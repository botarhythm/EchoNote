import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/db';
import { suggestPrivacyTerms } from '@/lib/claude';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = await getSession(id);
    if (!session?.summary || !session?.transcript) {
      return NextResponse.json({ terms: [] });
    }

    const terms = await suggestPrivacyTerms(session.summary, session.transcript);
    return NextResponse.json({ terms });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '提案生成エラー' },
      { status: 500 }
    );
  }
}
