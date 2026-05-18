'use client';

import { useEffect, useState } from 'react';

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
}

interface ChannelStatus {
  discord: boolean;
  slack: boolean;
}

interface StudentUrlResponse {
  url: string;
  expiresAt: number;
}

/**
 * セッションの参加者を招待するためのモーダル。
 *
 * - 開く度に `/api/jishushitsu/student-url` でワンタイム URL を発行
 * - メッセージを編集して、メール / Discord / Slack へ送信
 * - 各リンクは 1 回限り (受講生が退出すると無効)
 */
export function InviteModal({ open, onClose }: InviteModalProps) {
  const [participantUrl, setParticipantUrl] = useState<string>('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<ChannelStatus>({ discord: false, slack: false });
  const [busy, setBusy] = useState<null | 'discord' | 'slack' | 'copy'>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setUrlError(null);
    setParticipantUrl('');
    setMessage('');

    let cancelled = false;
    fetch('/api/jishushitsu/invite')
      .then((r) => r.json())
      .then((d: ChannelStatus) => {
        if (!cancelled) setStatus(d);
      })
      .catch(() => {
        if (!cancelled) setStatus({ discord: false, slack: false });
      });

    fetch('/api/jishushitsu/student-url')
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d?.error || `URL 発行失敗 (${r.status})`);
        }
        return (await r.json()) as StudentUrlResponse;
      })
      .then((d) => {
        if (cancelled) return;
        setParticipantUrl(d.url);
        setMessage(buildDefaultMessage(d.url));
      })
      .catch((err) => {
        if (cancelled) return;
        setUrlError(err instanceof Error ? err.message : 'URL 発行に失敗しました');
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const sendVia = async (method: 'discord' | 'slack') => {
    setBusy(method);
    setFeedback(null);
    try {
      const res = await fetch('/api/jishushitsu/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFeedback({ ok: true, text: `${method === 'discord' ? 'Discord' : 'Slack'} に送信しました` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ ok: false, text: msg });
    } finally {
      setBusy(null);
    }
  };

  const sendViaMail = () => {
    const subject = encodeURIComponent('【Botarhythm Studio】セッション参加のご案内');
    const body = encodeURIComponent(message);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const copyMessage = async () => {
    setBusy('copy');
    try {
      await navigator.clipboard.writeText(message);
      setFeedback({ ok: true, text: 'クリップボードにコピーしました' });
    } catch {
      setFeedback({ ok: false, text: 'コピーに失敗しました' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              参加者を招待
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ワンタイムリンク (1 回限り・退出後は無効) を発行します
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {urlError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {urlError}
          </div>
        ) : !participantUrl ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
            ワンタイムリンクを発行中…
          </div>
        ) : (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ActionButton
            onClick={sendViaMail}
            icon="✉️"
            label="メール"
            disabled={!participantUrl}
          />
          <ActionButton
            onClick={() => sendVia('discord')}
            icon="💬"
            label="Discord"
            disabled={!participantUrl || !status.discord || busy !== null}
            busy={busy === 'discord'}
            disabledHint={!status.discord ? '未設定' : undefined}
          />
          <ActionButton
            onClick={() => sendVia('slack')}
            icon="💼"
            label="Slack"
            disabled={!participantUrl || !status.slack || busy !== null}
            busy={busy === 'slack'}
            disabledHint={!status.slack ? '未設定' : undefined}
          />
          <ActionButton
            onClick={copyMessage}
            icon="📋"
            label="コピー"
            busy={busy === 'copy'}
            disabled={!participantUrl || busy !== null}
          />
        </div>

        {feedback && (
          <p
            className={`mt-3 text-xs ${
              feedback.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {feedback.text}
          </p>
        )}

        {!status.discord && !status.slack && (
          <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
            Discord / Slack 連携は <code>DISCORD_WEBHOOK_URL</code> /{' '}
            <code>SLACK_WEBHOOK_URL</code> を環境変数で設定すると有効化されます。
          </p>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  disabled,
  busy,
  disabledHint,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  disabledHint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      title={disabledHint}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{busy ? '送信中…' : label}</span>
      {disabledHint && <span className="text-[10px] text-slate-400">{disabledHint}</span>}
    </button>
  );
}

function buildDefaultMessage(participantUrl: string): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `【Botarhythm Studio セッションのご案内】

日時: ${yyyy}-${mm}-${dd}
参加URL (1 回限り・退出後は無効): ${participantUrl}

リンクを開いてお名前を入力するとご参加いただけます。
ブラウザのマイク・カメラ権限を許可してください（推奨ブラウザ: Chrome 最新版）。`;
}
