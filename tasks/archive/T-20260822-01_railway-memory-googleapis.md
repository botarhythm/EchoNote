# T-20260822-01 Railway常駐メモリ削減: googleapis 全体読込の解消

- 出典: DegiHara-ChatBot/docs/briefs/railway-cost-other-projects.md（EchoNote分 $2.96/月）
- 実行: Fable（指令塔直営・小タスクのため同一セッション）/ status: done / attempts: 0

## 調査結果（ブリーフ未決点の解消）
- 249MB は **アプリ（EchoNote サービス）**、Postgres は 46MB（Railway usage API を serviceId で groupBy して実測）。
- 主因: `import { google } from 'googleapis'` が全API（約200種）を読み込む。Node単体実測: 全体 +91MB RSS / Drive単体 +9MB。
- pg Pool は既に単一インスタンス。常駐子プロセスなし（ffmpeg は処理時のみ spawn）。

## 変更
- `googleapis` → `@googleapis/drive`（公式単体パッケージ、Drive v3 同一API）。`src/lib/drive.ts` の import と auth/drive 生成のみ変更。
- `next.config.ts` serverExternalPackages に `@googleapis/drive` 追加。
- 未使用の `@google/generative-ai` を dependencies から削除（使用箇所0）。
- `scripts/railway-memory-ledger.mjs` + `docs/ledger/railway-memory.jsonl`（ocean-loop 判定器＋台帳）。

## AC（コマンド → 期待結果）
1. `npx tsc --noEmit` → エラー0 ✅
2. `npm run build` → Compiled successfully ✅
3. `grep -rn "from 'googleapis'" src` → 0件 ✅
4. standalone サーバー起動45秒後の RSS（同条件: --unhandled-rejections=warn, ローカルDBなし）→ 変更前 163MB / 変更後 82MB（−81MB）✅
5. `node scripts/railway-memory-ledger.mjs --dry` → 台帳形式で出力・終了コード（現状FAIL=未デプロイのため期待どおり）✅
6. デプロイ後7日: 同スクリプトで app < 120MB → PASS（**未実施・観測待ち**）

## 逸脱・気づき
- ローカル計測は Postgres 無しの条件。本番はDB接続分が数MB乗るが、差分−81MBは純粋にモジュール読込分なので本番でも同程度を見込む（月額で約 -$0.9）。
- Railway の Drive 実通信（list/download/rename/move）は本番デプロイ後に要確認（AC6と同時）。API表面は同一のためリスク低。
