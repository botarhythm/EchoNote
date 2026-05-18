'use client';

import { useMemo, useState } from 'react';
import { InviteModal } from './InviteModal';

type InitialRec = 'off' | 'audio' | 'screen' | 'both';

const BASE_URL = process.env.NEXT_PUBLIC_DIGIHARA_BASE_URL || '';

function computeInitialRec(audio: boolean, screen: boolean): InitialRec {
  if (audio && screen) return 'both';
  if (audio) return 'audio';
  if (screen) return 'screen';
  return 'off';
}

/**
 * Botarhythm Studio セッションルームのランチャーカード。
 *
 * - 録音セッションを開始: /api/jishushitsu/start?rec=... へ 302、Jishushitsu のワンタイム URL に飛ばす
 * - 録音 / 録画 を別個に ON/OFF してから開始できる
 * - 参加者を招待: モーダル経由でメール/Discord/Slack 送信、ワンタイム URL を都度発行
 */
export function JishushitsuCard() {
  const [recAudio, setRecAudio] = useState(true);
  const [recScreen, setRecScreen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const initialRec = useMemo(
    () => computeInitialRec(recAudio, recScreen),
    [recAudio, recScreen]
  );
  const startHref = `/api/jishushitsu/start?rec=${initialRec}`;

  if (!BASE_URL) return null;

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

        <p className="mb-3 text-xs text-stone-600 dark:text-stone-400 sm:text-sm">
          ワンタイムリンクで入室します。下のチェックで入室直後に開始する記録方法を選べます。
        </p>

        {/* 録音 / 録画チェック */}
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-stone-200 bg-white/70 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900/40">
          <label className="inline-flex cursor-pointer items-center gap-2 text-stone-700 dark:text-stone-200">
            <input
              type="checkbox"
              checked={recAudio}
              onChange={(e) => setRecAudio(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-red-600 focus:ring-red-400 dark:border-stone-600"
            />
            <span>🎙️ 録音 (AI要約)</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-stone-700 dark:text-stone-200">
            <input
              type="checkbox"
              checked={recScreen}
              onChange={(e) => setRecScreen(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-400 dark:border-stone-600"
            />
            <span>🎥 録画 (画面)</span>
          </label>
          <span className="ml-auto self-center text-[11px] text-stone-500 dark:text-stone-400">
            入室後にいつでも ON/OFF 可能
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={startHref}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 active:scale-95 sm:col-span-2 sm:py-3 sm:text-base"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <span>セッションを開始（ホスト）</span>
          </a>

          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:scale-95 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 sm:col-span-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            参加者を招待 (ワンタイムリンク発行)
          </button>
        </div>

        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
          受講生向けのリンクは「参加者を招待」から発行できます。各リンクは 1 回限り (退出後は無効)。
        </p>
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
