import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession, updateStatus } from '@/lib/db';
import { retrySession } from '@/lib/poller';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await retrySession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '再処理に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  }

  const body = (await request.json()) as { title?: string };
  if (typeof body.title === 'string' && session.summary) {
    const updatedSummary = { ...session.summary, title: body.title.trim() };
    await updateStatus(id, session.status, { summary: updatedSummary });
    return NextResponse.json({ ok: true, title: updatedSummary.title });
  }

  return NextResponse.json({ error: '更新するデータがありません' }, { status: 400 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await deleteSession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '削除に失敗しました' },
      { status: 500 }
    );
  }
}
