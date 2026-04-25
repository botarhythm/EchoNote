import { NextRequest, NextResponse } from 'next/server';
import { getSessionsByClient } from '@/lib/db';
import { generateCrossAnalysis } from '@/lib/claude';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const clientName = decodeURIComponent(name);

  // 任意でリクエストボディから対象セッションIDを受け取る（未指定なら全件対象）
  let sessionIds: string[] | undefined;
  try {
    const body = (await request.json()) as { sessionIds?: string[] };
    if (Array.isArray(body.sessionIds) && body.sessionIds.length > 0) {
      sessionIds = body.sessionIds;
    }
  } catch {
    // body 無し（後方互換）
  }

  const allSessions = await getSessionsByClient(clientName);

  if (allSessions.length < 2) {
    return NextResponse.json(
      { error: `クロス分析には2セッション以上必要です（現在: ${allSessions.length}件）` },
      { status: 400 }
    );
  }

  // サマリーが存在するセッションのみ対象。sessionIds 指定時はそれで絞り込み
  const validSessions = allSessions
    .filter((s) => s.summary)
    .filter((s) => !sessionIds || sessionIds.includes(s.id))
    .map((s) => ({ id: s.id, date: s.meta.date, summary: s.summary! }));

  if (validSessions.length < 2) {
    return NextResponse.json(
      {
        error: sessionIds
          ? `選択されたセッションのうち、サマリー生成済みは ${validSessions.length} 件のみです（2件以上必要）`
          : 'サマリー生成済みのセッションが2件未満です',
      },
      { status: 400 }
    );
  }

  try {
    const analysis = await generateCrossAnalysis(clientName, validSessions);
    return NextResponse.json({ analysis });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'クロス分析に失敗しました' },
      { status: 500 }
    );
  }
}
