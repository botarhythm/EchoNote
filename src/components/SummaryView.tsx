import type { SessionSummary } from '@/lib/types';

export function SummaryView({ summary }: { summary: SessionSummary }) {
  return (
    <div className="space-y-8">
      {summary.clientPains.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            クライアントの課題
          </h3>
          <ul className="space-y-1.5">
            {summary.clientPains.map((pain, i) => (
              <li key={i} className="flex gap-2 text-slate-700 dark:text-slate-200">
                <span className="mt-1 text-red-500 dark:text-red-400">&#x2022;</span>
                {pain}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.adviceGiven.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            アドバイス・提案
          </h3>
          <ul className="space-y-1.5">
            {summary.adviceGiven.map((advice, i) => (
              <li key={i} className="flex gap-2 text-slate-700 dark:text-slate-200">
                <span className="mt-1 text-blue-500 dark:text-blue-400">&#x2022;</span>
                {advice}
              </li>
            ))}
          </ul>
        </section>
      )}

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
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{action.task}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{action.owner}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{action.deadline || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {summary.homeworkForClient.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            クライアントへの宿題
          </h3>
          <ul className="space-y-1.5">
            {summary.homeworkForClient.map((hw, i) => (
              <li key={i} className="flex gap-2 text-slate-700 dark:text-slate-200">
                <span className="mt-1 text-amber-500 dark:text-amber-400">&#x2022;</span>
                {hw}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.keyQuotes.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            印象的な発言
          </h3>
          <div className="space-y-3">
            {summary.keyQuotes.map((quote, i) => (
              <blockquote
                key={i}
                className="border-l-2 border-slate-300 pl-4 dark:border-slate-500"
              >
                <p className="text-slate-700 dark:text-slate-200">
                  &ldquo;{quote.text}&rdquo;
                </p>
                <footer className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  &#8212; 話者{quote.speaker} &middot; {quote.context}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          セッション全体の所感
        </h3>
        <p className="leading-relaxed text-slate-700 dark:text-slate-200">{summary.overallAssessment}</p>
      </section>
    </div>
  );
}
