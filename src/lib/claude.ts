import Anthropic from '@anthropic-ai/sdk';
import type { Utterance, SessionMeta, SessionSummary } from './types';

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
JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。`;

export async function generateSummary(
  transcript: Utterance[],
  meta: SessionMeta
): Promise<SessionSummary> {
  const client = getClient();

  const transcriptText = transcript
    .map((u) => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`)
    .join('\n');

  const userPrompt = `【セッション情報】
日付: ${meta.date}
クライアント: ${meta.clientName}
${meta.memo ? `補足: ${meta.memo}` : ''}

【文字起こし】
${transcriptText}

【出力するJSONの型】
{
  "title": "セッションを一言で表すタイトル",
  "clientName": "${meta.clientName}",
  "date": "${meta.date}",
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
