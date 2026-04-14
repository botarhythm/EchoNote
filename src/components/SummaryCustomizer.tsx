'use client';

import { useState, useEffect } from 'react';
import type {
  SummaryDepth,
  SummaryPattern,
  SummaryOptions,
  SessionSummary,
  ClientSettings,
  SpeakerNames,
} from '@/lib/types';
import { DEPTH_LABELS, PATTERN_LABELS } from '@/lib/types';

interface SummaryCustomizerProps {
  sessionId: string;
  clientName: string;
  onRegenerated: (summary: SessionSummary) => void;
}

const DEPTHS: SummaryDepth[] = ['simple', 'standard', 'detailed', 'deep'];
const PATTERNS: SummaryPattern[] = ['action', 'psychology', 'coaching', 'strategy', 'problem'];

export function SummaryCustomizer({ sessionId, clientName, onRegenerated }: SummaryCustomizerProps) {
  const [open, setOpen] = useState(false);

  // 話者設定
  const [speakerA, setSpeakerA] = useState('もっちゃん');
  const [speakerB, setSpeakerB] = useState('');

  // 再生成オプション
  const [depth, setDepth] = useState<SummaryDepth>('standard');
  const [patterns, setPatterns] = useState<SummaryPattern[]>([]);
  const [clientNotes, setClientNotes] = useState('');
  const [userNotes, setUserNotes] = useState('');

  // 状態
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // パネルを開いたときにクライアント設定を読み込む
  useEffect(() => {
    if (!open || !clientName || clientName === '不明') return;
    setLoadingSettings(true);
    fetch(`/api/clients/${encodeURIComponent(clientName)}/settings`)
      .then((r) => r.json())
      .then((data: { settings: ClientSettings }) => {
        setSpeakerA(data.settings.speakerA || 'もっちゃん');
        setSpeakerB(data.settings.speakerB || clientName);
        setClientNotes(data.settings.notes || '');
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
  }, [open, clientName]);

  const handleSaveSettings = async () => {
    if (!clientName || clientName === '不明') return;
    setSavingSettings(true);
    setSavedMessage(null);
    try {
      await fetch(`/api/clients/${encodeURIComponent(clientName)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: clientNotes, speakerA, speakerB }),
      });
      setSavedMessage('保存しました');
      setTimeout(() => setSavedMessage(null), 2000);
    } catch {
      setSavedMessage('保存に失敗しました');
    } finally {
      setSavingSettings(false);
    }
  };

  const togglePattern = (p: SummaryPattern) => {
    setPatterns((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    const speakerNames: SpeakerNames = { A: speakerA, B: speakerB };
    const options: SummaryOptions = { depth, patterns, userNotes, clientNotes, speakerNames };
    try {
      const res = await fetch(`/api/sessions/${sessionId}/regenerate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || '再生成に失敗しました');
      }
      const data = (await res.json()) as { summary: SessionSummary };
      onRegenerated(data.summary);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '再生成に失敗しました');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50">
      {/* ヘッダー */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          サマリーをカスタマイズして再生成
        </span>
        <span className="text-xs text-slate-400">{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-slate-400">クライアント設定を読み込み中...</span>
            </div>
          ) : (
            <div className="space-y-6 px-4 py-5">

              {/* ── 話者設定 ── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    話者設定
                  </p>
                  {clientName && clientName !== '不明' && (
                    <span className="text-xs text-slate-400">{clientName} の設定として保存されます</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      話者 A（アドバイザー側）
                    </span>
                    <input
                      type="text"
                      value={speakerA}
                      onChange={(e) => setSpeakerA(e.target.value)}
                      placeholder="もっちゃん"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      話者 B（クライアント側）
                    </span>
                    <input
                      type="text"
                      value={speakerB}
                      onChange={(e) => setSpeakerB(e.target.value)}
                      placeholder="クライアント名"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </label>
                </div>
              </div>

              {/* ── クライアント共通メモ ── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    クライアント共通メモ
                  </p>
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings || !clientName || clientName === '不明'}
                    className="rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-950/30"
                  >
                    {savingSettings ? '保存中...' : savedMessage ?? '話者設定と共に保存'}
                  </button>
                </div>
                <textarea
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  rows={3}
                  placeholder="例: デジハラ = デジタル原っぱ大学（デジタルハラスメントではない）&#10;例: クライアントは個人事業主。法人向け提案は不要。"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
                />
                <p className="mt-1 text-xs text-slate-400">このクライアントのすべてのセッションで参照されます</p>
              </div>

              {/* ── 深度セレクター ── */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  深度
                  {depth === 'deep' && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Botarhythm Studio モード
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {DEPTHS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDepth(d)}
                      className={`rounded-full px-3 py-1 text-sm transition-colors ${
                        depth === d
                          ? d === 'deep'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'border border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-400'
                      }`}
                    >
                      {DEPTH_LABELS[d]}
                    </button>
                  ))}
                </div>
                {depth === 'deep' && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Botarhythm Studio のサービス哲学・コーチング観点で徹底分析します
                  </p>
                )}
              </div>

              {/* ── パターン選択 ── */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  重点パターン（複数選択可）
                </p>
                <div className="flex flex-wrap gap-2">
                  {PATTERNS.map((p) => (
                    <button
                      key={p}
                      onClick={() => togglePattern(p)}
                      className={`rounded-full px-3 py-1 text-sm transition-colors ${
                        patterns.includes(p)
                          ? 'bg-blue-600 text-white dark:bg-blue-500'
                          : 'border border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-400'
                      }`}
                    >
                      {PATTERN_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── このセッションのメモ ── */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  このセッションの補正メモ
                </p>
                <textarea
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  rows={3}
                  placeholder="例: 今回は新規事業の話がメイン&#10;例: セッション後半の提案内容を中心にまとめて"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
                />
                <p className="mt-1 text-xs text-slate-400">このセッションの1回の再生成にのみ使用されます</p>
              </div>

              {/* エラー */}
              {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

              {/* 実行ボタン */}
              <div className="flex justify-end">
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  {regenerating && (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-slate-900 dark:border-t-transparent" />
                  )}
                  {regenerating ? '生成中...' : 'サマリーを再生成'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
