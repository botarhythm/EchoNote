# EchoNote

セッション録音から自動で文字起こし＋AI要約を生成するアプリ。Botarhythm Studio の議事録自動化のために作られましたが、誰でも fork して自分のインスタンスを立てられます。

## 主な機能

- Google Drive 監視フォルダに音声をアップロード → 自動検知 → Gemini で文字起こし → Claude で要約
- セッション一覧／詳細閲覧、印象的な発言・課題・宿題・ネクストアクションを構造化
- クライアントごとのタブとクロス分析（複数セッションの俯瞰）
- 共有リンク発行（匿名化マスキング対応）
- [デジタル原っぱ大学 自習室（digihara_jishushitsu）](https://github.com/akiratsukakoshi/digihara_jishushitsu) からの録音受け口（`/api/ingest`）
- 自習室ランチャー（自分の EchoNote から digihara を講師として起動）

## 技術スタック

| 層 | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router) + TypeScript + React 19 |
| UI | Tailwind CSS v4 |
| AI | Gemini API（文字起こし + 話者判別）/ Anthropic Claude API（要約） |
| ストレージ | Google Drive（音声ファイル）+ Postgres（メタデータ） |
| ホスティング | Railway（推奨）/ Vercel など Next.js が動く環境 |

## デプロイ手順（自分の EchoNote を立てる）

詳細は [docs/setup.md](./docs/setup.md) を参照してください。概要は以下のとおりです。

1. **このリポジトリを Fork**: 右上の「Fork」ボタンで自分の GitHub アカウントへコピー
2. **Google Cloud セットアップ**: プロジェクト作成 → Drive API 有効化 → サービスアカウント作成 → 監視フォルダを作って権限付与
3. **AI API キー取得**: [Gemini](https://aistudio.google.com/apikey)（無料枠あり） + [Anthropic](https://console.anthropic.com/)（従量課金）
4. **Postgres 用意**: Railway なら無料枠の Postgres を 1 クリックで作成可
5. **Railway で fork した repo をデプロイ** → 環境変数を設定
6. （任意）digihara との連携: ingest token を発番し、digihara 側に登録

最短で動かしたい方向けに、Railway の Deploy ボタンや手順テンプレを [docs/setup.md](./docs/setup.md) に用意しています。

## ローカル開発

```bash
# 1. 依存パッケージをインストール
npm install

# 2. 環境変数ファイルを準備
cp .env.example .env.local
# .env.local を編集（Gemini / Anthropic / Drive / Postgres / 任意で digihara 連携）

# 3. 開発サーバーを起動
npm run dev
```

`http://localhost:3000` でアクセスできます。

## 環境変数

| 変数名 | 説明 | 必須 |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API キー（文字起こし） | 必須 |
| `ANTHROPIC_API_KEY` | Anthropic API キー（要約） | 必須 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | サービスアカウント JSON を base64 エンコードした文字列 | 必須 |
| `DRIVE_FOLDER_ID` | 監視対象 Drive フォルダの ID | 必須 |
| `DRIVE_PROCESSED_FOLDER_ID` | 処理済みファイル移動先フォルダ ID | 任意 |
| `DATABASE_URL` | Postgres 接続文字列 | 必須 |
| `POLL_INTERVAL_MS` | サーバー側ポーリング間隔（ms） | 任意（既定 60000） |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | クライアント側自動更新間隔（ms） | 任意（既定 10000） |
| `ECHONOTE_INGEST_TOKEN` | 外部からの音声受け口（digihara 等）に使う共有秘密鍵 | digihara 連携時のみ |
| `NEXT_PUBLIC_DIGIHARA_BASE_URL` | 自習室の参加者 URL ベース | 自習室ランチャー使用時 |
| `DIGIHARA_INSTRUCTOR_KEY` | 自習室の講師キー（自分の） | 自習室ランチャー使用時 |

## API

### `/api/ingest` （外部からの音声受け口）

外部アプリが録音をアップロードするためのエンドポイント。

- 認証: `Authorization: Bearer <ECHONOTE_INGEST_TOKEN>`
- 形式: `multipart/form-data`
  - `file`: 音声（mp3/m4a/wav/webm 等）必須
  - `clientName` / `sessionDate(YYYYMMDD)` / `memo` / `source`: 任意のメタ情報

レスポンス: `{ ok: true, sessionId, filename, viewUrl }`

[デジタル原っぱ大学 自習室](https://github.com/akiratsukakoshi/digihara_jishushitsu) はこのエンドポイントへ自動送信します。

### `/api/jishushitsu/instructor-url`

自習室の講師 URL を返します。講師キーをクライアントバンドルに含めないためのサーバー側組み立て。

## ドキュメント

- [セットアップガイド](./docs/setup.md) — fork から本番デプロイまでの手順
- [実装計画書](./IMPLEMENTATION_PLAN.md) — 設計と実装ノート

## ライセンス

このリポジトリは非商用利用を前提とした個人プロジェクトです。商用利用や派生プロダクトを作りたい場合はオーナー（[botarhythm](https://github.com/botarhythm)）までご連絡ください。
