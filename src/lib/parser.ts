import type { SessionMeta } from './types';

const FILENAME_PATTERN = /^(\d{8})_([^_]+)(?:_(.+))?\.(mp3|m4a|wav)$/;

export function parseSessionMeta(
  filename: string,
  fileId: string,
  mimeType: string
): SessionMeta | null {
  const match = filename.match(FILENAME_PATTERN);
  if (!match) return null;

  const [, dateStr, clientName, memo] = match;

  // 日付バリデーション
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  const date = `${year}-${month}-${day}`;

  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return null;

  return {
    date,
    clientName,
    memo: memo || undefined,
    originalFilename: filename,
    driveFileId: fileId,
    mimeType,
  };
}
