'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Session, SessionSummary, SpeakerNames, ClientSettings, Utterance } from '@/lib/types';
import { getSummaryMode } from '@/lib/types';
import { useSessionsStore } from '@/store/sessions';
import { StatusBadge } from '@/components/StatusBadge';
import { SummaryView } from '@/components/SummaryView';
import { TranscriptView } from '@/components/TranscriptView';
import { SummaryVisualizations } from '@/components/SummaryVisualizations';
import { TranscriptDiffPanel } from '@/components/TranscriptDiffPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SessionActionBar } from '@/components/SessionActionBar';

type Tab = 'summary' | 'transcript';

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const adminMode = searchParams.get('admin') === '1';
  // 初回マウント時にトップページのストアから即座に取得し、再フェッチ待ちのレイテンシを排除する
  const [session, setSession] = useState<Session | null>(() => {
    return useSessionsStore.getState().sessions.find((s) => s.id === params.id) ?? null;
  });
  const [clientSettings, setClientSettings] = useState<ClientSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState({ clientName: '', date: '' });
  const [diffPanelOpen, setDiffPanelOpen] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      // 軽量レスポンス（transcriptは含まない）。書き起こしは別フェッチで取得する。
      const res = await fetch(`/api/sessions/${params.id}`);
      if (!res.ok) { setError('セッションが見つかりません'); return; }
      const data = (await res.json()) as { session: Session };
      setSession((prev) => {
        // 既に transcript を取得済みなら維持する（lite レスポンスで上書きしない）
        if (prev?.transcript && !data.session.transcript) {
          return { ...data.session, transcript: prev.transcript };
        }
        return data.session;
      });
    } catch {
      setError('読み込みエラー');
    }
  }, [params.id]);

  const loadTranscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${params.id}/transcript`);
      if (!res.ok) return;
      const data = (await res.json()) as { transcript: Utterance[] | null };
      if (data.transcript) {
        setSession((prev) => (prev ? { ...prev, transcript: data.transcript ?? undefined } : prev));
      }
    } catch {
      // 失敗しても致命的ではない（タブ切替時に再試行可能）
    }
  }, [params.id]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // セッションが完了状態なら transcript をバックグラウンドで取得
  useEffect(() => {
    if (session?.status === 'done' && !session.transcript) {
      loadTranscript();
    }
  }, [session?.status, session?.transcript, loadTranscript]);

  useEffect(() => {
    const clientName = session?.meta.clientName;
    if (!clientName || clientName === '不明') return;
    fetch(`/api/clients/${encodeURIComponent(clientName)}/settings`)
      .then((r) => r.json())
      .then((data: { settings: ClientSettings }) => setClientSettings(data.settings))
      .catch(() => {});
  }, [session?.meta.clientName]);

  useEffect(() => {
    if (!session) return;
    if (!['pending', 'transcribing', 'summarizing'].includes(session.status)) return;
    const timer = setInterval(loadSession, 3000);
    return () => clearInterval(timer);
  }, [session?.status, loadSession]);

  const handleTitleSave = async () => {
    const newTitle = titleDraft.trim();
    if (!newTitle || !session || newTitle === session.summary?.title) {
      setEditingTitle(false);
      return;
    }
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) {
      setSession((prev) =>
        prev?.summary ? { ...prev, summary: { ...prev.summary, title: newTitle } } : prev
      );
    }
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') setEditingTitle(false);
  };

  const handleTranscriptSave = useCallback(
    async (next: Utterance[]) => {
      if (!session) return;
      // 楽観的更新
      setSession((prev) => (prev ? { ...prev, transcript: next } : prev));
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: next }),
      });
      if (!res.ok) {
        // 失敗時はサーバ状態に戻す
        await loadSession();
        throw new Error('保存に失敗しました');
      }
    },
    [session, loadSession]
  );

  const handleMetaSave = async () => {
    if (!session) { setEditingMeta(false); return; }
    const clientName = metaDraft.clientName.trim();
    const date = metaDraft.date.trim();
    if (!clientName && !date) { setEditingMeta(false); return; }
    const body: Record<string, string> = {};
    if (clientName && clientName !== session.meta.clientName) body.clientName = clientName;
    if (date && date !== session.meta.date) body.date = date;
    if (Object.keys(body).length === 0) { setEditingMeta(false); return; }
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSession((prev) => prev ? {
        ...prev,
        meta: { ...prev.meta, ...body },
        summary: prev.summary ? { ...prev.summary, ...body } : prev.summary,
      } : prev);
    }
    setEditingMeta(false);
  };

  const speakerNames: SpeakerNames = {
    A: clientSettings?.speakerA || '',
    B: clientSettings?.speakerB || session?.meta.clientName || '',
  };

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-red-500 dark:text-red-400">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-slate-500 dark:text-slate-400">
          &larr; 一覧に戻る
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-slate-500 dark:text-slate-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">

      {/* ── ナビゲーションバー ── */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <span className="text-base leading-none">←</span>
          <span className="hidden sm:inline">一覧に戻る</span>
        </Link>
        <ThemeToggle />
      </div>

      {/* ── タイトル & メタ ── */}
      <div className="mb-6">
        {editingTitle ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="w-full rounded-lg border border-blue-400 bg-white px-3 py-2 text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-blue-500 dark:bg-slate-800 dark:text-slate-100 sm:text-2xl"
            />
            <div className="flex gap-2">
              <button
                onClick={handleTitleSave}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800 sm:flex-none"
              >
                保存
              </button>
              <button
                onClick={() => setEditingTitle(false)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:text-slate-400 sm:flex-none"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
                  {session.summary?.title || session.meta.clientName}
                </h1>
                {/* タイトル編集ボタン：スマホでも常時表示 */}
                {session.summary && (
                  <button
                    onClick={() => {
                      setTitleDraft(session.summary?.title || session.meta.clientName);
                      setEditingTitle(true);
                    }}
                    className="mt-1 shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    title="タイトルを編集"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
              {/* メタ情報（日付・クライアント名）インライン編集 */}
              {editingMeta ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="date"
                    value={metaDraft.date}
                    onChange={(e) => setMetaDraft((d) => ({ ...d, date: e.target.value }))}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <input
                    autoFocus
                    type="text"
                    value={metaDraft.clientName}
                    onChange={(e) => setMetaDraft((d) => ({ ...d, clientName: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleMetaSave(); if (e.key === 'Escape') setEditingMeta(false); }}
                    placeholder="クライアント名"
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleMetaSave} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800">保存</button>
                    <button onClick={() => setEditingMeta(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400">取消</button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-1.5">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {session.meta.date} · {session.meta.clientName}
                    {session.meta.memo && ` · ${session.meta.memo}`}
                  </p>
                  <button
                    onClick={() => {
                      setMetaDraft({ clientName: session.meta.clientName, date: session.meta.date });
                      setEditingMeta(true);
                    }}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    title="日付・クライアント名を編集"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <StatusBadge status={session.status} />
          </div>
        )}
      </div>

      {/* ── ダッシュボードアクションバー ── */}
      {(session.status === 'done' || (session.transcript && session.transcript.length > 0)) && (
        <SessionActionBar
          sessionId={session.id}
          clientName={session.meta.clientName}
          hasTranscript={!!(session.transcript && session.transcript.length > 0)}
          isDone={session.status === 'done'}
          currentMode={session.summary ? getSummaryMode(session.summary) : undefined}
          onRegenerated={(newSummary: SessionSummary) =>
            setSession((prev) => (prev ? { ...prev, summary: newSummary } : prev))
          }
        />
      )}

      {/* ── 処理中の進捗 ── */}
      {['pending', 'transcribing', 'summarizing'].includes(session.status) && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/40 dark:bg-blue-900/20">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">処理中</span>
          </div>
          <div className="flex items-start gap-2 font-mono text-xs text-blue-600 dark:text-blue-400">
            <span>›</span>
            <span>{session.progressMessage || '処理待ち...'}</span>
          </div>
        </div>
      )}

      {/* ── タブ ── */}
      <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800/50">
        {(['summary', 'transcript'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {tab === 'summary' ? 'サマリー' : '書き起こし'}
          </button>
        ))}
      </div>

      {/* ── コンテンツ ── */}
      {activeTab === 'summary' && session.summary ? (
        <div className="space-y-6">
          <SummaryView summary={session.summary} speakerNames={speakerNames} />
          <SummaryVisualizations
            summary={session.summary}
            speakerALabel={speakerNames?.A}
            speakerBLabel={speakerNames?.B}
          />
        </div>
      ) : activeTab === 'summary' ? (
        <p className="text-slate-500 dark:text-slate-400">サマリーはまだ生成されていません</p>
      ) : session.transcript ? (
        <div className="space-y-4">
          {adminMode && session.status === 'done' && (
            <div className="flex justify-end">
              <button
                onClick={() => setDiffPanelOpen((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95 ${
                  diffPanelOpen
                    ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-600 dark:bg-violet-900/20 dark:text-violet-300'
                    : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Drive書き起こしと照合
              </button>
            </div>
          )}
          {diffPanelOpen && (
            <TranscriptDiffPanel
              sessionId={session.id}
              echonoteTranscript={session.transcript}
              speakerNames={speakerNames}
              onClose={() => setDiffPanelOpen(false)}
            />
          )}
          <TranscriptView
            transcript={session.transcript}
            speakerNames={speakerNames}
            editable={session.status === 'done'}
            onSave={handleTranscriptSave}
          />
        </div>
      ) : session.status === 'done' ? (
        <p className="text-slate-500 dark:text-slate-400">書き起こしを読み込み中...</p>
      ) : (
        <p className="text-slate-500 dark:text-slate-400">書き起こしはまだ完了していません</p>
      )}
    </div>
  );
}
