import { NextRequest, NextResponse } from 'next/server';
import { getSharesBySession } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const shares = await getSharesBySession(id);
  return NextResponse.json({ shares });
}
