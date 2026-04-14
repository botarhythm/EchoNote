'use client';

import type { Session } from '@/lib/types';

interface ClientTabsProps {
  sessions: Session[];
  activeClient: string | null;
  onSelect: (client: string | null) => void;
  managingClient: string | null;
  onManage: (client: string | null) => void;
}

export function ClientTabs({
  sessions,
  activeClient,
  onSelect,
  managingClient,
  onManage,
}: ClientTabsProps) {
  const clients = Array.from(
    new Set(
      sessions
        .filter((s) => s.status === 'done' && s.meta.clientName && s.meta.clientName !== '不明')
        .map((s) => s.meta.clientName)
    )
  );

  if (clients.length < 2) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {/* すべてタブ */}
      <button
        onClick={() => onSelect(null)}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          activeClient === null
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
        }`}
      >
        すべて
      </button>

      {/* クライアントタブ */}
      {clients.map((client) => {
        const count = sessions.filter((s) => s.meta.clientName === client).length;
        const isManaging = managingClient === client;
        return (
          <div key={client} className="flex items-center gap-0.5">
            <button
              onClick={() => onSelect(client)}
              className={`flex items-center gap-1.5 rounded-l-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeClient === client
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {client}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  activeClient === client
                    ? 'bg-white/20 dark:bg-black/20'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
            {/* 設定ギア */}
            <button
              onClick={() => onManage(isManaging ? null : client)}
              title="クライアント設定"
              className={`rounded-r-full py-1.5 pl-1.5 pr-2.5 text-xs transition-colors ${
                isManaging
                  ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'
              }`}
            >
              ⚙
            </button>
          </div>
        );
      })}
    </div>
  );
}
