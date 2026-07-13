import { NextRequest, NextResponse } from 'next/server';
import { getAllSessionsLite } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S2S読み取りAPI: クライアント一覧（外部の伴走ボット等がセッション資産を参照するための入口）。
 *
 * 認証:
 *   Authorization: Bearer <ECHONOTE_READ_TOKEN>
 *   （書き込み用 ECHONOTE_INGEST_TOKEN とは別トークン。読み取り専用の権限分離）
 *
 * レスポンス:
 *   { ok: true, clients: [{ name, sessionCount, lastSessionDate }] }
 */
export async function GET(request: NextRequest) {
  const expected = process.env.ECHONOTE_READ_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 's2s read API は無効化されています（ECHONOTE_READ_TOKEN 未設定）' },
      { status: 503 }
    );
  }
  const authHeader = request.headers.get('authorization') || '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessions = await getAllSessionsLite();
  const byClient = new Map<string, { name: string; sessionCount: number; lastSessionDate: string }>();
  for (const s of sessions) {
    if (s.status !== 'done' || !s.summary) continue;
    const name = s.meta.clientName;
    const entry = byClient.get(name) ?? { name, sessionCount: 0, lastSessionDate: '' };
    entry.sessionCount++;
    if (s.meta.date > entry.lastSessionDate) entry.lastSessionDate = s.meta.date;
    byClient.set(name, entry);
  }

  return NextResponse.json({ ok: true, clients: [...byClient.values()] });
}
