import { NextRequest, NextResponse } from 'next/server';
import { generateSummary, jstDateOf } from '@/lib/claude';
import { getSession, updateStatus } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { fileId } = await request.json() as { fileId: string };
    if (!fileId) {
      return NextResponse.json({ error: 'fileId が必要です' }, { status: 400 });
    }

    const session = await getSession(fileId);
    if (!session) {
      return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
    }
    if (!session.transcript) {
      return NextResponse.json({ error: '文字起こしがまだ完了していません' }, { status: 400 });
    }

    await updateStatus(fileId, 'summarizing');

    // 投入日（Drive検知日時）を渡して日付の誤推定をガード
    const summary = await generateSummary(
      session.transcript,
      session.meta.originalFilename,
      jstDateOf(session.createdAt)
    );

    await updateStatus(fileId, 'done', {
      summary,
      processedAt: new Date().toISOString(),
    });

    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
