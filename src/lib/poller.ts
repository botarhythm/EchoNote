import { listAudioFiles, downloadFile, renameFile, moveToProcessed } from './drive';
import { initDb, upsertSession, getSession, updateStatus } from './db';
import { transcribeAudio } from './gemini';
import { generateSummary } from './claude';
import path from 'path';

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS) || 60000;
let isRunning = false;

export async function retrySession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('セッションが見つかりません');

  // ステータスをリセットしてエラーをクリア
  await updateStatus(sessionId, 'pending', { error: '' });

  processSession(sessionId, session.meta.originalFilename, session.meta.mimeType).catch(
    async (err) => {
      console.error(`[EchoNote] 再処理エラー (${sessionId}):`, err);
      await updateStatus(sessionId, 'error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  );
}

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
      if (existing) continue; // 登録済みならスキップ（errorの再試行は手動で）

      // どんなファイル名でも受け入れる
      const meta = {
        date: '',
        clientName: '',
        originalFilename: file.name,
        driveFileId: file.id,
        mimeType: file.mimeType,
      };

      await upsertSession({ id: file.id, meta, status: 'pending' });
      processing.push(file.id);
      console.log(`[EchoNote] 新規ファイル検知: ${file.name}`);

      processSession(file.id, file.name, file.mimeType).catch(async (err) => {
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

async function processSession(fileId: string, originalFilename: string, mimeType: string) {
  // 1. 文字起こし
  await updateStatus(fileId, 'transcribing');
  const audioBuffer = await downloadFile(fileId);
  const transcript = await transcribeAudio(audioBuffer, mimeType);
  await updateStatus(fileId, 'summarizing', { transcript });

  // 2. サマリー生成
  const summary = await generateSummary(transcript, originalFilename);

  // 3. サマリーからメタデータを構築してDBを更新
  const date = summary.date || new Date().toISOString().slice(0, 10);
  const clientName = summary.clientName || '不明';
  const ext = path.extname(originalFilename) || '.m4a';
  const newFilename = `${date.replace(/-/g, '')}_${clientName}${ext}`;

  const meta = {
    date,
    clientName,
    originalFilename: newFilename,
    driveFileId: fileId,
    mimeType,
  };

  await updateStatus(fileId, 'done', {
    meta,
    summary,
    processedAt: new Date().toISOString(),
  });

  // 4. Driveのファイル名をリネーム
  try {
    await renameFile(fileId, newFilename);
    console.log(`[EchoNote] リネーム: ${originalFilename} → ${newFilename}`);
  } catch (err) {
    console.error(`[EchoNote] リネームエラー (${fileId}):`, err);
  }

  // 5. Processedフォルダに移動
  try {
    await moveToProcessed(fileId);
  } catch (err) {
    console.error(`[EchoNote] Processed移動エラー (${fileId}):`, err);
  }
}
