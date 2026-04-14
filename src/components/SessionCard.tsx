'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Session } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

export function SessionCard({
  session,
  onRetry,
}: {
  session: Session;
  onRetry?: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault();
    setRetrying(true);
    try {
      await fetch(`/api/sessions/${session.id}`, { method: 'POST' });
      onRetry?.();
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  const card = (
    <div className="group rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-500 dark:hover:bg-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {session.summary?.title || session.meta.clientName || session.meta.originalFilename}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {session.meta.date && `${session.meta.date} · `}
            {session.meta.clientName || session.meta.originalFilename}
            {session.meta.memo && ` · ${session.meta.memo}`}
          </p>
          {session.summary?.sessionType && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{session.summary.sessionType}</p>
          )}
        </div>
        <StatusBadge status={session.status} />
      </div>
      {/* 進捗メッセージ（処理中のみ） */}
      {['pending', 'transcribing', 'summarizing'].includes(session.status) && (
        <div className="mt-3 flex items-start gap-2">
          <span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-blue-400 dark:bg-blue-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {session.progressMessage || '処理待ち...'}
          </p>
        </div>
      )}

      {session.error && (
        <p className="mt-3 text-sm text-red-500 dark:text-red-400">{session.error}</p>
      )}
      {session.summary?.overallAssessment && (
        <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
          {session.summary.overallAssessment}
        </p>
      )}
      {session.status === 'error' && (
        <div className="mt-3">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            {retrying ? '処理中...' : '再処理する'}
          </button>
        </div>
      )}
    </div>
  );

  if (session.status === 'done') {
    return <Link href={`/session/${session.id}`}>{card}</Link>;
  }

  return card;
}
