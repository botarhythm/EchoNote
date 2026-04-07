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
    q: `'${folderId}' in parents and trashed = false and (mimeType = 'audio/mpeg' or mimeType = 'audio/mp4' or mimeType = 'audio/wav' or mimeType = 'audio/x-m4a')`,
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
