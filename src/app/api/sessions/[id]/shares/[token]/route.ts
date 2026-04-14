import { NextRequest, NextResponse } from 'next/server';
import { revokeShare } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; token: string }> }
) {
  const { token } = await params;
  await revokeShare(token);
  return NextResponse.json({ ok: true });
}
