import { NextRequest, NextResponse } from 'next/server';
import { createShare, getSession } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json() as { sessionId: string };
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId が必要です' }, { status: 400 });
    }

    const session = await getSession(sessionId);
    if (!session || session.status !== 'done') {
      return NextResponse.json({ error: 'セッションが見つからないか未完了です' }, { status: 404 });
    }

    const token = await createShare(sessionId);
    return NextResponse.json({ token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'シェアリンク作成エラー' },
      { status: 500 }
    );
  }
}
