import { NextRequest, NextResponse } from 'next/server';
import { getSessionsByClient } from '@/lib/db';
import { generateCrossAnalysis } from '@/lib/claude';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const clientName = decodeURIComponent(name);

  const sessions = await getSessionsByClient(clientName);

  if (sessions.length < 2) {
    return NextResponse.json(
      { error: `クロス分析には2セッション以上必要です（現在: ${sessions.length}件）` },
      { status: 400 }
    );
  }

  // サマリーが存在するセッションのみ対象
  const validSessions = sessions
    .filter((s) => s.summary)
    .map((s) => ({ id: s.id, date: s.meta.date, summary: s.summary! }));

  if (validSessions.length < 2) {
    return NextResponse.json(
      { error: 'サマリー生成済みのセッションが2件未満です' },
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
