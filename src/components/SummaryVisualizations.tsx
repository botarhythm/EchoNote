'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { SessionSummary } from '@/lib/types';

// 重いライブラリ（@xyflow/react, dagre, recharts）を含むため遅延ロード
// 初回ページ遷移時に同期評価されないようにし、書き起こし/サマリータブの切り替えも軽量にする
const VizFallback = () => (
  <div className="flex h-[640px] w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50/50 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-500">
    可視化を読み込み中...
  </div>
);

const MindMap = dynamic(() => import('./MindMap').then((m) => m.MindMap), {
  ssr: false,
  loading: VizFallback,
});
const RelationshipGraph = dynamic(
  () => import('./RelationshipGraph').then((m) => m.RelationshipGraph),
  { ssr: false, loading: VizFallback }
);
const Infographic = dynamic(() => import('./Infographic').then((m) => m.Infographic), {
  ssr: false,
  loading: VizFallback,
});

type VizTab = 'mindmap' | 'relationship' | 'infographic';

const TABS: Array<{ id: VizTab; label: string; description: string }> = [
  { id: 'mindmap',      label: 'マインドマップ', description: 'サマリー全体の構造を放射状に' },
  { id: 'relationship', label: '関係図',         description: '課題→アドバイス→アクションの因果連鎖' },
  { id: 'infographic',  label: 'インフォグラフィック', description: 'カテゴリ別の数量・比率を可視化' },
];

interface Props {
  summary: SessionSummary;
  speakerALabel?: string;
  speakerBLabel?: string;
}

export function SummaryVisualizations({ summary, speakerALabel, speakerBLabel }: Props) {
  const [active, setActive] = useState<VizTab>('mindmap');

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          可視化
        </h3>
        <p className="hidden text-xs text-slate-400 sm:block">
          {TABS.find((t) => t.id === active)?.description}
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/40">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
              active === tab.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 本体 */}
      <div>
        {active === 'mindmap' && <MindMap summary={summary} />}
        {active === 'relationship' && <RelationshipGraph summary={summary} />}
        {active === 'infographic' && (
          <Infographic summary={summary} speakerALabel={speakerALabel} speakerBLabel={speakerBLabel} />
        )}
      </div>
    </section>
  );
}
