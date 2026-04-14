import { GoogleGenAI } from '@google/genai';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Utterance } from './types';

const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB
const FILES_API_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 最大10分
const MAX_RETRIES = 3;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');
  return new GoogleGenAI({ apiKey });
}

/** ネットワーク系エラーを指数バックオフでリトライ */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const cause = (err as { cause?: { message?: string } })?.cause?.message ?? '';
      const fullMessage = `${message} ${cause}`;

      const isRetryable =
        fullMessage.includes('fetch failed') ||
        fullMessage.includes('ECONNRESET') ||
        fullMessage.includes('ETIMEDOUT') ||
        fullMessage.includes('socket hang up') ||
        fullMessage.includes('Connection reset');

      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        // 根本原因も含めてログ出力
        console.error(`[EchoNote] ${label} 失敗 (attempt ${attempt + 1}):`, message, cause ? `cause: ${cause}` : '');
        throw err;
      }

      const delaySec = 5 * Math.pow(2, attempt);
      console.log(`[EchoNote] ${label} — ネットワークエラー、${delaySec}秒後にリトライ (${attempt + 1}/${MAX_RETRIES}): ${fullMessage}`);
      await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
    }
  }
  throw lastError;
}

type ProgressCallback = (msg: string) => Promise<void>;

async function uploadViaFilesApi(
  ai: GoogleGenAI,
  audioBuffer: Buffer,
  mimeType: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const tmpPath = join(tmpdir(), `echonote-${Date.now()}`);
  writeFileSync(tmpPath, audioBuffer);

  try {
    await onProgress?.('📤 AIへ音声ファイルをアップロード中...');
    const uploaded = await withRetry(
      () => ai.files.upload({ file: tmpPath, config: { mimeType } }),
      'Files API アップロード'
    );

    await onProgress?.('⏳ AI がファイルを解析中...');

    // PROCESSING 状態が解除されるまで待機（最大10分）
    const deadline = Date.now() + FILES_API_PROCESSING_TIMEOUT_MS;
    let fileInfo = uploaded;

    while (fileInfo.state === 'PROCESSING') {
      if (Date.now() > deadline) {
        throw new Error('Gemini Files API の処理がタイムアウトしました（10分超過）');
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
      fileInfo = await withRetry(
        () => ai.files.get({ name: fileInfo.name! }),
        'Files API ステータス確認'
      );
    }

    if (fileInfo.state === 'FAILED') {
      throw new Error('Gemini Files API でのファイル処理に失敗しました');
    }

    return fileInfo.uri!;
  } finally {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
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
  mimeType: string,
  onProgress?: ProgressCallback
): Promise<Utterance[]> {
  const ai = getClient();
  const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1);

  type Part =
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { mimeType: string; fileUri: string } };

  let audioPart: Part;

  if (audioBuffer.length > INLINE_SIZE_LIMIT) {
    console.log(`[EchoNote] ファイルサイズ ${sizeMB}MB — Files API を使用`);
    const fileUri = await uploadViaFilesApi(ai, audioBuffer, mimeType, onProgress);
    audioPart = { fileData: { mimeType, fileUri } };
  } else {
    audioPart = { inlineData: { mimeType, data: audioBuffer.toString('base64') } };
  }

  await onProgress?.(`✍️ AIが音声を文字起こし中... (${sizeMB}MB)`);

  const result = await withRetry(
    () =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [audioPart, { text: PROMPT }] }],
        config: { responseMimeType: 'application/json' },
      }),
    'AI generateContent'
  );

  const text = result.text ?? '';
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
