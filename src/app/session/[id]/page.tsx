'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Session } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { SummaryView } from '@/components/SummaryView';
import { TranscriptView } from '@/components/TranscriptView';
import { ShareButton } from '@/components/ShareButton';
import { MindMap } from '@/components/MindMap';
import { ThemeToggle } from '@/components/ThemeToggle';

type Tab = 'summary' | 'transcript';

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${params.id}`);
      if (!res.ok) {
        setError('セッションが見つかりません');
        return;
      }
      const data = (await res.json()) as { session: Session };
      setSession(data.session);
    } catch {
      setError('読み込みエラー');
    }
  }, [params.id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // 処理中は3秒ごとにポーリングして進捗を反映
  useEffect(() => {
    if (!session) return;
    if (!['pending', 'transcribing', 'summarizing'].includes(session.status)) return;
    const timer = setInterval(loadSession, 3000);
    return () => clearInterval(timer);
  }, [session?.status, loadSession]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-red-500 dark:text-red-400">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          &larr; 一覧に戻る
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-slate-500 dark:text-slate-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          &larr; 一覧に戻る
        </Link>
        <div className="flex items-center gap-2">
          {session.status === 'done' && <ShareButton sessionId={session.id} />}
          <ThemeToggle />
        </div>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {session.summary?.title || session.meta.clientName}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {session.meta.date} &middot; {session.meta.clientName}
            {session.meta.memo && ` &middot; ${session.meta.memo}`}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {/* 処理中の進捗表示 */}
      {['pending', 'transcribing', 'summarizing'].includes(session.status) && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/40 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">処理中</span>
          </div>
          <div className="space-y-1.5 font-mono text-xs text-blue-600 dark:text-blue-400">
            {session.progressMessage ? (
              <div className="flex items-start gap-2">
                <span className="text-blue-400 dark:text-blue-500">›</span>
                <span>{session.progressMessage}</span>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="text-blue-400 dark:text-blue-500">›</span>
                <span>処理待ち...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* タブ切り替え */}
      <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800/50">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'summary'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          サマリー
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'transcript'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          書き起こし
        </button>
      </div>

      {/* コンテンツ */}
      {activeTab === 'summary' && session.summary ? (
        <div className="space-y-8">
          <SummaryView summary={session.summary} />
          <MindMap summary={session.summary} />
        </div>
      ) : activeTab === 'summary' ? (
        <p className="text-slate-500 dark:text-slate-400">サマリーはまだ生成されていません</p>
      ) : session.transcript ? (
        <TranscriptView transcript={session.transcript} />
      ) : (
        <p className="text-slate-500 dark:text-slate-400">書き起こしはまだ完了していません</p>
      )}
    </div>
  );
}
