import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/db';

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
