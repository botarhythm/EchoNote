import { NextRequest, NextResponse } from 'next/server';
import { getSessionsWithContractTopics } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S2S読み取りAPI: 契約トピックを含むセッション一覧。
 * Insight-Scope の同期スクリプト（echonote_contract_sync）が請求書発行の論拠として
 * 取り込むためのエンドポイント。金額を含むため通常のセッション一覧とは分離している。
 *
 * 認証: Authorization: Bearer <ECHONOTE_READ_TOKEN>
 * クエリ:
 *   ?since=YYYY-MM-DD  処理完了日がこの日以降のセッションのみ（増分同期用）
 *   ?limit=N           最大件数（デフォルト50・最大200）
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

  const since = request.nextUrl.searchParams.get('since') ?? undefined;
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

  const sessions = await getSessionsWithContractTopics({ since, limit });
  const lean = sessions.map((s) => ({
    id: s.id,
    clientName: s.meta.clientName,
    date: s.meta.date,
    filename: s.meta.originalFilename,
    title: s.summary?.title ?? null,
    sessionType: s.summary?.sessionType ?? null,
    contractTopics: s.summary?.contractTopics ?? [],
    decisions: s.summary?.decisions ?? [],
    keyNumbers: s.summary?.keyNumbers ?? [],
    processedAt: s.processedAt ?? null,
    createdAt: s.createdAt ?? null,
  }));

  return NextResponse.json({ ok: true, count: lean.length, sessions: lean });
}
