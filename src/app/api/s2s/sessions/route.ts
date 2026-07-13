import { NextRequest, NextResponse } from 'next/server';
import { getAllSessionsLite } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S2S読み取りAPI: 直近セッション一覧（クライアント不問）。
 * 伴走ボットが「直近の録音を〇〇さんに紐づけて」を実現するための候補取得に使う。
 *
 * 認証: Authorization: Bearer <ECHONOTE_READ_TOKEN>
 * クエリ: ?limit=N（デフォルト5・最大20）
 */
export async function GET(request: NextRequest) {
  const expected = process.env.ECHONOTE_READ_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 's2s API 無効（ECHONOTE_READ_TOKEN 未設定）' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '5');
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 5, 1), 20);

  const sessions = await getAllSessionsLite();
  const lean = sessions.slice(0, limit).map((s) => ({
    id: s.id,
    filename: s.meta.originalFilename,
    clientName: s.meta.clientName,
    date: s.meta.date,
    status: s.status,
    title: s.summary?.title ?? null,
  }));
  return NextResponse.json({ ok: true, sessions: lean });
}
