import { NextResponse } from 'next/server';
import { getPublicBrandInfo } from '@/lib/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 公開可能なブランド情報を返す。
 * UI から「ブランドモードが有効か」「表示用のホスト名・モードラベル」などを取得するのに使う。
 *
 * レスポンス: { enabled: boolean, name?, shortName?, hostName?, modeLabel? }
 */
export async function GET() {
  return NextResponse.json(await getPublicBrandInfo());
}
