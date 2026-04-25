'use client';

import { useEffect, useState } from 'react';
import type { Utterance, SpeakerNames } from '@/lib/types';

interface ExternalLine {
  timestamp: string | null;
  text: string;
}

interface CoverageReport {
  totalSentences: number;
  matchedSentences: number;
  ratio: number;
}

interface DiffData {
  fileName: string;
  rawText: string;
  lines: ExternalLine[];
  coverage: CoverageReport;
  missingSegments: string[];
}

interface NoMatchData {
  reason: string;
  candidates: { id: string; name: string; mimeType: string }[];
}

interface Props {
  sessionId: string;
  echonoteTranscript: Utterance[] | undefined;
  speakerNames?: SpeakerNames;
  onClose: () => void;
}

export function TranscriptDiffPanel({
  sessionId,
  echonoteTranscript,
  speakerNames,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DiffData | null>(null);
  const [noMatch, setNoMatch] = useState<NoMatchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 初回マウント時にフェッチ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/external-transcript`);
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.matched) {
          setData(body as DiffData);
        } else if (res.status === 404 && body.matched === false) {
          setNoMatch(body as NoMatchData);
        } else {
          setError(body.error || `取得失敗 (status ${res.status})`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const speakerLabel = (s: 'A' | 'B') =>
    speakerNames?.[s] ? speakerNames[s].slice(0, 4) : s;

  const echonoteCount = echonoteTranscript?.length ?? 0;

  return (
    <div className="rounded-lg border border-violet-200 bg-white shadow-sm dark:border-violet-900/40 dark:bg-slate-900">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Drive書き起こしと照合
          </h3>
          {data && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {data.fileName}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="閉じる"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="px-4 py-4">
        {loading && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Driveから取得中...</p>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        {noMatch && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
              {noMatch.reason}
            </div>
            {noMatch.candidates.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  候補ファイル（手動で確認してください）:
                </p>
                <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {noMatch.candidates.map((c) => (
                    <li key={c.id} className="rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                      <span className="ml-2 text-[10px] text-slate-400">{c.mimeType}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* カバレッジサマリ */}
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">EchoNote側で網羅できた割合: </span>
                  <span className={`font-mono text-base ${
                    data.coverage.ratio >= 0.9
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : data.coverage.ratio >= 0.7
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {(data.coverage.ratio * 100).toFixed(1)}%
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {data.coverage.matchedSentences} / {data.coverage.totalSentences} 文 一致
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  EchoNote: {echonoteCount} 発話 · Drive行: {data.lines.length} 行
                </p>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                ※ 文単位の部分一致判定（NFKC正規化＋句読点除去）。話者分離は EchoNote のみ提供。
              </p>
            </div>

            {/* 欠損セグメント */}
            {data.missingSegments.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                  EchoNoteに見つからなかった文 ({data.missingSegments.length}{data.missingSegments.length >= 50 ? '+' : ''})
                </h4>
                <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-red-200 bg-red-50/40 p-2 dark:border-red-900/40 dark:bg-red-950/20">
                  {data.missingSegments.map((seg, i) => (
                    <li key={i} className="rounded bg-white px-2 py-1.5 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {seg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 並列ビュー */}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  EchoNote（話者付き）
                </h4>
                <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  {echonoteTranscript && echonoteTranscript.length > 0 ? (
                    echonoteTranscript.map((u, i) => (
                      <div key={i} className="flex gap-2">
                        <span className={`shrink-0 font-mono text-[10px] ${
                          u.speaker === 'A'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {u.timestamp} {speakerLabel(u.speaker)}
                        </span>
                        <span className="text-slate-700 dark:text-slate-200">{u.text}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">EchoNoteの書き起こしなし</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Google Recorder（話者なし）
                </h4>
                <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  {data.lines.map((line, i) => (
                    <div key={i} className="flex gap-2">
                      {line.timestamp && (
                        <span className="shrink-0 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {line.timestamp}
                        </span>
                      )}
                      <span className="text-slate-700 dark:text-slate-200">{line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
