import { useId } from 'react';
import type { SessionSummary, SpeakerNames, SessionMoment, KeyQuote } from '@/lib/types';
import { getSummaryMode } from '@/lib/types';

interface SummaryViewProps {
  summary: SessionSummary;
  speakerNames?: SpeakerNames;
}

// ── もっちゃんアイコン ──
function MochanAvatar({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/avatars/mocchan.jpg"
      alt="もっちゃんのアイコン"
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm dark:ring-slate-700"
      style={{ width: size, height: size }}
    />
  );
}

// ── クライアント疑似アバター（名前から決定的に色生成・幾何模様） ──
const CLIENT_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#fb923c', '#f59e0b', '#ec4899'], // orange→pink
  ['#22d3ee', '#3b82f6', '#8b5cf6'], // cyan→violet
  ['#10b981', '#14b8a6', '#0ea5e9'], // emerald→sky
  ['#a855f7', '#ec4899', '#f43f5e'], // purple→rose
  ['#84cc16', '#22c55e', '#06b6d4'], // lime→cyan
  ['#f43f5e', '#fb7185', '#fb923c'], // rose→orange
  ['#6366f1', '#8b5cf6', '#d946ef'], // indigo→fuchsia
];

function ClientAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const reactId = useId();
  const safeName = name || 'Client';
  const hash = [...safeName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [c1, c2, c3] = CLIENT_PALETTES[hash % CLIENT_PALETTES.length];
  // 同じ要約内で複数回出ても安定するよう、名前ハッシュ + React useId
  const gradId = `client-grad-${hash}-${reactId.replace(/:/g, '')}`;

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className="shrink-0 rounded-full ring-2 ring-white shadow-sm dark:ring-slate-700"
      style={{ width: size, height: size }}
      aria-label={`${safeName}のアイコン`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c3} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="20" fill={`url(#${gradId})`} />
      <circle cx="13" cy="14" r="9" fill={c2} opacity="0.55" />
      <circle cx="28" cy="26" r="11" fill={c1} opacity="0.45" />
      <circle cx="22" cy="20" r="5" fill="white" opacity="0.25" />
    </svg>
  );
}

// ── SMS風チャット吹き出し ──
function ChatBubble({
  quote,
  isMine,
  speakerName,
}: {
  quote: KeyQuote;
  isMine: boolean;
  speakerName: string;
}) {
  return (
    <li className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {isMine ? <MochanAvatar /> : <ClientAvatar name={speakerName} />}
      <div className={`flex max-w-[78%] flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
        <span className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {speakerName}
        </span>
        <div
          className={
            isMine
              ? 'rounded-2xl rounded-br-sm bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-2.5 text-[14.5px] leading-[1.7] text-white shadow-sm'
              : 'rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-[14.5px] leading-[1.7] text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
          }
        >
          {quote.text}
        </div>
        {quote.context && (
          <p
            className={`max-w-[95%] px-1 text-[11px] italic leading-relaxed text-slate-500 dark:text-slate-400 ${
              isMine ? 'text-right' : 'text-left'
            }`}
          >
            {quote.context}
          </p>
        )}
      </div>
    </li>
  );
}

const MOMENT_TYPE_LABELS: Record<SessionMoment['type'], { label: string; color: string }> = {
  breakthrough: { label: '突破口',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  resistance:   { label: '抵抗・葛藤', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  insight:      { label: '気づき',  color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  decision:     { label: '決断',    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  emotion:      { label: '感情的変化', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
};

// ── セクション見出し（紙面風・明朝アクセント） ──
function SectionHeading({
  number,
  title,
  accent = 'navy',
}: {
  number: string;
  title: string;
  accent?: 'navy' | 'crimson' | 'indigo' | 'teal' | 'amber' | 'violet' | 'slate';
}) {
  const accentMap: Record<string, { bar: string; num: string }> = {
    navy:    { bar: 'bg-[#0f3460] dark:bg-sky-400',       num: 'text-[#0f3460] dark:text-sky-400' },
    crimson: { bar: 'bg-[#c0392b] dark:bg-rose-400',      num: 'text-[#c0392b] dark:text-rose-400' },
    indigo:  { bar: 'bg-indigo-600 dark:bg-indigo-400',   num: 'text-indigo-600 dark:text-indigo-400' },
    teal:    { bar: 'bg-teal-600 dark:bg-teal-400',       num: 'text-teal-600 dark:text-teal-400' },
    amber:   { bar: 'bg-amber-600 dark:bg-amber-400',     num: 'text-amber-700 dark:text-amber-400' },
    violet:  { bar: 'bg-violet-600 dark:bg-violet-400',   num: 'text-violet-600 dark:text-violet-400' },
    slate:   { bar: 'bg-slate-500 dark:bg-slate-400',     num: 'text-slate-600 dark:text-slate-400' },
  };
  const c = accentMap[accent];
  return (
    <header className="mb-5 flex items-baseline gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
      <span className={`shrink-0 font-serif text-xs font-semibold tracking-[0.2em] ${c.num}`}>
        {number}
      </span>
      <h2
        className="relative flex-1 font-serif text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[1.4rem]"
      >
        {title}
        <span
          className={`absolute -bottom-3 left-0 h-[2px] w-12 ${c.bar}`}
          aria-hidden
        />
      </h2>
    </header>
  );
}

// ── ドット付きリスト ──
function DottedList({
  items,
  dotClass,
  textClass = 'text-slate-700 dark:text-slate-200',
  size = 'base',
}: {
  items: string[];
  dotClass: string;
  textClass?: string;
  size?: 'base' | 'sm';
}) {
  const textSize = size === 'sm' ? 'text-sm' : 'text-[15px]';
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className={`flex gap-3 leading-[1.85] ${textClass}`}>
          <span className={`mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
          <span className={textSize}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function SummaryView({ summary, speakerNames }: SummaryViewProps) {
  const speakerLabel = (s: 'A' | 'B') =>
    speakerNames?.[s] ? speakerNames[s] : `話者${s}`;

  const isBotarhythm = getSummaryMode(summary) === 'botarhythm';

  return (
    <article
      className="
        relative mx-auto max-w-[760px]
        rounded-2xl bg-white px-6 py-9 shadow-[0_2px_24px_rgba(15,23,42,0.05)]
        ring-1 ring-slate-100
        sm:px-10 sm:py-12
        dark:bg-slate-900 dark:shadow-[0_2px_24px_rgba(0,0,0,0.4)] dark:ring-slate-800
      "
    >
      {/* モードバッジ */}
      {isBotarhythm && (
        <div className="mb-8 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-[11px] font-medium tracking-wider text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            BOTARHYTHM SESSION
          </span>
        </div>
      )}

      <div className="space-y-12">
        {/* I. 主要な課題・議題 */}
        {summary.clientPains.length > 0 && (
          <section>
            <SectionHeading number="I" title="主要な課題・議題" accent="crimson" />
            <DottedList items={summary.clientPains} dotClass="bg-[#c0392b] dark:bg-rose-400" />
          </section>
        )}

        {/* II. 深層テーマ（Botarhythm） */}
        {isBotarhythm && summary.underlyingThemes && summary.underlyingThemes.length > 0 && (
          <section>
            <SectionHeading number="II" title="深層テーマ" accent="indigo" />
            <div className="rounded-lg border border-indigo-100/80 bg-indigo-50/40 px-5 py-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
              <DottedList
                items={summary.underlyingThemes}
                dotClass="bg-indigo-500 dark:bg-indigo-400"
                size="sm"
              />
            </div>
          </section>
        )}

        {/* III. セッションの転換点（Botarhythm） */}
        {isBotarhythm && summary.sessionMoments && summary.sessionMoments.length > 0 && (
          <section>
            <SectionHeading number="III" title="セッションの転換点" accent="navy" />
            <ol className="space-y-5">
              {summary.sessionMoments.map((moment, i) => {
                const badge = MOMENT_TYPE_LABELS[moment.type] ?? MOMENT_TYPE_LABELS.insight;
                const isLast = i === (summary.sessionMoments?.length ?? 0) - 1;
                return (
                  <li key={i} className="flex gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wider ${badge.color}`}>
                        {badge.label}
                      </span>
                      {!isLast && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-[15px] leading-[1.85] text-slate-700 dark:text-slate-200">
                        {moment.description}
                      </p>
                      {moment.significance && (
                        <p className="mt-1.5 border-l-2 border-slate-200 pl-3 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          {moment.significance}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* IV. クライアントの変化（Botarhythm） */}
        {isBotarhythm && summary.clientStateShift && (
          <section>
            <SectionHeading number="IV" title="セッション中の変化" accent="teal" />
            <div className="rounded-lg border border-teal-100/80 bg-teal-50/40 px-5 py-4 dark:border-teal-900/40 dark:bg-teal-950/30">
              <p className="text-[15px] leading-[1.95] text-slate-700 dark:text-slate-200">
                {summary.clientStateShift}
              </p>
            </div>
          </section>
        )}

        {/* V. アドバイス・提案 */}
        {summary.adviceGiven.length > 0 && (
          <section>
            <SectionHeading number={isBotarhythm ? 'V' : 'II'} title="アドバイス・提案" accent="navy" />
            <DottedList items={summary.adviceGiven} dotClass="bg-[#0f3460] dark:bg-sky-400" />
          </section>
        )}

        {/* VI. ネクストアクション */}
        {summary.nextActions.length > 0 && (
          <section>
            <SectionHeading number={isBotarhythm ? 'VI' : 'III'} title="ネクストアクション" accent="navy" />
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    <th className="px-4 py-2.5">タスク</th>
                    <th className="px-4 py-2.5 w-28">担当</th>
                    <th className="px-4 py-2.5 w-32">期限</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.nextActions.map((action, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="px-4 py-3 leading-relaxed text-slate-700 dark:text-slate-200">
                        {action.task}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {action.owner}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {action.deadline || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* VII. フォローアップ項目 */}
        {summary.homeworkForClient.length > 0 && (
          <section>
            <SectionHeading number={isBotarhythm ? 'VII' : 'IV'} title="フォローアップ項目" accent="amber" />
            <DottedList items={summary.homeworkForClient} dotClass="bg-amber-500 dark:bg-amber-400" />
          </section>
        )}

        {/* VIII. 印象的なやりとり（SMS風） */}
        {summary.keyQuotes.length > 0 && (
          <section>
            <SectionHeading number={isBotarhythm ? 'VIII' : 'V'} title="印象的なやりとり" accent="navy" />
            <div className="rounded-2xl bg-slate-50/70 px-3 py-5 ring-1 ring-slate-100 dark:bg-slate-800/30 dark:ring-slate-700/60 sm:px-5 sm:py-6">
              <ul className="space-y-4">
                {summary.keyQuotes.map((quote, i) => (
                  <ChatBubble
                    key={i}
                    quote={quote}
                    isMine={quote.speaker === 'A'}
                    speakerName={speakerLabel(quote.speaker)}
                  />
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* IX. コーチング効果分析（Botarhythm） */}
        {isBotarhythm && summary.coachingInsights && (
          <section>
            <SectionHeading number="IX" title="コーチング効果分析" accent="violet" />
            <div className="rounded-lg border border-violet-100/80 bg-violet-50/40 px-5 py-4 dark:border-violet-900/40 dark:bg-violet-950/30">
              <p className="text-[15px] leading-[1.95] text-slate-700 dark:text-slate-200">
                {summary.coachingInsights}
              </p>
            </div>
          </section>
        )}

        {/* X. 総評・所感 */}
        <section>
          <SectionHeading
            number={isBotarhythm ? 'X' : 'VI'}
            title="総評・所感"
            accent="navy"
          />
          <p className="text-[15.5px] leading-[1.95] text-slate-700 first-letter:font-serif first-letter:text-2xl first-letter:font-bold first-letter:text-[#0f3460] dark:text-slate-200 dark:first-letter:text-sky-400">
            {summary.overallAssessment}
          </p>
        </section>

        {/* XI. 次回への提案（Botarhythm） */}
        {isBotarhythm && summary.nextSessionSuggestions && summary.nextSessionSuggestions.length > 0 && (
          <section>
            <SectionHeading number="XI" title="次回への提案" accent="slate" />
            <DottedList
              items={summary.nextSessionSuggestions}
              dotClass="bg-slate-400 dark:bg-slate-500"
              size="sm"
            />
          </section>
        )}
      </div>
    </article>
  );
}
