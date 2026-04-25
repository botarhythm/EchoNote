import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';

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
    q: `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or name contains '.m4a' or name contains '.mp3' or name contains '.wav')`,
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

export async function moveToProcessed(fileId: string): Promise<void> {
  const folderId = process.env.DRIVE_FOLDER_ID;
  const processedFolderId = process.env.DRIVE_PROCESSED_FOLDER_ID;
  if (!processedFolderId || !folderId) return;

  const drive = getDrive();
  await drive.files.update({
    fileId,
    addParents: processedFolderId,
    removeParents: folderId,
  });
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

/** DRIVE_FOLDER_ID と DRIVE_PROCESSED_FOLDER_ID を横断して全ファイルを返す */
export async function listAllRelevantFiles(): Promise<DriveFile[]> {
  const folderId = process.env.DRIVE_FOLDER_ID;
  const processedFolderId = process.env.DRIVE_PROCESSED_FOLDER_ID;
  const folders = [folderId, processedFolderId].filter((s): s is string => !!s);
  return listAllFiles(folders);
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
