'use client';

import { useEffect, useRef } from 'react';
import type { SessionSummary } from '@/lib/types';

function escapeLabel(text: string): string {
  return text.replace(/["\[\]()]/g, ' ').replace(/\n/g, ' ').slice(0, 60);
}

function buildMermaidDef(summary: SessionSummary): string {
  const lines: string[] = ['mindmap'];
  lines.push(`  root((${escapeLabel(summary.title)}))`);

  if (summary.clientPains.length > 0) {
    lines.push('    ::icon(fa fa-exclamation-triangle)');
    lines.push('    課題');
    summary.clientPains.forEach((p) => lines.push(`      ${escapeLabel(p)}`));
  }

  if (summary.adviceGiven.length > 0) {
    lines.push('    アドバイス');
    summary.adviceGiven.forEach((a) => lines.push(`      ${escapeLabel(a)}`));
  }

  if (summary.nextActions.length > 0) {
    lines.push('    ネクストアクション');
    summary.nextActions.forEach((na) =>
      lines.push(`      ${escapeLabel(na.task)} [${na.owner}]`)
    );
  }

  if (summary.homeworkForClient.length > 0) {
    lines.push('    宿題');
    summary.homeworkForClient.forEach((hw) => lines.push(`      ${escapeLabel(hw)}`));
  }

  return lines.join('\n');
}

export function MindMap({ summary }: { summary: SessionSummary }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 内容が十分ある場合のみ表示
  const hasContent =
    summary.clientPains.length + summary.adviceGiven.length + summary.nextActions.length > 2;

  useEffect(() => {
    if (!hasContent || !containerRef.current) return;

    const renderChart = async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
        mindmap: { padding: 20 },
      });

      const def = buildMermaidDef(summary);
      try {
        const { svg } = await mermaid.render('mindmap-svg', def);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        // マインドマップ生成失敗は静かに無視
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      }
    };

    renderChart();
  }, [summary, hasContent]);

  if (!hasContent) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        構造マップ
      </h3>
      <div
        ref={containerRef}
        className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50"
      />
    </section>
  );
}
