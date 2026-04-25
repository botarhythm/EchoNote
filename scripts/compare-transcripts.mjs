// EchoNote (本番DB) と Google Recorder のテキストを直接比較するスクリプト
// 使い方:
//   node scripts/compare-transcripts.mjs --session <session_id> --drive-text <drive_file_id>
//   --base-url <https://...>  (省略時は production)

import dotenv from 'dotenv';
import { google } from 'googleapis';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '_inspection');

dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const DEFAULT_BASE_URL = 'https://echonote-production.up.railway.app';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function getDrive() {
  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyB64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が未設定です');
  const credentials = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf-8'));
  return google.drive({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    }),
  });
}

async function downloadDriveText(drive, fileId) {
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

async function login(baseUrl, password) {
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`ログイン失敗 ${res.status}: ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Set-Cookie ヘッダがありません');
  const m = setCookie.match(/echonote-auth=([^;]+)/);
  if (!m) throw new Error(`echonote-auth クッキーが取れません: ${setCookie}`);
  return `echonote-auth=${m[1]}`;
}

async function fetchJson(url, cookie) {
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {} });
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchSessionTranscript(baseUrl, sessionId, cookie) {
  const body = await fetchJson(`${baseUrl}/api/sessions/${sessionId}/transcript`, cookie);
  return body.transcript || [];
}

async function fetchSessionMeta(baseUrl, sessionId, cookie) {
  const body = await fetchJson(`${baseUrl}/api/sessions/${sessionId}`, cookie);
  return body.session;
}

function normalize(s) {
  return s
    .normalize('NFKC')
    .replace(/[\s　、，。．・！？!?「」『』（）()【】\[\]、ー~〜ｰ-]/g, '')
    .toLowerCase();
}

function computeCoverage(googleText, echonoteText) {
  const echoNorm = normalize(echonoteText);
  const sentences = googleText
    .split(/[。.!?！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);

  const matched = [];
  for (const sent of sentences) {
    const norm = normalize(sent);
    if (norm.length < 4) {
      matched.push({ sent, hit: true, score: 1 });
      continue;
    }
    const window = 6;
    if (norm.length <= window) {
      const hit = echoNorm.includes(norm);
      matched.push({ sent, hit, score: hit ? 1 : 0 });
      continue;
    }
    let hits = 0;
    let total = 0;
    for (let i = 0; i + window <= norm.length; i += window) {
      total++;
      if (echoNorm.includes(norm.slice(i, i + window))) hits++;
    }
    const score = total === 0 ? 0 : hits / total;
    matched.push({ sent, hit: score >= 0.5, score });
  }
  return matched;
}

async function main() {
  const sessionId = arg('session');
  const driveTextId = arg('drive-text');
  const baseUrl = arg('base-url', DEFAULT_BASE_URL);
  if (!sessionId || !driveTextId) {
    console.error('使い方: node scripts/compare-transcripts.mjs --session <id> --drive-text <id> [--base-url <url>]');
    process.exit(1);
  }

  console.log(`[compare] base-url    = ${baseUrl}`);
  console.log(`[compare] session    = ${sessionId}`);
  console.log(`[compare] drive-text = ${driveTextId}`);
  console.log();

  // 認証
  const password = arg('password', process.env.ADMIN_PASSWORD);
  let cookie = null;
  if (password) {
    cookie = await login(baseUrl, password);
    console.log(`[compare] 認証OK`);
  } else {
    console.log(`[compare] パスワード未指定（--password か ADMIN_PASSWORD env）。認証なしで試行...`);
  }

  const drive = getDrive();
  const [{ name: driveName, text: googleText }, transcript, sessionMeta] = await Promise.all([
    downloadDriveText(drive, driveTextId),
    fetchSessionTranscript(baseUrl, sessionId, cookie),
    fetchSessionMeta(baseUrl, sessionId, cookie).catch(() => null),
  ]);

  console.log(`[compare] Drive ファイル名: ${driveName}`);
  if (sessionMeta) {
    console.log(`[compare] EchoNote セッション: ${sessionMeta.meta?.originalFilename ?? '?'}  status=${sessionMeta.status}`);
  }
  console.log();

  const echoText = transcript.map((u) => u.text).join('\n');
  const echoChars = normalize(echoText).length;
  const googleChars = normalize(googleText).length;
  console.log(`[compare] EchoNote utterances: ${transcript.length}  正規化後文字数: ${echoChars}`);
  console.log(`[compare] Google 行: ${googleText.split(/\r?\n/).filter(Boolean).length}  正規化後文字数: ${googleChars}`);
  console.log(`[compare] 文字数比 (echo / google): ${(echoChars / Math.max(1, googleChars) * 100).toFixed(1)}%`);
  console.log();

  const coverage = computeCoverage(googleText, echoText);
  const total = coverage.length;
  const hits = coverage.filter((c) => c.hit).length;
  const missingFull = coverage.filter((c) => c.score === 0);
  const missingPartial = coverage.filter((c) => !c.hit && c.score > 0);

  console.log(`=== カバレッジ（Googleの文がEchoNoteに含まれているか） ===`);
  console.log(`  全文数:      ${total}`);
  console.log(`  完全一致:    ${hits} (${(hits / total * 100).toFixed(1)}%)`);
  console.log(`  部分欠損:    ${missingPartial.length}`);
  console.log(`  完全欠損:    ${missingFull.length}`);
  console.log();

  // 完全欠損サンプル
  console.log(`=== EchoNote から完全に消えている文（最大30件） ===`);
  for (const m of missingFull.slice(0, 30)) {
    console.log(`  ・${m.sent}`);
  }

  // 結果を JSON で保存
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `compare-${sessionId}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        sessionId,
        driveFileId: driveTextId,
        driveFileName: driveName,
        echonoteFilename: sessionMeta?.meta?.originalFilename,
        echoUtterances: transcript.length,
        echoChars,
        googleChars,
        ratioEchoOverGoogle: echoChars / Math.max(1, googleChars),
        coverage: { total, hits, missingFull: missingFull.length, missingPartial: missingPartial.length },
        missingSegments: missingFull.map((c) => c.sent),
        partialSegments: missingPartial.map((c) => ({ sent: c.sent, score: c.score })),
      },
      null,
      2
    ),
    'utf-8'
  );
  console.log();
  console.log(`詳細は ${outPath} に保存しました`);
}

main().catch((err) => {
  console.error('[compare] エラー:', err);
  process.exit(1);
});
