// Drive フォルダの中身を直接確認するための一回切りスクリプト
// 使い方: node scripts/inspect-drive.mjs [--download <file_id>]
//   引数なし: 両フォルダ（DRIVE_FOLDER_ID + DRIVE_PROCESSED_FOLDER_ID）の全ファイルをリスト
//   --download <id>: 指定ファイルをテキストとして取得し scripts/_inspection/ 配下に保存

import dotenv from 'dotenv';
import { google } from 'googleapis';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '_inspection');

// .env.local を優先して読み込む（Next.js の慣例に合わせる）
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

function getDrive() {
  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyB64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が未設定です（.env.local を確認）');
  const credentials = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function listFolder(drive, folderId, label) {
  if (!folderId) return [];
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 1000,
  });
  return (res.data.files || []).map((f) => ({ ...f, _folder: label }));
}

async function downloadAsText(drive, fileId) {
  const meta = await drive.files.get({ fileId, fields: 'id, name, mimeType' });
  const file = meta.data;
  let buffer;
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export(
      { fileId, mimeType: 'text/plain' },
      { responseType: 'arraybuffer' }
    );
    buffer = Buffer.from(res.data);
  } else {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    buffer = Buffer.from(res.data);
  }
  return { name: file.name, mimeType: file.mimeType, text: buffer.toString('utf-8') };
}

async function main() {
  const args = process.argv.slice(2);
  const drive = getDrive();
  const folderId = process.env.DRIVE_FOLDER_ID;
  const processedId = process.env.DRIVE_PROCESSED_FOLDER_ID;

  console.log('[inspect-drive] DRIVE_FOLDER_ID         =', folderId || '(未設定)');
  console.log('[inspect-drive] DRIVE_PROCESSED_FOLDER_ID =', processedId || '(未設定)');
  console.log();

  // --download モード
  const dlIdx = args.indexOf('--download');
  if (dlIdx >= 0 && args[dlIdx + 1]) {
    const id = args[dlIdx + 1];
    mkdirSync(OUT_DIR, { recursive: true });
    console.log(`[inspect-drive] ダウンロード: ${id}`);
    const { name, mimeType, text } = await downloadAsText(drive, id);
    const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
    const outPath = join(OUT_DIR, `${safeName}.txt`);
    writeFileSync(outPath, text, 'utf-8');
    console.log(`  name: ${name}`);
    console.log(`  mime: ${mimeType}`);
    console.log(`  bytes: ${Buffer.byteLength(text, 'utf-8')}`);
    console.log(`  保存先: ${outPath}`);
    console.log();
    console.log('--- 先頭2000文字 ---');
    console.log(text.slice(0, 2000));
    console.log('--- 末尾1000文字 ---');
    console.log(text.slice(-1000));
    return;
  }

  // 一覧モード
  const files = [
    ...(await listFolder(drive, folderId, 'INPUT')),
    ...(await listFolder(drive, processedId, 'PROCESSED')),
  ];
  console.log(`[inspect-drive] 合計 ${files.length} ファイル`);
  console.log();

  // mimeType ごとに集計
  const byMime = new Map();
  for (const f of files) {
    byMime.set(f.mimeType, (byMime.get(f.mimeType) || 0) + 1);
  }
  console.log('--- MIMEタイプ別件数 ---');
  for (const [mime, count] of byMime) {
    console.log(`  ${count.toString().padStart(4)}  ${mime}`);
  }
  console.log();

  console.log('--- ファイル一覧（フォルダ / mime / 名前 / id） ---');
  for (const f of files) {
    const sizeKb = f.size ? `${(Number(f.size) / 1024).toFixed(1)}KB` : '-';
    console.log(`[${f._folder.padEnd(9)}] ${f.mimeType.padEnd(45)} ${sizeKb.padStart(10)}  ${f.name}  (${f.id})`);
  }

  // テキスト系の絞り込み出力
  console.log();
  const textLike = files.filter((f) =>
    f.mimeType.startsWith('text/') ||
    f.mimeType === 'application/vnd.google-apps.document' ||
    f.name.toLowerCase().endsWith('.txt')
  );
  console.log(`--- テキスト系ファイル ${textLike.length} 件 ---`);
  for (const f of textLike) {
    console.log(`  [${f._folder}] ${f.name}  (${f.id})  mime=${f.mimeType}`);
  }

  // 保存: 一覧をJSONで残す
  mkdirSync(OUT_DIR, { recursive: true });
  const manifestPath = join(OUT_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(files, null, 2), 'utf-8');
  console.log();
  console.log(`一覧をJSONで保存: ${manifestPath}`);

  if (textLike.length > 0) {
    console.log();
    console.log('テキストファイルの中身を見るには:');
    for (const f of textLike.slice(0, 5)) {
      console.log(`  node scripts/inspect-drive.mjs --download ${f.id}`);
    }
  }
}

main().catch((err) => {
  console.error('[inspect-drive] エラー:', err);
  process.exit(1);
});
