'use client';

import { useEffect, useCallback, useState } from 'react';
import { useSessionsStore } from '@/store/sessions';
import { SessionCard } from '@/components/SessionCard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RailwayStatus } from '@/components/RailwayStatus';
import { ClientTabs } from '@/components/ClientTabs';
import { ClientSettingsPanel } from '@/components/ClientSettingsPanel';
import { CrossAnalysisView } from '@/components/CrossAnalysisView';
import { JishushitsuCard } from '@/components/JishushitsuCard';
import { BrandSettingsPanel } from '@/components/BrandSettingsPanel';
import type { Session } from '@/lib/types';

const REFRESH_INTERVAL = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 10000;

export default function HomePage() {
  const { sessions, setSessions, lastPolledAt, setLastPolledAt, isPolling, setPolling } =
    useSessionsStore();
  const [activeClient, setActiveClient] = useState<string | null>(null);
  const [managingClient, setManagingClient] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [showCrossAnalysis, setShowCrossAnalysis] = useState(false);
  const [brandPanelOpen, setBrandPanelOpen] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = (await res.json()) as { sessions: Session[] };
        setSessions(data.sessions);
        setLastPolledAt(new Date().toLocaleTimeString('ja-JP'));
      }
    } catch {
      // ネットワークエラーは無視
    }
  }, [setSessions, setLastPolledAt]);

  const triggerPoll = useCallback(async () => {
    setPolling(true);
    try {
      await fetch('/api/drive/poll');
      await fetchSessions();
    } catch {
      // エラーは無視
    } finally {
      setPolling(false);
    }
  }, [setPolling, fetchSessions]);

  const hasActiveSessions = sessions.some((s) =>
    ['pending', 'transcribing', 'summarizing'].includes(s.status)
  );

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    const interval = setInterval(fetchSessions, hasActiveSessions ? 3000 : REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSessions, hasActiveSessions]);

  // フィルタ後のセッション
  const filteredSessions = sessions.filter(
    (s) => activeClient === null || s.meta.clientName === activeClient
  );

  const handleManage = (client: string | null) => {
    setManagingClient(client);
    // 管理パネルを開いたらそのタブに切り替え
    if (client) setActiveClient(client);
  };

  // クライアント切り替え時にクロス分析を閉じる
  const handleClientSelect = (client: string | null) => {
    setActiveClient(client);
    setShowCrossAnalysis(false);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      {/* ヘッダー */}
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            EchoNote
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            {lastPolledAt ? `更新: ${lastPolledAt}` : 'Session Archive'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* ブランド設定（管理モード中のみ） */}
          {adminMode && (
            <button
              onClick={() => setBrandPanelOpen(true)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 active:scale-95 dark:border-amber-700 dark:bg-slate-800 dark:text-amber-400 dark:hover:bg-slate-700"
            >
              ブランド設定
            </button>
          )}
          {/* 管理モードトグル */}
          <button
            onClick={() => {
              setAdminMode((v) => !v);
              if (adminMode) setManagingClient(null);
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-95 ${
              adminMode
                ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {adminMode ? '管理中' : '管理'}
          </button>
          <button
            onClick={triggerPoll}
            disabled={isPolling}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {isPolling ? '...' : 'チェック'}
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* 自習室ランチャー */}
      <JishushitsuCard />

      {/* クライアントタブ */}
      <ClientTabs
        sessions={sessions}
        activeClient={activeClient}
        onSelect={handleClientSelect}
        managingClient={adminMode ? managingClient : null}
        onManage={adminMode ? handleManage : () => {}}
      />

      {/* クライアント選択中 — クロス分析ボタン */}
      {activeClient && !adminMode && (
        <div className="mb-3 flex items-center justify-end">
          <button
            onClick={() => setShowCrossAnalysis((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95 ${
              showCrossAnalysis
                ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-600 dark:bg-violet-900/20 dark:text-violet-300'
                : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            クロス分析
          </button>
        </div>
      )}

      {/* クライアント設定パネル（管理モード） */}
      {adminMode && managingClient && (
        <ClientSettingsPanel
          clientName={managingClient}
          onClose={() => setManagingClient(null)}
        />
      )}

      {/* クロス分析パネル（通常モード） */}
      {activeClient && !adminMode && showCrossAnalysis && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-white p-5 shadow-sm dark:border-violet-900/40 dark:bg-slate-900">
          <CrossAnalysisView
            clientName={activeClient}
            sessions={sessions.filter((s) => s.meta.clientName === activeClient)}
            onClose={() => setShowCrossAnalysis(false)}
          />
        </div>
      )}

      {/* セッション一覧 */}
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400">セッションがありません</p>
          <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
            Google Driveの指定フォルダに音声ファイルをアップロードすると自動検知されます
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredSessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              このクライアントのセッションはありません
            </p>
          ) : (
            filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onRetry={fetchSessions}
                onDelete={fetchSessions}
                adminMode={adminMode}
              />
            ))
          )}
        </div>
      )}

      <RailwayStatus />

      <BrandSettingsPanel
        open={brandPanelOpen}
        onClose={() => setBrandPanelOpen(false)}
      />

      <footer className="mt-6 text-center text-[11px] text-slate-300 dark:text-slate-700">
        EchoNote v{process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'}
      </footer>
    </div>
  );
}
