// EchoNote の transcript 全体の構造を分析し、末尾欠落と timestamp 異常を診断
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const baseUrl = arg('base-url', 'https://echonote-production.up.railway.app');
const sessionId = arg('session');
const password = arg('password', process.env.ADMIN_PASSWORD);
if (!sessionId || !password) { console.error('--session と --password が必要'); process.exit(1); }

async function login() {
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return (res.headers.get('set-cookie') || '').match(/echonote-auth=([^;]+)/)?.[0] || '';
}

const cookie = await login();
const tRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/transcript`, { headers: { Cookie: cookie } });
const transcript = (await tRes.json()).transcript || [];

console.log(`[diag] 総発話数: ${transcript.length}`);

// タイムスタンプを秒に変換して min/max/各時間レンジ集計
function tsToSec(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return (parts[0]||0)*3600 + (parts[1]||0)*60 + (parts[2]||0);
  if (parts.length === 2) return (parts[0]||0)*60 + (parts[1]||0);
  return parts[0]||0;
}
const secs = transcript.map((u) => tsToSec(u.timestamp));
const min = Math.min(...secs), max = Math.max(...secs);
console.log(`[diag] timestamp 範囲: min=${min}s (${(min/60).toFixed(1)}分) max=${max}s (${(max/60).toFixed(1)}分 = ${(max/3600).toFixed(2)}時間)`);

// 10分刻みで集計
const buckets = new Map();
for (const s of secs) {
  const bucket = Math.floor(s / 600) * 600;
  buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
}
console.log(`\n[diag] 10分単位の発話数分布（実音声は約64分=3840秒）:`);
const sortedBuckets = [...buckets.entries()].sort((a,b) => a[0]-b[0]);
for (const [b, c] of sortedBuckets) {
  const m = Math.floor(b/60), h = Math.floor(b/3600);
  const range = h > 0 ? `${h}時間${(m%60).toFixed(0)}分台` : `${m}分台`;
  console.log(`  ${String(b).padStart(6)}s - ${String(b+600).padStart(6)}s (${range.padEnd(15)}): ${c} 発話`);
}

// 重要キーワードが含まれるかチェック
const echoText = transcript.map((u) => u.text).join('\n');
const keywords = [
  'カモン', 'セラーメイト', 'ボタリズム', 'ノヴァ', 'サボる犬',
  '11 日', '11日', '5 月', '5月', 'バックラベル', 'ロゴ',
  'ストッカー', 'パッケージ', '振り込み', 'カップサイズ',
  '180', '160', 'カフェオレ',
];
console.log(`\n[diag] Google末尾に出てくるキーワードがEchoNoteにあるか:`);
for (const k of keywords) {
  const found = echoText.includes(k);
  console.log(`  ${found ? '✓' : '✗'}  "${k}"`);
}

// 末尾近くで実際に何が話されているかタイムスタンプ秒順に
console.log(`\n[diag] 末尾10件（timestamp秒順）:`);
const sorted = [...transcript].sort((a, b) => tsToSec(a.timestamp) - tsToSec(b.timestamp));
for (const u of sorted.slice(-10)) {
  console.log(`  [${u.timestamp}] (${tsToSec(u.timestamp)}s) 話者${u.speaker}: ${u.text.slice(0, 60)}`);
}

// 異常タイムスタンプの集計
const overOneHour = secs.filter((s) => s > 3600).length;
const oneToTen = secs.filter((s) => s >= 0 && s <= 600).length;
console.log(`\n[diag] timestamp が 1時間 (3600秒) 超のもの: ${overOneHour} 件 / ${transcript.length}`);
console.log(`[diag] timestamp が 0〜10分のもの: ${oneToTen} 件 / ${transcript.length}`);
