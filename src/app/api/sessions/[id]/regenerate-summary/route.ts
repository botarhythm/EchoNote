import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateStatus } from '@/lib/db';
import { generateCustomSummary } from '@/lib/claude';
import type {
  SummaryOptions,
  SummaryMode,
  NormalDepth,
  NormalPattern,
  BotarhythmDepth,
  BotarhythmPattern,
  SpeakerNames,
} from '@/lib/types';
import { DEPTHS_BY_MODE, PATTERNS_BY_MODE } from '@/lib/types';

interface RegenerateRequestBody {
  mode?: SummaryMode;
  depth?: string;
  patterns?: string[];
  userNotes?: string;
  clientNotes?: string;
  speakerNames?: SpeakerNames;
}

function buildOptions(body: RegenerateRequestBody): SummaryOptions {
  const base = {
    userNotes: body.userNotes ?? '',
    clientNotes: body.clientNotes ?? '',
    speakerNames: body.speakerNames ?? { A: '', B: '' },
  };

  if (body.mode === 'botarhythm') {
    const allowedDepths = DEPTHS_BY_MODE.botarhythm;
    const allowedPatterns = PATTERNS_BY_MODE.botarhythm;
    const depth = (allowedDepths as string[]).includes(body.depth ?? '')
      ? (body.depth as BotarhythmDepth)
      : 'detailed';
    const patterns = (body.patterns ?? []).filter((p): p is BotarhythmPattern =>
      (allowedPatterns as string[]).includes(p)
    );
    return { mode: 'botarhythm', depth, patterns, ...base };
  }

  const allowedDepths = DEPTHS_BY_MODE.normal;
  const allowedPatterns = PATTERNS_BY_MODE.normal;
  const depth = (allowedDepths as string[]).includes(body.depth ?? '')
    ? (body.depth as NormalDepth)
    : 'standard';
  const patterns = (body.patterns ?? []).filter((p): p is NormalPattern =>
    (allowedPatterns as string[]).includes(p)
  );
  return { mode: 'normal', depth, patterns, ...base };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  }

  if (!session.transcript || session.transcript.length === 0) {
    return NextResponse.json({ error: '書き起こしデータがありません' }, { status: 400 });
  }

  const body = (await req.json()) as RegenerateRequestBody;
  const options = buildOptions(body);

  try {
    const summary = await generateCustomSummary(
      session.transcript,
      session.meta.originalFilename,
      options
    );

    await updateStatus(id, 'done', { summary });

    return NextResponse.json({ summary });
  } catch (err) {
    console.error('[EchoNote] サマリー再生成エラー:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'サマリー生成に失敗しました' },
      { status: 500 }
    );
  }
}
