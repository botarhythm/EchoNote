import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Utterance } from './types';

const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');
  return new GoogleGenerativeAI(apiKey);
}

function getFileManager(): GoogleAIFileManager {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');
  return new GoogleAIFileManager(apiKey);
}

async function uploadViaFilesApi(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const fileManager = getFileManager();
  const tmpPath = join(tmpdir(), `echonote-${Date.now()}`);
  writeFileSync(tmpPath, audioBuffer);

  try {
    const uploadResponse = await fileManager.uploadFile(tmpPath, { mimeType });
    let file = uploadResponse.file;

    // PROCESSING 状態が解除されるまで待機
    while (file.state === FileState.PROCESSING) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      file = await fileManager.getFile(file.name);
    }

    if (file.state === FileState.FAILED) {
      throw new Error('Gemini Files API でのファイル処理に失敗しました');
    }

    return file.uri;
  } finally {
    unlinkSync(tmpPath);
  }
}

const PROMPT = `以下の音声を文字起こしし、話者を分離してください。

【話者の前提】
- これはコンサルティング/アドバイザリーセッションの録音です
- 話者Aはアドバイザー（もっちゃん）です
- 話者Bはクライアント（相談者）です
- 会話の内容から話者を判別してください
- 話者が1人しかいない場合でも、必ず話者Aとして出力してください

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

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<Utterance[]> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  let audioPart: Part;

  if (audioBuffer.length > INLINE_SIZE_LIMIT) {
    // 20MB超 → Files API 経由でアップロード
    console.log(
      `[EchoNote] ファイルサイズ ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB — Files API を使用`
    );
    const fileUri = await uploadViaFilesApi(audioBuffer, mimeType);
    audioPart = { fileData: { mimeType, fileUri } };
  } else {
    // 20MB以下 → インラインデータ
    audioPart = { inlineData: { mimeType, data: audioBuffer.toString('base64') } };
  }

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [audioPart, { text: PROMPT }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text();

  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Geminiの応答がJSON配列ではありません');
  }

  return (parsed as Record<string, unknown>[]).map((item) => ({
    speaker: item.speaker as 'A' | 'B',
    timestamp: (item.timestamp as string) || '00:00:00',
    text: item.text as string,
  }));
}
