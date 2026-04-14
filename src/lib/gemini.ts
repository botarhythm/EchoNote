import { GoogleGenAI } from '@google/genai';
import { writeFileSync, unlinkSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import pLimit from 'p-limit';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegStatic: string | null = require('ffmpeg-static');
import type { Utterance } from './types';

const CHUNK_DURATION_SEC = 600; // 10分チャンク
const PARALLEL_LIMIT = 3;       // 同時処理チャンク数
const FILES_API_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RETRIES = 3;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');
  // Files APIのアップロード・文字起こしは時間がかかるため10分タイムアウトを設定
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 600000 } });
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

// ─── FFmpeg ────────────────────────────────────────────────────────────────

/** FFmpegのパスを取得（ffmpeg-static → 環境変数 → システム の順） */
function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
}

/**
 * mimeTypeから入力ファイルの拡張子を決定する
 * audio/mpeg はGoogle DriveがM4A(AAC)に付けることがある → m4a として扱う
 */
function inputExtFromMime(mimeType: string): string {
  if (mimeType === 'audio/mpeg') return 'm4a'; // iPhoneのM4Aファイル
  if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') return 'm4a';
  if (mimeType === 'audio/wav') return 'wav';
  if (mimeType === 'audio/ogg') return 'ogg';
  if (mimeType === 'audio/webm') return 'webm';
  if (mimeType === 'audio/flac') return 'flac';
  return mimeType.split('/')[1] || 'm4a';
}

/** 音声バッファを10分チャンクに分割し、チャンクファイルパスの配列を返す */
async function splitAudio(
  audioBuffer: Buffer,
  mimeType: string,
  sessionId: string
): Promise<{ paths: string[]; durationPerChunk: number }> {
  const ext = inputExtFromMime(mimeType); // audio/mpeg → m4a（コンテナを正しく識別）
  const inputPath = join(tmpdir(), `echonote-input-${sessionId}.${ext}`);
  const outputPattern = join(tmpdir(), `echonote-chunk-${sessionId}-%03d.${ext}`);

  writeFileSync(inputPath, audioBuffer);

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-f', 'segment',
      '-segment_time', String(CHUNK_DURATION_SEC),
      '-c:a', 'copy', // トランスコードなし（品質劣化なし・高速）
      '-vn',           // 映像ストリームを除外
      '-reset_timestamps', '1',
      outputPattern,
    ];

    const proc = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg 分割失敗 (code ${code}): ${stderr.slice(-500)}`));
      }
    });
    proc.on('error', (err) => {
      // FFmpegが見つからない場合はフォールバック
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('FFmpegが見つかりません。環境にFFmpegをインストールしてください。'));
      } else {
        reject(err);
      }
    });
  });

  // 生成されたチャンクファイルを収集（番号順にソート）
  const dir = tmpdir();
  const prefix = `echonote-chunk-${sessionId}-`;
  const chunkPaths = readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .sort()
    .map((f) => join(dir, f));

  // 入力ファイルを削除
  if (existsSync(inputPath)) unlinkSync(inputPath);

  return { paths: chunkPaths, durationPerChunk: CHUNK_DURATION_SEC };
}

// ─── Gemini Files API ──────────────────────────────────────────────────────

async function uploadViaFilesApi(
  ai: GoogleGenAI,
  filePath: string,
  mimeType: string,
  onProgress?: ProgressCallback
): Promise<string> {
  await onProgress?.('📤 AIへ音声をアップロード中...');
  const uploaded = await withRetry(
    () => ai.files.upload({ file: filePath, config: { mimeType } }),
    'Files API アップロード'
  );

  await onProgress?.('⏳ AI がファイルを解析中...');

  const deadline = Date.now() + FILES_API_PROCESSING_TIMEOUT_MS;
  let fileInfo = uploaded;

  while (fileInfo.state === 'PROCESSING') {
    if (Date.now() > deadline) {
      throw new Error('AI Files API の処理がタイムアウトしました（10分超過）');
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    fileInfo = await withRetry(
      () => ai.files.get({ name: fileInfo.name! }),
      'Files API ステータス確認'
    );
  }

  if (fileInfo.state === 'FAILED') {
    throw new Error('AI Files API でのファイル処理に失敗しました');
  }

  return fileInfo.uri!;
}

// ─── プロンプト ─────────────────────────────────────────────────────────────

function buildPrompt(prevContext: string | null): string {
  const contextSection = prevContext
    ? `【前のチャンクとの接続情報】
前チャンク末尾の発話（話者の文脈を引き継いでください）:
${prevContext}

`
    : '';

  return `${contextSection}以下の音声を文字起こしし、話者を分離してください。

【話者の前提】
- これはコンサルティング/アドバイザリーセッションの録音です
- 話者Aはアドバイザー（もっちゃん）です
- 話者Bはクライアント（相談者）です
- 会話の内容から話者を判別してください
- 話者が1人しかいない場合でも、必ず話者Aとして出力してください
- 全チャンクで話者ラベルA/Bを一貫して使用してください

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
}

// ─── チャンク1本の文字起こし ───────────────────────────────────────────────

async function transcribeChunk(
  ai: GoogleGenAI,
  chunkPath: string,
  mimeType: string,
  chunkIndex: number,
  offsetSec: number,
  prevContext: string | null
): Promise<Utterance[]> {
  const fileUri = await uploadViaFilesApi(ai, chunkPath, mimeType);

  const result = await withRetry(
    () =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { mimeType, fileUri } },
              { text: buildPrompt(prevContext) },
            ],
          },
        ],
        config: { responseMimeType: 'application/json' },
      }),
    `AI generateContent (chunk ${chunkIndex})`
  );

  const text = result.text ?? '';
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`チャンク${chunkIndex}: AIの応答がJSON配列ではありません`);
  }

  // タイムスタンプにオフセットを加算
  return (parsed as Record<string, unknown>[]).map((item) => {
    const ts = (item.timestamp as string) || '00:00:00';
    const adjusted = addSecondsToTimestamp(ts, offsetSec);
    return {
      speaker: item.speaker as 'A' | 'B',
      timestamp: adjusted,
      text: item.text as string,
    };
  });
}

/** "HH:MM:SS" にオフセット秒を加算して返す */
function addSecondsToTimestamp(ts: string, offsetSec: number): string {
  const parts = ts.split(':').map(Number);
  let totalSec = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) + offsetSec;
  const h = Math.floor(totalSec / 3600);
  totalSec %= 3600;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** チャンク末尾の発話を次チャンクへのコンテキストとして整形 */
function buildPrevContext(utterances: Utterance[], count = 3): string {
  return utterances
    .slice(-count)
    .map((u) => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`)
    .join('\n');
}

// ─── メインエクスポート ────────────────────────────────────────────────────

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  onProgress?: ProgressCallback
): Promise<Utterance[]> {
  const ai = getClient();
  const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1);
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await onProgress?.(`✍️ 音声ファイルを解析中... (${sizeMB}MB)`);

  // ── チャンク分割を試みる ──────────────────────────────────────────────────
  let chunkPaths: string[] = [];
  let useChunked = false;

  try {
    const { paths } = await splitAudio(audioBuffer, mimeType, sessionId);
    chunkPaths = paths;
    useChunked = chunkPaths.length > 1;
    console.log(`[EchoNote] 音声を ${chunkPaths.length} チャンクに分割`);
  } catch (err) {
    // FFmpegが使えない環境ではシングル処理にフォールバック
    console.warn('[EchoNote] チャンク分割スキップ（FFmpeg利用不可）:', err instanceof Error ? err.message : err);
    useChunked = false;
  }

  // ── シングル処理（FFmpeg不可 or 1チャンクのみ） ──────────────────────────
  if (!useChunked) {
    if (chunkPaths.length === 1) {
      // 1チャンク分割済みの場合はそのファイルを使う
      const path = chunkPaths[0]!;
      await onProgress?.('📤 AIへ音声をアップロード中...');
      const fileUri = await uploadViaFilesApi(ai, path, mimeType);
      await onProgress?.(`✍️ AIが音声を文字起こし中... (${sizeMB}MB)`);
      const result = await withRetry(
        () =>
          ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ fileData: { mimeType, fileUri } }, { text: buildPrompt(null) }] }],
            config: { responseMimeType: 'application/json' },
          }),
        'AI generateContent'
      );
      if (existsSync(path)) unlinkSync(path);
      return parseResult(result.text ?? '');
    }

    // FFmpegなし: Buffer を直接インライン/Files API で送信
    await onProgress?.('📤 AIへ音声をアップロード中...');
    const tmpPath = join(tmpdir(), `echonote-${sessionId}`);
    writeFileSync(tmpPath, audioBuffer);
    try {
      const fileUri = await uploadViaFilesApi(ai, tmpPath, mimeType);
      await onProgress?.(`✍️ AIが音声を文字起こし中... (${sizeMB}MB)`);
      const result = await withRetry(
        () =>
          ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ fileData: { mimeType, fileUri } }, { text: buildPrompt(null) }] }],
            config: { responseMimeType: 'application/json' },
          }),
        'AI generateContent'
      );
      return parseResult(result.text ?? '');
    } finally {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    }
  }

  // ── チャンク並列処理 ──────────────────────────────────────────────────────
  const total = chunkPaths.length;
  await onProgress?.(`🔀 音声を ${total} チャンクに分割して並列処理します`);

  // チャンクを順次処理（前チャンクのコンテキストが必要なため順序は維持、並列はAPI呼び出しで制御）
  // pLimit でFiles APIアップロード+文字起こしを最大3並列
  const limit = pLimit(PARALLEL_LIMIT);
  const allUtterances: Utterance[][] = new Array(total);

  // prevContext は順番に確定させる必要があるため、依存関係を持たせて処理
  // ただしAPIレイテンシを考慮し、前チャンクのコンテキストが確定次第、次チャンクを投入
  let prevContext: string | null = null;
  const pending: Promise<void>[] = [];

  for (let i = 0; i < total; i++) {
    const idx = i;
    const path = chunkPaths[idx]!;
    const offsetSec = idx * CHUNK_DURATION_SEC;
    const ctx = prevContext;

    await onProgress?.(`✍️ チャンク ${idx + 1}/${total} を文字起こし中...`);

    // limit() で並列度を制御しつつ順次投入
    const task = limit(async () => {
      try {
        const utterances = await transcribeChunk(ai, path, mimeType, idx, offsetSec, ctx);
        allUtterances[idx] = utterances;
        console.log(`[EchoNote] チャンク ${idx + 1}/${total} 完了 (${utterances.length} 発話)`);
        return utterances;
      } finally {
        if (existsSync(path)) unlinkSync(path);
      }
    });

    pending.push(task.then((utterances) => {
      // 次チャンクのコンテキストを更新（順次）
      if (utterances && utterances.length > 0) {
        prevContext = buildPrevContext(utterances);
      }
    }));

    // PARALLEL_LIMIT 個溜まったら待機（コンテキスト引き継ぎのため）
    if (pending.length >= PARALLEL_LIMIT) {
      await pending.shift();
    }
  }

  // 残りを待機
  await Promise.all(pending);

  await onProgress?.('🔗 チャンクをマージ中...');

  // 全チャンクをフラット化してタイムスタンプ順にソート
  const merged = allUtterances
    .filter(Boolean)
    .flat()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  console.log(`[EchoNote] マージ完了: 合計 ${merged.length} 発話`);
  return merged;
}

function parseResult(text: string): Utterance[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('AIの応答がJSON配列ではありません');
  }
  return (parsed as Record<string, unknown>[]).map((item) => ({
    speaker: item.speaker as 'A' | 'B',
    timestamp: (item.timestamp as string) || '00:00:00',
    text: item.text as string,
  }));
}
