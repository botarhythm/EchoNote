'use client';

import { useState } from 'react';
import type { Utterance } from '@/lib/types';

export function TranscriptView({ transcript }: { transcript: Utterance[] }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = searchQuery
    ? transcript.filter((u) =>
        u.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : transcript;

  return (
    <div className="space-y-4">
      {/* 検索バー */}
      <div className="relative">
        <input
          type="text"
          placeholder="テキストを検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-slate-500 focus:outline-none"
        />
        {searchQuery && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            {filtered.length} 件
          </span>
        )}
      </div>

      {/* 発話一覧 */}
      <div className="space-y-1">
        {filtered.map((utterance, i) => (
          <div
            key={i}
            className={`flex gap-3 rounded px-3 py-2 ${
              utterance.speaker === 'A'
                ? 'bg-blue-950/30'
                : 'bg-emerald-950/30'
            }`}
          >
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  utterance.speaker === 'A'
                    ? 'bg-blue-500/30 text-blue-300'
                    : 'bg-emerald-500/30 text-emerald-300'
                }`}
              >
                {utterance.speaker}
              </span>
              <span className="text-[10px] text-slate-500">{utterance.timestamp}</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-200">{utterance.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
