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
  // ── Deep/Detailed モードで生成される拡張フィールド ──
  sessionMoments?: SessionMoment[];       // セッション内の転換点
  coachingInsights?: string;              // コーチングアプローチの効果分析
  underlyingThemes?: string[];            // 表面課題の下にある深層テーマ
  clientStateShift?: string;             // セッション前後でのクライアントの心理的変化
  nextSessionSuggestions?: string[];     // 次回セッションへの提案アジェンダ
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

// セッション内の転換点（詳細・Deep モードで使用）
export interface SessionMoment {
  type: 'breakthrough' | 'resistance' | 'insight' | 'decision' | 'emotion';
  description: string;  // 何が起きたか
  significance: string; // なぜそれが重要か
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

// ─── クロスセッション分析 ────────────────────────────────────────────────────

/** 複数セッション横断分析の結果 */
export interface CrossAnalysisResult {
  clientName: string;
  sessionCount: number;
  periodSummary: string;       // "2024年1月〜2025年4月（6セッション）"
  generatedAt: string;

  // 成長の物語
  progressNarrative: string;   // クライアントの変遷を語る段落

  // テーマの推移
  recurringThemes: CrossTheme[];

  // 課題の変化
  resolvedIssues: string[];        // 解消・前進した課題
  persistentChallenges: string[];  // まだ残る・深まっている課題
  emergingIssues: string[];        // 最近新たに浮上した課題

  // 行動・思考パターン
  behavioralPatterns: string[];    // クライアントの行動上のパターン
  mindsetEvolution: string;        // 思考・姿勢の変化（段落）

  // 実行の傾向
  actionPattern: string;           // 宿題・アクションの実行傾向

  // マイルストーン
  keyMilestones: CrossMilestone[];

  // コーチング関係の評価
  coachingRelationship: string;    // 関係性の深さ・質の評価
  currentPhase: string;            // 現在のコーチングフェーズ

  // 次のフェーズへ
  nextPhaseRecommendation: string; // 次フェーズへの提言（段落）
  priorityTopics: string[];        // 次回セッションの優先テーマ
}

export interface CrossTheme {
  theme: string;
  sessionCount: number;         // 何セッションに登場したか
  evolution: string;            // どう変化してきたか
  status: 'ongoing' | 'resolved' | 'deepening' | 'new';
}

export interface CrossMilestone {
  sessionDate: string;
  description: string;
  significance: string;
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
  progressMessage?: string;
}
