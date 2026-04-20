'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  Handle,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

import type { SessionSummary, SessionMoment } from '@/lib/types';
import { getSummaryMode } from '@/lib/types';

// ─── ノードタイプ定義 ────────────────────────────────────────────────────────

type RelationCategory = 'pain' | 'advice' | 'action' | 'homework' | 'moment' | 'stateShift';

const CATEGORY_STYLE: Record<RelationCategory, { bg: string; border: string; text: string; label: string }> = {
  pain:       { bg: 'bg-red-50 dark:bg-red-950/40',         border: 'border-red-300 dark:border-red-800/60',         text: 'text-red-800 dark:text-red-200',         label: '課題' },
  advice:     { bg: 'bg-blue-50 dark:bg-blue-950/40',       border: 'border-blue-300 dark:border-blue-800/60',       text: 'text-blue-800 dark:text-blue-200',       label: 'アドバイス' },
  action:     { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-800/60', text: 'text-emerald-800 dark:text-emerald-200', label: 'アクション' },
  homework:   { bg: 'bg-amber-50 dark:bg-amber-950/40',     border: 'border-amber-300 dark:border-amber-800/60',     text: 'text-amber-800 dark:text-amber-200',     label: '宿題' },
  moment:     { bg: 'bg-violet-50 dark:bg-violet-950/40',   border: 'border-violet-300 dark:border-violet-800/60',   text: 'text-violet-800 dark:text-violet-200',   label: '転換点' },
  stateShift: { bg: 'bg-teal-50 dark:bg-teal-950/40',       border: 'border-teal-300 dark:border-teal-800/60',       text: 'text-teal-800 dark:text-teal-200',       label: '状態変化' },
};

const MOMENT_TYPE_BADGE: Record<SessionMoment['type'], string> = {
  breakthrough: '突破口',
  resistance:   '抵抗',
  insight:      '気づき',
  decision:     '決断',
  emotion:      '感情',
};

interface RelationNodeData extends Record<string, unknown> {
  category: RelationCategory;
  label: string;
  badge?: string;
}

function RelationNode({ data }: NodeProps<Node<RelationNodeData>>) {
  const style = CATEGORY_STYLE[data.category];
  return (
    <div className={`w-[220px] rounded-lg border px-3 py-2 text-xs leading-snug shadow-sm break-words whitespace-normal ${style.bg} ${style.border} ${style.text}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="mb-1 flex items-center gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">
          {style.label}
        </span>
        {data.badge && (
          <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[9px] font-medium dark:bg-black/30">
            {data.badge}
          </span>
        )}
      </div>
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { relation: RelationNode };

// ─── グラフ構築 ──────────────────────────────────────────────────────────────

function estimateHeight(text: string, width: number): number {
  const charsPerLine = Math.floor(width / 14);
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return lines * 18 + 50;
}

/**
 * サマリーから因果関係グラフを構築：
 *   課題 → アドバイス → アクション / 宿題
 * Botarhythm モードでは さらに 転換点 → 状態変化 を並列配置。
 * 厳密な関連情報がないため「インデックス近接で対応付け」＋「全組み合わせ薄線」で視覚化する。
 */
function buildRelationshipGraph(summary: SessionSummary): {
  nodes: Node<RelationNodeData>[];
  edges: Edge[];
} {
  const isBotarhythm = getSummaryMode(summary) === 'botarhythm';
  const nodes: Node<RelationNodeData>[] = [];
  const edges: Edge[] = [];
  const nodeWidth = 220;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 70, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const addNode = (id: string, data: RelationNodeData): void => {
    const h = estimateHeight(data.label, nodeWidth);
    nodes.push({ id, type: 'relation', position: { x: 0, y: 0 }, data });
    g.setNode(id, { width: nodeWidth, height: h });
  };

  const addEdge = (source: string, target: string, opts: { strong?: boolean } = {}): void => {
    const color = opts.strong ? 'rgb(100 116 139)' : 'rgb(203 213 225)';
    const width = opts.strong ? 1.5 : 0.8;
    edges.push({
      id: `e-${source}-${target}`,
      source,
      target,
      type: 'smoothstep',
      style: { stroke: color, strokeWidth: width, strokeDasharray: opts.strong ? undefined : '4 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    });
    g.setEdge(source, target);
  };

  // 1. 課題ノード
  summary.clientPains.forEach((pain, i) => addNode(`pain-${i}`, { category: 'pain', label: pain }));

  // 2. アドバイスノード
  summary.adviceGiven.forEach((advice, i) => addNode(`advice-${i}`, { category: 'advice', label: advice }));

  // 3. 課題 → アドバイス（インデックス近接で太線、それ以外は細い破線）
  const painCount = summary.clientPains.length;
  const adviceCount = summary.adviceGiven.length;
  if (painCount > 0 && adviceCount > 0) {
    for (let i = 0; i < painCount; i++) {
      for (let j = 0; j < adviceCount; j++) {
        // インデックス比率が近い組み合わせを主因として扱う
        const painRatio = painCount > 1 ? i / (painCount - 1) : 0.5;
        const adviceRatio = adviceCount > 1 ? j / (adviceCount - 1) : 0.5;
        const strong = Math.abs(painRatio - adviceRatio) < 0.35;
        if (strong) addEdge(`pain-${i}`, `advice-${j}`, { strong: true });
      }
    }
    // エッジが1本も張れなかった場合は 1対1 の対応でフォールバック
    const hasEdge = edges.some((e) => e.source.startsWith('pain-') && e.target.startsWith('advice-'));
    if (!hasEdge) {
      for (let i = 0; i < Math.min(painCount, adviceCount); i++) {
        addEdge(`pain-${i}`, `advice-${i}`, { strong: true });
      }
    }
  }

  // 4. アクション・宿題ノード
  summary.nextActions.forEach((a, i) =>
    addNode(`action-${i}`, {
      category: 'action',
      label: `${a.task}${a.deadline ? ` (${a.deadline})` : ''}`,
      badge: a.owner,
    })
  );
  summary.homeworkForClient.forEach((hw, i) => addNode(`hw-${i}`, { category: 'homework', label: hw }));

  // 5. アドバイス → アクション / 宿題
  const actionCount = summary.nextActions.length;
  const hwCount = summary.homeworkForClient.length;
  if (adviceCount > 0) {
    for (let j = 0; j < adviceCount; j++) {
      for (let k = 0; k < actionCount; k++) {
        const ar = adviceCount > 1 ? j / (adviceCount - 1) : 0.5;
        const kr = actionCount > 1 ? k / (actionCount - 1) : 0.5;
        if (Math.abs(ar - kr) < 0.4) addEdge(`advice-${j}`, `action-${k}`, { strong: true });
      }
      for (let k = 0; k < hwCount; k++) {
        const ar = adviceCount > 1 ? j / (adviceCount - 1) : 0.5;
        const kr = hwCount > 1 ? k / (hwCount - 1) : 0.5;
        if (Math.abs(ar - kr) < 0.4) addEdge(`advice-${j}`, `hw-${k}`, { strong: true });
      }
    }
  }

  // 6. Botarhythm 専用: 転換点 → 状態変化
  if (isBotarhythm && summary.sessionMoments && summary.sessionMoments.length > 0) {
    summary.sessionMoments.forEach((m, i) =>
      addNode(`moment-${i}`, {
        category: 'moment',
        label: m.description,
        badge: MOMENT_TYPE_BADGE[m.type] ?? '',
      })
    );

    if (summary.clientStateShift) {
      addNode('stateshift', { category: 'stateShift', label: summary.clientStateShift });
      summary.sessionMoments.forEach((_, i) => addEdge(`moment-${i}`, 'stateshift', { strong: true }));
    }
  }

  if (nodes.length === 0) return { nodes, edges };

  dagre.layout(g);
  const laidOut: Node<RelationNodeData>[] = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
    };
  });

  return { nodes: laidOut, edges };
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function RelationshipGraph({ summary }: { summary: SessionSummary }) {
  const { nodes, edges } = useMemo(() => buildRelationshipGraph(summary), [summary]);

  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
        関係図を生成するための情報が不足しています
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        <Legend category="pain" />
        <Legend category="advice" />
        <Legend category="action" />
        <Legend category="homework" />
        {getSummaryMode(summary) === 'botarhythm' && (
          <>
            {summary.sessionMoments && summary.sessionMoments.length > 0 && <Legend category="moment" />}
            {summary.clientStateShift && <Legend category="stateShift" />}
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 bg-slate-400" />
          <span>主要な因果</span>
          <span className="ml-2 inline-block h-0.5 w-6 bg-slate-300 [background-image:linear-gradient(to_right,transparent_50%,rgb(203_213_225)_50%)] [background-size:6px_1px]" />
          <span>関連</span>
        </span>
      </div>

      <div className="h-[640px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} color="rgb(148 163 184 / 0.15)" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
}

function Legend({ category }: { category: RelationCategory }) {
  const style = CATEGORY_STYLE[category];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${style.bg} ${style.border} ${style.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {style.label}
    </span>
  );
}
