import { NextResponse } from 'next/server';
import { poll } from '@/lib/poller';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await poll();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Drive接続エラー' },
      { status: 500 }
    );
  }
}
