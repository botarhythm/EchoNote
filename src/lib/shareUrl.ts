/**
 * 共有リンクのURL生成。
 * NEXT_PUBLIC_SHARE_BASE_URL（例: https://share.studio.botarhythm.com）が
 * 設定されていれば独自ドメインで発行し、未設定なら現在のオリジンを使う。
 * 旧ドメインで開かれた発行済みリンクは proxy.ts が独自ドメインへリダイレクトする。
 */
export function buildShareUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SHARE_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/+$/, '')}/share/${token}`;
}
