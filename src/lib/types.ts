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

// サマリーのモード（ノーマル議事録 vs Botarhythmセッション分析）
export type SummaryMode = 'normal' | 'botarhythm';

// セッションの章立て（タイムスタンプ付き目次）
export interface Chapter {
  startTime: string;   // "00:00:00"
  endTime: string;     // "00:12:30"
  title: string;       // 章タイトル
  summary: string;     // その章で何が話されたか（1〜2文）
}

// 数値・条件の抽出（金額・期日・KPIなど）
export interface KeyNumber {
  label: string;       // 例: "月額顧問料"
  value: string;       // 例: "5万円"
  context?: string;    // 例: "4月から開始で合意"
}

// Claude APIが返すサマリーのJSON構造
export interface SessionSummary {
  mode?: SummaryMode;                    // 'normal'|'botarhythm'（未設定 = 後方互換で推測）
  title: string;
  clientName: string;
  date: string;
  sessionType: string;
  // ── エグゼクティブブリーフ（冒頭30秒で全体把握するためのTLDR） ──
  executiveSummary?: string[];           // 2〜4行の要点（旧データには存在しない）
  chapters?: Chapter[];                  // タイムスタンプ付き章立て
  decisions?: string[];                  // このセッションで確定した決定事項のみ
  keyNumbers?: KeyNumber[];              // 言及された重要な数値・金額・期日
  clientPains: string[];
  adviceGiven: string[];
  nextActions: NextAction[];
  homeworkForClient: string[];
  keyQuotes: KeyQuote[];
  overallAssessment: string;
  // ── Botarhythm モードでのみ生成される深層分析フィールド ──
  sessionMoments?: SessionMoment[];       // セッション内の転換点
  coachingInsights?: string;              // コーチングアプローチの効果分析
  underlyingThemes?: string[];            // 表面課題の下にある深層テーマ
  clientStateShift?: string;             // セッション前後でのクライアントの心理的変化
  nextSessionSuggestions?: string[];     // 次回セッションへの提案アジェンダ
}

/** mode 未設定の過去データも扱えるよう、フィールドの有無から推測する */
export function getSummaryMode(summary: SessionSummary): SummaryMode {
  if (summary.mode) return summary.mode;
  const hasDeepFields =
    (summary.sessionMoments?.length ?? 0) > 0 ||
    !!summary.coachingInsights ||
    (summary.underlyingThemes?.length ?? 0) > 0 ||
    !!summary.clientStateShift ||
    (summary.nextSessionSuggestions?.length ?? 0) > 0;
  return hasDeepFields ? 'botarhythm' : 'normal';
}

export interface NextAction {
  task: string;
  // 担当者名（AIが会話から推測した実名が入ることもあるため自由文字列。
  // 旧データは 'もっちゃん' | 'クライアント' | '両者' のいずれか）
  owner: string;
  deadline?: string;
}

export interface KeyQuote {
  speaker: 'A' | 'B';
  text: string;
  context: string;
  timestamp?: string;  // "00:12:34" — 書き起こしへのジャンプに使用（旧データにはない）
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

// ─── モード別の深度とパターン ─────────────────────────────────────────────────

// ノーマル議事録の深度（一般的な会議・打合せ向け）
export type NormalDepth = 'simple' | 'standard' | 'detailed';
// Botarhythm セッション分析の深度（deep がフラグシップ）
export type BotarhythmDepth = 'standard' | 'detailed' | 'deep';
// 互換用のユニオン型
export type SummaryDepth = NormalDepth | BotarhythmDepth;

// ノーマル議事録向けパターン（コーチング臭のない汎用観点）
export type NormalPattern = 'action' | 'strategy' | 'problem';
// Botarhythm セッション向けパターン
export type BotarhythmPattern = 'psychology' | 'coaching' | 'strategy' | 'problem';
// 互換用のユニオン型
export type SummaryPattern = NormalPattern | BotarhythmPattern;

// ─── サマリー生成オプション（mode による判別可能ユニオン） ────────────────────

interface BaseSummaryOptions {
  userNotes: string;       // このセッション限りの補正メモ
  clientNotes: string;     // クライアント共通の補正メモ
  speakerNames: SpeakerNames;
}

export interface NormalSummaryOptions extends BaseSummaryOptions {
  mode: 'normal';
  depth: NormalDepth;
  patterns: NormalPattern[];
}

export interface BotarhythmSummaryOptions extends BaseSummaryOptions {
  mode: 'botarhythm';
  depth: BotarhythmDepth;
  patterns: BotarhythmPattern[];
}

export type SummaryOptions = NormalSummaryOptions | BotarhythmSummaryOptions;

// ─── ラベル定義 ───────────────────────────────────────────────────────────────

export const MODE_LABELS: Record<SummaryMode, string> = {
  normal:     'ノーマル（議事録）',
  botarhythm: 'Botarhythmセッション',
};

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

/** モードごとに利用可能な深度 */
export const DEPTHS_BY_MODE: {
  normal: NormalDepth[];
  botarhythm: BotarhythmDepth[];
} = {
  normal:     ['simple', 'standard', 'detailed'],
  botarhythm: ['standard', 'detailed', 'deep'],
};

/** モードごとに利用可能なパターン */
export const PATTERNS_BY_MODE: {
  normal: NormalPattern[];
  botarhythm: BotarhythmPattern[];
} = {
  normal:     ['action', 'strategy', 'problem'],
  botarhythm: ['psychology', 'coaching', 'strategy', 'problem'],
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
