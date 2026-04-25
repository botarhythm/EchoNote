// EchoNote の transcript 末尾を表示し、Google 側の末尾と並べて出す
// 使い方: node scripts/dump-tail.mjs --session <id> --drive-text <file_id> --password <pwd> [--lines 50]

import dotenv from 'dotenv';
import { google } from 'googleapis';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const baseUrl = arg('base-url', 'https://echonote-production.up.railway.app');
const sessionId = arg('session');
const driveTextId = arg('drive-text');
const password = arg('password', process.env.ADMIN_PASSWORD);
const tailLines = Number(arg('lines', '50'));

if (!sessionId || !driveTextId || !password) {
  console.error('使い方: node scripts/dump-tail.mjs --session <id> --drive-text <id> --password <pwd>');
  process.exit(1);
}

async function login() {
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/echonote-auth=([^;]+)/);
  return m ? `echonote-auth=${m[1]}` : '';
}

function getDrive() {
  const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8'));
  return google.drive({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    }),
  });
}

async function downloadDriveText(drive, fileId) {
  const meta = await drive.files.get({ fileId, fields: 'mimeType' });
  if (meta.data.mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data).toString('utf-8');
  }
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data).toString('utf-8');
}

const cookie = await login();
const drive = getDrive();

const [tRes, googleText] = await Promise.all([
  fetch(`${baseUrl}/api/sessions/${sessionId}/transcript`, { headers: { Cookie: cookie } }),
  downloadDriveText(drive, driveTextId),
]);

const transcript = (await tRes.json()).transcript || [];
console.log(`[dump-tail] EchoNote 総発話数: ${transcript.length}`);

if (transcript.length > 0) {
  const first = transcript[0];
  const last = transcript[transcript.length - 1];
  console.log(`[dump-tail] 最初の発話: [${first.timestamp}] 話者${first.speaker}: ${first.text.slice(0, 80)}`);
  console.log(`[dump-tail] 最後の発話: [${last.timestamp}] 話者${last.speaker}: ${last.text.slice(0, 80)}`);
}

// タイムスタンプを秒に変換して、何分まで進んでいるか確認
function tsToSec(ts) {
  const parts = ts.split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}
if (transcript.length > 0) {
  const lastSec = tsToSec(transcript[transcript.length - 1].timestamp);
  const m = Math.floor(lastSec / 60);
  const s = lastSec % 60;
  console.log(`[dump-tail] EchoNote の最終タイムスタンプ: ${transcript[transcript.length - 1].timestamp} (${m}分${s}秒)`);
}

console.log();
console.log(`=== EchoNote 末尾 ${tailLines} 発話 ===`);
for (const u of transcript.slice(-tailLines)) {
  console.log(`[${u.timestamp}] 話者${u.speaker}: ${u.text}`);
}

console.log();
console.log(`=== Google 末尾 ${tailLines} 行 ===`);
const googleLines = googleText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
console.log(`[dump-tail] Google 行数: ${googleLines.length}`);
for (const line of googleLines.slice(-tailLines)) {
  console.log(line);
}
