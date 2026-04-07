import { NextResponse } from 'next/server';
import { getAllSessions } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = await getAllSessions();
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'DB読み取りエラー' },
      { status: 500 }
    );
  }
}
