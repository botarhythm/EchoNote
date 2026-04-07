import { listAudioFiles, downloadFile, moveToProcessed } from './drive';
import { parseSessionMeta } from './parser';
import { initDb, upsertSession, getSession, updateStatus } from './db';
import { transcribeAudio } from './gemini';
import { generateSummary } from './claude';

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS) || 60000;
let isRunning = false;

export function startPolling() {
  console.log(`[EchoNote] サーバーサイドポーリング開始 (間隔: ${POLL_INTERVAL}ms)`);

  setTimeout(async () => {
    await initDb();
    poll();
    setInterval(poll, POLL_INTERVAL);
  }, 3000);
}

export async function poll(): Promise<{ found: number; processing: string[] }> {
  if (isRunning) return { found: 0, processing: [] };
  isRunning = true;

  try {
    const files = await listAudioFiles();
    const processing: string[] = [];

    for (const file of files) {
      const existing = await getSession(file.id);
      if (existing && existing.status !== 'error') continue;

      const meta = parseSessionMeta(file.name, file.id, file.mimeType);
      if (!meta) {
        console.log(`[EchoNote] ファイル名が命名規則に合いません: ${file.name}`);
        continue;
      }

      await upsertSession({ id: file.id, meta, status: 'pending' });
      processing.push(file.id);

      // 非同期で処理開始
      processSession(file.id, meta).catch(async (err) => {
        console.error(`[EchoNote] セッション処理エラー (${file.id}):`, err);
        await updateStatus(file.id, 'error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return { found: files.length, processing };
  } catch (err) {
    console.error('[EchoNote] ポーリングエラー:', err);
    return { found: 0, processing: [] };
  } finally {
    isRunning = false;
  }
}

async function processSession(
  fileId: string,
  meta: NonNullable<ReturnType<typeof parseSessionMeta>>
) {
  // 1. 文字起こし
  await updateStatus(fileId, 'transcribing');
  const audioBuffer = await downloadFile(fileId);
  const transcript = await transcribeAudio(audioBuffer, meta.mimeType, meta.clientName);
  await updateStatus(fileId, 'summarizing', { transcript });

  // 2. サマリー生成
  const summary = await generateSummary(transcript, meta);
  await updateStatus(fileId, 'done', {
    summary,
    processedAt: new Date().toISOString(),
  });

  // 3. Processedフォルダに移動
  try {
    await moveToProcessed(fileId);
  } catch (err) {
    console.error(`[EchoNote] Processed移動エラー (${fileId}):`, err);
  }
}
