'use client';

import { useState, useCallback } from 'react';
import type { CrossAnalysisResult, CrossTheme } from '@/lib/types';

const STATUS_LABELS: Record<CrossTheme['status'], { label: string; color: string }> = {
  ongoing:   { label: '継続中',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  deepening: { label: '深まっている', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  resolved:  { label: '前進・解消', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  new:       { label: '新規浮上',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
};

interface CrossAnalysisViewProps {
  clientName: string;
  onClose?: () => void;
}

export function CrossAnalysisView({ clientName, onClose }: CrossAnalysisViewProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CrossAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientName)}/cross-analysis`, {
        method: 'POST',
      });
      const data = (await res.json()) as { analysis?: CrossAnalysisResult; error?: string };
      if (!res.ok || !data.analysis) {
        throw new Error(data.error || 'クロス分析に失敗しました');
      }
      setResult(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'クロス分析に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [clientName]);

  // ─── 未実行 ───
  if (!result && !loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="rounded-full bg-violet-100 p-4 dark:bg-violet-900/20">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {clientName} の全セッションを横断分析
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            完了済みセッションのサマリーをAIが一括分析します。<br />
            成長の軌跡・繰り返すテーマ・次のフェーズへの提言を生成します。
          </p>
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        <button
          onClick={run}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 active:bg-violet-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          クロス分析を開始
        </button>
      </div>
    );
  }

  // ─── 生成中 ───
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">AIがセッションを横断分析しています...</p>
          <p className="mt-1 text-xs text-slate-400">全セッションのサマリーを読み込み、パターンを分析中です</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  // ─── 結果表示 ───
  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {result.clientName} — クロス分析レポート
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {result.periodSummary} · 分析日時: {new Date(result.generatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          title="再分析"
          className="shrink-0 rounded-lg border border-slate-300 p-2 text-slate-500 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* 成長の物語 */}
      <Section title="成長の物語">
        <p className="leading-relaxed text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {result.progressNarrative}
        </p>
      </Section>

      {/* 繰り返し登場するテーマ */}
      {result.recurringThemes.length > 0 && (
        <Section title="繰り返し登場するテーマ">
          <div className="space-y-3">
            {result.recurringThemes.map((theme, i) => {
              const badge = STATUS_LABELS[theme.status];
              return (
                <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm text-slate-800 dark:text-slate-100">{theme.theme}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.color}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-slate-400">{theme.sessionCount}セッションに登場</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{theme.evolution}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* 課題の変化（3列） */}
      <Section title="課題の変化">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {result.resolvedIssues.length > 0 && (
            <div className="rounded-lg border border-green-100 bg-green-50/50 p-3 dark:border-green-900/30 dark:bg-green-900/10">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">前進・解消</p>
              <ul className="space-y-1.5">
                {result.resolvedIssues.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-green-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.persistentChallenges.length > 0 && (
            <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3 dark:border-orange-900/30 dark:bg-orange-900/10">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">継続する課題</p>
              <ul className="space-y-1.5">
                {result.persistentChallenges.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-orange-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.emergingIssues.length > 0 && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/30 dark:bg-blue-900/10">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">新たに浮上</p>
              <ul className="space-y-1.5">
                {result.emergingIssues.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* マイルストーン */}
      {result.keyMilestones.length > 0 && (
        <Section title="重要なマイルストーン">
          <div className="space-y-3">
            {result.keyMilestones.map((m, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400">{i + 1}</span>
                  </div>
                  {i < result.keyMilestones.length - 1 && (
                    <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  <p className="text-[10px] font-medium text-slate-400">{m.sessionDate}</p>
                  <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{m.description}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">→ {m.significance}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 行動パターン & 思考の変化 */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {result.behavioralPatterns.length > 0 && (
          <Section title="行動パターン">
            <ul className="space-y-2">
              {result.behavioralPatterns.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title="アクション実行の傾向">
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
            {result.actionPattern}
          </p>
        </Section>
      </div>

      {/* 思考・姿勢の変化 */}
      <Section title="思考・姿勢の変化">
        <p className="leading-relaxed text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {result.mindsetEvolution}
        </p>
      </Section>

      {/* コーチング関係 & 現在のフェーズ */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Section title="コーチング関係の評価">
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
            {result.coachingRelationship}
          </p>
        </Section>
        <Section title="現在のフェーズ">
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
            {result.currentPhase}
          </p>
        </Section>
      </div>

      {/* 次のフェーズへの提言 */}
      <Section title="次のフェーズへの提言" accent>
        <p className="leading-relaxed text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {result.nextPhaseRecommendation}
        </p>
      </Section>

      {/* 次回セッションの優先テーマ */}
      {result.priorityTopics.length > 0 && (
        <Section title="次回セッションの優先テーマ">
          <ol className="space-y-2">
            {result.priorityTopics.map((topic, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700 dark:text-slate-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{topic}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

// ─── 補助コンポーネント ────────────────────────────────────────────────────────

function Section({
  title,
  children,
  accent = false,
}: {
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={accent ? 'rounded-lg border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-900/10' : ''}>
      <h3 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${accent ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}
