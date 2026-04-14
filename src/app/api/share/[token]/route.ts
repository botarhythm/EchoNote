import { NextRequest, NextResponse } from 'next/server';
import { getShareData } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const data = await getShareData(token);

  if (!data) {
    return NextResponse.json({ error: '共有リンクが無効です' }, { status: 404 });
  }

  const { session, isAnonymized, maskedTerms } = data;

  return NextResponse.json({
    session: {
      meta: session.meta,
      summary: session.summary,
      transcript: session.transcript,
      status: session.status,
    },
    isAnonymized,
    maskedTerms,
  });
}
