'use client';

import { useState } from 'react';
import { InviteModal } from './InviteModal';

const PARTICIPANT_URL = process.env.NEXT_PUBLIC_DIGIHARA_BASE_URL || '';

/**
 * Botarhythm Studio セッションルームのランチャーカード。
 *
 * - 録音セッションを開始: /api/jishushitsu/start への通常リンク（302リダイレクトで digihara のホストURLへ）
 *   ブラウザのポップアップブロックに引っかからないよう、aタグの target=_blank で開く
 * - 参加者を招待: メール/Discord/Slack 経由で招待メッセージを送信できるモーダル
 * - 参加者URLをコピー: クリップボードへ
 */
export function JishushitsuCard() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const handleCopyUrl = async () => {
    if (!PARTICIPANT_URL) {
      setError('NEXT_PUBLIC_DIGIHARA_BASE_URL が未設定です');
      return;
    }
    try {
      await navigator.clipboard.writeText(PARTICIPANT_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('クリップボードへのコピーに失敗しました');
    }
  };

  if (!PARTICIPANT_URL) return null;

  return (
    <>
      <div className="mb-6 rounded-xl border border-stone-200 bg-gradient-to-br from-amber-50 to-stone-50 p-4 shadow-sm dark:border-stone-700 dark:from-stone-800/60 dark:to-stone-900/60 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-lg" aria-hidden>🎙️</span>
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200 sm:text-base">
            セッションルーム — 録音 & AI要約
          </h2>
          <span className="ml-auto rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
            ライブ
          </span>
        </div>

        <p className="mb-4 text-xs text-stone-600 dark:text-stone-400 sm:text-sm">
          ホストとして入室すると <strong className="text-red-600 dark:text-red-400">自動で録音</strong> が始まります。
          終了時に文字起こしとAI要約が自動で生成されます。
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          {/* 主アクション: 録音セッション開始（aタグでサーバーリダイレクト） */}
          <a
            href="/api/jishushitsu/start"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 active:scale-95 sm:col-span-3 sm:py-3 sm:text-base"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <span>録音セッションを開始（ホスト）</span>
          </a>

          {/* 副アクション: 参加者を招待 */}
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:scale-95 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            参加者を招待
          </button>

          {/* 副アクション: URLコピー */}
          <button
            onClick={handleCopyUrl}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:scale-95 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            {copied ? 'コピーしました' : 'URLをコピー'}
          </button>

          {/* 参加者URL（小さく表示） */}
          <a
            href={PARTICIPANT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-3 truncate text-center text-[11px] text-stone-500 underline-offset-2 hover:underline dark:text-stone-400"
          >
            参加者: {PARTICIPANT_URL.replace(/^https?:\/\//, '')}
          </a>
        </div>

        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      <InviteModal
        open={inviteOpen}
        participantUrl={PARTICIPANT_URL}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}
