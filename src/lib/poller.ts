import { listAudioFiles, downloadFile, renameFile, moveToProcessed, getFileMd5 } from './drive';
import {
  initDb,
  getSession,
  updateStatus,
  updateProgress,
  insertSessionIfAbsent,
  findOriginalSessionByHash,
  getSessionIdsWithoutHash,
  setContentHash,
} from './db';
import { transcribeAudio } from './gemini';
import { generateSummary } from './claude';
import path from 'path';

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS) || 60000;
let isRunning = false;
const processingIds = new Set<string>();

export async function retrySession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('セッションが見つかりません');

  // 処理中ステータスなら弾く
  if (['pending', 'transcribing', 'summarizing'].includes(session.status)) {
    throw new Error('すでに処理中です');
  }

  // セッション単位のロック
  if (processingIds.has(sessionId)) {
    throw new Error('すでに処理中です');
  }
  processingIds.add(sessionId);

  await updateStatus(sessionId, 'pending', { error: '' });

  processSession(sessionId, session.meta.originalFilename, session.meta.mimeType)
    .catch(async (err) => {
      console.error(`[EchoNote] 再処理エラー (${sessionId}):`, err);
      await updateStatus(sessionId, 'error', {
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      processingIds.delete(sessionId);
    });
}

export function startPolling() {
  console.log(`[EchoNote] サーバーサイドポーリング開始 (間隔: ${POLL_INTERVAL}ms)`);

  setTimeout(async () => {
    await initDb();
    backfillContentHashes().catch((err) =>
      console.error('[EchoNote] ハッシュバックフィルエラー:', err)
    );
    poll();
    setInterval(poll, POLL_INTERVAL);
  }, 3000);
}

/**
 * ハッシュ埋め戻し: この機能導入前に処理されたセッションには content_hash が無く、
 * 過去録音の再アップロードを重複検知できない。Drive のメタデータ（md5Checksum）を
 * 取得して埋める — ダウンロード不要・AI処理なしなので起動時に安全に実行できる。
 * Drive 上から削除済みのファイルはスキップ（次回起動でも再試行されるが実害なし）。
 */
async function backfillContentHashes(): Promise<void> {
  const ids = await getSessionIdsWithoutHash();
  if (ids.length === 0) return;
  console.log(`[EchoNote] content_hash 未設定セッションのバックフィル開始: ${ids.length}件`);
  let filled = 0;
  for (const id of ids) {
    const md5 = await getFileMd5(id);
    if (!md5) continue; // Drive から消えたファイル等
    await setContentHash(id, md5);
    filled++;
  }
  console.log(`[EchoNote] バックフィル完了: ${filled}/${ids.length}件にハッシュを設定`);
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

      const contentHash = file.md5Checksum;

      // 重複検知: 同一内容の録音が既に取り込まれていれば、AI処理をスキップして
      // このファイルは「重複」として記録し、Processed のクライアント別フォルダへ退避する。
      if (contentHash) {
        const original = await findOriginalSessionByHash(contentHash);
        if (original) {
          const dupMeta = {
            date: original.meta.date || '',
            clientName: original.meta.clientName || '',
            originalFilename: file.name,
            driveFileId: file.id,
            mimeType: file.mimeType,
          };
          // アトミック登録（並行ポーリング/多重インスタンスでの二重登録を防ぐ）
          const created = await insertSessionIfAbsent({
            id: file.id,
            meta: dupMeta,
            status: 'duplicate',
            contentHash,
            duplicateOf: original.id,
          });
          if (!created) continue; // 他プロセスが先に登録済み
          console.log(
            `[EchoNote] 重複検知: ${file.name} は既存セッション ${original.id}（${original.meta.clientName || '不明'}）と同一内容。AI処理をスキップします。`
          );
          try {
            await moveToProcessed(file.id, original.meta.clientName || undefined);
          } catch (err) {
            console.error(`[EchoNote] 重複ファイルのProcessed移動エラー (${file.id}):`, err);
          }
          continue;
        }
      }

      // どんなファイル名でも受け入れる
      const meta = {
        date: '',
        clientName: '',
        originalFilename: file.name,
        driveFileId: file.id,
        mimeType: file.mimeType,
      };

      // アトミック登録: 行を作れたインスタンスだけが処理を担当する（二重処理ガード）
      const created = await insertSessionIfAbsent({
        id: file.id,
        meta,
        status: 'pending',
        contentHash: contentHash || undefined,
      });
      if (!created) continue; // 他プロセスが先に拾って処理中
      processing.push(file.id);
      console.log(`[EchoNote] 新規ファイル検知: ${file.name}`);

      processingIds.add(file.id);
      processSession(file.id, file.name, file.mimeType)
        .catch(async (err) => {
          console.error(`[EchoNote] セッション処理エラー (${file.id}):`, err);
          await updateStatus(file.id, 'error', {
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          processingIds.delete(file.id);
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
  // 進捗コールバック（DB更新 + ログ）
  const onProgress = async (msg: string) => {
    console.log(`[EchoNote] ${msg}`);
    await updateProgress(fileId, msg).catch(() => {});
  };

  // 1. 文字起こし
  await updateStatus(fileId, 'transcribing');
  await onProgress('📥 音声ファイルをダウンロード中...');
  const audioBuffer = await downloadFile(fileId);
  const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1);
  await onProgress(`📥 ダウンロード完了 (${sizeMB}MB) — 文字起こしを開始します`);

  const transcript = await transcribeAudio(audioBuffer, mimeType, onProgress, fileId);
  await updateStatus(fileId, 'summarizing', { transcript });

  // 2. サマリー生成
  await onProgress('🧠 AIがサマリーを生成中...');
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
    error: '',
  });
  await updateProgress(fileId, '').catch(() => {});

  // 4. Driveのファイル名をリネーム
  try {
    await renameFile(fileId, newFilename);
    console.log(`[EchoNote] リネーム: ${originalFilename} → ${newFilename}`);
  } catch (err) {
    console.error(`[EchoNote] リネームエラー (${fileId}):`, err);
  }

  // 5. Processedフォルダのクライアント別サブフォルダに移動
  try {
    await moveToProcessed(fileId, clientName);
  } catch (err) {
    console.error(`[EchoNote] Processed移動エラー (${fileId}):`, err);
  }
}
