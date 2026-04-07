'use client';

import { useState } from 'react';

export function ShareButton({ sessionId }: { sessionId: string }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    if (shareUrl) {
      await copyToClipboard(shareUrl);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) return;

      const { token } = await res.json() as { token: string };
      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      await copyToClipboard(url);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {copying ? 'コピーしました!' : loading ? '作成中...' : shareUrl ? 'URLをコピー' : '共有リンク作成'}
    </button>
  );
}
