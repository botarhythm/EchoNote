import { NextRequest, NextResponse } from 'next/server';
import { createShare, getSession } from '@/lib/db';
import { generateAnonymizedSummary, anonymizeTranscript } from '@/lib/claude';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sessionId: string; maskedTerms?: string[] };
    const { sessionId, maskedTerms } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId が必要です' }, { status: 400 });
    }

    const session = await getSession(sessionId);
    if (!session || session.status !== 'done') {
      return NextResponse.json({ error: 'セッションが見つからないか未完了です' }, { status: 404 });
    }

    if (maskedTerms && maskedTerms.length > 0 && session.summary && session.transcript) {
      // プライバシー保護モード：匿名化して共有
      const [anonymizedSummary, anonymizedTranscript] = await Promise.all([
        generateAnonymizedSummary(session.summary, maskedTerms),
        Promise.resolve(anonymizeTranscript(session.transcript, maskedTerms)),
      ]);

      const token = await createShare(sessionId, {
        maskedTerms,
        anonymizedSummaryJson: JSON.stringify(anonymizedSummary),
        anonymizedTranscriptJson: JSON.stringify(anonymizedTranscript),
      });
      return NextResponse.json({ token, isAnonymized: true });
    }

    // 通常モード
    const token = await createShare(sessionId);
    return NextResponse.json({ token, isAnonymized: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'シェアリンク作成エラー' },
      { status: 500 }
    );
  }
}
