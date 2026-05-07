/**
 * 録音チャンクを FFmpeg で結合し、監視フォルダにアップロードして
 * 既存の transcribe → summarize パイプラインに乗せる。
 *
 * - チャンクは Drive の _chunks サブフォルダに保管されている
 * - groupId 内の全チャンクを取得 → 一時ファイルに保存 → FFmpeg concat → 結合ファイルアップロード
 * - 結合済みチャンクは DB で merged 印し、Drive 側のチャンクファイルは削除
 */

import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getChunksByGroup,
  markChunksMerged,
  type RecordingChunkRow,
} from './db';
import { downloadFile, uploadAudioFile, deleteFile } from './drive';

const ffmpegStatic: string | null = require('ffmpeg-static');

function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
}

interface MergeOptions {
  groupId: string;
  /** マージ後のファイル名（拡張子を除く） */
  baseName?: string;
}

interface MergeResult {
  driveFileId: string;
  filename: string;
  mimeType: string;
  totalDurationMs?: number;
}

/**
 * 指定 groupId の全チャンクを結合し、監視フォルダに1つの音声ファイルとしてアップロードする。
 *
 * 同時実行を避けるため、内部で in-flight set で簡易ロックする。
 */
const inFlightMerges = new Set<string>();

export async function mergeChunkGroup(options: MergeOptions): Promise<MergeResult | null> {
  const { groupId } = options;

  if (inFlightMerges.has(groupId)) {
    console.log(`[chunk-merger] 既にマージ中: ${groupId}`);
    return null;
  }
  inFlightMerges.add(groupId);

  try {
    const chunks = await getChunksByGroup(groupId);
    if (chunks.length === 0) {
      console.log(`[chunk-merger] チャンクなし: ${groupId}`);
      return null;
    }

    console.log(`[chunk-merger] マージ開始: ${groupId} (${chunks.length}チャンク)`);

    // 一時ディレクトリを作成
    const workDir = mkdtempSync(join(tmpdir(), `echonote-merge-${groupId.slice(0, 8)}-`));
    const localPaths: string[] = [];
    let mimeType = chunks[0]!.mimeType;
    const ext = inferExtFromMime(mimeType);

    try {
      // 1. 各チャンクをDriveからダウンロードして一時ファイルに保存
      for (const chunk of chunks) {
        const buf = await downloadFile(chunk.driveFileId);
        const localPath = join(workDir, `chunk_${String(chunk.chunkIndex).padStart(4, '0')}.${ext}`);
        writeFileSync(localPath, buf);
        localPaths.push(localPath);
      }

      // 2. concat list ファイルを作成
      const listPath = join(workDir, 'concat.txt');
      const listContent = localPaths
        .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
        .join('\n');
      writeFileSync(listPath, listContent);

      // 3. FFmpegで結合
      const outputPath = join(workDir, `merged.${ext}`);
      await runFFmpegConcat(listPath, outputPath);

      if (!existsSync(outputPath)) {
        throw new Error('FFmpeg concat の出力ファイルが見つかりません');
      }

      // 4. 結合ファイルを監視フォルダにアップロード
      const mergedBuffer = readFileSync(outputPath);
      const filename = buildMergedFilename(chunks[0]!, ext, options.baseName);
      const driveFileId = await uploadAudioFile(filename, mimeType, mergedBuffer);

      console.log(
        `[chunk-merger] マージ完了: ${groupId} → ${filename} (${(mergedBuffer.length / 1024 / 1024).toFixed(1)}MB)`
      );

      // 5. DBで merged フラグを立てる
      await markChunksMerged(groupId);

      // 6. Drive側のチャンクファイルを削除（fire-and-forget）
      for (const chunk of chunks) {
        deleteFile(chunk.driveFileId).catch((err) => {
          console.warn(`[chunk-merger] チャンク削除失敗 ${chunk.driveFileId}:`, err);
        });
      }

      return { driveFileId, filename, mimeType };
    } finally {
      // 一時ディレクトリ削除
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('[chunk-merger] 一時ディレクトリ削除失敗:', err);
      }
    }
  } finally {
    inFlightMerges.delete(groupId);
  }
}

function buildMergedFilename(
  firstChunk: RecordingChunkRow,
  ext: string,
  override?: string
): string {
  if (override) return `${override}.${ext}`;
  // 既存の命名規則に合わせる: YYYYMMDD_<source/clientName>_<memo>.ext
  const date = firstChunk.sessionDate || todayYYYYMMDD();
  const baseName = firstChunk.clientName || firstChunk.source || 'recording';
  const memoPart = firstChunk.memo ? `_${firstChunk.memo}` : '';
  return `${date}_${baseName}${memoPart}.${ext}`;
}

function todayYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function inferExtFromMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'bin';
}

function runFFmpegConcat(listPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      outputPath,
    ];
    const proc = spawn(ffmpegPath(), args);
    let stderr = '';
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg concat 失敗 (exit=${code}): ${stderr.slice(-500)}`));
      }
    });
  });
}
