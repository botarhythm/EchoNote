# EchoNote KNOWLEDGE（ステータスボード・常に現在形）

運用フェーズ: **F2**（ブリーフ起票時点の宣言。変更はユーザー宣言で）

## 現在の状態
- 本番: Railway `EchoNote` プロジェクト（サービス: EchoNote / Postgres）。共有リンク独自ドメイン対応済み。
- **Railway メモリ削減（2026-08-22）**: `googleapis` → `@googleapis/drive` に置換（ローカル実測 163→82MB）。**本番デプロイ後の7日観測が未完**。判定: `RAILWAY_API_TOKEN=<アカウントトークン> node scripts/railway-memory-ledger.mjs`（台帳 `docs/ledger/railway-memory.jsonl`、閾値 app<120MB）。詳細 `tasks/archive/T-20260822-01_*.md`、決定 `docs/adr/0001`。
- ブリーフ出典: `DegiHara-ChatBot/docs/briefs/railway-cost-other-projects.md`（他8プロジェクトは各リポジトリで別途）。

## 規約
- Google API は `@googleapis/<api>` 単体パッケージのみ（ADR 0001）。
- Railway アカウント横断の usage は Project-Access-Token では取れない。アカウントトークンで `me.workspaces[].projects`。
