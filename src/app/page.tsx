'use client';

import { useEffect, useCallback } from 'react';
import { useSessionsStore } from '@/store/sessions';
import { SessionCard } from '@/components/SessionCard';
import type { Session } from '@/lib/types';

const REFRESH_INTERVAL = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 10000;

export default function HomePage() {
  const { sessions, setSessions, lastPolledAt, setLastPolledAt, isPolling, setPolling } =
    useSessionsStore();

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

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            EchoNote
          </h1>
          <p className="text-sm text-slate-400">Session Archive</p>
        </div>
        <div className="flex items-center gap-4">
          {lastPolledAt && (
            <span className="text-xs text-slate-500">
              最終更新: {lastPolledAt}
            </span>
          )}
          <button
            onClick={triggerPoll}
            disabled={isPolling}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {isPolling ? 'チェック中...' : '今すぐチェック'}
          </button>
        </div>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 p-12 text-center">
          <p className="text-slate-400">セッションがありません</p>
          <p className="mt-2 text-sm text-slate-500">
            Google Driveの指定フォルダに音声ファイルをアップロードすると自動検知されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
