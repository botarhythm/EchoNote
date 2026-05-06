import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 講師用の自習室URLを発行する。
 * 講師キーをクライアントバンドルに含めないよう、サーバー側で組み立ててから返す。
 *
 * レスポンス: { url: "https://.../?role=instructor&key=..." }
 */
export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_DIGIHARA_BASE_URL ||
    process.env.DIGIHARA_BASE_URL ||
    '';
  const key = process.env.DIGIHARA_INSTRUCTOR_KEY || '';

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_DIGIHARA_BASE_URL が未設定です' },
      { status: 503 }
    );
  }
  if (!key) {
    return NextResponse.json(
      { error: 'DIGIHARA_INSTRUCTOR_KEY が未設定です' },
      { status: 503 }
    );
  }

  const url = new URL(baseUrl);
  url.searchParams.set('role', 'instructor');
  url.searchParams.set('key', key);

  return NextResponse.json({ url: url.toString() });
}
