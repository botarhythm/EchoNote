'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Session, SpeakerNames } from '@/lib/types';
import { SummaryView } from '@/components/SummaryView';
import { SummaryVisualizations } from '@/components/SummaryVisualizations';

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const [session, setSession] = useState<Partial<Session> | null>(null);
  const [speakerNames, setSpeakerNames] = useState<SpeakerNames | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isAnonymized, setIsAnonymized] = useState(false);

  // クライアント向けページは常にライト（ナチュラル）テーマで表示する。
  // ルートレイアウトが html に dark を付与するため、ここで外し、
  // 離脱時はアプリ側の保存テーマ設定に戻す
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      if (localStorage.getItem('echonote-theme') !== 'light') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/share/${params.token}`);
      if (!res.ok) {
        setError('この共有リンクは無効です');
        return;
      }
      const data = await res.json() as {
        session: Partial<Session>;
        speakerNames?: SpeakerNames;
        isAnonymized: boolean;
      };
      setSession(data.session);
      setSpeakerNames(data.speakerNames);
      setIsAnonymized(data.isAnonymized ?? false);
    }
    load();
  }, [params.token]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#faf6ef]">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#faf6ef]">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-stone-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf6ef] text-stone-800">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 text-xs uppercase tracking-[0.2em] text-stone-400">
          EchoNote · Session Report
        </div>

        {isAnonymized && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>このセッションはプライバシー保護のため、一部の情報が匿名化されています。</span>
          </div>
        )}

        {/* ── 紙面風タイトルブロック ── */}
        <header className="mx-auto mb-6 max-w-[760px] text-center">
          <p className="mb-2 font-serif text-[11px] tracking-[0.3em] text-stone-400">
            SESSION SUMMARY
          </p>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-stone-900 sm:text-[1.75rem]">
            {session.summary?.title}
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            {session.summary?.date || session.meta?.date} &middot;{' '}
            {session.summary?.clientName || session.meta?.clientName}
          </p>
        </header>

        {/* コンテンツ */}
        {session.summary ? (
          <div className="space-y-8">
            <SummaryView summary={session.summary} speakerNames={speakerNames} />
            <SummaryVisualizations
              summary={session.summary}
              speakerALabel={speakerNames?.A}
              speakerBLabel={speakerNames?.B}
            />
          </div>
        ) : (
          <p className="text-stone-500">データがありません</p>
        )}

        <footer className="mt-12 border-t border-stone-200 pt-6 text-center text-[11px] tracking-wider text-stone-400">
          このレポートはセッション録音をもとに自動生成されています
        </footer>
      </div>
    </div>
  );
}
