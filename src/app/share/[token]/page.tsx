'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Session } from '@/lib/types';
import { SummaryView } from '@/components/SummaryView';
import { MindMap } from '@/components/MindMap';

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const [session, setSession] = useState<Partial<Session> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/share/${params.token}`);
      if (!res.ok) {
        setError('この共有リンクは無効です');
        return;
      }
      const data = await res.json() as { session: Partial<Session> };
      setSession(data.session);
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
      <div className="mb-2 text-xs text-slate-400 dark:text-slate-500">
        EchoNote 共有サマリー
      </div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {session.summary?.title}
      </h1>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        {session.meta?.date} &middot; {session.meta?.clientName}
      </p>

      {session.summary && (
        <div className="space-y-8">
          <SummaryView summary={session.summary} />
          <MindMap summary={session.summary} />
        </div>
      )}
    </div>
  );
}
