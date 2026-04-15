'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  SummaryDepth,
  SummaryPattern,
  SummaryOptions,
  SessionSummary,
  ClientSettings,
  SpeakerNames,
} from '@/lib/types';
import { DEPTH_LABELS, PATTERN_LABELS } from '@/lib/types';
import type { ShareRecord } from '@/lib/db';

type ActivePanel = 'regenerate' | 'share' | 'history' | null;

const DEPTHS: SummaryDepth[] = ['simple', 'standard', 'detailed', 'deep'];
const PATTERNS: SummaryPattern[] = ['action', 'psychology', 'coaching', 'strategy', 'problem'];

interface SessionActionBarProps {
  sessionId: string;
  clientName: string;
  hasTranscript: boolean;
  isDone: boolean;
  onRegenerated: (summary: SessionSummary) => void;
}

export function SessionActionBar({
  sessionId,
  clientName,
  hasTranscript,
  isDone,
  onRegenerated,
}: SessionActionBarProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // ── 再生成パネル ──
  const [speakerA, setSpeakerA] = useState('もっちゃん');
  const [speakerB, setSpeakerB] = useState('');
  const [depth, setDepth] = useState<SummaryDepth>('standard');
  const [patterns, setPatterns] = useState<SummaryPattern[]>([]);
  const [clientNotes, setClientNotes] = useState('');
  const [userNotes, setUserNotes] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // ── 共有パネル ──
  const [maskedTerms, setMaskedTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState('');
  const [suggestedTerms, setSuggestedTerms] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCreated, setShareCreated] = useState<string | null>(null);
  const shareInputRef = useRef<HTMLInputElement>(null);

  // ── 履歴パネル ──
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const toggle = (panel: ActivePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  // ── クライアント設定ロード（再生成パネルを開いたとき） ──
  useEffect(() => {
    if (activePanel !== 'regenerate') return;
    if (!clientName || clientName === '不明') return;
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
  }, [activePanel, clientName]);

  // ── 共有履歴ロード ──
  const loadShares = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/shares`);
    if (res.ok) {
      const data = (await res.json()) as { shares: ShareRecord[] };
      setShares(data.shares);
    }
  }, [sessionId]);

  useEffect(() => { loadShares(); }, [loadShares]);

  useEffect(() => {
    if (activePanel === 'history') loadShares();
  }, [activePanel, loadShares]);

  // 共有パネル開いたときにinputにフォーカス
  useEffect(() => {
    if (activePanel === 'share') {
      setTimeout(() => shareInputRef.current?.focus(), 50);
    }
  }, [activePanel]);

  // ── 再生成 ──
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
      setTimeout(() => setSavedMessage(null), 2500);
    } catch {
      setSavedMessage('保存に失敗しました');
    } finally {
      setSavingSettings(false);
    }
  };

  const togglePattern = (p: SummaryPattern) =>
    setPatterns((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenError(null);
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
      setActivePanel(null);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : '再生成に失敗しました');
    } finally {
      setRegenerating(false);
    }
  };

  // ── 共有 ──
  const addTerm = (term?: string) => {
    const value = (term ?? termInput).trim();
    if (value && !maskedTerms.includes(value)) {
      setMaskedTerms((prev) => [...prev, value]);
      setSuggestedTerms((prev) => prev.filter((t) => t !== value));
    }
    if (!term) {
      setTermInput('');
      shareInputRef.current?.focus();
    }
  };

  const removeTerm = (term: string) =>
    setMaskedTerms((prev) => prev.filter((t) => t !== term));

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestedTerms([]);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/privacy-suggestions`);
      if (res.ok) {
        const { terms } = (await res.json()) as { terms: string[] };
        setSuggestedTerms(terms.filter((t) => !maskedTerms.includes(t)));
      }
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const createShareLink = async (withPrivacy: boolean) => {
    setSharing(true);
    try {
      const body: { sessionId: string; maskedTerms?: string[] } = { sessionId };
      if (withPrivacy && maskedTerms.length > 0) body.maskedTerms = maskedTerms;
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setShareCreated(url);
      setMaskedTerms([]);
      setSuggestedTerms([]);
      setTermInput('');
      loadShares();
    } finally {
      setSharing(false);
    }
  };

  // ── 履歴 ──
  const copyShare = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const revokeShare = async (token: string) => {
    setRevoking(token);
    await fetch(`/api/sessions/${sessionId}/shares/${token}`, { method: 'DELETE' });
    setShares((prev) => prev.filter((s) => s.token !== token));
    setRevoking(null);
  };

  return (
    <div className="mb-6">
      {/* ── アクションボタン行 ── */}
      <div className="flex flex-wrap gap-2">
        {/* 再生成 */}
        {hasTranscript && (
          <button
            onClick={() => toggle('regenerate')}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-95 ${
              activePanel === 'regenerate'
                ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            サマリー再生成
          </button>
        )}

        {/* 共有リンク */}
        {isDone && (
          <button
            onClick={() => toggle('share')}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-95 ${
              activePanel === 'share'
                ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            共有リンク
          </button>
        )}

        {/* 共有履歴 */}
        <button
          onClick={() => toggle('history')}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-95 ${
            activePanel === 'history'
              ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          共有履歴
          {shares.length > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none dark:bg-slate-600 dark:text-slate-200">
              {shares.length}
            </span>
          )}
        </button>
      </div>

      {/* ── 展開パネル ── */}
      {activePanel && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/50">

          {/* ══ 再生成パネル ══ */}
          {activePanel === 'regenerate' && (
            <div className="p-5">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">サマリー再生成</h3>
                <button onClick={() => setActivePanel(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 active:bg-slate-200 dark:hover:bg-slate-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {loadingSettings ? (
                <p className="text-sm text-slate-400">クライアント設定を読み込み中...</p>
              ) : (
                <div className="space-y-5">

                  {/* 話者設定 */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">話者設定</p>
                      {clientName && clientName !== '不明' && (
                        <button
                          onClick={handleSaveSettings}
                          disabled={savingSettings || !clientName || clientName === '不明'}
                          className="rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40 active:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-950/30"
                        >
                          {savingSettings ? '保存中...' : savedMessage ?? '話者設定と共通メモを保存'}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <label className="flex flex-1 flex-col gap-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">話者 A（アドバイザー側）</span>
                        <input
                          type="text" value={speakerA}
                          onChange={(e) => setSpeakerA(e.target.value)}
                          placeholder="もっちゃん"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">話者 B（クライアント側）</span>
                        <input
                          type="text" value={speakerB}
                          onChange={(e) => setSpeakerB(e.target.value)}
                          placeholder="クライアント名"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        />
                      </label>
                    </div>
                  </div>

                  {/* クライアント共通メモ */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">クライアント共通メモ</p>
                    <textarea
                      value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={3}
                      placeholder="例: デジハラ = デジタル原っぱ大学（デジタルハラスメントではない）&#10;例: クライアントは個人事業主。法人向け提案は不要。"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
                    />
                    <p className="mt-1 text-xs text-slate-400">このクライアントのすべてのセッションで参照されます</p>
                  </div>

                  {/* 深度 */}
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
                          key={d} onClick={() => setDepth(d)}
                          className={`rounded-full px-3 py-1 text-sm transition-colors active:scale-95 ${
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

                  {/* パターン */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">重点パターン（複数選択可）</p>
                    <div className="flex flex-wrap gap-2">
                      {PATTERNS.map((p) => (
                        <button
                          key={p} onClick={() => togglePattern(p)}
                          className={`rounded-full px-3 py-1 text-sm transition-colors active:scale-95 ${
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

                  {/* セッションメモ */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">このセッションの補正メモ</p>
                    <textarea
                      value={userNotes} onChange={(e) => setUserNotes(e.target.value)} rows={3}
                      placeholder="例: 今回は新規事業の話がメイン&#10;例: セッション後半の提案内容を中心にまとめて"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
                    />
                    <p className="mt-1 text-xs text-slate-400">このセッションの1回の再生成にのみ使用されます</p>
                  </div>

                  {regenError && <p className="text-sm text-red-500 dark:text-red-400">{regenError}</p>}

                  <div className="flex justify-end">
                    <button
                      onClick={handleRegenerate} disabled={regenerating}
                      className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 active:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
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

          {/* ══ 共有パネル ══ */}
          {activePanel === 'share' && (
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">共有リンクの作成</h3>
                <button onClick={() => setActivePanel(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 active:bg-slate-200 dark:hover:bg-slate-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {shareCreated ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800/40 dark:bg-green-900/20">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">共有リンクを作成しました</p>
                    <p className="mt-1 break-all font-mono text-xs text-green-600 dark:text-green-400">{shareCreated}</p>
                    <p className="mt-1 text-xs text-green-600/70 dark:text-green-400/70">URLをクリップボードにコピーしました</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShareCreated(null); toggle('history'); }}
                      className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      共有履歴を確認する →
                    </button>
                    <button
                      onClick={() => setShareCreated(null)}
                      className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      もう1件作成
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 匿名化キーワード入力 */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">匿名化するキーワード</p>
                    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                      入力した語句をサマリーから言い換えて共有します。守秘義務や個人情報の保護に。
                    </p>
                    <div className="flex gap-2">
                      <input
                        ref={shareInputRef} type="text" value={termInput}
                        onChange={(e) => setTermInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }}
                        placeholder="例：山田様、株式会社〇〇"
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
                      />
                      <button
                        onClick={() => addTerm()} disabled={!termInput.trim()}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 active:bg-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        追加
                      </button>
                    </div>
                    {maskedTerms.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {maskedTerms.map((term) => (
                          <span key={term} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            {term}
                            <button onClick={() => removeTerm(term)} className="ml-0.5 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI提案 */}
                  <div className="border-t border-slate-100 pt-4 dark:border-slate-700/50">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">AIのおすすめ語句</p>
                      <button
                        onClick={fetchSuggestions} disabled={loadingSuggestions}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        {loadingSuggestions ? '分析中...' : suggestedTerms.length > 0 ? '再取得' : '提案を取得'}
                      </button>
                    </div>
                    {loadingSuggestions && (
                      <p className="text-xs text-slate-400">AIがセッション内容を分析しています...</p>
                    )}
                    {!loadingSuggestions && suggestedTerms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedTerms.map((term) => (
                          <button
                            key={term} onClick={() => addTerm(term)}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 active:bg-amber-100 dark:border-slate-600 dark:text-slate-400 dark:hover:border-amber-600 dark:hover:bg-amber-900/20 dark:hover:text-amber-300"
                          >
                            + {term}
                          </button>
                        ))}
                      </div>
                    )}
                    {!loadingSuggestions && suggestedTerms.length === 0 && (
                      <p className="text-xs text-slate-400">「提案を取得」でAIが匿名化すべき語句を自動検出します</p>
                    )}
                  </div>

                  {/* 実行ボタン */}
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-1 dark:border-slate-700/50">
                    {maskedTerms.length > 0 && (
                      <button
                        onClick={() => createShareLink(true)} disabled={sharing}
                        className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 active:bg-amber-800 dark:bg-amber-700 dark:hover:bg-amber-600"
                      >
                        {sharing ? 'AIが匿名化中...' : `プライバシー保護して共有 (${maskedTerms.length}語句)`}
                      </button>
                    )}
                    <button
                      onClick={() => createShareLink(false)} disabled={sharing}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 active:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {maskedTerms.length > 0 ? 'そのまま共有する' : '共有リンクを作成'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ 履歴パネル ══ */}
          {activePanel === 'history' && (
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  発行済み共有リンク
                  {shares.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      {shares.length}
                    </span>
                  )}
                </h3>
                <button onClick={() => setActivePanel(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 active:bg-slate-200 dark:hover:bg-slate-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {shares.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">共有リンクはまだ発行されていません</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {shares.map((share) => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${share.token}`;
                    const date = new Date(share.createdAt).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <li key={share.token} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                              /share/{share.token.slice(0, 8)}…
                            </span>
                            {share.isAnonymized ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">匿名化</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">通常</span>
                            )}
                            <span className="text-xs text-slate-400">{date}</span>
                          </div>
                          {share.maskedTerms && share.maskedTerms.length > 0 && (
                            <p className="mt-1 text-xs text-slate-400">マスク: {share.maskedTerms.join('、')}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            onClick={() => copyShare(share.token)}
                            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 sm:flex-none"
                          >
                            {copied === share.token ? 'コピー済み ✓' : 'URLをコピー'}
                          </button>
                          <a
                            href={url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 sm:flex-none"
                          >
                            開く
                          </a>
                          <button
                            onClick={() => revokeShare(share.token)} disabled={revoking === share.token}
                            className="flex-1 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 disabled:opacity-50 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-950/20 sm:flex-none"
                          >
                            {revoking === share.token ? '...' : '無効化'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
