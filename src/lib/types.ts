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
  title: string;
  clientName: string;
  date: string;
  sessionType: string;
  clientPains: string[];
  adviceGiven: string[];
  nextActions: NextAction[];
  homeworkForClient: string[];
  keyQuotes: KeyQuote[];
  overallAssessment: string;
}

export interface NextAction {
  task: string;
  owner: 'もっちゃん' | 'クライアント' | '両者';
  deadline?: string;
}

export interface KeyQuote {
  speaker: 'A' | 'B';
  text: string;
  context: string;
}

// 話者名のマッピング
export interface SpeakerNames {
  A: string;  // 例: "もっちゃん"
  B: string;  // 例: クライアント名
}

// クライアントごとのグローバル設定
export interface ClientSettings {
  clientName: string;
  notes: string;       // クライアント共通の補正メモ
  speakerA: string;   // 話者Aの名前（デフォルト: "もっちゃん"）
  speakerB: string;   // 話者Bの名前（通常クライアント名）
  updatedAt?: string;
}

// サマリーの深度
export type SummaryDepth = 'simple' | 'standard' | 'detailed' | 'deep';

// サマリーの観点（複数選択可）
export type SummaryPattern = 'action' | 'psychology' | 'coaching' | 'strategy' | 'problem';

export interface SummaryOptions {
  depth: SummaryDepth;
  patterns: SummaryPattern[];
  userNotes: string;       // このセッション限りの補正メモ
  clientNotes: string;     // クライアント共通の補正メモ
  speakerNames: SpeakerNames;
}

export const DEPTH_LABELS: Record<SummaryDepth, string> = {
  simple:   'シンプル',
  standard: 'スタンダード',
  detailed: '詳細',
  deep:     'ディープダイブ',
};

export const PATTERN_LABELS: Record<SummaryPattern, string> = {
  action:     'アクション重視',
  psychology: 'クライアント心理',
  coaching:   'コーチング観点',
  strategy:   'ビジネス戦略',
  problem:    '課題分析',
};

// セッション全体のデータモデル
export interface Session {
  id: string;             // driveFileId をそのまま使う
  meta: SessionMeta;
  status: SessionStatus;
  transcript?: Utterance[];
  summary?: SessionSummary;
  error?: string;
  processedAt?: string;
  progressMessage?: string;
}
