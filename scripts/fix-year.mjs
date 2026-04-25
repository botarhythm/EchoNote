// セッションの meta.date が 2025-* で始まるものを 2026-* に一括補正する
// 使い方:
//   node scripts/fix-year.mjs --password <pwd>
//   node scripts/fix-year.mjs --password <pwd> --from 2025 --to 2026
//   --dry-run を付けると保存せず一覧のみ表示

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
const password = arg('password', process.env.ADMIN_PASSWORD);
const fromYear = arg('from', '2025');
const toYear = arg('to', '2026');
const dryRun = process.argv.includes('--dry-run');

if (!password) {
  console.error('使い方: node scripts/fix-year.mjs --password <pwd> [--from 2025] [--to 2026] [--dry-run]');
  process.exit(1);
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
console.log(`[fix-year] 認証OK  ${fromYear} → ${toYear}  ${dryRun ? '(dry-run)' : ''}`);

const listRes = await fetch(`${baseUrl}/api/sessions`, { headers: { Cookie: cookie } });
const { sessions } = await listRes.json();
console.log(`[fix-year] 全セッション数: ${sessions.length}`);

const targets = sessions.filter((s) => s.meta?.date?.startsWith(`${fromYear}-`));
console.log(`[fix-year] 補正対象: ${targets.length} 件\n`);

for (const s of targets) {
  const oldDate = s.meta.date;
  const newDate = oldDate.replace(`${fromYear}-`, `${toYear}-`);
  const label = `${oldDate} → ${newDate}  ${s.meta.clientName ?? ''}  (${s.id})`;
  if (dryRun) {
    console.log(`  [DRY]  ${label}`);
    continue;
  }
  const res = await fetch(`${baseUrl}/api/sessions/${s.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ date: newDate }),
  });
  if (res.ok) {
    console.log(`  [OK]   ${label}`);
  } else {
    console.log(`  [FAIL] ${label}  status=${res.status}  ${await res.text()}`);
  }
}

if (dryRun) console.log('\n[fix-year] --dry-run のため保存はしていません');
