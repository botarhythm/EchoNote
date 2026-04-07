import { NextRequest, NextResponse } from 'next/server';
import { getSessionByShareToken } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await getSessionByShareToken(token);

  if (!session) {
    return NextResponse.json({ error: '共有リンクが無効です' }, { status: 404 });
  }

  return NextResponse.json({
    session: {
      meta: session.meta,
      summary: session.summary,
      transcript: session.transcript,
      status: session.status,
    },
  });
}
