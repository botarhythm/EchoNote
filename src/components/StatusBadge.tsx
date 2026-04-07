import type { SessionStatus } from '@/lib/types';

const STATUS_CONFIG: Record<SessionStatus, { label: string; className: string }> = {
  pending: {
    label: '待機中',
    className: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  },
  transcribing: {
    label: '文字起こし中',
    className: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse',
  },
  summarizing: {
    label: 'サマリー生成中',
    className: 'bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse',
  },
  done: {
    label: '完了',
    className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  error: {
    label: 'エラー',
    className: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
