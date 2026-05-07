import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * セッションホスト用URLへリダイレクトするエンドポイント。
 *
 * フロントから直接 <a href="/api/jishushitsu/start" target="_blank"> でリンクすれば、
 * ブラウザがリダイレクト先（digihara のホストURL）で新タブを開く。
 *
 * fetch + window.open() のパターンだとポップアップブロックされるため、
 * このリダイレクト型に切り替えている。
 *
 * ホストキーは環境変数からサーバー側のみで読み込み、クライアントバンドルには含まれない。
 */
export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_DIGIHARA_BASE_URL ||
    process.env.DIGIHARA_BASE_URL ||
    '';
  const key = process.env.DIGIHARA_INSTRUCTOR_KEY || '';

  if (!baseUrl || !key) {
    return NextResponse.json(
      {
        error:
          'NEXT_PUBLIC_DIGIHARA_BASE_URL または DIGIHARA_INSTRUCTOR_KEY が未設定です',
      },
      { status: 503 }
    );
  }

  const target = new URL(baseUrl);
  target.searchParams.set('role', 'instructor');
  target.searchParams.set('key', key);

  return NextResponse.redirect(target.toString(), 302);
}
