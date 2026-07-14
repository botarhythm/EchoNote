// セッションの処理状態
export type SessionStatus =
  | 'pending'      // Drive検知済み・未処理
  | 'transcribing' // Gemini処理中
  | 'summarizing'  // Claude処理中
  | 'done'         // 完了
  | 'error'        // エラー
  | 'duplicate';   // 既存録音と同一内容（AI処理をスキップ）

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

// 契約・請求に関わるトピック（Insight-Scope の請求書発行論拠として同期される）
export interface ContractTopic {
  type: '新規契約' | '料金合意' | 'スコープ変更' | '支払条件' | '解約・保留' | 'その他';
  description: string; // 何が合意・協議されたか（当事者と内容がわかる1〜2文）
  amount?: string;     // 言及された金額（例: "¥105,600"・"月5万円"）
  timeline?: string;   // 期間・開始時期・支払期日など
  agreed: boolean;     // true=確定合意 / false=提案・協議中
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
  contractTopics?: ContractTopic[];      // 契約・請求に関わる言及（IS請求論拠・旧データにはない）
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

/**
 * クライアント共有向けサマリー：コーチ側の戦略・分析にあたるフィールドを除去する。
 * 共有APIの配信前に適用し、ブラウザに届くJSON自体からコーチ視点の情報を消す。
 */
export function toClientFacingSummary(summary: SessionSummary): SessionSummary {
  const client: SessionSummary = { ...summary, mode: 'normal' };
  delete client.sessionMoments;
  delete client.coachingInsights;
  delete client.underlyingThemes;
  delete client.clientStateShift;
  delete client.nextSessionSuggestions;
  delete client.contractTopics;
  return client;
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

/** 深度ごとの結果イメージ（再生成UIのボタン解説）。プロンプト指示の要点と一致させること */
export const DEPTH_DESCRIPTIONS: {
  normal: Record<NormalDepth, string>;
  botarhythm: Record<BotarhythmDepth, string>;
} = {
  normal: {
    simple:   '要点だけを2〜3項目に絞った、2分で読める短い議事録',
    standard: '論点・決定事項・アクションを一通り押さえた実用議事録',
    detailed: '背景や根拠まで記録し、欠席者の後読みにも耐える詳細版',
  },
  botarhythm: {
    standard: '全体像の整理が中心。深層分析は最小限の軽めサマリー',
    detailed: '転換点・深層テーマ・次回提案を必ず含む本格レポート',
    deep:     '心理変化やコーチング効果まで読み込む、最も濃い徹底分析',
  },
};

/** 重点パターンごとの結果イメージ（再生成UIのボタン解説） */
export const PATTERN_DESCRIPTIONS: Record<SummaryPattern, string> = {
  action:     '「誰が・何を・いつまでに」を具体化したTODO中心のまとめに',
  psychology: '感情・心理的ブロック・セッション中の変化を重点的に描写',
  coaching:   'コーチの質問やリフレームがどう効いたかを場面ごとに評価',
  strategy:   '提案をビジネスインパクトと優先度で整理し、構造的問題を特定',
  problem:    '課題を表面症状→背景→根本原因の3層に掘り下げて整理',
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
  createdAt?: string;      // Drive検知＝DB登録日時（投入日の特定に使う。旧データにはない）
  contentHash?: string;    // 音声内容のMD5（Driveのmd5Checksumと一致）。重複検知に使う
  duplicateOf?: string;    // status='duplicate' のとき、元セッションのID
}
