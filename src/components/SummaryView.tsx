import type { SessionSummary, SpeakerNames, SessionMoment } from '@/lib/types';
import { getSummaryMode } from '@/lib/types';

interface SummaryViewProps {
  summary: SessionSummary;
  speakerNames?: SpeakerNames;
}

const MOMENT_TYPE_LABELS: Record<SessionMoment['type'], { label: string; color: string }> = {
  breakthrough: { label: '突破口',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  resistance:   { label: '抵抗・葛藤', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  insight:      { label: '気づき',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  decision:     { label: '決断',    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  emotion:      { label: '感情的変化', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
};

export function SummaryView({ summary, speakerNames }: SummaryViewProps) {
  const speakerLabel = (s: 'A' | 'B') =>
    speakerNames?.[s] ? speakerNames[s] : `話者${s}`;

  // ノーマル議事録モードではBotarhythm専用フィールドを非表示にする（仮にデータが残っていても）
  const isBotarhythm = getSummaryMode(summary) === 'botarhythm';

  return (
    <div className="space-y-8">
      {/* モードバッジ（Botarhythmのときのみ） */}
      {isBotarhythm && (
        <div className="-mb-4 flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Botarhythm セッション分析
          </span>
        </div>
      )}

      {/* 主要な課題・議題 */}
      {summary.clientPains.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            主要な課題・議題
          </h3>
          <ul className="space-y-2">
            {summary.clientPains.map((pain, i) => (
              <li key={i} className="flex gap-2.5 text-slate-700 dark:text-slate-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400 dark:bg-red-500" />
                <span className="leading-relaxed">{pain}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 深層テーマ（Botarhythmモードのみ） */}
      {isBotarhythm && summary.underlyingThemes && summary.underlyingThemes.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            深層テーマ
          </h3>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 dark:border-indigo-900/40 dark:bg-indigo-900/10">
            <ul className="space-y-1.5">
              {summary.underlyingThemes.map((theme, i) => (
                <li key={i} className="flex gap-2.5 text-slate-700 dark:text-slate-200">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                  <span className="leading-relaxed text-sm">{theme}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* セッションの転換点（Botarhythmモードのみ） */}
      {isBotarhythm && summary.sessionMoments && summary.sessionMoments.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            セッションの転換点
          </h3>
          <div className="space-y-3">
            {summary.sessionMoments.map((moment, i) => {
              const badge = MOMENT_TYPE_LABELS[moment.type] ?? MOMENT_TYPE_LABELS.insight;
              return (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${badge.color}`}>
                      {badge.label}
                    </span>
                    {i < (summary.sessionMoments?.length ?? 0) - 1 && (
                      <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{moment.description}</p>
                    {moment.significance && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        → {moment.significance}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* クライアントの変化（Botarhythmモードのみ） */}
      {isBotarhythm && summary.clientStateShift && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            セッション中の変化
          </h3>
          <div className="rounded-lg border border-teal-100 bg-teal-50/50 px-4 py-3 dark:border-teal-900/40 dark:bg-teal-900/10">
            <p className="leading-relaxed text-sm text-slate-700 dark:text-slate-200">{summary.clientStateShift}</p>
          </div>
        </section>
      )}

      {/* アドバイス・提案 */}
      {summary.adviceGiven.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            アドバイス・提案
          </h3>
          <ul className="space-y-2">
            {summary.adviceGiven.map((advice, i) => (
              <li key={i} className="flex gap-2.5 text-slate-700 dark:text-slate-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400 dark:bg-blue-500" />
                <span className="leading-relaxed">{advice}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ネクストアクション */}
      {summary.nextActions.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            ネクストアクション
          </h3>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <th className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300">タスク</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300">担当</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300">期限</th>
                </tr>
              </thead>
              <tbody>
                {summary.nextActions.map((action, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{action.task}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{action.owner}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{action.deadline || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* フォローアップ項目 */}
      {summary.homeworkForClient.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            フォローアップ項目
          </h3>
          <ul className="space-y-2">
            {summary.homeworkForClient.map((hw, i) => (
              <li key={i} className="flex gap-2.5 text-slate-700 dark:text-slate-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 dark:bg-amber-500" />
                <span className="leading-relaxed">{hw}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 印象的な発言 */}
      {summary.keyQuotes.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            印象的な発言
          </h3>
          <div className="space-y-3">
            {summary.keyQuotes.map((quote, i) => (
              <blockquote
                key={i}
                className="border-l-2 border-slate-300 pl-4 dark:border-slate-600"
              >
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                  &ldquo;{quote.text}&rdquo;
                </p>
                <footer className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  &#8212; {speakerLabel(quote.speaker)} &middot; {quote.context}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {/* コーチング効果分析（Botarhythmモードのみ） */}
      {isBotarhythm && summary.coachingInsights && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            コーチング効果分析
          </h3>
          <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-900/10">
            <p className="leading-relaxed text-sm text-slate-700 dark:text-slate-200">{summary.coachingInsights}</p>
          </div>
        </section>
      )}

      {/* 総評・所感 */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          総評・所感
        </h3>
        <p className="leading-relaxed text-slate-700 dark:text-slate-200">{summary.overallAssessment}</p>
      </section>

      {/* 次回への提案（Botarhythmモードのみ） */}
      {isBotarhythm && summary.nextSessionSuggestions && summary.nextSessionSuggestions.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            次回への提案
          </h3>
          <ul className="space-y-2">
            {summary.nextSessionSuggestions.map((suggestion, i) => (
              <li key={i} className="flex gap-2.5 text-slate-700 dark:text-slate-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
                <span className="leading-relaxed text-sm">{suggestion}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
