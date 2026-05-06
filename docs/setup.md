# EchoNote セットアップガイド

このドキュメントは、自分の EchoNote インスタンスを立ち上げるための手順をまとめたものです。

所要時間の目安: 30〜60分（Google Cloud と Railway を初めて触る場合）

---

## ステップ 1. リポジトリを Fork

1. https://github.com/botarhythm/EchoNote にアクセス
2. 右上の「Fork」ボタンを押下 → 自分のアカウントに fork
3. 自分の fork の URL をメモ（例: `https://github.com/your-name/EchoNote`）

---

## ステップ 2. Google Cloud の準備（Drive 連携用）

### 2-1. プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. 「プロジェクトを作成」→ 任意の名前（例: `my-echonote`）

### 2-2. Drive API を有効化

1. プロジェクト選択後、「APIとサービス」→「ライブラリ」
2. 「Google Drive API」を検索 → 有効化

### 2-3. サービスアカウント作成

1. 「APIとサービス」→「認証情報」
2. 「認証情報を作成」→「サービスアカウント」
3. 名前を入力（例: `echonote-sa`）→ 作成
4. ロールはなしで OK
5. 作成したサービスアカウントを開き、「キー」タブから「鍵を追加」→「新しい鍵を作成」→「JSON」
6. ダウンロードされた JSON ファイルを保管（後で base64 エンコードして使う）

### 2-4. Drive フォルダ作成 & 共有

1. [Google Drive](https://drive.google.com/) で新規フォルダ作成（例: `EchoNote録音`）
2. フォルダを開いた URL の末尾にあるフォルダ ID をコピー（`/folders/` の後の文字列）
3. フォルダを「共有」→ サービスアカウントのメールアドレス（`*-compute@developer.gserviceaccount.com` または `*@<project>.iam.gserviceaccount.com`）に「編集者」権限を付与
4. （任意）`Processed` というサブフォルダも同じ手順で作成。処理済みファイルがそこに移動されます

### 2-5. サービスアカウント JSON を base64 化

PowerShell:
```powershell
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
```

macOS / Linux:
```bash
base64 -i service-account.json | tr -d '\n'
```

出力された長い文字列を `GOOGLE_SERVICE_ACCOUNT_KEY` として使います。

---

## ステップ 3. AI API キー取得

### Gemini（文字起こし用・無料枠あり）

1. https://aistudio.google.com/apikey で「Create API Key」
2. キーをコピー → `GEMINI_API_KEY` として使用

### Anthropic（要約用・従量課金）

1. https://console.anthropic.com/ でアカウント作成 → クレジット購入
2. 「API Keys」→「Create Key」
3. キーをコピー → `ANTHROPIC_API_KEY` として使用

費用感: 1 セッション（約 1 時間 / 文字起こし約 50KB）あたり数十円程度

---

## ステップ 4. Postgres を用意

Railway を使う場合、ステップ 5 のデプロイと同時に「Add Postgres」で作れます。
ローカル開発では Docker が便利です:

```bash
docker run --name echonote-pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:16
```

接続文字列: `postgresql://postgres:secret@localhost:5432/postgres`

---

## ステップ 5. Railway へデプロイ

1. https://railway.app/ にサインアップ（GitHub 連携）
2. 「New Project」→「Deploy from GitHub repo」→ 自分の fork を選択
3. デプロイが始まったら、「Add Service」→「Database」→「PostgreSQL」を追加
4. プロジェクト内の EchoNote サービスを開き、「Variables」タブで以下を設定:

| 変数 | 値 |
|---|---|
| `GEMINI_API_KEY` | ステップ 3 で取得 |
| `ANTHROPIC_API_KEY` | ステップ 3 で取得 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | ステップ 2-5 の base64 文字列 |
| `DRIVE_FOLDER_ID` | ステップ 2-4 のフォルダ ID |
| `DRIVE_PROCESSED_FOLDER_ID` | （任意）`Processed` サブフォルダ ID |
| `DATABASE_URL` | Postgres サービスの `DATABASE_URL` を参照（`${{ Postgres.DATABASE_URL }}`） |
| `POLL_INTERVAL_MS` | `60000`（1 分）推奨 |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | `10000`（10 秒）推奨 |

5. 「Settings」→「Networking」→「Generate Domain」で公開 URL を発行
6. ブラウザでアクセスして動作確認

---

## ステップ 6. （任意）digihara_jishushitsu との連携

自習室の録音を自動で取り込みたい場合の設定。

### 6-1. EchoNote 側

ingest token を発番:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Railway の Variables に追加:

| 変数 | 値 |
|---|---|
| `ECHONOTE_INGEST_TOKEN` | 上で生成した値 |

### 6-2. digihara 側

[digihara_jishushitsu](https://github.com/akiratsukakoshi/digihara_jishushitsu) の運用者に依頼して、自分用の以下の env を設定してもらいます（自分が `TSUKAKOSHI` 講師の場合の例）:

```
ECHONOTE_URL_TSUKAKOSHI=https://your-echonote.up.railway.app
ECHONOTE_TOKEN_TSUKAKOSHI=<上のtoken>
```

これで自習室セッション終了時に、自分の EchoNote へ自動で録音が送られて要約されます。

---

## ステップ 7. （任意）EchoNote から自習室を起動

EchoNote のトップページに「自習室を開く」カードを表示する場合:

| 変数 | 値 |
|---|---|
| `NEXT_PUBLIC_DIGIHARA_BASE_URL` | `https://digihara-jishushitsu.vercel.app` |
| `DIGIHARA_INSTRUCTOR_KEY` | digihara 運用者から提供される自分の講師キー |

設定すれば、トップページから 1 クリックで講師として自習室を開けます。

---

## トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| 起動時 `ECONNREFUSED ::1:5432` | Postgres に接続できない。`DATABASE_URL` を確認 |
| Drive 連携エラー | サービスアカウントへの共有権限を確認 / `GOOGLE_SERVICE_ACCOUNT_KEY` の base64 を確認 |
| Gemini が JSON を返さない | API キーの有効性 / ファイル容量上限（20MB）を確認。長尺は Files API 経由に自動切替 |
| Claude のエラー | API キー / Anthropic Console のクレジット残高を確認 |
| `/api/ingest` が 401 | リクエストの `Authorization: Bearer` が `ECHONOTE_INGEST_TOKEN` と一致しているか確認 |

---

## 元の EchoNote（Botarhythm Studio）との関係

- このリポジトリは [botarhythm/EchoNote](https://github.com/botarhythm/EchoNote) をベースに、誰でも自分のインスタンスを立てられるように整備されたものです
- fork すれば独立に運用できます。元のインスタンスとはデータも共有されません
- 改善のフィードバックは Pull Request または Issue でお寄せください
