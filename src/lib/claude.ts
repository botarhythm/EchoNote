import Anthropic from '@anthropic-ai/sdk';
import type { Utterance, SessionSummary, SummaryOptions, SummaryDepth, SummaryPattern, SpeakerNames } from './types';

// ─── システムプロンプト ───────────────────────────────────────────────────────

/** 汎用（deep以外で使用） */
const GENERIC_SYSTEM_PROMPT = `あなたはプロフェッショナルなセッション議事録作成AIです。
音声録音から文字起こしされた会話を分析し、構造化されたサマリーを作成します。
会話の内容からクライアント名・セッション日付・セッション種別を推測してください。
日付が不明な場合は "不明" としてください。
JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。`;

/** Botarhythm Studio専用（deep モード） */
const BOTARHYTHM_SYSTEM_PROMPT = `あなたはBotarhythm Studioのセッション議事録作成AIです。
Botarhythm Studioはスモールビジネス向けDXアドバイザリーサービスです。
もっちゃん（元沢信昭）がアドバイザーとして、クライアントのデジタル変革を支援します。

サービスの特徴:
- 「依存させない」哲学：クライアントが自走できる状態を目指す
- 丸投げではなく伴走型のサポート
- 現場の痛みに寄り添う当事者目線
- デジタル変革の実践的アドバイス

この文脈を踏まえ、コーチングセッションとしての深みある分析を行ってください。
会話の内容からクライアント名・セッション日付・セッション種別を推測してください。
日付が不明な場合は "不明" としてください。
JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。`;

// ─── 話者自動検出 ─────────────────────────────────────────────────────────────

/** 文字起こしからもっちゃんがどちらの話者かを自動検出 */
export function autoDetectSpeakers(transcript: Utterance[]): SpeakerNames {
  const MOTCHAN_KEYWORDS = ['もっちゃん', '元沢', 'もっちゃんさん', 'もっちゃんが', 'もっちゃんは'];
  const bTexts = transcript.filter((u) => u.speaker === 'B').map((u) => u.text).join(' ');

  // Bがもっちゃんに言及 → AがもっちゃんでBがクライアント
  if (MOTCHAN_KEYWORDS.some((k) => bTexts.includes(k))) {
    return { A: 'もっちゃん', B: '' };
  }

  // デフォルト: 録音機器の持ち主（A）= もっちゃん
  return { A: 'もっちゃん', B: '' };
}

// ─── プロンプトビルダー ───────────────────────────────────────────────────────

function buildSpeakerContext(speakerNames: SpeakerNames): string {
  const lines: string[] = [];
  if (speakerNames.A) lines.push(`話者A = ${speakerNames.A}`);
  if (speakerNames.B) lines.push(`話者B = ${speakerNames.B}`);
  if (lines.length === 0) return '';
  return `\n【話者情報】\n${lines.join('\n')}\n（サマリー内では「話者A」「話者B」の代わりにこの名前を使用してください）`;
}

const DEPTH_INSTRUCTIONS: Record<SummaryDepth, string> = {
  simple: `【深度: シンプル】
重要なアクションアイテムと主要課題のみを簡潔にまとめてください。
各フィールドは2〜3項目以内。overallAssessmentは1文。`,

  standard: `【深度: スタンダード】
主要な課題・アドバイス・ネクストアクションをバランスよくまとめてください。
各フィールドは3〜5項目。overallAssessmentは2〜3文。`,

  detailed: `【深度: 詳細】
セッション全体を詳しくカバーしてください。
発言の背景や文脈も含め、各フィールドは5〜8項目。
keyQuotesは印象的な発言を5つ以上拾ってください。
overallAssessmentは3〜4文で深みある所感を書いてください。`,

  deep: `【深度: ディープダイブ】
セッションを徹底的に分析してください。
クライアントの発言の行間・感情の変化・暗黙の前提まで読み取り、
各フィールドは8項目以上（重要なものは漏らさず）。
keyQuotesは8つ以上、各quoteにコンテキストを詳しく記述。
overallAssessmentは5文以上で、今後のセッション設計への示唆も含めてください。`,
};

const PATTERN_INSTRUCTIONS: Record<SummaryPattern, string> = {
  action:     `- アクション重視: nextActionsとhomeworkForClientを特に詳しく。期限・担当・具体的手順まで掘り下げること。`,
  psychology: `- クライアント心理: クライアントの感情状態・モチベーション・ブロックや恐れを分析。clientPainsに心理的側面を含めること。`,
  coaching:   `- コーチング観点: もっちゃんの介入・質問・リフレームの効果を評価。クライアントの気づきと変化に注目すること。`,
  strategy:   `- ビジネス戦略: 事業課題・市場環境・競合・ROIの観点でアドバイスを整理。adviceGivenにビジネスインパクトを含めること。`,
  problem:    `- 課題分析: 根本原因・因果関係・優先度の観点でclientPainsを深掘り。表面的な問題と本質的な問題を区別すること。`,
};

const JSON_SCHEMA = `{
  "title": "セッションを一言で表すタイトル",
  "clientName": "会話から推測したクライアント名（不明なら '不明'）",
  "date": "YYYY-MM-DD形式（会話やファイル名から推測。不明なら今日の日付）",
  "sessionType": "体験セッション | メンタリング | その他",
  "clientPains": ["課題1", "課題2", ...],
  "adviceGiven": ["アドバイス1", "アドバイス2", ...],
  "nextActions": [
    { "task": "タスク名", "owner": "もっちゃん | クライアント | 両者", "deadline": "任意" }
  ],
  "homeworkForClient": ["宿題1", "宿題2", ...],
  "keyQuotes": [
    { "speaker": "A | B", "text": "発言内容", "context": "なぜ印象的か" }
  ],
  "overallAssessment": "セッション全体の所感。"
}`;

// ─── 共通ユーティリティ ───────────────────────────────────────────────────────

export async function suggestPrivacyTerms(
  summary: SessionSummary,
  transcript: Utterance[]
): Promise<string[]> {
  const client = getClient();
  const transcriptPreview = transcript
    .slice(0, 60)
    .map((u) => `${u.speaker}: ${u.text}`)
    .join('\n');

  const prompt = `以下のセッション情報を分析し、プライバシーや守秘義務の観点から匿名化を推奨する語句をリストアップしてください。

【対象となる語句の基準】
- 個人名（クライアント名・関係者名など）
- 企業名・組織名・ブランド名
- 具体的なサービス名・商品名（競合情報になりうるもの）
- 個人を特定しうる固有名詞

【サマリー】
クライアント名: ${summary.clientName}
タイトル: ${summary.title}
課題: ${summary.clientPains.join('、')}

【書き起こし抜粋】
${transcriptPreview}

JSONの配列のみ返すこと。重複なし。一般的すぎる語（「クライアント」「会社」など）は除外。空なら []。
例: ["山田様", "株式会社〇〇", "△△アプリ"]`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return JSON.parse(text) as string[];
}

export function anonymizeTranscript(transcript: Utterance[], maskedTerms: string[]): Utterance[] {
  return transcript.map((u) => ({
    ...u,
    text: maskedTerms.reduce((text, term) => text.split(term).join('●●'), u.text),
  }));
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');
  return new Anthropic({ apiKey });
}

// ─── サマリー生成（初回自動） ──────────────────────────────────────────────────

/** 初回自動サマリー: 汎用プロンプト + 話者自動検出 */
export async function generateSummary(
  transcript: Utterance[],
  originalFilename: string
): Promise<SessionSummary> {
  const client = getClient();
  const speakerNames = autoDetectSpeakers(transcript);

  const transcriptText = transcript
    .map((u) => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`)
    .join('\n');

  const userPrompt = `【元のファイル名】
${originalFilename}
${buildSpeakerContext(speakerNames)}

【文字起こし】
${transcriptText}

【出力するJSONの型】
${JSON_SCHEMA}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: GENERIC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return JSON.parse(text) as SessionSummary;
}

// ─── サマリー再生成（カスタム） ────────────────────────────────────────────────

/** カスタム再生成: 深度・パターン・補正メモ・話者名を反映 */
export async function generateCustomSummary(
  transcript: Utterance[],
  originalFilename: string,
  options: SummaryOptions
): Promise<SessionSummary> {
  const client = getClient();

  // deep モードのみ Botarhythm Studio コンテキストを使用
  const systemPrompt = options.depth === 'deep' ? BOTARHYTHM_SYSTEM_PROMPT : GENERIC_SYSTEM_PROMPT;

  const transcriptText = transcript
    .map((u) => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`)
    .join('\n');

  const depthInstruction = DEPTH_INSTRUCTIONS[options.depth];
  const patternInstructions = options.patterns.map((p) => PATTERN_INSTRUCTIONS[p]).join('\n');

  const notesSection = [
    options.clientNotes.trim() && `【クライアント共通メモ】\n${options.clientNotes.trim()}`,
    options.userNotes.trim() && `【このセッションの補正メモ】\n${options.userNotes.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const userPrompt = `【元のファイル名】
${originalFilename}
${buildSpeakerContext(options.speakerNames)}

${depthInstruction}

${patternInstructions ? `【重点パターン】\n${patternInstructions}` : ''}

${notesSection ? `${notesSection}\n（上記のメモを反映してサマリーを作成してください。用語の誤変換修正・文脈補足・注力ポイントなどを優先的に取り込むこと）` : ''}

【文字起こし】
${transcriptText}

【出力するJSONの型】
${JSON_SCHEMA}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return JSON.parse(text) as SessionSummary;
}

// ─── 匿名化サマリー生成 ───────────────────────────────────────────────────────

export async function generateAnonymizedSummary(
  originalSummary: SessionSummary,
  maskedTerms: string[]
): Promise<SessionSummary> {
  const client = getClient();

  const termsText = maskedTerms.map((t) => `- "${t}"`).join('\n');

  const userPrompt = `以下のセッションサマリーを、指定された固有名詞を匿名化して再生成してください。

【匿名化する語句】
${termsText}

【匿名化のルール】
- 上記の語句はすべて別の表現に置き換える
- 人名 → 「クライアント」「担当者」「Aさん」など文脈に合う表現
- 企業名・サービス名 → 「A社」「当該サービス」など
- 文章が自然に読めるよう適切に言い換える
- JSONのキー名・構造は変えない
- clientName フィールドも匿名化する

【元のサマリーJSON】
${JSON.stringify(originalSummary, null, 2)}

JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: GENERIC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return JSON.parse(text) as SessionSummary;
}
