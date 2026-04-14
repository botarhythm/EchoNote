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

  const body = (await request.json()) as {
    title?: string;
    clientName?: string;
    date?: string;
  };

  const updates: Parameters<typeof updateStatus>[2] = {};

  if (typeof body.title === 'string' && session.summary) {
    updates.summary = { ...session.summary, title: body.title.trim() };
  }

  if (typeof body.clientName === 'string' || typeof body.date === 'string') {
    updates.meta = {
      ...session.meta,
      ...(typeof body.clientName === 'string' && { clientName: body.clientName.trim() }),
      ...(typeof body.date === 'string' && { date: body.date.trim() }),
    };
    // summaryのclientName/dateも同期
    if (session.summary) {
      updates.summary = {
        ...(updates.summary ?? session.summary),
        ...(typeof body.clientName === 'string' && { clientName: body.clientName.trim() }),
        ...(typeof body.date === 'string' && { date: body.date.trim() }),
      };
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '更新するデータがありません' }, { status: 400 });
  }

  await updateStatus(id, session.status, updates);
  return NextResponse.json({ ok: true });
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
