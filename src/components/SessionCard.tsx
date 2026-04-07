'use client';

import Link from 'next/link';
import type { Session } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

export function SessionCard({ session }: { session: Session }) {
  const card = (
    <div className="group rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-500 dark:hover:bg-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {session.summary?.title || session.meta.clientName}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {session.meta.date} &middot; {session.meta.clientName}
            {session.meta.memo && ` &middot; ${session.meta.memo}`}
          </p>
          {session.summary?.sessionType && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{session.summary.sessionType}</p>
          )}
        </div>
        <StatusBadge status={session.status} />
      </div>
      {session.error && (
        <p className="mt-3 text-sm text-red-500 dark:text-red-400">{session.error}</p>
      )}
      {session.summary?.overallAssessment && (
        <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
          {session.summary.overallAssessment}
        </p>
      )}
    </div>
  );

  if (session.status === 'done') {
    return <Link href={`/session/${session.id}`}>{card}</Link>;
  }

  return card;
}
