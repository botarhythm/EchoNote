'use client';

import { useState } from 'react';
import type { SessionSummary } from '@/lib/types';

interface Branch {
  label: string;
  color: string;
  bgColor: string;
  items: string[];
}

function buildBranches(summary: SessionSummary): Branch[] {
  const branches: Branch[] = [];

  if (summary.clientPains.length > 0) {
    branches.push({
      label: '課題',
      color: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/50',
      items: summary.clientPains,
    });
  }
  if (summary.adviceGiven.length > 0) {
    branches.push({
      label: 'アドバイス',
      color: 'text-blue-700 dark:text-blue-300',
      bgColor: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/50',
      items: summary.adviceGiven,
    });
  }
  if (summary.nextActions.length > 0) {
    branches.push({
      label: 'ネクストアクション',
      color: 'text-emerald-700 dark:text-emerald-300',
      bgColor: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/50',
      items: summary.nextActions.map((a) => `${a.task}（${a.owner}${a.deadline ? ` / ${a.deadline}` : ''}）`),
    });
  }
  if (summary.homeworkForClient.length > 0) {
    branches.push({
      label: '宿題',
      color: 'text-amber-700 dark:text-amber-300',
      bgColor: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50',
      items: summary.homeworkForClient,
    });
  }

  return branches;
}

export function MindMap({ summary }: { summary: SessionSummary }) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const branches = buildBranches(summary);

  const hasContent = branches.length >= 2;
  if (!hasContent) return null;

  const toggle = (i: number) =>
    setCollapsed((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        構造マップ
      </h3>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex min-w-[480px] items-start gap-4">

          {/* 中心ノード */}
          <div className="flex shrink-0 items-center self-center">
            <div className="max-w-[160px] rounded-xl border-2 border-slate-400 bg-slate-50 px-4 py-3 text-center text-sm font-semibold leading-snug text-slate-800 shadow-sm dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100">
              {summary.title}
            </div>
            {/* 中心→ブランチの接続線 */}
            <div className="h-0.5 w-6 bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* ブランチ列 */}
          <div className="flex flex-1 flex-col gap-3">
            {branches.map((branch, i) => (
              <div key={i} className="flex items-start gap-2">
                {/* ブランチヘッダー */}
                <button
                  onClick={() => toggle(i)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${branch.bgColor} ${branch.color}`}
                >
                  <span>{branch.label}</span>
                  <span className="opacity-60">{collapsed[i] ? '▶' : '▼'}</span>
                  <span className="ml-0.5 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] dark:bg-black/20">
                    {branch.items.length}
                  </span>
                </button>

                {/* リーフノード */}
                {!collapsed[i] && (
                  <div className="flex flex-1 flex-col gap-1.5">
                    {/* ブランチ→リーフの縦線 */}
                    <div className="flex items-stretch">
                      <div className="mr-2 flex flex-col items-center">
                        <div className="h-full w-0.5 bg-slate-200 dark:bg-slate-700" />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        {branch.items.map((item, j) => (
                          <div key={j} className="flex items-start gap-1.5">
                            <div className="mt-2.5 h-0.5 w-3 shrink-0 bg-slate-200 dark:bg-slate-700" />
                            <div
                              className={`rounded-md border px-2.5 py-1.5 text-xs leading-snug ${branch.bgColor} ${branch.color}`}
                            >
                              {item}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
