import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { createHash } from 'node:crypto';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

function getAuth() {
  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyBase64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません');
  const key = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf-8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

function getDrive(): drive_v3.Drive {
  return google.drive({ version: 'v3', auth: getAuth() });
}

export async function listAudioFiles(): Promise<DriveFile[]> {
  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('DRIVE_FOLDER_ID が設定されていません');

  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or mimeType contains 'video/webm' or name contains '.m4a' or name contains '.mp3' or name contains '.wav' or name contains '.webm' or name contains '.ogg' or name contains '.mp4')`,
    fields: 'files(id, name, mimeType, modifiedTime)',
    orderBy: 'modifiedTime desc',
  });

  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime!,
  }));
}

/**
 * 監視フォルダ（DRIVE_FOLDER_ID）に音声ファイルをアップロードする。
 * 既存の Drive ポーリングが拾って文字起こし → サマリー生成のパイプラインに乗る。
 *
 * @param targetFolderId 任意。未指定なら DRIVE_FOLDER_ID を使う。
 *                       チャンク受信時はサブフォルダ ID を渡す。
 * @returns 作成された Drive ファイルの ID
 */
export async function uploadAudioFile(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  targetFolderId?: string
): Promise<string> {
  const folderId = targetFolderId ?? process.env.DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('DRIVE_FOLDER_ID が設定されていません');

  const drive = getDrive();
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  if (!res.data.id) throw new Error('Drive アップロードに失敗しました（id 取得不可）');
  return res.data.id;
}

/**
 * DRIVE_FOLDER_ID 配下のチャンク用サブフォルダ（_chunks）を取得・作成する。
 * 既存ポーリングは direct children のみを見るので、サブフォルダ内のチャンクは検知されない。
 */
let cachedChunksFolderId: string | null = null;
export async function getOrCreateChunksFolderId(): Promise<string> {
  if (cachedChunksFolderId) return cachedChunksFolderId;
  const parentId = process.env.DRIVE_FOLDER_ID;
  if (!parentId) throw new Error('DRIVE_FOLDER_ID が設定されていません');
  const drive = getDrive();
  // 既存のサブフォルダを検索
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '_chunks' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  const existing = res.data.files?.[0];
  if (existing?.id) {
    cachedChunksFolderId = existing.id;
    return existing.id;
  }
  // 無ければ作成
  const created = await drive.files.create({
    requestBody: {
      name: '_chunks',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  if (!created.data.id) throw new Error('チャンクフォルダ作成失敗');
  cachedChunksFolderId = created.data.id;
  return created.data.id;
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDrive();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function renameFile(fileId: string, newName: string): Promise<void> {
  const drive = getDrive();
  await drive.files.update({
    fileId,
    requestBody: { name: newName },
  });
}

/**
 * 処理済み録音を Processed フォルダへ移動する（監視フォルダから親を付け替え）。
 * clientName を渡すと Processed/{clientName}/ サブフォルダへ、未指定なら Processed 直下へ。
 * 既存の Processed 直下配置（clientName 未指定時）とは非互換にしない。
 */
export async function moveToProcessed(fileId: string, clientName?: string): Promise<void> {
  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) return;

  const dest = clientName ? await getOrCreateClientFolder(clientName) : await getProcessedRootId();
  const drive = getDrive();
  await drive.files.update({
    fileId,
    addParents: dest,
    removeParents: folderId,
  });
}

/**
 * 指定フォルダ配下の名前付きサブフォルダを取得・作成する（get-or-create）。
 * getOrCreateChunksFolderId と同型。parentId/name の組で ID をメモ化する。
 */
const subfolderCache = new Map<string, string>();
export async function getOrCreateSubfolder(parentId: string, name: string): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const cached = subfolderCache.get(cacheKey);
  if (cached) return cached;

  const drive = getDrive();
  const safeName = name.replace(/'/g, "\\'"); // list クエリのシングルクオートをエスケープ
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  const existing = res.data.files?.[0];
  if (existing?.id) {
    subfolderCache.set(cacheKey, existing.id);
    return existing.id;
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  if (!created.data.id) throw new Error(`サブフォルダ作成失敗: ${name}`);
  subfolderCache.set(cacheKey, created.data.id);
  return created.data.id;
}

/**
 * アーカイブ親フォルダ（Processed 相当）の ID を返す。
 * DRIVE_PROCESSED_FOLDER_ID が設定されていればそれを使う。未設定なら監視フォルダ
 * （DRIVE_FOLDER_ID）配下に 'Processed' を get-or-create する — サービスアカウントは
 * 監視フォルダの書込権限を継承するので、追加の共有設定なしで確実に書ける。
 * 後で独立フォルダへ移して DRIVE_PROCESSED_FOLDER_ID を設定すれば、明示指定が優先される。
 */
let cachedProcessedRootId: string | null = null;
async function getProcessedRootId(): Promise<string> {
  if (cachedProcessedRootId) return cachedProcessedRootId;
  const explicit = process.env.DRIVE_PROCESSED_FOLDER_ID;
  if (explicit) {
    cachedProcessedRootId = explicit;
    return explicit;
  }
  const watchId = process.env.DRIVE_FOLDER_ID;
  if (!watchId) throw new Error('DRIVE_FOLDER_ID / DRIVE_PROCESSED_FOLDER_ID がどちらも未設定');
  const id = await getOrCreateSubfolder(watchId, 'Processed');
  cachedProcessedRootId = id;
  return id;
}

/** アーカイブ親フォルダ配下のクライアント別サブフォルダ（Processed/{clientName}/）。 */
export async function getOrCreateClientFolder(clientName: string): Promise<string> {
  const processedFolderId = await getProcessedRootId();
  return getOrCreateSubfolder(processedFolderId, clientName);
}

/**
 * 既に Processed 配下にあるファイルを、指定クライアントのサブフォルダへ移動する。
 * assign（クライアント付け替え）の追従用。現在の親を removeParents に指定して移し替える。
 */
export async function moveFileToClientFolder(fileId: string, clientName: string): Promise<void> {
  const dest = await getOrCreateClientFolder(clientName);
  const drive = getDrive();
  const cur = await drive.files.get({ fileId, fields: 'parents' });
  const parents = cur.data.parents || [];
  if (parents.includes(dest)) return; // 既に正しいフォルダに居る
  await drive.files.update({
    fileId,
    addParents: dest,
    removeParents: parents.join(',') || undefined,
  });
}

/**
 * 任意のバイナリを指定フォルダへ作成する（画像等の汎用アップロード）。
 * description を渡すと Drive ファイルの「説明」メタデータに載る（詳細ペインで閲覧可・別ファイル不要）。
 */
export async function uploadBinaryToFolder(
  folderId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
  description?: string
): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId], description },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error('Drive アップロード失敗（uploadBinaryToFolder）');
  return res.data.id;
}

const SCREENSHOT_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/** ISO 文字列を JST の「YYYYMMDD_HHmm」に整形する（録音の YYYYMMDD_ と日付順に並ぶ命名）。 */
function jstFileStamp(iso: string): string {
  const parsed = iso ? new Date(iso) : new Date();
  const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  // sv-SE ロケールは "YYYY-MM-DD HH:mm:ss" 形式
  const s = d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
  return s.slice(0, 16).replace(/[-:]/g, '').replace(' ', '_'); // 例: "20260714_1430"
}

/**
 * 伴走ボットからのスクショを、録音と同じクライアント直下フォルダ（Processed/{clientName}/）へ
 * 時系列で保存する。解析結果は別ファイル（サイドカー）にせず Drive ファイルの「説明」メタデータに
 * 載せる — 見返す時に画像と説明が1ファイルにまとまり、時系列が JSON で寸断されない。
 * ハッシュ・撮影時刻・mediaType は Drive 自身のメタデータ（createdTime/mimeType）で代替できる。
 * @returns 画像ファイルの Drive ID
 */
export async function saveScreenshot(input: {
  clientName: string;
  imageBase64: string;
  mediaType: string;
  description: string;
  capturedAt: string;
}): Promise<string> {
  const clientFolder = await getOrCreateClientFolder(input.clientName);

  const buffer = Buffer.from(input.imageBase64, 'base64');
  const hash8 = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  const ext = SCREENSHOT_EXT[input.mediaType] ?? '.jpg';
  const filename = `${jstFileStamp(input.capturedAt)}_${hash8}${ext}`;

  return uploadBinaryToFolder(
    clientFolder,
    filename,
    input.mediaType,
    buffer,
    input.description || undefined
  );
}

/**
 * 指定フォルダ配下のすべてのファイルを取得する（mimeType フィルタなし）。
 * Google Recorder のテキストファイル等を拾うために使う。
 */
export async function listAllFiles(folderIds: string[]): Promise<DriveFile[]> {
  if (folderIds.length === 0) return [];
  const drive = getDrive();
  const all: DriveFile[] = [];
  for (const folderId of folderIds) {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 1000,
    });
    for (const f of res.data.files || []) {
      all.push({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        modifiedTime: f.modifiedTime!,
      });
    }
  }
  return all;
}

/**
 * DRIVE_FOLDER_ID と DRIVE_PROCESSED_FOLDER_ID を横断して全ファイルを返す。
 * Processed 配下はクライアント別サブフォルダ（Processed/{clientName}/）に整理されうるため、
 * 直下ファイルに加えて 1 階層下のサブフォルダ内ファイルも列挙する（外部書き起こし照合の候補維持）。
 */
export async function listAllRelevantFiles(): Promise<DriveFile[]> {
  const folderId = process.env.DRIVE_FOLDER_ID;
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const out: DriveFile[] = [];

  if (folderId) out.push(...(await listAllFiles([folderId])));

  const processedFolderId = await getProcessedRootId().catch(() => null);
  if (processedFolderId) {
    const top = await listAllFiles([processedFolderId]); // 直下ファイル＋クライアント別サブフォルダ
    out.push(...top.filter((f) => f.mimeType !== FOLDER_MIME));
    const subfolderIds = top.filter((f) => f.mimeType === FOLDER_MIME).map((f) => f.id);
    if (subfolderIds.length > 0) {
      const inner = await listAllFiles(subfolderIds);
      out.push(...inner.filter((f) => f.mimeType !== FOLDER_MIME));
    }
  }

  return out;
}

/**
 * テキストとしてファイルを取得する。
 * - text/plain: alt=media で取得して utf-8 デコード
 * - application/vnd.google-apps.document: text/plain にエクスポート
 * - その他のテキスト系（text/*）: alt=media で取得
 */
export async function downloadFileText(file: DriveFile): Promise<string> {
  const drive = getDrive();
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: 'text/plain' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data as ArrayBuffer).toString('utf-8');
  }
  if (file.mimeType.startsWith('text/') || file.name.endsWith('.txt')) {
    const res = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data as ArrayBuffer).toString('utf-8');
  }
  throw new Error(`テキストとして取得できないMIMEタイプです: ${file.mimeType}`);
}

/** 拡張子を除いた基底名（パス区切りは含まない想定） */
function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

/** ファイル名がテキスト書き起こしらしいかを判定 */
function isTextLikeFile(file: DriveFile): boolean {
  if (file.mimeType === 'application/vnd.google-apps.document') return true;
  if (file.mimeType.startsWith('text/')) return true;
  if (file.name.toLowerCase().endsWith('.txt')) return true;
  return false;
}

export interface ExternalTranscriptMatch {
  matched: DriveFile | null;
  candidates: DriveFile[];
}

/**
 * 音声ファイル名から対応する外部書き起こしを Drive ファイル一覧から探す。
 *   1) ベース名完全一致
 *   2) ベース名 + "_transcript" / "-transcript" / " transcript"
 *   3) 前方一致（拡張子なし）で最も近いものを最大3件 candidates に
 */
export function findExternalTranscript(
  audioFilename: string,
  allFiles: DriveFile[]
): ExternalTranscriptMatch {
  const textFiles = allFiles.filter(isTextLikeFile);
  if (textFiles.length === 0) return { matched: null, candidates: [] };

  const audioBase = stripExtension(audioFilename).toLowerCase();
  const norm = (s: string) => stripExtension(s).toLowerCase();

  // 1) 完全一致
  const exact = textFiles.find((f) => norm(f.name) === audioBase);
  if (exact) return { matched: exact, candidates: [] };

  // 2) サフィックスバリエーション
  const suffixes = ['_transcript', '-transcript', ' transcript', '_文字起こし', ' 文字起こし'];
  for (const suf of suffixes) {
    const target = audioBase + suf;
    const hit = textFiles.find((f) => norm(f.name) === target.toLowerCase());
    if (hit) return { matched: hit, candidates: [] };
  }

  // 3) 前方一致候補
  const prefixHits = textFiles
    .filter((f) => norm(f.name).startsWith(audioBase))
    .slice(0, 3);
  if (prefixHits.length > 0) return { matched: null, candidates: prefixHits };

  // 4) ベース名の一部を含む候補（最後の手段）
  const containHits = textFiles
    .filter((f) => norm(f.name).includes(audioBase) || audioBase.includes(norm(f.name)))
    .slice(0, 3);
  return { matched: null, candidates: containHits };
}
