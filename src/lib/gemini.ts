import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Utterance } from './types';

const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');
  return new GoogleGenerativeAI(apiKey);
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<Utterance[]> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `以下の音声を文字起こしし、話者を分離してください。

【話者の前提】
- これはコンサルティング/アドバイザリーセッションの録音です
- 話者Aはアドバイザー（もっちゃん）です
- 話者Bはクライアント（相談者）です
- 会話の内容から話者を判別してください

【出力形式】
必ず以下のJSON配列のみを返してください。他のテキストは一切含めないこと。

[
  {
    "speaker": "A" または "B",
    "timestamp": "HH:MM:SS",
    "text": "発話内容"
  }
]

【ルール】
- 話者が切り替わるたびに新しい要素を作る
- 相槌・短い反応（「はい」「そうですね」）も含める
- 聞き取れない部分は [不明瞭] と記載
- 日本語で出力`;

  if (audioBuffer.length > INLINE_SIZE_LIMIT) {
    throw new Error(`ファイルサイズが${INLINE_SIZE_LIMIT / 1024 / 1024}MBを超えています。現在のバージョンでは対応していません。`);
  }

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBuffer.toString('base64'),
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text();

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('Geminiの応答がJSON配列ではありません');
  }

  return parsed.map((item: Record<string, unknown>) => ({
    speaker: item.speaker as 'A' | 'B',
    timestamp: (item.timestamp as string) || '00:00:00',
    text: item.text as string,
  }));
}
