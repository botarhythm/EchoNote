// Railway の EchoNote プロジェクトについて、サービス別の直近7日平均メモリを取得し
// docs/ledger/railway-memory.jsonl に追記する決定論的な判定器（ocean-loop 用）。
//
// 使い方:  RAILWAY_API_TOKEN=<アカウントトークン> node scripts/railway-memory-ledger.mjs [--days=7] [--dry]
//   ※ プロジェクトトークンでは me.workspaces が取れない。DegiHara-ChatBot/.env の RAILWAY_API_TOKEN が同じアカウント。
// 判定:  app の平均MBが THRESHOLD_APP_MB 未満なら PASS、以上なら FAIL（終了コード1）。
//        前回エントリとの差分も表示する。
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

const TOKEN = process.env.RAILWAY_API_TOKEN;
if (!TOKEN) { console.error('RAILWAY_API_TOKEN（アカウントトークン）が必要です'); process.exit(2); }
const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const DAYS = Number(arg('days', 7));
const DRY = process.argv.includes('--dry');
const PROJECT = 'EchoNote';
const THRESHOLD_APP_MB = 120; // 変更前249MB / ローカル実測82MB。Railway側の実値を見て調整する
const LEDGER = new URL('../docs/ledger/railway-memory.jsonl', import.meta.url);

const gql = async (query, variables = {}) => {
  const r = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data;
};

const me = await gql(`{ me { workspaces { projects { edges { node { id name services { edges { node { id name } } } } } } } } }`);
const project = me.me.workspaces.flatMap(w => w.projects.edges.map(e => e.node)).find(p => p.name === PROJECT);
if (!project) throw new Error(`プロジェクト ${PROJECT} が見つかりません`);
const end = new Date(), start = new Date(end.getTime() - DAYS * 86400e3);
const u = await gql(
  `query($p:String!,$s:DateTime!,$e:DateTime!){ usage(projectId:$p,startDate:$s,endDate:$e,groupBy:[SERVICE_ID],measurements:[MEMORY_USAGE_GB,CPU_USAGE]){ measurement value tags { serviceId } } }`,
  { p: project.id, s: start.toISOString(), e: end.toISOString() });
const mins = (end - start) / 60000;
const services = {};
for (const r of u.usage) {
  const name = project.services.edges.find(e => e.node.id === r.tags.serviceId)?.node.name ?? r.tags.serviceId;
  services[name] ??= {};
  if (r.measurement === 'MEMORY_USAGE_GB') services[name].memMB = Math.round(r.value / mins * 1024);
  if (r.measurement === 'CPU_USAGE') services[name].cpu = Number((r.value / mins).toFixed(4));
}
const appMB = services[PROJECT]?.memMB ?? null;
const entry = { at: end.toISOString(), days: DAYS, services, appMB, thresholdAppMB: THRESHOLD_APP_MB, verdict: appMB !== null && appMB < THRESHOLD_APP_MB ? 'PASS' : 'FAIL' };

let prev = null;
if (existsSync(LEDGER)) {
  const lines = readFileSync(LEDGER, 'utf-8').trim().split('\n').filter(Boolean);
  if (lines.length) prev = JSON.parse(lines.at(-1));
}
if (!DRY) appendFileSync(LEDGER, JSON.stringify(entry) + '\n');

console.log(`[${PROJECT}] 直近${DAYS}日平均`);
for (const [n, v] of Object.entries(services)) console.log(`  ${n.padEnd(10)} ${String(v.memMB).padStart(4)} MB  cpu ${v.cpu ?? '-'}`);
if (prev?.appMB != null && appMB != null) console.log(`  前回(${prev.at.slice(0, 10)}) app ${prev.appMB} MB → 今回 ${appMB} MB (${appMB - prev.appMB >= 0 ? '+' : ''}${appMB - prev.appMB})`);
console.log(`  判定: ${entry.verdict} (閾値 app < ${THRESHOLD_APP_MB} MB)${DRY ? ' [dry: 台帳未記録]' : ''}`);
process.exit(entry.verdict === 'PASS' ? 0 : 1);
