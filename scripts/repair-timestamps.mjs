// 壊れたタイムスタンプを修復するスクリプト
//
// 仕組み:
//   - 旧コードのバグ: Geminiが "MM:SS" を返したのを "HH:MM" として解釈し、
//     `parts[0] * 3600 + parts[1] * 60` で過大な秒数として保存していた。
//   - そのため stored_sec = correct_sec * 60 になっているケースが多発。
//   - 64分の音声に対して10時間超の値が散在する状態。
//
// 修復方針:
//   - 各utteranceの stored_sec を取得
//   - もし stored_sec が音声長(--audio-min)を大幅に超えるなら 60で割る
//     （MM:SS が HH:MM:00 として保存されたパターンの逆変換）
//   - 補正後にソート、HH:MM:SSに整形してPATCHで上書き
//
// 使い方:
//   node scripts/repair-timestamps.mjs --session <id> --audio-min 64 --password <pwd>
//   --dry-run を付けると保存せず差分プレビューのみ

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
const audioMin = Number(arg('audio-min', '60'));
const dryRun = process.argv.includes('--dry-run');
const SCALE_THRESHOLD = audioMin * 60 * 1.5; // 音声長の1.5倍を超えるなら誤解釈と判定

if (!sessionId || !password) {
  console.error('使い方: node scripts/repair-timestamps.mjs --session <id> --password <pwd> [--audio-min 64] [--dry-run]');
  process.exit(1);
}

function tsToSec(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length >= 3) return (parts[0]||0)*3600 + (parts[1]||0)*60 + (parts[2]||0);
  if (parts.length === 2) return (parts[0]||0)*60 + (parts[1]||0);
  return parts[0]||0;
}
function secToTs(s) {
  const total = Math.max(0, Math.round(s));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  const sec = total%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

async function login() {
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`ログイン失敗: ${res.status}`);
  return (res.headers.get('set-cookie') || '').match(/echonote-auth=([^;]+)/)?.[0] || '';
}

const cookie = await login();
console.log(`[repair] 認証OK  audio-min=${audioMin}  threshold=${SCALE_THRESHOLD}s`);

const tRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/transcript`, { headers: { Cookie: cookie } });
const transcript = (await tRes.json()).transcript || [];
console.log(`[repair] 取得した発話数: ${transcript.length}`);

const audioDurationSec = audioMin * 60;
let correctedCount = 0;

// Step 1: 各発話のtimestampを secInAudio に変換
//   stored_sec が threshold を超える → 誤解釈なので 60で割る
const repaired = transcript.map((u, idx) => {
  const stored = tsToSec(u.timestamp);
  let realSec;
  if (stored > SCALE_THRESHOLD) {
    realSec = stored / 60;
    correctedCount++;
  } else {
    realSec = stored;
  }
  // 念のため音声長でクランプ
  realSec = Math.min(realSec, audioDurationSec);
  return { ...u, _origTs: u.timestamp, _origSec: stored, _realSec: realSec, _origIdx: idx };
});

console.log(`[repair] 補正対象（誤解釈と判定）: ${correctedCount} / ${repaired.length}`);

// Step 2: 修復後の秒で安定ソート（同秒は元のインデックスを維持）
repaired.sort((a, b) => a._realSec - b._realSec || a._origIdx - b._origIdx);

// Step 3: HH:MM:SSに変換、_補助フィールドを除去
const finalUtterances = repaired.map((u) => ({
  speaker: u.speaker,
  timestamp: secToTs(u._realSec),
  text: u.text,
}));

// プレビュー
console.log();
console.log('=== 補正後の先頭5件 ===');
for (const u of finalUtterances.slice(0, 5)) {
  console.log(`  [${u.timestamp}] 話者${u.speaker}: ${u.text.slice(0, 60)}`);
}
console.log('=== 補正後の末尾5件 ===');
for (const u of finalUtterances.slice(-5)) {
  console.log(`  [${u.timestamp}] 話者${u.speaker}: ${u.text.slice(0, 60)}`);
}

const minTs = finalUtterances[0]?.timestamp;
const maxTs = finalUtterances[finalUtterances.length - 1]?.timestamp;
console.log(`\n[repair] 補正後 timestamp 範囲: ${minTs} 〜 ${maxTs}`);

if (dryRun) {
  console.log('[repair] --dry-run のため保存はしません');
  process.exit(0);
}

// Step 4: PATCHで保存
const patchRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ transcript: finalUtterances }),
});
if (!patchRes.ok) {
  console.error(`[repair] PATCH失敗: ${patchRes.status} ${await patchRes.text()}`);
  process.exit(1);
}
console.log(`[repair] 保存完了: PATCH ${patchRes.status}`);
