# Implementation Plan — EchoNote

Botarhythm Studio セッション議事録自動化アプリ
作成日: 2026-04-07
対象: Claude Code（バイブコーディング用）

---

## Phase 0: 前提セットアップ（コーディング前に人間が行う）

### 0-1. VB-Audio Virtual Cable（Windowsオンライン録音用）

1. https://vb-audio.com/Cable/ からインストール
2. Windowsサウンド設定:
   - 出力デバイス: CABLE Input（VB-Audio）
   - 入力デバイス: CABLE Output（VB-Audio）
3. 録音アプリ（ボイスレコーダー or Audacity）でCABLE Outputを録音ソースに設定
4. LINE通話中はスピーカーから音が出なくなるため、モニタリング設定を有効にする
   - サウンド設定 → 録音タブ → CABLE Output → プロパティ → 聴く → このデバイスを聴く → 実際のスピーカーを選択

### 0-2. Google Cloud セットアップ

```
1. Google Cloud Console でプロジェクト作成
   プロジェクト名: botarhythm-studio-summarizer

2. APIを有効化:
   - Google Drive API
   - （Gemini APIはGoogle AI Studioのキーを使うため不要）

3. サービスアカウント作成:
   - 名前: session-summarizer
   - ロール: なし（Driveは共有で制御する）
   - キー作成: JSON形式でダウンロード

4. Google Driveで専用フォルダ作成:
   - フォルダ名: SessionRecordings
   - サービスアカウントのメールアドレスに「編集者」権限を付与
   - フォルダIDをコピー（URLの /folders/ 以降）
```

### 0-3. APIキー取得

```
- Gemini API: https://aistudio.google.com/apikey
- Anthropic API: https://console.anthropic.com/
```

### 0-4. ファイル命名規則の周知

音声ファイルは以下の形式で保存・アップロードすること:

```
YYYYMMDD_クライアント名.mp3
YYYYMMDD_クライアント名.m4a
YYYYMMDD_クライアント名.wav

例:
20260407_田中様.mp3
20260407_鈴木商店.m4a
20260407_山田太郎_体験セッション.mp3   ← アンダースコア3つ目以降は補足メモ
```

---

## Phase 1: プロジェクト初期化

### Claude Codeへの指示

```
Next.js 14 (App Router) + TypeScript + Tailwind CSS v4 で
session-summarizerというプロジェクトを作成してください。

コマンド:
npx create-next-app@latest echo-note \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

追加でインストールするパッケージ:
npm install @google/generative-ai @anthropic-ai/sdk googleapis zustand
npm install -D @types/node
```

### .gitignore に追加する項目

```
.env.local
*.mp3
*.m4a
*.wav
/tmp/
```

---

## Phase 2: 型定義（src/lib/types.ts）

```typescript
// セッションの処理状態
export type SessionStatus =
  | 'pending'      // Drive検知済み・未処理
  | 'transcribing' // Gemini処理中
  | 'summarizing'  // Claude処理中
  | 'done'         // 完了
  | 'error';       // エラー

// ファイル名から取得するメタデータ
export interface SessionMeta {
  date: string;          // "2026-04-07"
  clientName: string;    // "田中様"
  memo?: string;         // "体験セッション"（任意）
  originalFilename: string;
  driveFileId: string;
  mimeType: string;
}

// 話者付き発話ブロック
export interface Utterance {
  speaker: 'A' | 'B';   // A=もっちゃん / B=クライアント
  timestamp: string;     // "00:03:24"
  text: string;
}

// Claude APIが返すサマリーのJSON構造
export interface SessionSummary {
  title: string;                    // セッションタイトル（自動生成）
  clientName: string;
  date: string;
  sessionType: string;             // "体験セッション" | "メンタリング" | "その他"
  clientPains: string[];           // クライアントの課題・ペイン（箇条書き）
  adviceGiven: string[];           // もっちゃんのアドバイス・提案（箇条書き）
  nextActions: NextAction[];       // ネクストアクション
  homeworkForClient: string[];     // クライアントへの宿題
  keyQuotes: KeyQuote[];           // 印象的な発言
  overallAssessment: string;       // セッション全体の所感（3文程度）
}

export interface NextAction {
  task: string;
  owner: 'もっちゃん' | 'クライアント' | '両者';
  deadline?: string;
}

export interface KeyQuote {
  speaker: 'A' | 'B';
  text: string;
  context: string;   // なぜ印象的か
}

// セッション全体のデータモデル
export interface Session {
  id: string;             // driveFileId をそのまま使う
  meta: SessionMeta;
  status: SessionStatus;
  transcript?: Utterance[];
  summary?: SessionSummary;
  error?: string;
  processedAt?: string;
}
```

---

## Phase 3: Google Drive 連携（src/lib/drive.ts）

### 実装すること

```typescript
// サービスアカウント認証の初期化
function getDriveClient(): drive_v3.Drive

// 指定フォルダ内の音声ファイル一覧を取得
// 返す: ファイルID・名前・更新日時・MIMEタイプ
async function listAudioFiles(folderId: string): Promise<DriveFile[]>

// ファイルの内容をBufferとして取得（Gemini APIに渡すため）
async function downloadFile(fileId: string): Promise<Buffer>

// 処理済みフラグ用: ファイルを「処理済み」サブフォルダに移動
async function moveToProcessed(fileId: string, processedFolderId: string): Promise<void>
```

### 重複処理防止の仕組み

DriveフォルダにProcessedサブフォルダを作成し、処理完了後にファイルを移動する。
ポーリング時はProcessedフォルダ内のファイルを除外する。

```
SessionRecordings/
├── 20260407_田中様.mp3        ← 未処理（監視対象）
└── Processed/
    └── 20260406_鈴木商店.mp3  ← 処理済み（監視除外）
```

---

## Phase 4: ファイル名パーサー（src/lib/parser.ts）

### 命名規則

```
YYYYMMDD_クライアント名[_補足メモ].(mp3|m4a|wav)
```

### 実装仕様

```typescript
export function parseSessionMeta(
  filename: string,
  fileId: string,
  mimeType: string
): SessionMeta | null

// パターンマッチ:
// ^(\d{8})_([^_]+)(?:_(.+))?\.(mp3|m4a|wav|m4a)$
// グループ1: 日付 → "20260407" → "2026-04-07"
// グループ2: クライアント名 → "田中様"
// グループ3: 補足メモ（任意）→ "体験セッション"

// パースできない場合は null を返す（処理をスキップ）
```

---

## Phase 5: Gemini 文字起こし（src/lib/gemini.ts）

### 実装仕様

```typescript
async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  clientName: string
): Promise<Utterance[]>
```

### Geminiへのプロンプト

```
以下の音声を文字起こしし、話者を分離してください。

【話者の前提】
- 話者Aは「もっちゃん」（アドバイザー・インタビュアー側）
- 話者Bは「${clientName}」（クライアント・相談者側）

【出力形式】
必ず以下のJSON配列のみを返してください。他のテキストは一切含めないこと。

[
  {
    "speaker": "A" または "B",
    "timestamp": "HH:MM:SS",
    "text": "発話内容"
  }
]

【ルール】
- 話者が切り替わるたびに新しい要素を作る
- 相槌・短い反応（「はい」「そうですね」）も含める
- 聞き取れない部分は [不明瞭] と記載
- 日本語で出力
```

### エラーハンドリング

- JSONパース失敗時: rawテキストをそのまま保存し、statusを `error` にする
- API タイムアウト: 5分（音声が長い場合があるため）
- ファイルサイズ上限: 20MB以下はinline、超える場合はFiles API経由

---

## Phase 6: Claude サマリー生成（src/lib/claude.ts）

### 実装仕様

```typescript
async function generateSummary(
  transcript: Utterance[],
  meta: SessionMeta
): Promise<SessionSummary>
```

### Claudeへのシステムプロンプト

```
あなたはBotarhythm Studioのセッション議事録作成AIです。
Botarhythm Studioはスモールビジネス向けDXアドバイザリーサービスです。
もっちゃん（元沢信昭）がアドバイザーとして、クライアントのデジタル変革を支援します。

サービスの特徴:
- 「依存させない」哲学
- 丸投げではなく自走できる状態を目指す
- 現場の痛みに寄り添う当事者目線

以下の文字起こしを分析し、指定のJSON形式でサマリーを作成してください。
JSONのみ返すこと。説明文・マークダウン・コードブロックは不要。
```

### Claudeへのユーザープロンプト

```
【セッション情報】
日付: ${meta.date}
クライアント: ${meta.clientName}
${meta.memo ? `補足: ${meta.memo}` : ''}

【文字起こし】
${transcript.map(u => `[${u.timestamp}] 話者${u.speaker}: ${u.text}`).join('\n')}

【出力するJSONの型】
{
  "title": "セッションを一言で表すタイトル",
  "clientName": "${meta.clientName}",
  "date": "${meta.date}",
  "sessionType": "体験セッション | メンタリング | その他",
  "clientPains": ["課題1", "課題2", ...],
  "adviceGiven": ["アドバイス1", "アドバイス2", ...],
  "nextActions": [
    { "task": "タスク名", "owner": "もっちゃん | クライアント | 両者", "deadline": "任意" }
  ],
  "homeworkForClient": ["宿題1", "宿題2", ...],
  "keyQuotes": [
    { "speaker": "A | B", "text": "発言内容", "context": "なぜ印象的か" }
  ],
  "overallAssessment": "セッション全体の所感。3文程度。"
}
```

---

## Phase 7: Drive 監視 API Route（src/app/api/drive/poll/route.ts）

### 処理フロー

```
GET /api/drive/poll

1. Drive APIでSessionRecordingsフォルダを検索
2. 音声ファイル（mp3/m4a/wav）一覧を取得
3. Processedフォルダ内のファイルを除外
4. 各ファイルについて:
   a. ファイル名をparseSessionMetaでパース（nullならスキップ）
   b. status: 'pending' でZustand storeに追加
   c. 非同期でtranscribe → summarizeを実行
   d. 完了後、ファイルをProcessedフォルダに移動
5. 処理中のファイルIDを返す

レスポンス:
{
  "found": number,       // 検知したファイル数
  "processing": string[] // 処理開始したファイルID一覧
}
```

### ポーリング実装

フロントエンド（page.tsx）から `POLL_INTERVAL_MS` ごとに `fetch('/api/drive/poll')` を呼ぶ。
Next.jsのRoute Handlerはステートレスなため、セッション状態はZustand storeで管理する。

**注意**: サーバーサイドのZustandはリクエスト間で状態を保持しない。
→ 解決策: SQLite（better-sqlite3）でローカルDB管理に切り替える。

```
npm install better-sqlite3 @types/better-sqlite3
```

DBファイル: `./data/sessions.db`（gitignore対象）

---

## Phase 8: データ永続化（src/lib/db.ts）

### テーブル設計

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- driveFileId
  filename TEXT NOT NULL,
  client_name TEXT NOT NULL,
  session_date TEXT NOT NULL,
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  transcript_json TEXT,          -- JSON文字列
  summary_json TEXT,             -- JSON文字列
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);
```

### 実装する関数

```typescript
function upsertSession(session: Partial<Session>): void
function getSession(id: string): Session | null
function getAllSessions(): Session[]
function updateStatus(id: string, status: SessionStatus, data?: Partial<Session>): void
```

---

## Phase 9: Web UI

### page.tsx — セッション一覧

```
表示内容:
- ヘッダー: "EchoNote — Session Archive"
- 右上: 最終監視時刻 + 「今すぐチェック」ボタン
- セッションカード一覧（新しい順）
  - クライアント名・日付・セッションタイプ
  - 処理状態バッジ（pending/transcribing/summarizing/done/error）
  - doneの場合: カードクリックで詳細ページへ

自動ポーリング:
- useEffect で POLL_INTERVAL_MS ごとに /api/drive/poll を呼ぶ
- done になったセッションはバッジが緑に変わる
```

### session/[id]/page.tsx — セッション詳細

```
表示内容（タブ切り替え）:

[サマリー] タブ（デフォルト）:
  - セッションタイトル・日付・クライアント名
  - クライアントの課題（箇条書き）
  - アドバイス・提案（箇条書き）
  - ネクストアクション（オーナー・期限付きテーブル）
  - クライアントへの宿題
  - 印象的な発言（引用スタイル）
  - セッション全体の所感

[書き起こし] タブ:
  - 話者A/B切り替えで色分け
  - タイムスタンプ表示
  - テキスト検索（Ctrl+F的なもの）
```

### デザイン方針

```
- Botarhythm Studioサイト（studio.botarhythm.com）のトーンに合わせる
- フォント: システムフォント（Noto Sans JP）
- カラー: ダークネイビー系 + ホワイト（スタジオサイトと同系統）
- シンプル・クリーン・プロフェッショナル
- モバイル対応不要（PCブラウザ前提）
```

---

## Phase 10: エラーハンドリング一覧

| エラー種別 | 対応 |
|---|---|
| ファイル名が命名規則に合わない | スキップ・ログ出力のみ |
| Gemini API タイムアウト（5分超） | status: 'error'、エラーメッセージ保存 |
| Gemini JSON パース失敗 | rawテキストをerror_messageに保存 |
| Claude API エラー | status: 'error'、リトライなし |
| Drive API 認証エラー | コンソールエラー + UIに「Drive接続エラー」表示 |
| ファイルサイズ超過（Gemini inline 20MB上限） | Files API経由に自動切替 |

---

## Phase 11: ローカル起動手順（README.md に記載すること）

```bash
# 1. 依存インストール
npm install

# 2. 環境変数設定
cp .env.example .env.local
# .env.local を編集してAPIキーを記入

# 3. サービスアカウントJSONのエンコード
# サービスアカウントJSONファイルを base64 エンコードして GOOGLE_SERVICE_ACCOUNT_JSON に貼る
# PowerShell:
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("C:\path\to\service-account.json"))

# 4. DBディレクトリ作成
mkdir data

# 5. 開発サーバー起動
npm run dev

# 6. ブラウザでアクセス
# http://localhost:3000
```

---

## 実装順序（Claude Code への推奨手順）

```
Step 1: プロジェクト初期化 + パッケージインストール
Step 2: src/lib/types.ts — 型定義
Step 3: src/lib/parser.ts — ファイル名パーサー + テスト
Step 4: src/lib/db.ts — SQLite CRUD
Step 5: src/lib/drive.ts — Drive APIクライアント
Step 6: src/lib/gemini.ts — Gemini文字起こし
Step 7: src/lib/claude.ts — Claudeサマリー生成
Step 8: src/app/api/drive/poll/route.ts — 監視エンドポイント
Step 9: src/app/api/transcribe/route.ts — 文字起こしエンドポイント
Step 10: src/app/api/summarize/route.ts — サマリーエンドポイント
Step 11: src/components/* — UIコンポーネント
Step 12: src/app/page.tsx — 一覧ページ
Step 13: src/app/session/[id]/page.tsx — 詳細ページ
Step 14: .env.example + README.md 作成
```

---

## 将来拡張（v2以降の候補）

- セッション間横断検索（クライアント名・課題キーワード）
- クライアント別ページ（過去セッション履歴）
- Notion APIへの自動エクスポート
- メール自動送信（セッション後フォローアップ）
- InsightScopeへの統合
