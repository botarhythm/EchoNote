'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Session, SessionSummary, SpeakerNames, ClientSettings } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { SummaryView } from '@/components/SummaryView';
import { TranscriptView } from '@/components/TranscriptView';
import { ShareButton } from '@/components/ShareButton';
import { MindMap } from '@/components/MindMap';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SummaryCustomizer } from '@/components/SummaryCustomizer';

type Tab = 'summary' | 'transcript';

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [clientSettings, setClientSettings] = useState<ClientSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${params.id}`);
      if (!res.ok) {
        setError('セッションが見つかりません');
        return;
      }
      const data = (await res.json()) as { session: Session };
      setSession(data.session);
    } catch {
      setError('読み込みエラー');
    }
  }, [params.id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // クライアント設定を読み込む（clientName確定後）
  useEffect(() => {
    const clientName = session?.meta.clientName;
    if (!clientName || clientName === '不明') return;
    fetch(`/api/clients/${encodeURIComponent(clientName)}/settings`)
      .then((r) => r.json())
      .then((data: { settings: ClientSettings }) => setClientSettings(data.settings))
      .catch(() => {});
  }, [session?.meta.clientName]);

  // 処理中は3秒ごとにポーリング
  useEffect(() => {
    if (!session) return;
    if (!['pending', 'transcribing', 'summarizing'].includes(session.status)) return;
    const timer = setInterval(loadSession, 3000);
    return () => clearInterval(timer);
  }, [session?.status, loadSession]);

  const handleTitleSave = async () => {
    const newTitle = titleDraft.trim();
    if (!newTitle || !session || newTitle === session.summary?.title) {
      setEditingTitle(false);
      return;
    }
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) {
      setSession((prev) =>
        prev?.summary ? { ...prev, summary: { ...prev.summary, title: newTitle } } : prev
      );
    }
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') setEditingTitle(false);
  };

  // speakerNames: クライアント設定があればそちら、なければ自動検出相当のデフォルト
  const speakerNames: SpeakerNames = {
    A: clientSettings?.speakerA || 'もっちゃん',
    B: clientSettings?.speakerB || session?.meta.clientName || '',
  };

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-red-500 dark:text-red-400">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          &larr; 一覧に戻る
        </Link>
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
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          &larr; 一覧に戻る
        </Link>
        <div className="flex items-center gap-2">
          {session.status === 'done' && <ShareButton sessionId={session.id} />}
          <ThemeToggle />
        </div>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* タイトル：クリックで編集 */}
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleTitleSave}
                className="w-full rounded-lg border border-blue-400 bg-white px-3 py-1.5 text-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); handleTitleSave(); }}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                保存
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); setEditingTitle(false); }}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setTitleDraft(session.summary?.title || session.meta.clientName);
                setEditingTitle(true);
              }}
              className="group flex items-center gap-2 text-left"
              title="クリックして編集"
            >
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {session.summary?.title || session.meta.clientName}
              </h1>
              <span className="text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-600">
                ✎
              </span>
            </button>
          )}
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {session.meta.date} &middot; {session.meta.clientName}
            {session.meta.memo && ` · ${session.meta.memo}`}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {/* 処理中の進捗表示 */}
      {['pending', 'transcribing', 'summarizing'].includes(session.status) && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/40 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">処理中</span>
          </div>
          <div className="space-y-1.5 font-mono text-xs text-blue-600 dark:text-blue-400">
            <div className="flex items-start gap-2">
              <span className="text-blue-400 dark:text-blue-500">›</span>
              <span>{session.progressMessage || '処理待ち...'}</span>
            </div>
          </div>
        </div>
      )}

      {/* タブ切り替え */}
      <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800/50">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'summary'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          サマリー
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'transcript'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          書き起こし
        </button>
      </div>

      {/* コンテンツ */}
      {activeTab === 'summary' && session.summary ? (
        <div className="space-y-8">
          <SummaryView summary={session.summary} speakerNames={speakerNames} />
          <MindMap summary={session.summary} />
          {session.transcript && session.transcript.length > 0 && (
            <SummaryCustomizer
              sessionId={session.id}
              clientName={session.meta.clientName}
              onRegenerated={(newSummary: SessionSummary) =>
                setSession((prev) => (prev ? { ...prev, summary: newSummary } : prev))
              }
            />
          )}
        </div>
      ) : activeTab === 'summary' ? (
        <p className="text-slate-500 dark:text-slate-400">サマリーはまだ生成されていません</p>
      ) : session.transcript ? (
        <TranscriptView transcript={session.transcript} speakerNames={speakerNames} />
      ) : (
        <p className="text-slate-500 dark:text-slate-400">書き起こしはまだ完了していません</p>
      )}
    </div>
  );
}
