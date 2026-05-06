/**
 * EchoNote のブランドモード設定。
 *
 * デフォルトでは EchoNote は「汎用議事録モード（PlaudNote風）」のみが有効で、
 * 各 EchoNote インスタンスはブランドモードを opt-in で有効化できる。
 *
 * 設定の保存先は以下の優先順位:
 *   1. DB（brand_settings テーブル・1行のみ）
 *   2. 環境変数（DB に行が無い場合の初期値・互換用フォールバック）
 *
 * 通常運用では管理画面（管理モード → ブランド設定パネル）から編集する。
 * env はあくまでブートストラップ用。設定の変更ごとに再デプロイが要らない。
 */

import { getBrandSettings } from './db';

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

/** env から bootstrap 用の初期値を読み込む（DB に行が無い場合のフォールバック） */
function getEnvFallbackConfig(): BrandConfig | null {
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

/**
 * ブランド設定を取得する。DB → env の優先順位。
 * DB の行が存在し enabled=true なら DB の値、無いか未保存なら env、それも無ければ null。
 */
export async function getBrandConfig(): Promise<BrandConfig | null> {
  // 1. DB を優先
  const dbRow = await getBrandSettings();
  if (dbRow && dbRow.enabled && dbRow.name && dbRow.hostName) {
    const hostKeywords = (dbRow.hostKeywords || dbRow.hostName)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      name: dbRow.name,
      shortName: dbRow.shortName || dbRow.name,
      hostName: dbRow.hostName,
      hostFullName: dbRow.hostFullName || dbRow.hostName,
      hostKeywords,
      philosophy: dbRow.philosophy,
      approach: dbRow.approach,
      hostStrength: dbRow.hostStrength,
      sessionFlow: dbRow.sessionFlow,
      modeLabel: dbRow.modeLabel || `${dbRow.name}セッション`,
    };
  }

  // 2. env フォールバック（DB未保存の初回起動時など）
  return getEnvFallbackConfig();
}

export async function isBrandModeEnabled(): Promise<boolean> {
  return (await getBrandConfig()) !== null;
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

export async function getPublicBrandInfo(): Promise<PublicBrandInfo> {
  const config = await getBrandConfig();
  if (!config) return { enabled: false };
  return {
    enabled: true,
    name: config.name,
    shortName: config.shortName,
    hostName: config.hostName,
    modeLabel: config.modeLabel,
  };
}
