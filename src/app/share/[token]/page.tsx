'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Session } from '@/lib/types';
import { SummaryView } from '@/components/SummaryView';
import { TranscriptView } from '@/components/TranscriptView';
import { MindMap } from '@/components/MindMap';
import { ThemeToggle } from '@/components/ThemeToggle';

type Tab = 'summary' | 'transcript';

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const [session, setSession] = useState<Partial<Session> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [isAnonymized, setIsAnonymized] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/share/${params.token}`);
      if (!res.ok) {
        setError('この共有リンクは無効です');
        return;
      }
      const data = await res.json() as { session: Partial<Session>; isAnonymized: boolean };
      setSession(data.session);
      setIsAnonymized(data.isAnonymized ?? false);
    }
    load();
  }, [params.token]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-red-500 dark:text-red-400">{error}</p>
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
        <div className="text-xs text-slate-400 dark:text-slate-500">
          EchoNote 共有セッション
        </div>
        <ThemeToggle />
      </div>

      {isAnonymized && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          <span>このセッションはプライバシー保護のため、一部の情報が匿名化されています。</span>
        </div>
      )}

      <h1 className="mb-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {session.summary?.title}
      </h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {session.meta?.date} &middot; {session.meta?.clientName}
      </p>

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
      ) : activeTab === 'transcript' && session.transcript ? (
        <TranscriptView transcript={session.transcript} />
      ) : (
        <p className="text-slate-500 dark:text-slate-400">データがありません</p>
      )}
    </div>
  );
}
