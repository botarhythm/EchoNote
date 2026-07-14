import { NextRequest, NextResponse } from 'next/server';
import { getSessionsByClient } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S2S読み取りAPI: クライアント別セッションサマリー（コーチング資産）。
 * 伴走ボットがセッションの構造化サマリーを取得して文脈に活かすためのエンドポイント。
 *
 * 認証:
 *   Authorization: Bearer <ECHONOTE_READ_TOKEN>
 *
 * クエリ:
 *   ?limit=N  直近N件（デフォルト3・最大10）
 *
 * レスポンス:
 *   { ok: true, clientName, sessions: [<lean summary>] }  ※transcriptは含まない
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
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

  const { name } = await params;
  const clientName = decodeURIComponent(name);
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '3');
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 3, 1), 10);

  // 日付昇順で返ってくるので、直近limit件を新しい順に
  const sessions = await getSessionsByClient(clientName);
  const recent = sessions.slice(-limit).reverse();

  const lean = recent.map((s) => {
    const sum = s.summary!;
    return {
      id: s.id,
      date: s.meta.date,
      title: sum.title,
      sessionType: sum.sessionType,
      executiveSummary: sum.executiveSummary,
      decisions: sum.decisions,
      contractTopics: sum.contractTopics, // 契約・請求に関わる言及（伴走ボットの店主報告用）
      clientPains: sum.clientPains,
      adviceGiven: sum.adviceGiven,
      nextActions: sum.nextActions,
      homeworkForClient: sum.homeworkForClient,
      overallAssessment: sum.overallAssessment,
      // Botarhythmモードの深層分析（存在する場合のみ）
      sessionMoments: sum.sessionMoments,
      coachingInsights: sum.coachingInsights,
      underlyingThemes: sum.underlyingThemes,
      clientStateShift: sum.clientStateShift,
      nextSessionSuggestions: sum.nextSessionSuggestions,
    };
  });

  return NextResponse.json({ ok: true, clientName, sessions: lean });
}
