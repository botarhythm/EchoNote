'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Session } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

export function SessionCard({
  session,
  onRetry,
  onDelete,
  adminMode,
}: {
  session: Session;
  onRetry?: () => void;
  onDelete?: () => void;
  adminMode?: boolean;
}) {
  const [retrying, setRetrying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleDeleteConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      onDelete?.();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(false);
  };

  const cardContent = (
    <div className="group rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-500 dark:hover:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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

        <div className="flex shrink-0 items-start gap-2">
          <StatusBadge status={session.status} />
          {/* 削除ボタン（管理モード時のみ） */}
          {adminMode && !confirmDelete && (
            <button
              onClick={handleDeleteClick}
              className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-red-400"
              title="削除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 進捗メッセージ */}
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

      {/* 再処理ボタン */}
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

      {/* 削除確認 */}
      {confirmDelete && (
        <div
          className="mt-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800/40 dark:bg-red-950/20"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="flex-1 text-xs text-red-700 dark:text-red-400">
            このセッションを削除しますか？（書き起こし・サマリーもすべて削除されます）
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteCancel}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              キャンセル
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? '削除中...' : '削除する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // 削除確認中・削除中はリンクを無効化
  if (session.status === 'done' && !confirmDelete && !deleting) {
    return <Link href={`/session/${session.id}`}>{cardContent}</Link>;
  }

  return cardContent;
}
