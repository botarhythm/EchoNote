'use client';

import { useState, useEffect, useCallback } from 'react';

interface DeploymentInfo {
  id: string;
  status: string;
  createdAt: string;
  url: string | null;
}

interface LogEntry {
  timestamp: string;
  message: string;
  severity: string;
}

interface RailwayData {
  deployment?: DeploymentInfo;
  logs?: LogEntry[];
  error?: string;
}

const STATUS_LABEL: Record<string, string> = {
  SUCCESS: '稼働中',
  BUILDING: 'ビルド中',
  DEPLOYING: 'デプロイ中',
  FAILED: 'ビルド失敗',
  CRASHED: 'クラッシュ',
  REMOVED: '削除済み',
  THROTTLED: '制限中',
};

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'bg-emerald-400',
  BUILDING: 'bg-yellow-400 animate-pulse',
  DEPLOYING: 'bg-blue-400 animate-pulse',
  FAILED: 'bg-red-500',
  CRASHED: 'bg-red-500',
  REMOVED: 'bg-slate-400',
  THROTTLED: 'bg-orange-400',
};

const SEVERITY_COLOR: Record<string, string> = {
  ERROR: 'text-red-400',
  WARN: 'text-yellow-400',
  INFO: 'text-slate-300',
  DEBUG: 'text-slate-500',
};

function isActiveStatus(status: string) {
  return ['BUILDING', 'DEPLOYING'].includes(status);
}

export function RailwayStatus() {
  const [data, setData] = useState<RailwayData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/railway');
      if (res.ok) {
        const json = (await res.json()) as RailwayData;
        setData(json);
      }
    } catch {
      // 無視
    }
  }, []);

  // 初回ロード
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // デプロイ中は5秒ごとにポーリング
  useEffect(() => {
    if (!data?.deployment) return;
    if (!isActiveStatus(data.deployment.status)) return;
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, [data?.deployment?.status, fetchStatus]);

  const handleToggle = async () => {
    if (!open) {
      setLoading(true);
      await fetchStatus();
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  // env var 未設定なら非表示
  if (data?.error?.includes('未設定')) return null;

  const deployment = data?.deployment;
  const status = deployment?.status ?? 'UNKNOWN';
  const dotColor = STATUS_COLOR[status] ?? 'bg-slate-400';
  const label = STATUS_LABEL[status] ?? status;

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50">
      {/* ヘッダー（常に表示） */}
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Railway — {loading ? '確認中...' : label}
          </span>
          {deployment && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {new Date(deployment.createdAt).toLocaleString('ja-JP')}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">{open ? '▲ 閉じる' : '▼ ログを見る'}</span>
      </button>

      {/* ログパネル */}
      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          {data?.error ? (
            <p className="px-4 py-3 text-sm text-red-500">{data.error}</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-b-lg bg-slate-900 p-3 font-mono text-xs">
              {data?.logs && data.logs.length > 0 ? (
                data.logs.map((log, i) => (
                  <div key={i} className="flex gap-2 py-0.5">
                    <span className="shrink-0 text-slate-600">
                      {new Date(log.timestamp).toLocaleTimeString('ja-JP')}
                    </span>
                    <span className={SEVERITY_COLOR[log.severity] ?? 'text-slate-300'}>
                      {log.message}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">ログがありません</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 px-4 py-2">
            <button
              onClick={() => setData((d) => d ? { ...d, logs: [] } : d)}
              className="text-xs text-slate-400 hover:text-red-400 dark:hover:text-red-400"
            >
              クリア
            </button>
            <button
              onClick={fetchStatus}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              更新
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
