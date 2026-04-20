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

import type { SessionSummary } from '@/lib/types';
import { getSummaryMode } from '@/lib/types';

// ─── 配色テーマ ───────────────────────────────────────────────────────────────

type CategoryKey =
  | 'central'
  | 'pains'
  | 'advice'
  | 'nextActions'
  | 'homework'
  | 'themes'
  | 'moments'
  | 'nextSessions';

const CATEGORY_COLORS: Record<CategoryKey, { bg: string; border: string; text: string }> = {
  central:      { bg: 'bg-slate-50 dark:bg-slate-700',       border: 'border-slate-400 dark:border-slate-500',       text: 'text-slate-800 dark:text-slate-100' },
  pains:        { bg: 'bg-red-50 dark:bg-red-950/40',        border: 'border-red-300 dark:border-red-800/60',        text: 'text-red-800 dark:text-red-200' },
  advice:       { bg: 'bg-blue-50 dark:bg-blue-950/40',      border: 'border-blue-300 dark:border-blue-800/60',      text: 'text-blue-800 dark:text-blue-200' },
  nextActions:  { bg: 'bg-emerald-50 dark:bg-emerald-950/40',border: 'border-emerald-300 dark:border-emerald-800/60',text: 'text-emerald-800 dark:text-emerald-200' },
  homework:     { bg: 'bg-amber-50 dark:bg-amber-950/40',    border: 'border-amber-300 dark:border-amber-800/60',    text: 'text-amber-800 dark:text-amber-200' },
  themes:       { bg: 'bg-indigo-50 dark:bg-indigo-950/40',  border: 'border-indigo-300 dark:border-indigo-800/60',  text: 'text-indigo-800 dark:text-indigo-200' },
  moments:      { bg: 'bg-violet-50 dark:bg-violet-950/40',  border: 'border-violet-300 dark:border-violet-800/60',  text: 'text-violet-800 dark:text-violet-200' },
  nextSessions: { bg: 'bg-slate-100 dark:bg-slate-800',      border: 'border-slate-300 dark:border-slate-600',       text: 'text-slate-700 dark:text-slate-200' },
};

// ─── カスタムノード（文字欠け防止のため divベース） ──────────────────────────

interface MindMapNodeData extends Record<string, unknown> {
  label: string;
  category: CategoryKey;
  variant: 'central' | 'category' | 'leaf';
}

function MindMapNode({ data }: NodeProps<Node<MindMapNodeData>>) {
  const color = CATEGORY_COLORS[data.category];
  const variant = data.variant;

  const baseClass = `${color.bg} ${color.border} ${color.text} rounded-lg border shadow-sm leading-snug break-words whitespace-normal`;

  const variantClass =
    variant === 'central'
      ? 'px-4 py-3 text-sm font-semibold border-2 w-[220px] text-center'
      : variant === 'category'
      ? 'px-3 py-2 text-xs font-semibold uppercase tracking-wide w-[180px] text-center'
      : 'px-3 py-2 text-xs w-[240px]';

  return (
    <div className={`${baseClass} ${variantClass}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {data.label}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { mindmap: MindMapNode };

// ─── サマリーからノード/エッジを構築 ──────────────────────────────────────────

interface Branch {
  key: CategoryKey;
  label: string;
  items: string[];
}

function buildBranches(summary: SessionSummary): Branch[] {
  const isBotarhythm = getSummaryMode(summary) === 'botarhythm';
  const branches: Branch[] = [];

  if (summary.clientPains.length > 0) {
    branches.push({ key: 'pains', label: '課題・論点', items: summary.clientPains });
  }
  if (isBotarhythm && summary.underlyingThemes && summary.underlyingThemes.length > 0) {
    branches.push({ key: 'themes', label: '深層テーマ', items: summary.underlyingThemes });
  }
  if (summary.adviceGiven.length > 0) {
    branches.push({ key: 'advice', label: 'アドバイス・提案', items: summary.adviceGiven });
  }
  if (summary.nextActions.length > 0) {
    branches.push({
      key: 'nextActions',
      label: 'ネクストアクション',
      items: summary.nextActions.map((a) => `${a.task}（${a.owner}${a.deadline ? ` / ${a.deadline}` : ''}）`),
    });
  }
  if (summary.homeworkForClient.length > 0) {
    branches.push({ key: 'homework', label: '宿題・フォロー', items: summary.homeworkForClient });
  }
  if (isBotarhythm && summary.sessionMoments && summary.sessionMoments.length > 0) {
    branches.push({
      key: 'moments',
      label: '転換点',
      items: summary.sessionMoments.map((m) => m.description),
    });
  }
  if (isBotarhythm && summary.nextSessionSuggestions && summary.nextSessionSuggestions.length > 0) {
    branches.push({ key: 'nextSessions', label: '次回への提案', items: summary.nextSessionSuggestions });
  }

  return branches;
}

/** 文字数ベースの高さ概算（dagre layoutに渡すため） */
function estimateHeight(text: string, width: number, variant: 'central' | 'category' | 'leaf'): number {
  const charsPerLine = variant === 'leaf' ? Math.floor(width / 14) : Math.floor(width / 12);
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const lineHeight = variant === 'central' ? 20 : variant === 'category' ? 16 : 18;
  const padding = variant === 'central' ? 32 : variant === 'category' ? 24 : 28;
  return lines * lineHeight + padding;
}

/** summary から nodes/edges を構築し、dagreでレイアウトを決める */
function layoutMindMap(summary: SessionSummary): { nodes: Node<MindMapNodeData>[]; edges: Edge[] } {
  const branches = buildBranches(summary);
  const nodes: Node<MindMapNodeData>[] = [];
  const edges: Edge[] = [];

  const centralId = 'central';
  const centralWidth = 220;
  const centralHeight = estimateHeight(summary.title, centralWidth, 'central');

  nodes.push({
    id: centralId,
    type: 'mindmap',
    position: { x: 0, y: 0 },
    data: { label: summary.title, category: 'central', variant: 'central' },
  });

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 16, ranksep: 60, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  g.setNode(centralId, { width: centralWidth, height: centralHeight });

  branches.forEach((branch, bi) => {
    const categoryId = `cat-${bi}`;
    const catWidth = 180;
    const catHeight = estimateHeight(branch.label, catWidth, 'category');

    nodes.push({
      id: categoryId,
      type: 'mindmap',
      position: { x: 0, y: 0 },
      data: { label: branch.label, category: branch.key, variant: 'category' },
    });
    edges.push({
      id: `e-${centralId}-${categoryId}`,
      source: centralId,
      target: categoryId,
      type: 'smoothstep',
      animated: false,
      style: { stroke: 'rgb(148 163 184)', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgb(148 163 184)' },
    });
    g.setNode(categoryId, { width: catWidth, height: catHeight });
    g.setEdge(centralId, categoryId);

    branch.items.forEach((item, ii) => {
      const leafId = `leaf-${bi}-${ii}`;
      const leafWidth = 240;
      const leafHeight = estimateHeight(item, leafWidth, 'leaf');

      nodes.push({
        id: leafId,
        type: 'mindmap',
        position: { x: 0, y: 0 },
        data: { label: item, category: branch.key, variant: 'leaf' },
      });
      edges.push({
        id: `e-${categoryId}-${leafId}`,
        source: categoryId,
        target: leafId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: 'rgb(203 213 225)', strokeWidth: 1 },
      });
      g.setNode(leafId, { width: leafWidth, height: leafHeight });
      g.setEdge(categoryId, leafId);
    });
  });

  dagre.layout(g);

  // dagre が計算した中心座標を React Flow の左上基点に変換
  const laidOut: Node<MindMapNodeData>[] = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
    };
  });

  return { nodes: laidOut, edges };
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function MindMap({ summary }: { summary: SessionSummary }) {
  const { nodes, edges } = useMemo(() => layoutMindMap(summary), [summary]);

  if (nodes.length <= 1) return null;

  return (
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
  );
}
