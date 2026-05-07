import { NextRequest, NextResponse } from 'next/server';
import { uploadAudioFile, getOrCreateChunksFolderId } from '@/lib/drive';
import { insertChunk } from '@/lib/db';
import { mergeChunkGroup } from '@/lib/chunk-merger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 外部アプリ（セッションルーム等）が録音音声をEchoNoteに送り込むためのエンドポイント。
 *
 * 認証:
 *   Authorization: Bearer <ECHONOTE_INGEST_TOKEN>
 *
 * リクエスト形式:
 *   Content-Type: multipart/form-data
 *   - file:        音声ファイル（mp3 / m4a / wav / webm）必須
 *   - clientName:  クライアント／参加者名（任意・ファイル名生成に使用）
 *   - sessionDate: YYYYMMDD（任意・未指定なら今日の日付）
 *   - memo:        補足メモ（任意・ファイル名末尾に追加される）
 *   - source:      送信元アプリ名（任意・例: "digihara"）
 *
 * 処理フロー:
 *   1. Bearer トークン検証
 *   2. ファイルを `YYYYMMDD_クライアント名[_memo].ext` で Google Drive 監視フォルダにアップロード
 *   3. 既存のDriveポーリングが拾って transcribe → summarize が自動実行される
 *
 * レスポンス:
 *   { ok: true, sessionId, filename, viewUrl }
 */
export async function POST(request: NextRequest) {
  // 1. 認証
  const expected = process.env.ECHONOTE_INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'ingest API は無効化されています（ECHONOTE_INGEST_TOKEN 未設定）' },
      { status: 503 }
    );
  }
  const authHeader = request.headers.get('authorization') || '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. multipart parse
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'multipart/form-data が必要です' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file フィールドが必要です' }, { status: 400 });
  }

  const clientName = sanitize(form.get('clientName')?.toString() || '');
  const memo = sanitize(form.get('memo')?.toString() || '');
  const sessionDate = sanitizeDate(form.get('sessionDate')?.toString() || '');
  const source = sanitize(form.get('source')?.toString() || 'external');

  // チャンク分割アップロードのメタデータ
  const sessionGroupId = (form.get('sessionGroupId')?.toString() || '').trim();
  const chunkIndexRaw = form.get('chunkIndex')?.toString() || '';
  const isFinalRaw = form.get('isFinal')?.toString() || '';

  // 3. ファイル名整形
  const ext = pickExtension(file.name, file.type) || 'm4a';
  const today = sessionDate || todayYYYYMMDD();
  const baseName = clientName || source || 'recording';
  const memoPart = memo ? `_${memo}` : '';
  const origin = request.headers.get('origin') || new URL(request.url).origin;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || `audio/${ext}`;

    // ── チャンクモード ──
    if (sessionGroupId) {
      const chunkIndex = Number.parseInt(chunkIndexRaw, 10);
      if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
        return NextResponse.json(
          { error: 'sessionGroupId 指定時は chunkIndex（0以上の整数）が必要です' },
          { status: 400 }
        );
      }
      const isFinal = isFinalRaw === 'true' || isFinalRaw === '1';

      // チャンク用フォルダにアップロード
      const chunksFolderId = await getOrCreateChunksFolderId();
      const chunkFilename = `${sessionGroupId}_${String(chunkIndex).padStart(4, '0')}.${ext}`;
      const driveFileId = await uploadAudioFile(chunkFilename, mimeType, buffer, chunksFolderId);

      // DB に登録
      await insertChunk({
        groupId: sessionGroupId,
        chunkIndex,
        driveFileId,
        filename: chunkFilename,
        mimeType,
        isFinal,
        clientName: clientName || null,
        sessionDate: today,
        memo: memo || null,
        source: source || null,
      });

      // isFinal=true なら、少し待ってからマージ実行（並行アップロードの取りこぼし防止）
      if (isFinal) {
        // バックグラウンドで実行（fire-and-forget）
        const mergedBaseName = `${today}_${baseName}${memoPart}`;
        (async () => {
          try {
            // 30秒待つ：他のチャンクが in-flight の場合に備える
            await new Promise((r) => setTimeout(r, 30 * 1000));
            await mergeChunkGroup({ groupId: sessionGroupId, baseName: mergedBaseName });
          } catch (err) {
            console.error(`[ingest] マージ失敗 ${sessionGroupId}:`, err);
          }
        })();
      }

      return NextResponse.json({
        ok: true,
        chunkIndex,
        sessionGroupId,
        isFinal,
        message: isFinal
          ? 'チャンクを受け取りました。全チャンクを結合してまもなく要約生成を開始します。'
          : 'チャンクを受け取りました。続きのチャンクを送信してください。',
      });
    }

    // ── 従来モード（単一ファイル） ──
    const filename = `${today}_${baseName}${memoPart}.${ext}`;
    const fileId = await uploadAudioFile(filename, mimeType, buffer);

    return NextResponse.json({
      ok: true,
      sessionId: fileId,
      filename,
      viewUrl: `${origin}/session/${fileId}`,
      message:
        '受け取りました。まもなく文字起こしとサマリー生成が始まります（数分〜十数分）。',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[EchoNote] ingest error:', err);
    return NextResponse.json({ error: `アップロード失敗: ${message}` }, { status: 500 });
  }
}

/** ファイル名・パス区切りやタグなどを除外する */
function sanitize(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 40);
}

/** YYYYMMDD 形式に正規化（YYYY-MM-DD も許容） */
function sanitizeDate(s: string): string {
  const compact = s.replace(/[^0-9]/g, '');
  return /^\d{8}$/.test(compact) ? compact : '';
}

function todayYYYYMMDD(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function pickExtension(name: string, mime: string): string | null {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  return null;
}
