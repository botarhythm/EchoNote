import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateStatus } from '@/lib/db';
import { generateCustomSummary } from '@/lib/claude';
import type { SummaryOptions } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(params.id);
  if (!session) {
    return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  }

  if (!session.transcript || session.transcript.length === 0) {
    return NextResponse.json({ error: '書き起こしデータがありません' }, { status: 400 });
  }

  const body = (await req.json()) as Partial<SummaryOptions>;
  const options: SummaryOptions = {
    depth: body.depth ?? 'standard',
    patterns: body.patterns ?? [],
    userNotes: body.userNotes ?? '',
    clientNotes: body.clientNotes ?? '',
    speakerNames: body.speakerNames ?? { A: 'もっちゃん', B: '' },
  };

  try {
    const summary = await generateCustomSummary(
      session.transcript,
      session.meta.originalFilename,
      options
    );

    await updateStatus(params.id, 'done', { summary });

    return NextResponse.json({ summary });
  } catch (err) {
    console.error('[EchoNote] サマリー再生成エラー:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'サマリー生成に失敗しました' },
      { status: 500 }
    );
  }
}
