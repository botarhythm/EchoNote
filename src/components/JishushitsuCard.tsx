'use client';

import { useState } from 'react';

const PARTICIPANT_URL = process.env.NEXT_PUBLIC_DIGIHARA_BASE_URL || '';

/**
 * 自習室（digihara_jishushitsu）ランチャーカード。
 * - 講師として開く: サーバー側 API から鍵付きURLを取得して新タブで開く
 * - 参加者URLをコピー: 受講生に渡すための公開URLをクリップボードへ
 */
export function JishushitsuCard() {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenInstructor = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/jishushitsu/instructor-url');
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || '講師URLを取得できませんでした');
      }
      // noopener で referrer 漏れを防止
      const win = window.open(data.url, '_blank', 'noopener,noreferrer');
      if (!win) {
        setError('ポップアップがブロックされました。ブラウザ設定をご確認ください。');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyParticipantUrl = async () => {
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

  if (!PARTICIPANT_URL) {
    // 設定なしのときは表示しない
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border border-stone-200 bg-gradient-to-br from-amber-50 to-stone-50 p-4 shadow-sm dark:border-stone-700 dark:from-stone-800/60 dark:to-stone-900/60 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg" aria-hidden>🎓</span>
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200 sm:text-base">
          デジタル原っぱ大学 自習室
        </h2>
        <span className="ml-auto text-[11px] text-stone-500 dark:text-stone-400">
          ライブ授業
        </span>
      </div>

      <p className="mb-3 text-xs text-stone-600 dark:text-stone-400 sm:text-sm">
        講師として入室、または参加者URLをコピーして受講生に共有できます。
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleOpenInstructor}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 active:scale-95 dark:bg-amber-700 dark:hover:bg-amber-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M14 3h7v7" />
            <path d="M21 3l-9 9" />
            <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
          </svg>
          {busy ? '開いています…' : '講師として開く'}
        </button>

        <button
          onClick={handleCopyParticipantUrl}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:scale-95 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          {copied ? 'コピーしました' : '参加者URLをコピー'}
        </button>

        <a
          href={PARTICIPANT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-center text-xs text-stone-500 underline-offset-2 hover:underline dark:text-stone-400"
        >
          {PARTICIPANT_URL.replace(/^https?:\/\//, '')}
        </a>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
