'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ShareRecord } from '@/lib/db';

interface ShareLogProps {
  sessionId: string;
  /** 新しいトークンが発行されたとき親から通知されリロードする */
  refreshTrigger?: number;
}

export function ShareLog({ sessionId, refreshTrigger }: ShareLogProps) {
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/shares`);
    if (res.ok) {
      const data = (await res.json()) as { shares: ShareRecord[] };
      setShares(data.shares);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const copy = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const revoke = async (token: string) => {
    setRevoking(token);
    await fetch(`/api/sessions/${sessionId}/shares/${token}`, { method: 'DELETE' });
    setShares((prev) => prev.filter((s) => s.token !== token));
    setRevoking(null);
  };

  if (shares.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50">
      {/* ヘッダー */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            発行済み共有リンク
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {shares.length}
          </span>
        </div>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {shares.map((share) => {
              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${share.token}`;
              const date = new Date(share.createdAt).toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <li key={share.token} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  {/* URL & バッジ */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                        /share/{share.token.slice(0, 8)}…
                      </span>
                      {share.isAnonymized ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          匿名化
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                          通常
                        </span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">{date}</span>
                    </div>
                    {share.maskedTerms && share.maskedTerms.length > 0 && (
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        マスク: {share.maskedTerms.join('、')}
                      </p>
                    )}
                  </div>

                  {/* アクションボタン */}
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => copy(share.token)}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 sm:flex-none"
                    >
                      {copied === share.token ? 'コピー済み ✓' : 'URLをコピー'}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 sm:flex-none"
                    >
                      開く
                    </a>
                    <button
                      onClick={() => revoke(share.token)}
                      disabled={revoking === share.token}
                      className="flex-1 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 disabled:opacity-50 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-950/20 sm:flex-none"
                    >
                      {revoking === share.token ? '...' : '無効化'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
