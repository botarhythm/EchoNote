import Anthropic from '@anthropic-ai/sdk';
import type { Utterance, SessionSummary } from './types';

export async function suggestPrivacyTerms(
  summary: SessionSummary,
  transcript: Utterance[]
): Promise<string[]> {
  const client = getClient();

  // コスト削減のため書き起こしは先頭60発話のみ使用
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
    text: maskedTerms.reduce(
      (text, term) => text.split(term).join('●●'),
      u.text
    ),
  }));
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `あなたはBotarhythm Studioのセッション議事録作成AIです。
Botarhythm Studioはスモールビジネス向けDXアドバイザリーサービスです。
もっちゃん（元沢信昭）がアドバイザーとして、クライアントのデジタル変革を支援します。

サービスの特徴:
- 「依存させない」哲学
- 丸投げではなく自走できる状態を目指す
- 現場の痛みに寄り添う当事者目線

以下の文字起こしを分析し、指定のJSON形式でサマリーを作成してください。
会話の内容からクライアント名・セッション日付・セッション種別を推測してください。
日付が不明な場合は "不明" としてください。
JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。`;

export async function generateSummary(
  transcript: Utterance[],
  originalFilename: string
): Promise<SessionSummary> {
  const client = getClient();

  const transcriptText = transcript
    .map((u) => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`)
    .join('\n');

  const userPrompt = `【元のファイル名】
${originalFilename}

【文字起こし】
${transcriptText}

【出力するJSONの型】
{
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
  "overallAssessment": "セッション全体の所感。3文程度。"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const summary = JSON.parse(text) as SessionSummary;
  return summary;
}

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
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return JSON.parse(text) as SessionSummary;
}
