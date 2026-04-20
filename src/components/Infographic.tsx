'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { SessionSummary, SessionMoment } from '@/lib/types';
import { getSummaryMode } from '@/lib/types';

// ─── テーマ検知（ダークモード対応） ──────────────────────────────────────────

function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

// ─── 配色 ─────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  pains:        '#ef4444',   // red-500
  advice:       '#3b82f6',   // blue-500
  nextActions:  '#10b981',   // emerald-500
  homework:     '#f59e0b',   // amber-500
  themes:       '#6366f1',   // indigo-500
  moments:      '#8b5cf6',   // violet-500
  nextSessions: '#64748b',   // slate-500
} as const;

const MOMENT_TYPE_COLORS: Record<SessionMoment['type'], string> = {
  breakthrough: '#10b981',   // emerald
  resistance:   '#f97316',   // orange
  insight:      '#3b82f6',   // blue
  decision:     '#8b5cf6',   // violet
  emotion:      '#ec4899',   // pink
};

const MOMENT_TYPE_LABELS: Record<SessionMoment['type'], string> = {
  breakthrough: '突破口',
  resistance:   '抵抗・葛藤',
  insight:      '気づき',
  decision:     '決断',
  emotion:      '感情的変化',
};

// ─── サマリー構成データ ──────────────────────────────────────────────────────

interface CategoryDatum {
  name: string;
  value: number;
  color: string;
}

function buildCategoryData(summary: SessionSummary): CategoryDatum[] {
  const isBotarhythm = getSummaryMode(summary) === 'botarhythm';
  const data: CategoryDatum[] = [
    { name: '課題',            value: summary.clientPains.length,       color: CATEGORY_COLORS.pains },
    { name: 'アドバイス',       value: summary.adviceGiven.length,       color: CATEGORY_COLORS.advice },
    { name: 'ネクストアクション', value: summary.nextActions.length,       color: CATEGORY_COLORS.nextActions },
    { name: '宿題',             value: summary.homeworkForClient.length, color: CATEGORY_COLORS.homework },
  ];

  if (isBotarhythm) {
    if (summary.underlyingThemes?.length)     data.push({ name: '深層テーマ',   value: summary.underlyingThemes.length,     color: CATEGORY_COLORS.themes });
    if (summary.sessionMoments?.length)       data.push({ name: '転換点',       value: summary.sessionMoments.length,       color: CATEGORY_COLORS.moments });
    if (summary.nextSessionSuggestions?.length) data.push({ name: '次回提案',   value: summary.nextSessionSuggestions.length, color: CATEGORY_COLORS.nextSessions });
  }

  return data.filter((d) => d.value > 0);
}

// ─── 発言者バランス ──────────────────────────────────────────────────────────

interface SpeakerDatum {
  name: string;
  value: number;
  color: string;
}

function buildSpeakerData(summary: SessionSummary, labelA: string, labelB: string): SpeakerDatum[] {
  const countA = summary.keyQuotes.filter((q) => q.speaker === 'A').length;
  const countB = summary.keyQuotes.filter((q) => q.speaker === 'B').length;
  if (countA === 0 && countB === 0) return [];
  return [
    { name: labelA || '話者A', value: countA, color: '#0ea5e9' },  // sky-500
    { name: labelB || '話者B', value: countB, color: '#a855f7' },  // purple-500
  ];
}

// ─── 転換点タイプ分布 ────────────────────────────────────────────────────────

function buildMomentData(summary: SessionSummary): Array<{ name: string; value: number; color: string }> {
  if (!summary.sessionMoments?.length) return [];
  const counts: Partial<Record<SessionMoment['type'], number>> = {};
  summary.sessionMoments.forEach((m) => {
    counts[m.type] = (counts[m.type] ?? 0) + 1;
  });
  return (Object.keys(counts) as SessionMoment['type'][]).map((type) => ({
    name: MOMENT_TYPE_LABELS[type],
    value: counts[type]!,
    color: MOMENT_TYPE_COLORS[type],
  }));
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

interface InfographicProps {
  summary: SessionSummary;
  speakerALabel?: string;
  speakerBLabel?: string;
}

export function Infographic({ summary, speakerALabel, speakerBLabel }: InfographicProps) {
  const isDark = useDarkMode();
  const isBotarhythm = getSummaryMode(summary) === 'botarhythm';

  const categoryData = useMemo(() => buildCategoryData(summary), [summary]);
  const speakerData = useMemo(
    () => buildSpeakerData(summary, speakerALabel ?? '話者A', speakerBLabel ?? '話者B'),
    [summary, speakerALabel, speakerBLabel]
  );
  const momentData = useMemo(() => buildMomentData(summary), [summary]);

  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.25)';
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#e2e8f0' : '#334155';

  const tooltipStyle = {
    backgroundColor: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: 6,
    fontSize: 12,
    color: tooltipText,
  };

  return (
    <div className="space-y-6">
      {/* サマリー構成（全モード共通） */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          サマリー構成
        </h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} />
              <YAxis allowDecimals={false} tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: gridColor }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {categoryData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          各カテゴリに含まれる項目数。全体のバランスを一目で確認
        </p>
      </section>

      {/* 発言者バランス（keyQuotesベース） */}
      {speakerData.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            印象的な発言の話者バランス
          </h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={speakerData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                  style={{ fontSize: 11, fill: axisColor }}
                >
                  {speakerData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: axisColor }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* 転換点タイプ分布（Botarhythmのみ） */}
      {isBotarhythm && momentData.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            転換点のタイプ分布
          </h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={momentData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                  style={{ fontSize: 11, fill: axisColor }}
                >
                  {momentData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: axisColor }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            どのタイプの場面が多かったか。セッションの質的な特徴が見えます
          </p>
        </section>
      )}

      {/* KPI タイル */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="課題" value={summary.clientPains.length} color="red" />
        <KpiTile label="アドバイス" value={summary.adviceGiven.length} color="blue" />
        <KpiTile label="アクション" value={summary.nextActions.length} color="emerald" />
        <KpiTile label="宿題" value={summary.homeworkForClient.length} color="amber" />
        {isBotarhythm && (
          <>
            <KpiTile label="深層テーマ" value={summary.underlyingThemes?.length ?? 0} color="indigo" />
            <KpiTile label="転換点" value={summary.sessionMoments?.length ?? 0} color="violet" />
            <KpiTile label="印象的な発言" value={summary.keyQuotes.length} color="slate" />
            <KpiTile label="次回提案" value={summary.nextSessionSuggestions?.length ?? 0} color="teal" />
          </>
        )}
      </section>
    </div>
  );
}

// ─── KPI タイル ──────────────────────────────────────────────────────────────

const KPI_COLORS = {
  red:     'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  blue:    'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  amber:   'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  indigo:  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  violet:  'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  slate:   'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
  teal:    'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
} as const;

function KpiTile({ label, value, color }: { label: string; value: number; color: keyof typeof KPI_COLORS }) {
  return (
    <div className={`rounded-lg p-3 ${KPI_COLORS[color]}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[11px] font-medium opacity-80">{label}</div>
    </div>
  );
}
