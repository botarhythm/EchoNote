import Anthropic from '@anthropic-ai/sdk';
import type {
  Utterance,
  SessionSummary,
  SummaryOptions,
  NormalDepth,
  BotarhythmDepth,
  NormalPattern,
  BotarhythmPattern,
  SpeakerNames,
  CrossAnalysisResult,
} from './types';
import { getBrandConfig, type BrandConfig } from './branding';

// ─── JSONパースユーティリティ ─────────────────────────────────────────────────

/**
 * マークダウンコードブロック (```json ... ```) を除去してからJSONパース。
 * structured outputs 使用時は基本的に常に有効なJSONが返るが、
 * stop_reason が 'max_tokens' の場合は出力が途中で切断されている可能性が高いので
 * ユーザ向けの分かりやすいエラーに変換する。
 */
function parseJsonResponse<T>(raw: string, stopReason?: string | null): T {
  if (stopReason === 'max_tokens') {
    throw new Error(
      '生成結果が出力トークン上限に達して途中で切断されました。深度を下げる・重点パターンを減らす・対象の文字起こしを短くするなどをお試しください。'
    );
  }

  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch (err) {
    const preview =
      stripped.length > 500
        ? `${stripped.slice(0, 250)}...(中略)...${stripped.slice(-250)}`
        : stripped;
    console.error('[EchoNote] JSONパース失敗', {
      stopReason,
      textLength: stripped.length,
      preview,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(
      `AI応答のJSONパースに失敗しました (stop_reason=${stopReason ?? 'unknown'}, length=${stripped.length}): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─── Structured Outputs 用 JSON Schema ───────────────────────────────────────
// Claude の structured outputs（output_config.format）でスキーマを強制し、
// JSONパース失敗・コードブロック混入・フィールド欠落を構造的に防ぐ。
// スキーマの description はモデルへの指示として機能する。

function str(description: string) {
  return { type: 'string' as const, description };
}

function arr(items: object, description: string) {
  return { type: 'array' as const, items, description };
}

function obj(properties: Record<string, object>, description?: string) {
  return {
    type: 'object' as const,
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
    ...(description ? { description } : {}),
  };
}

const CHAPTER_SCHEMA = obj({
  startTime: str('章の開始タイムスタンプ "HH:MM:SS"。文字起こしに実在するタイムスタンプを使うこと（創作しない）'),
  endTime: str('章の終了タイムスタンプ "HH:MM:SS"'),
  title: str('章タイトル。話題が一目でわかる具体的な表現（10〜20字程度）'),
  summary: str('この章で話された内容の要約（1〜2文）'),
});

const KEY_NUMBER_SCHEMA = obj({
  label: str('何の数値か（例: "月額顧問料", "納期", "目標売上"）'),
  value: str('値（例: "5万円", "4月末まで", "前年比120%"）'),
  context: str('どういう議論の中で出た数値か（1文）。特になければ空文字'),
});

const NEXT_ACTION_SCHEMA = obj({
  task: str('具体的なアクション。「誰が見ても何をすべきか分かる」粒度で'),
  owner: str('担当者名。会話から判別できなければ "未定"'),
  deadline: str('期限。会話から判明しない場合は空文字'),
});

const KEY_QUOTE_SCHEMA = obj({
  speaker: { type: 'string', enum: ['A', 'B'], description: '発言者（A または B）' },
  timestamp: str('該当発話のタイムスタンプ "HH:MM:SS"。文字起こしの [HH:MM:SS] をそのまま使用'),
  text: str('発言内容。フィラー（えーっと／あの／まあ／うーん／そうですね 等）と無意味な相づち・繰り返しを除去し、句点を補って読みやすく整える。意味のある言い直し・躊躇・感情的な強調はシグナルとして残す。文意の改変・要約・敬語の付け替えは禁止'),
  context: str('この発言がなぜ重要か・何を示しているか'),
});

const SESSION_MOMENT_SCHEMA = obj({
  type: {
    type: 'string',
    enum: ['breakthrough', 'resistance', 'insight', 'decision', 'emotion'],
    description: '転換点の種類',
  },
  description: str('何が起きたか（具体的な発言・場面を含む）'),
  significance: str('なぜそれがセッションにとって重要な転換点だったか'),
});

interface SummarySchemaOptions {
  titleDescription: string;
  sessionTypeDescription: string;
  extended: boolean; // Botarhythm 深層分析フィールドを含めるか
}

function buildSummarySchema(opts: SummarySchemaOptions) {
  const properties: Record<string, object> = {
    title: str(opts.titleDescription),
    clientName: str('主要な参加者名またはグループ名（会話から推測。不明なら "不明"）'),
    date: str('YYYY-MM-DD形式（会話やファイル名から推測。不明なら "不明"）'),
    sessionType: str(opts.sessionTypeDescription),
    executiveSummary: arr(
      { type: 'string' },
      '2〜4行のエグゼクティブブリーフ。読み手が30秒で「何の会話で・何が決まり・次に何をするか」を把握できる要点。各行は独立した完結文で、最重要事項から順に'
    ),
    chapters: arr(
      CHAPTER_SCHEMA,
      'セッションの章立て（タイムスタンプ付き目次）。話題の切れ目で3〜8章に分割し、startTime の昇順に並べる。タイムスタンプは文字起こしに実在するものを使う'
    ),
    decisions: arr(
      { type: 'string' },
      'このセッションで「確定」した決定事項のみ。提案・検討中の事項は含めない（それらは adviceGiven へ）。確定事項がなければ空配列'
    ),
    keyNumbers: arr(
      KEY_NUMBER_SCHEMA,
      '会話に登場した重要な数値・金額・期日・割合・件数。後から「あの数字いくらだったっけ」と探される情報を漏らさず。なければ空配列'
    ),
    clientPains: arr({ type: 'string' }, '主要な議題・課題・論点（背景・文脈を含む具体的な記述）'),
    adviceGiven: arr({ type: 'string' }, '提案・アドバイス・結論（根拠や背景を添えて）'),
    nextActions: arr(NEXT_ACTION_SCHEMA, '次のアクション'),
    homeworkForClient: arr({ type: 'string' }, 'フォローアップ項目（目的・期待成果を含む）'),
    keyQuotes: arr(KEY_QUOTE_SCHEMA, '印象的な発言'),
    overallAssessment: str('会話の成果・残課題・次回への展望を含む所感'),
  };

  if (opts.extended) {
    properties.sessionMoments = arr(SESSION_MOMENT_SCHEMA, 'セッション内の転換点');
    properties.coachingInsights = str(
      'コーチングアプローチの効果分析。どの介入が機能したか・しなかったか・次回以降の関わり方への示唆'
    );
    properties.underlyingThemes = arr(
      { type: 'string' },
      'クライアントがまだ言語化できていない深層テーマ'
    );
    properties.clientStateShift = str(
      'セッション開始時の状態 → 途中の変化 → 終了時の状態を具体的に描写。エネルギー・確信度・意欲がどう変化したか'
    );
    properties.nextSessionSuggestions = arr(
      { type: 'string' },
      '次回扱うべきテーマ（なぜ今それを扱うべきかの根拠付き）'
    );
  }

  return obj(properties);
}

/**
 * structured outputs で JSON を生成する共通ヘルパー。
 * - ストリーミング使用で長大出力時のHTTPタイムアウトを回避
 * - max_tokens 32000（Sonnet 4.6 はストリーミング時 64K まで）で切断をほぼ排除
 */
async function generateStructuredJson<T>(params: {
  model?: string;
  system: string;
  userPrompt: string;
  schema: ReturnType<typeof obj>;
  maxTokens?: number;
}): Promise<T> {
  const client = getClient();
  const stream = client.messages.stream({
    model: params.model ?? 'claude-sonnet-4-6',
    max_tokens: params.maxTokens ?? 32000,
    system: params.system,
    messages: [{ role: 'user', content: params.userPrompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: params.schema as unknown as Record<string, unknown>,
      },
    },
  });
  const message = await stream.finalMessage();
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return parseJsonResponse<T>(text, message.stop_reason);
}

// ─── システムプロンプト ───────────────────────────────────────────────────────

/**
 * 汎用システムプロンプト（一般的な会議・対話のサマリー用）
 * Botarhythm固有の前提を持たず、あらゆる会議・対話録音に対応する
 */
const GENERIC_SYSTEM_PROMPT = `あなたは会議・対話の記録を整理・要約するAIアシスタントです。
文字起こしから読み手がすぐに活用できる議事録・要約を作成します。

【編集の原則】
1. 会話の「核心」を捉える
   - 繰り返し登場するテーマ・懸念は重要なシグナルとして扱う
   - 発言の文字通りの意味だけでなく、背景にある意図・文脈を読む
   - 「何を言ったか」だけでなく「なぜそれが重要か」まで記述する

2. 各項目は「情報密度の高い一文」として書く
   - 冗長な前置きや重複した情報は省く
   - 固有の状況・文脈が伝わる具体的な表現を選ぶ
   - 一般論ではなく「この会議・対話に固有の記述」にする

3. 読み手が次にすべきことが直感的にわかる構成
   - アクション・フォローアップは誰が・何を・なぜを明確に
   - 残課題と今回の成果を区別する
   - 優先度の高いものを先に書く

4. 時間軸を捨てない
   - executiveSummary は「30秒で全体把握」できる密度で。最重要事項から順に
   - chapters は文字起こしのタイムスタンプに忠実に章を立てる。タイムスタンプの創作は禁止
   - decisions は「確定した事項」だけを書く。提案・検討中は adviceGiven と区別する
   - keyNumbers には金額・期日・数値を漏らさず拾う（後から探される情報）
   - keyQuotes の timestamp は該当発話の実際のタイムスタンプを使う

【タイトルのフォーマット — 必須】
title は「{クライアント名} — {テーマ}」の形で、クライアント名を先頭に置く。
- 例: 「田中商店 — 在庫管理システム見直しMTG」
- 例: 「みおり — Q2プロモーション施策のすり合わせ」
- クライアント名が会話から判別できない／"不明" の場合は、テーマのみを書く（"不明" の語をタイトルに含めない）。

参加者名・日付・会議種別は会話から推測すること。不明な場合は "不明" としてください。`;

/**
 * ブランドモード（Deep Dive モード）のシステムプロンプトを動的に組み立てる。
 * ブランドが未設定なら null を返す（呼び出し側は GENERIC_SYSTEM_PROMPT にフォールバック）。
 */
function buildBrandedSystemPrompt(brand: BrandConfig | null): string | null {
  if (!brand) return null;
  const { name, shortName, hostName, hostFullName, philosophy, approach, hostStrength, sessionFlow } =
    brand;
  return `あなたは${name}の専属セッションアナリストです。
${hostName}（${hostFullName}）が提供するセッションを、コーチング・心理・ビジネス戦略の3視点から徹底分析します。

【${name}のコンテキスト】
${philosophy ? `- サービス哲学：${philosophy}` : ''}
${approach ? `- アプローチ：${approach}` : ''}
${hostStrength ? `- ${hostName}の強み：${hostStrength}` : ''}
${sessionFlow ? `- 典型的なセッションの流れ：${sessionFlow}` : ''}

【深層分析の視点】
1. 発言の行間を読む
   - 何を言ったかではなく「どう言ったか」「何を言わなかったか」に注目する
   - 躊躇・言い直し・繰り返し・沈黙の直後の発言は心理的シグナル
   - クライアントの自己評価と客観的状況のギャップを捉える

2. セッションの感情的・認知的アーク
   - セッション開始時と終了時でクライアントの状態がどう変化したか
   - 「空気が変わった瞬間」——言葉・質問・沈黙がきっかけになった転換点
   - エネルギーが高まった場面と下がった場面の両方を記録する

3. コーチングの効果を評価する
   - ${hostName}のどの介入（質問・リフレーム・チャレンジ・共感）が機能したか
   - クライアントが「腹落ちした瞬間」を特定する
   - 次回以降のセッション設計に活かせる観察を記録する

4. ビジネス課題の構造を捉える
   - 表面的な困りごとの下にある根本的な問い・構造的問題を明確にする
   - 現在地・目指す状態・ギャップを整理する
   - 変革の優先度と実行可能性の両面から評価する

5. 時間軸を捨てない
   - executiveSummary は「30秒で全体把握」できる密度で。最重要事項から順に
   - chapters は文字起こしのタイムスタンプに忠実にセッションの流れを章立てする。創作禁止
   - decisions は「確定した事項」だけ。提案・検討中は adviceGiven と区別する
   - keyNumbers には金額・期日・数値を漏らさず拾う
   - keyQuotes の timestamp は該当発話の実際のタイムスタンプを使う

【タイトルのフォーマット — 必須】
title は「{クライアント名} × ${shortName} — {テーマ}」の形で、必ずクライアント名を先頭に置く。
- クライアント名が会話から判別できない／"不明" の場合は「クライアント × ${shortName} — {テーマ}」とする。

日付が不明な場合は "不明" としてください。`;
}

// ─── 話者自動検出 ─────────────────────────────────────────────────────────────

/**
 * 話者自動検出。
 * 運用前提として「録音機器の持ち主（話者A）= ホスト」が常に成り立つため、
 * ブランド設定があれば A にホスト名を割り当てる。
 * （以前はキーワード判定があったが、どちらの分岐でも同じ結果を返す死にロジックだったため削除）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function autoDetectSpeakers(_transcript: Utterance[]): Promise<SpeakerNames> {
  const brand = await getBrandConfig();
  return brand ? { A: brand.hostName, B: '' } : { A: '', B: '' };
}

// ─── プロンプトビルダー ───────────────────────────────────────────────────────

function buildSpeakerContext(speakerNames: SpeakerNames): string {
  const lines: string[] = [];
  if (speakerNames.A) lines.push(`話者A = ${speakerNames.A}`);
  if (speakerNames.B) lines.push(`話者B = ${speakerNames.B}`);
  if (lines.length === 0) return '';
  return `\n【話者情報】\n${lines.join('\n')}\n（サマリー内では「話者A」「話者B」の代わりにこの名前を使用してください）`;
}

// ─── ノーマル議事録モード: 深度指示 ──────────────────────────────────────────

const NORMAL_DEPTH_INSTRUCTIONS: Record<NormalDepth, string> = {
  simple: `【深度: シンプル — 意思決定者のための2分ブリーフィング】

目的：読み手が「今日の最重要事項」を2分で把握できること。

出力の要件：
- clientPains：最重要の論点・課題のみ2〜3項目。背景説明より「何が問題か」を優先
- adviceGiven：最も重要な決定事項・提案のみ2〜3項目。「何をすべきか」だけを端的に
- nextActions：次のアクションを明確に（期限・担当があれば必ず記載）
- homeworkForClient：フォローアップ事項を1〜2項目
- keyQuotes：省略可（特に印象的な発言が1つあれば可）
- overallAssessment：1〜2文で「今日の会議の一言要約」
- Botarhythm専用フィールド（sessionMoments / coachingInsights / underlyingThemes / clientStateShift / nextSessionSuggestions）は出力しない

タイトルは「{クライアント名} — {テーマ}」の順。シンプルに「何の会議だったか」が伝わる短い表現で。`,

  standard: `【深度: スタンダード — 全体像を把握する実用議事録】

目的：会議・対話の全体像を整理し、関係者への共有や次回の準備に使えること。

出力の要件：
- clientPains：3〜5項目。「何が論点か」＋「その背景・文脈」をセットで記述
- adviceGiven：3〜5項目。「何が決まったか／提案されたか」＋「なぜそう判断したか」を添える
- nextActions：具体的なタスクとオーナーを明確に。期限は把握できる範囲で
- homeworkForClient：3〜4項目。目的（なぜやるか）も1文で添える
- keyQuotes：2〜3発言。contextで「この発言がなぜ印象的か」を説明
- overallAssessment：2〜3文。会議の成果・残課題・次回への展望
- Botarhythm専用フィールドは出力しない

タイトルは「{クライアント名} — {テーマ}」の順（例：「田中商店 — Q2ロードマップすり合わせ」）。`,

  detailed: `【深度: 詳細 — 包括的な議事録】

目的：会議の内容を詳細に記録し、欠席者や後日参照する関係者に耐える品質に。

出力の要件：
- clientPains：5〜8項目。「論点」「背景」「関係者の立場の違い」を層的に記述
- adviceGiven：5〜8項目。決定・提案の根拠・前提条件・関係者の反応も含める
- nextActions：すべてのアクションを漏れなく。期限・担当・背景まで記載
- homeworkForClient：4〜6項目。実行手順・期待成果・想定される障壁も添える
- keyQuotes：5〜7発言。contextは「この発言が何を示しているか」を詳しく
- overallAssessment：3〜4文。会議の成果・残課題・未解決事項・次回への提言
- Botarhythm専用フィールドは出力しない

タイトルは「{クライアント名} — {テーマ}」の順（例：「田中商店 — "優先順位の再定義"で合意した来期計画MTG」）。`,
};

// ─── ブランドモード: 深度指示（動的生成） ────────────────────────────────────
// ブランド設定（env）から hostName / shortName を埋め込んで生成する。

function buildBrandedDepthInstructions(brand: BrandConfig): Record<BotarhythmDepth, string> {
  const { hostName, shortName, name } = brand;
  return {
    standard: `【深度: スタンダード — 全体像を把握する実用サマリー】

目的：セッションの全体像を整理し、次回に向けた準備に使えること。

出力の要件：
- clientPains：3〜5項目。「何が課題か」＋「その背景・文脈」をセットで記述
- adviceGiven：3〜5項目。「何を提案したか」＋「なぜそのアドバイスか」を添える
- nextActions：具体的なタスクとオーナーを明確に。期限は把握できる範囲で
- homeworkForClient：3〜4項目。目的（なぜやるか）も1文で添える
- keyQuotes：2〜3発言。contextで「この発言がなぜ印象的か」を説明
- overallAssessment：2〜3文。セッションの手応え・残課題・次回への展望
- sessionMoments / underlyingThemes / nextSessionSuggestions：あれば記載（省略可）
- coachingInsights / clientStateShift：省略

タイトルは「{クライアント名} × ${shortName} — {テーマ}」の順。`,

    detailed: `【深度: 詳細 — 包括的なセッションレポート】

目的：セッションの内容を詳細に記録し、関係者への共有・将来の参照に耐えること。

出力の要件：
- clientPains：5〜8項目。「主訴」「背景要因」「感情的インパクト」の3層で記述
- adviceGiven：5〜8項目。提案の根拠・前提条件・クライアントの反応も含める
- nextActions：すべてのアクションを漏れなく。期限・担当・背景まで記載
- homeworkForClient：4〜6項目。実行手順・期待成果・想定される障壁も添える
- keyQuotes：5〜7発言。contextは「この発言が何を示しているか」を詳しく
- overallAssessment：3〜4文。セッションの成果・残課題・関係性の変化・次回への提言
- sessionMoments：3つ以上（必須）。セッションの流れを形作った転換点を記録
- underlyingThemes：2〜4項目（必須）。表面的な課題の下にある深層テーマ
- nextSessionSuggestions：3項目以上（必須）。次回アジェンダの具体的な候補
- coachingInsights・clientStateShift：あれば記載

タイトルは「{クライアント名} × ${shortName} — {テーマ}」の順。`,

    deep: `【深度: ディープダイブ — ${name} 深層分析モード】

目的：このセッションを将来のコーチング設計に活かす資産として記録すること。
表面的な要約ではなく、クライアントの思考・感情・行動パターンの深層まで読み込む。

■ 分析の深さについて
- 発言内容だけでなく「言葉の選び方」「躊躇した箇所」「繰り返されたテーマ」まで読む
- クライアントの「本当の問い」を探す（表面的な質問の下にある、まだ言語化されていない問い）
- セッション中の感情的変化・エネルギーの変化を時系列で捉える
- ${hostName}の介入（質問・沈黙・リフレーム・チャレンジ）がどの場面で機能したか評価する
- 今回のセッションで扱えなかった「次の核心テーマ」を予測する

■ 出力の要件
- clientPains：8項目以上。「主訴 → 背景要因 → 根本原因 → 心理的インパクト」の流れで記述。優先度を示す
- adviceGiven：8項目以上。提案の意図・前提・クライアントの受け取り方・有効性の評価まで含める
- nextActions：すべてのアクションを漏れなく。「なぜ今これが重要か」も添える
- homeworkForClient：実行可能性・クライアントの抵抗感・成功の定義まで含める
- keyQuotes：8発言以上。各contextで「この発言がセッションの何を示す分水嶺だったか」を分析
- overallAssessment：5文以上。セッションの成果・コーチング効果・クライアントとの関係深化・今後の設計への示唆を含む
- sessionMoments：5つ以上（必須）。typeを正確に分類し、significanceでコーチングへの含意を説明
- coachingInsights：必須・詳細記述。「どの介入が機能したか」「機能しなかった場面とその理由」「次回以降の関わり方への示唆」
- underlyingThemes：3〜6項目（必須）。「クライアントがまだ言語化できていない問い」まで含める
- clientStateShift：必須・詳細記述。開始時の状態 → セッション中の変化 → 終了時の状態を具体的に描写
- nextSessionSuggestions：4項目以上（必須）。各提案に「なぜ今それを扱うべきか」の根拠を添える

タイトルは「{クライアント名} × ${shortName} — {テーマ}」の順で、深層テーマを象徴する記憶に残る表現に。`,
  };
}

// ─── ノーマル議事録モード: パターン指示 ────────────────────────────────────────

const NORMAL_PATTERN_INSTRUCTIONS: Record<NormalPattern, string> = {
  action: `【重点パターン: アクション重視】
nextActions と homeworkForClient を最優先で充実させること。
- nextActionsの各項目：「誰が・何を・いつまでに・どのように達成するか」まで具体化。期限は必ず記載（未定なら「次回までに」など）
- homeworkForClientの各項目：「やること」だけでなく「なぜやるか（目的）」「成功の定義」「想定される障壁と対処法」を含める
- adviceGivenはすべて「行動可能な提案」に落とし込む。「〜を考える」ではなく「〜をする」形で
- overallAssessmentは「今日決まったこと」と「次までにやること」を中心に締める`,

  strategy: `【重点パターン: ビジネス戦略】
ビジネス課題の構造的分析を最優先とすること。
- adviceGivenの各項目：「何をすべきか」＋「ビジネスインパクト（何が変わるか）」＋「優先度・緊急度の評価」を含める
- nextActionsに期限・担当に加え「なぜ今これが最優先か」の根拠を添える
- clientPainsを「表面症状」と「構造的問題」に区別して記述
- overallAssessmentで「現在地」「目指す状態」「最大のボトルネック」を整理する`,

  problem: `【重点パターン: 課題分析】
問題の根本原因の特定を最優先とすること。
- clientPainsを「表面症状 → 背景要因 → 根本原因」の3層で分析。優先度の高い順に並べる
- 「解決すべき問題」と「受け入れるべき制約」を区別して記述
- 問題間の因果関係・連鎖を意識する（AがBの原因でありCにも影響している、など）
- adviceGivenは「対症療法」と「根本対処」を区別して提案する
- overallAssessmentで「今日明確になった問い」と「まだ答えが出ていない問い」を整理する`,
};

// ─── ブランドモード: パターン指示（動的生成） ─────────────────────────────────

function buildBrandedPatternInstructions(
  brand: BrandConfig
): Record<BotarhythmPattern, string> {
  const { hostName } = brand;
  return {
    psychology: `【重点パターン: クライアント心理】
クライアントの内面状態の分析を最優先とすること。
- clientPainsにはクライアントの感情状態・心理的ブロック・恐れ・自己イメージを含める。「何が怖いか」「何を避けているか」を明示
- clientStateShift（必須）：セッション前後でのエネルギー・確信度・意欲の変化を具体的に描写。「〜だったが〜に変化した」という形で
- keyQuotesはクライアントの内面が滲む発言を優先。躊躇・言い直し・感情的な発言を選ぶ
- underlyingThemesに心理的なパターン（自己評価・他者承認欲求・完璧主義傾向など）を含める
- overallAssessmentでクライアントの「今の段階」（認識段階・葛藤段階・変化準備段階など）を評価する`,

    coaching: `【重点パターン: コーチング観点】
コーチングの効果と有効性の分析を最優先とすること。
- coachingInsights（必須・詳細）：${hostName}の介入を場面ごとに評価する。「〇〇という質問でクライアントが〜に気づいた」「〜のリフレームが〜の変化をもたらした」という具体的な分析
- sessionMomentsに「空気が変わった瞬間」を優先して記録。typeをbreakthroughやinsightで積極的に使う
- keyQuotesに「クライアントが腹落ちした瞬間の発言」を含める
- nextSessionSuggestionsはコーチングの継続性を意識した提案（今回の気づきをどう深めるか）
- overallAssessmentで「このセッションでクライアントが変わったこと」と「次回に持ち越す課題」を区別する`,

    strategy: `【重点パターン: ビジネス戦略】
ビジネス課題の構造的分析を最優先とすること。
- adviceGivenの各項目：「何をすべきか」＋「ビジネスインパクト（何が変わるか）」＋「優先度・緊急度の評価」を含める
- nextActionsに期限・担当に加え「なぜ今これが最優先か」の根拠を添える
- underlyingThemesにビジネス課題の構造的問題（組織・プロセス・技術・人材のどこに根本原因があるか）を明記
- clientPainsを「表面症状」と「構造的問題」に区別して記述
- overallAssessmentで「現在地」「目指す状態」「最大のボトルネック」を整理する
- nextSessionSuggestionsは具体的なビジネスイシューを扱う（「〜の意思決定をする」「〜の計画を立てる」など）`,

    problem: `【重点パターン: 課題分析】
問題の根本原因の特定を最優先とすること。
- clientPainsを「表面症状 → 背景要因 → 根本原因」の3層で分析。優先度の高い順に並べる
- underlyingThemes（必須）：「本当に解くべき問い」を明確にする。「〜という問題があるが、本質的な問いは〜ではないか」という形で
- 「解決すべき問題」と「受け入れるべき制約」を区別して記述
- 問題間の因果関係・連鎖を意識する（AがBの原因でありCにも影響している、など）
- adviceGivenは「対症療法」と「根本対処」を区別して提案する
- overallAssessmentで「今日明確になった問い」と「まだ答えが出ていない問い」を整理する`,
  };
}

// ─── モード別スキーマ生成 ─────────────────────────────────────────────────────

/** 初回自動生成・ノーマル再生成用（汎用・標準フィールドのみ） */
function buildNormalSummarySchema() {
  return buildSummarySchema({
    titleDescription:
      '「{クライアント名} — {テーマ}」の形でクライアント名を先頭に置く（クライアント名が不明ならテーマのみ。"不明" の語をタイトルに含めない）',
    sessionTypeDescription: '会議 | 打ち合わせ | 1on1 | ブレスト | ヒアリング | コーチング | その他',
    extended: false,
  });
}

/** ブランドモード再生成用（深層分析フィールド付き） */
function buildBrandedSummarySchema(brand: BrandConfig) {
  return buildSummarySchema({
    titleDescription: `「{クライアント名} × ${brand.shortName} — {テーマ}」の形で必ずクライアント名を先頭に置く（クライアント名が不明なら「クライアント × ${brand.shortName} — {テーマ}」）`,
    sessionTypeDescription: '体験セッション | メンタリング | 戦略セッション | 振り返り | その他',
    extended: true,
  });
}

// ─── 共通ユーティリティ ───────────────────────────────────────────────────────

/**
 * 書き起こし全体から最大 maxCount 発話を均等サンプリングする。
 * 先頭だけを見ると後半に登場する人名・社名を見逃すため、全体から拾う。
 */
function sampleTranscript(transcript: Utterance[], maxCount: number): Utterance[] {
  if (transcript.length <= maxCount) return transcript;
  const step = transcript.length / maxCount;
  const sampled: Utterance[] = [];
  for (let i = 0; i < maxCount; i++) {
    sampled.push(transcript[Math.floor(i * step)]);
  }
  return sampled;
}

export async function suggestPrivacyTerms(
  summary: SessionSummary,
  transcript: Utterance[]
): Promise<string[]> {
  // サマリー全文 + 書き起こし全体からの均等サンプリング（最大240発話）を走査対象にする
  const transcriptPreview = sampleTranscript(transcript, 240)
    .map((u) => `${u.speaker}: ${u.text}`)
    .join('\n');

  const prompt = `以下のセッション情報を分析し、プライバシーや守秘義務の観点から匿名化を推奨する語句をリストアップしてください。

【対象となる語句の基準】
- 個人名（クライアント名・関係者名など）
- 企業名・組織名・ブランド名
- 具体的なサービス名・商品名（競合情報になりうるもの）
- 個人を特定しうる固有名詞

【サマリー全文（JSON）】
${JSON.stringify(summary, null, 1)}

【書き起こし抜粋（全体から均等サンプリング）】
${transcriptPreview}

重複なし。一般的すぎる語（「クライアント」「会社」など）は除外。該当なしなら空配列。`;

  const result = await generateStructuredJson<{ terms: string[] }>({
    model: 'claude-haiku-4-5-20251001',
    system: 'あなたは守秘義務とプライバシー保護の観点で文書を点検する専門家です。',
    userPrompt: prompt,
    schema: obj({
      terms: arr({ type: 'string' }, '匿名化を推奨する語句のリスト（例: "山田様", "株式会社〇〇", "△△アプリ"）'),
    }),
    maxTokens: 2048,
  });

  return result.terms;
}

/** 文字列に対し maskedTerms をすべて ●● に置換する。空語は無視。長い順に処理して部分一致衝突を回避 */
function maskString(value: string, terms: string[]): string {
  if (!value) return value;
  const sorted = [...terms].filter((t) => t.length > 0).sort((a, b) => b.length - a.length);
  return sorted.reduce((text, term) => text.split(term).join('●●'), value);
}

export function anonymizeTranscript(transcript: Utterance[], maskedTerms: string[]): Utterance[] {
  return transcript.map((u) => ({
    ...u,
    text: maskString(u.text, maskedTerms),
  }));
}

/**
 * SessionSummary 内のすべての文字列フィールドに対し決定的な文字列置換を行う。
 * AI 匿名化の取りこぼしを防ぐセーフティネット。タイトル・clientName・各リスト・
 * Botarhythm 拡張フィールドまで網羅する。
 */
export function applyMaskedTermsToSummary(
  summary: SessionSummary,
  maskedTerms: string[]
): SessionSummary {
  if (!maskedTerms || maskedTerms.length === 0) return summary;
  const m = (s: string) => maskString(s, maskedTerms);
  return {
    ...summary,
    title: m(summary.title),
    clientName: m(summary.clientName),
    date: summary.date,
    sessionType: m(summary.sessionType),
    executiveSummary: summary.executiveSummary?.map(m),
    chapters: summary.chapters?.map((c) => ({
      ...c,
      title: m(c.title),
      summary: m(c.summary),
    })),
    decisions: summary.decisions?.map(m),
    keyNumbers: summary.keyNumbers?.map((k) => ({
      ...k,
      label: m(k.label),
      value: m(k.value),
      context: k.context ? m(k.context) : k.context,
    })),
    clientPains: summary.clientPains.map(m),
    adviceGiven: summary.adviceGiven.map(m),
    nextActions: summary.nextActions.map((a) => ({
      ...a,
      task: m(a.task),
      // owner にクライアント実名が入ることがあるため必ずマスク対象にする
      owner: m(a.owner),
      deadline: a.deadline ? m(a.deadline) : a.deadline,
    })),
    homeworkForClient: summary.homeworkForClient.map(m),
    keyQuotes: summary.keyQuotes.map((q) => ({
      ...q,
      text: m(q.text),
      context: m(q.context),
    })),
    overallAssessment: m(summary.overallAssessment),
    sessionMoments: summary.sessionMoments?.map((sm) => ({
      ...sm,
      description: m(sm.description),
      significance: m(sm.significance),
    })),
    coachingInsights: summary.coachingInsights ? m(summary.coachingInsights) : summary.coachingInsights,
    underlyingThemes: summary.underlyingThemes?.map(m),
    clientStateShift: summary.clientStateShift ? m(summary.clientStateShift) : summary.clientStateShift,
    nextSessionSuggestions: summary.nextSessionSuggestions?.map(m),
  };
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');
  return new Anthropic({ apiKey });
}

// ─── サマリー生成（初回自動） ──────────────────────────────────────────────────

/** 初回自動サマリー: ノーマル議事録モード固定（Botarhythm固有の前提を一切持たない） */
export async function generateSummary(
  transcript: Utterance[],
  originalFilename: string
): Promise<SessionSummary> {
  const transcriptText = transcript
    .map((u) => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`)
    .join('\n');

  const userPrompt = `【元のファイル名】
${originalFilename}

【文字起こし】
${transcriptText}`;

  const parsed = await generateStructuredJson<SessionSummary>({
    system: GENERIC_SYSTEM_PROMPT,
    userPrompt,
    schema: buildNormalSummarySchema(),
  });
  return { ...parsed, mode: 'normal' };
}

// ─── サマリー再生成（カスタム） ────────────────────────────────────────────────

/** カスタム再生成: モード・深度・パターン・補正メモ・話者名を反映 */
export async function generateCustomSummary(
  transcript: Utterance[],
  originalFilename: string,
  options: SummaryOptions
): Promise<SessionSummary> {
  // モードで system prompt・スキーマ・深度/パターン指示を完全に切り替える
  // ブランドモード(botarhythm)が要求されたが env 未設定の場合は normal にフォールバック
  const brand = options.mode === 'botarhythm' ? await getBrandConfig() : null;
  const isBranded = options.mode === 'botarhythm' && brand !== null;

  const brandedSystemPrompt = isBranded ? buildBrandedSystemPrompt(brand) : null;
  const systemPrompt = brandedSystemPrompt ?? GENERIC_SYSTEM_PROMPT;
  const schema = isBranded ? buildBrandedSummarySchema(brand!) : buildNormalSummarySchema();

  const depthInstruction = isBranded
    ? buildBrandedDepthInstructions(brand!)[options.depth as BotarhythmDepth]
    : NORMAL_DEPTH_INSTRUCTIONS[options.depth as NormalDepth];

  const patternInstructions = isBranded
    ? (options.patterns as BotarhythmPattern[])
        .map((p) => buildBrandedPatternInstructions(brand!)[p])
        .join('\n\n')
    : (options.patterns as NormalPattern[])
        .map((p) => NORMAL_PATTERN_INSTRUCTIONS[p])
        .join('\n\n');

  const transcriptText = transcript
    .map((u) => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`)
    .join('\n');

  const notesSection = [
    options.clientNotes.trim() && `【クライアント共通メモ（用語の誤変換修正・背景情報）】\n${options.clientNotes.trim()}`,
    options.userNotes.trim() && `【今回の補正メモ（注力ポイント・文脈補足）】\n${options.userNotes.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  // ブランドモードのみ話者情報（ホスト名/クライアント名など）を活用
  const speakerContext = isBranded ? buildSpeakerContext(options.speakerNames) : '';

  const userPrompt = `【元のファイル名】
${originalFilename}
${speakerContext}

${depthInstruction}

${patternInstructions ? `【重点分析パターン — 以下の観点を特に重視して分析すること】\n${patternInstructions}` : ''}

${notesSection ? `${notesSection}\n（上記のメモを分析に反映すること。特に用語の誤変換は正確な語句に修正した上でサマリーを作成してください）` : ''}

【文字起こし】
${transcriptText}`;

  // 要求された mode が botarhythm でも env 未設定なら normal として保存
  const finalMode = options.mode === 'botarhythm' && !brand ? 'normal' : options.mode;
  const parsed = await generateStructuredJson<SessionSummary>({
    system: systemPrompt,
    userPrompt,
    schema,
  });
  return { ...parsed, mode: finalMode };
}

// ─── クロスセッション縦断分析 ──────────────────────────────────────────────────

async function buildCrossAnalysisSystemPrompt(): Promise<string> {
  const brand = await getBrandConfig();
  if (!brand) {
    return `あなたは複数のセッション記録を縦断的に分析し、クライアントの変遷を読み解くケースアナリストです。

【分析の視点】
1. 時系列でセッションを読む
   - 初回から最新回へと、何がどう変化してきたかを追う
   - 「同じ悩みを繰り返している」のか「螺旋状に深まっている」のかを区別する
   - 変化が起きたセッションを特定し、何がそのきっかけだったかを考察する

2. パターンを抽出する
   - 言葉・テーマ・懸念が繰り返される場合、それは解決されていない核心課題のシグナル
   - クライアントが「宿題を実行している/していない」傾向は行動変容の度合いを示す
   - アドバイスへの反応パターン（即実行型/検討型/抵抗型）を読む

3. 進捗を評価する
   - どのフェーズ（認識→葛藤→行動→内省）にいるかを判断する
   - 提供者との関係性がどう深まってきたかを記述する
   - 次のフェーズへ進む準備ができているかを評価する

4. 実用的な前進のためのインサイトを生成する
   - 「次のセッションで何を扱うべきか」を証拠に基づいて提言する
   - まだ手をつけていない「本質的な問い」を浮き彫りにする
   - クライアントが自走できる方向への示唆を含める

JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。`;
  }

  return `あなたは${brand.name}の専属ケースアナリストです。
複数のコーチングセッションの記録を縦断的に読み解き、クライアントの成長と変化の全体像を明らかにします。

【分析の視点】
1. 時系列でセッションを読む
   - 初回から最新回へと、何がどう変化してきたかを追う
   - 「同じ悩みを繰り返している」のか「螺旋状に深まっている」のかを区別する
   - 変化が起きたセッションを特定し、何がそのきっかけだったかを考察する

2. パターンを抽出する
   - 言葉・テーマ・懸念が繰り返される場合、それは解決されていない核心課題のシグナル
   - クライアントが「宿題を実行している/していない」傾向は行動変容の度合いを示す
   - アドバイスへの反応パターン（即実行型/検討型/抵抗型）を読む

3. コーチングの成果を評価する
   - どのフェーズ（認識→葛藤→行動→内省）にいるかを判断する
   - ${brand.hostName}との関係性がどう深まってきたかを記述する
   - 次のフェーズへ進む準備ができているかを評価する

4. 実用的な前進のためのインサイトを生成する
   - 「次のセッションで何を扱うべきか」を証拠に基づいて提言する
   - まだ手をつけていない「本質的な問い」を浮き彫りにする
   - クライアントが自走できる方向への示唆を含める

JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。`;
}

interface SessionDigest {
  date: string;
  sessionType: string;
  title: string;
  clientPains: string[];
  adviceGiven: string[];
  nextActions: string[];
  homeworkForClient: string[];
  overallAssessment: string;
  underlyingThemes?: string[];
  clientStateShift?: string;
  sessionMomentsCount?: number;
}

function buildSessionDigest(summary: SessionSummary): SessionDigest {
  return {
    date: summary.date,
    sessionType: summary.sessionType,
    title: summary.title,
    clientPains: summary.clientPains,
    adviceGiven: summary.adviceGiven,
    nextActions: summary.nextActions.map((a) => `[${a.owner}] ${a.task}${a.deadline ? ` (${a.deadline})` : ''}`),
    homeworkForClient: summary.homeworkForClient,
    overallAssessment: summary.overallAssessment,
    ...(summary.underlyingThemes?.length && { underlyingThemes: summary.underlyingThemes }),
    ...(summary.clientStateShift && { clientStateShift: summary.clientStateShift }),
    ...(summary.sessionMoments?.length && { sessionMomentsCount: summary.sessionMoments.length }),
  };
}

/** クロス分析の出力スキーマ */
function buildCrossAnalysisSchema(sessionCount: number) {
  return obj({
    periodSummary: str(`期間の要約（例: "2024年3月〜2025年4月（${sessionCount}セッション）"）`),
    progressNarrative: str('クライアントの変遷を語る2〜3段落。具体的なセッションの流れを踏まえて記述'),
    recurringThemes: arr(
      obj({
        theme: str('テーマ名'),
        sessionCount: { type: 'integer', description: '何回のセッションに登場したか' },
        evolution: str('どのように変化・深化してきたか'),
        status: {
          type: 'string',
          enum: ['ongoing', 'resolved', 'deepening', 'new'],
          description: 'テーマの現在の状態',
        },
      }),
      '繰り返し登場するテーマ'
    ),
    resolvedIssues: arr({ type: 'string' }, '解消・前進した課題'),
    persistentChallenges: arr({ type: 'string' }, 'まだ残る・深まる課題（なぜ解消されないかも含む）'),
    emergingIssues: arr({ type: 'string' }, '最近新たに浮上してきた課題'),
    behavioralPatterns: arr({ type: 'string' }, '観察されたクライアントの行動パターン（具体的な根拠を含む）'),
    mindsetEvolution: str('思考・姿勢・自己認識がどのように変化してきたかを2段落程度で'),
    actionPattern: str('宿題やアクションアイテムの実行傾向の分析。具体的な事例を挙げながら記述'),
    keyMilestones: arr(
      obj({
        sessionDate: str('YYYY-MM-DD'),
        description: str('何が起きたか'),
        significance: str('なぜそれが重要な転換点だったか'),
      }),
      '重要なマイルストーン'
    ),
    coachingRelationship: str('提供者とクライアントの関係性の深さ・質・変化を評価。信頼関係の構築度合いも含む'),
    currentPhase: str('現在のコーチングフェーズの評価（認識段階 / 葛藤段階 / 行動段階 / 内省・統合段階 など）とその根拠'),
    nextPhaseRecommendation: str('次のフェーズへ進むための提言。クライアントの準備状況・阻害要因・促進要因も含む2〜3段落'),
    priorityTopics: arr({ type: 'string' }, '次回セッションで最優先に扱うべきテーマ（根拠付き・3項目）'),
  });
}

export async function generateCrossAnalysis(
  clientName: string,
  sessions: Array<{ id: string; date: string; summary: SessionSummary }>
): Promise<CrossAnalysisResult> {
  const sessionDigests = sessions.map((s, i) => ({
    index: i + 1,
    ...buildSessionDigest(s.summary),
  }));

  const dateFrom = sessions[0].date;
  const dateTo = sessions[sessions.length - 1].date;

  const userPrompt = `【分析対象】
クライアント: ${clientName}
セッション数: ${sessions.length}回
期間: ${dateFrom} 〜 ${dateTo}

【セッション記録（時系列順）】
${sessionDigests.map((s) => `
── 第${s.index}回 (${s.date}) ──
タイトル: ${s.title}
種別: ${s.sessionType}
課題: ${s.clientPains.join(' / ')}
アドバイス: ${s.adviceGiven.join(' / ')}
アクション: ${s.nextActions.join(' / ')}
宿題: ${s.homeworkForClient.join(' / ')}
所感: ${s.overallAssessment}${s.underlyingThemes ? `\n深層テーマ: ${s.underlyingThemes.join(' / ')}` : ''}${s.clientStateShift ? `\n変化: ${s.clientStateShift}` : ''}`).join('\n')}`;

  const parsed = await generateStructuredJson<Omit<CrossAnalysisResult, 'clientName' | 'sessionCount' | 'generatedAt'>>({
    system: await buildCrossAnalysisSystemPrompt(),
    userPrompt,
    schema: buildCrossAnalysisSchema(sessions.length),
  });

  // クライアント名・件数・生成日時はAIに推測させずサーバー側で確定値を入れる
  return {
    ...parsed,
    clientName,
    sessionCount: sessions.length,
    generatedAt: new Date().toISOString(),
  };
}

// ─── 匿名化サマリー生成 ───────────────────────────────────────────────────────

/**
 * 匿名化用スキーマ: 元サマリーに実在するフィールドだけを必須にした動的スキーマ。
 * 旧データ（executiveSummary などがない）でも構造を完全に維持して再生成できる。
 */
function buildAnonymizedSchema(original: SessionSummary) {
  const full = buildSummarySchema({
    titleDescription: '元のタイトル。指定語句または対応カテゴリの具体値が含まれる場合のみ自然になるよう書き換え、含まれなければそのまま',
    sessionTypeDescription: '元の値を維持',
    extended: true,
  });
  const presentKeys = Object.entries(original)
    .filter(([key, value]) => key !== 'mode' && value !== undefined && value !== null)
    .map(([key]) => key);
  const properties = Object.fromEntries(
    Object.entries(full.properties).filter(([key]) => presentKeys.includes(key))
  );
  return {
    type: 'object' as const,
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export async function generateAnonymizedSummary(
  originalSummary: SessionSummary,
  maskedTerms: string[]
): Promise<SessionSummary> {
  const termsText = maskedTerms.map((t) => `- "${t}"`).join('\n');

  const userPrompt = `以下のセッションサマリーを、**指定された語句のみ**を匿名化して再生成してください。

【匿名化する語句】
${termsText}

【語句の2タイプ — まず判定する】
各語句は以下のいずれかに分類される。タイプに応じて処理を変える。

A. **固有名詞型**: 人名・会社名・店名・地名・商品名・サービス名など、特定のエンティティを指す名詞。
   例: "山田", "田中商店", "株式会社〇〇", "ABCサービス"

B. **カテゴリ型**: 「〜の条件」「〜情報」「〜など」「〜系」などカテゴリ・概念・属性を示す表現。
   例: "掛け率などの条件", "金額情報", "契約期間", "報酬体系", "個人情報", "売上数値"

【処理ルール】
1. **固有名詞型(A)**: その固有名詞および同一エンティティの自然な呼称バリエーションを置換する。
   - 例: "山田" がリストにある場合 → "山田さん"・"山田様"・"山田氏"・"山田部長" も置換。
   - 置換後: 人名 → 「クライアント」「担当者」「Aさん」/ 会社・店・サービス → 「A社」「該当店舗」「当該サービス」など。
2. **カテゴリ型(B)**: そのカテゴリに該当する**具体的な数値・条件・固有値**をサマリー内から特定して匿名化する。
   - 例: "掛け率などの条件" → 「掛け率35%」「販売手数料20%」のような具体値を「●●%」「●●」に置換。
   - 例: "金額情報" → 「月額50万円」のような具体金額を「●●万円」「●●」に置換。
   - 例: "契約期間" → 「3年契約」「2026年4月から」のような期間具体値を「●●」に置換。
   - 抽象的な議論や一般論はそのまま残す。具体値・固有値だけを匿名化する。
3. **絶対禁止 — 過剰匿名化の防止**:
   - リスト語句のいずれにも該当しない人名・社名・店名・地名・商品名・固有値は**一切変更しない**。
   - AIによる「念のため」の追加匿名化は厳禁。ユーザーが明示した語句および対応カテゴリだけを処理する。
4. **走査対象フィールド（漏れなく）**:
   title / clientName / sessionType /
   executiveSummary / chapters[].title / chapters[].summary /
   decisions / keyNumbers[].label / keyNumbers[].value / keyNumbers[].context /
   clientPains / adviceGiven /
   nextActions[].task / nextActions[].owner / nextActions[].deadline /
   homeworkForClient / keyQuotes[].text / keyQuotes[].context /
   overallAssessment / sessionMoments[].description / sessionMoments[].significance /
   coachingInsights / underlyingThemes / clientStateShift / nextSessionSuggestions
5. title フィールドにリスト語句または対応カテゴリの具体値が含まれる場合のみ、自然になるよう書き換える。
   含まれていなければタイトルもそのまま残す。
6. JSONのキー名・構造は変更しない。date は変更しない。意味を変える書き換えは禁止。

【元のサマリーJSON】
${JSON.stringify(originalSummary, null, 2)}`;

  const aiAnonymized = await generateStructuredJson<SessionSummary>({
    system: GENERIC_SYSTEM_PROMPT,
    userPrompt,
    schema: buildAnonymizedSchema(originalSummary),
  });

  // mode はAI出力に含めないため元の値を引き継ぎ、決定的マスクをセーフティネットとして適用
  return applyMaskedTermsToSummary({ ...aiAnonymized, mode: originalSummary.mode }, maskedTerms);
}
