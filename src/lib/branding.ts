/**
 * EchoNote のブランドモード設定。
 *
 * デフォルトでは EchoNote は「ノーマル議事録モード」のみが有効で、
 * PlaudNote 風の汎用的な要約を生成する。
 *
 * 各 EchoNote インスタンスは環境変数を通じて、自分のブランド／提供者向けの
 * 「ブランドモード」（深層分析モード）を opt-in で有効化できる。
 *
 * 例（Botarhythm Studio が有効化する場合）:
 *   NEXT_PUBLIC_BRAND_MODE_ENABLED=true
 *   NEXT_PUBLIC_BRAND_LABEL=Botarhythmセッション
 *   BRAND_NAME=Botarhythm Studio
 *   BRAND_SHORT_NAME=ボタリズム
 *   BRAND_HOST_NAME=もっちゃん
 *   BRAND_HOST_FULL_NAME=元沢信昭
 *   BRAND_HOST_KEYWORDS=もっちゃん,元沢
 *   BRAND_PHILOSOPHY=「依存させない」——クライアントが自走できる状態が最終目標
 *   BRAND_APPROACH=丸投げでなく伴走型。クライアントの現場感を尊重しながら変革を促す
 *   BRAND_HOST_STRENGTH=当事者目線でデジタル変革の痛みに共感し、実践的な処方箋を示す
 *   BRAND_SESSION_FLOW=課題の明確化 → 認知の拡張 → 行動への落とし込み
 */

export interface BrandConfig {
  /** ブランド名（例: "Botarhythm Studio"） */
  name: string;
  /** 短縮ブランド名（タイトル用、例: "ボタリズム"） */
  shortName: string;
  /** 提供者の通称（例: "もっちゃん"） */
  hostName: string;
  /** 提供者のフルネーム（例: "元沢信昭"） */
  hostFullName: string;
  /** 提供者の検出用キーワード（話者自動検出に使う） */
  hostKeywords: string[];
  /** ブランド哲学の説明（システムプロンプトに埋め込む） */
  philosophy: string;
  /** アプローチの説明 */
  approach: string;
  /** 提供者の強み・特徴 */
  hostStrength: string;
  /** セッションの典型的な流れ */
  sessionFlow: string;
  /** UI 表示用のモードラベル（例: "Botarhythmセッション"） */
  modeLabel: string;
}

/**
 * 環境変数からブランド設定を読み込む。
 * BRAND_MODE_ENABLED が "true" でない、または必須項目（NAME / HOST_NAME）が未設定なら null。
 */
export function getBrandConfig(): BrandConfig | null {
  const enabled =
    process.env.NEXT_PUBLIC_BRAND_MODE_ENABLED === 'true' ||
    process.env.BRAND_MODE_ENABLED === 'true';
  if (!enabled) return null;

  const name = process.env.BRAND_NAME?.trim();
  const hostName = process.env.BRAND_HOST_NAME?.trim();
  if (!name || !hostName) return null;

  const keywordsRaw = process.env.BRAND_HOST_KEYWORDS?.trim() || hostName;
  const hostKeywords = keywordsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    name,
    shortName: process.env.BRAND_SHORT_NAME?.trim() || name,
    hostName,
    hostFullName: process.env.BRAND_HOST_FULL_NAME?.trim() || hostName,
    hostKeywords,
    philosophy: process.env.BRAND_PHILOSOPHY?.trim() || '',
    approach: process.env.BRAND_APPROACH?.trim() || '',
    hostStrength: process.env.BRAND_HOST_STRENGTH?.trim() || '',
    sessionFlow: process.env.BRAND_SESSION_FLOW?.trim() || '',
    modeLabel:
      process.env.NEXT_PUBLIC_BRAND_LABEL?.trim() ||
      process.env.BRAND_MODE_LABEL?.trim() ||
      `${name}セッション`,
  };
}

export function isBrandModeEnabled(): boolean {
  return getBrandConfig() !== null;
}

/**
 * クライアントから参照する用の最小情報。
 * （話者デフォルト名や UI ラベルなど、機密でないものに限る）
 */
export interface PublicBrandInfo {
  enabled: boolean;
  name?: string;
  shortName?: string;
  hostName?: string;
  modeLabel?: string;
}

export function getPublicBrandInfo(): PublicBrandInfo {
  const config = getBrandConfig();
  if (!config) return { enabled: false };
  return {
    enabled: true,
    name: config.name,
    shortName: config.shortName,
    hostName: config.hostName,
    modeLabel: config.modeLabel,
  };
}
