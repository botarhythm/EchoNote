import { NextRequest, NextResponse } from 'next/server';
import { getClientSettings, upsertClientSettings } from '@/lib/db';
import type { ClientSettings } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const clientName = decodeURIComponent(name);
  const settings = await getClientSettings(clientName);
  return NextResponse.json({ settings });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const clientName = decodeURIComponent(name);
  const body = (await req.json()) as Partial<ClientSettings>;

  await upsertClientSettings({
    clientName,
    notes: body.notes ?? '',
    speakerA: body.speakerA ?? 'もっちゃん',
    speakerB: body.speakerB ?? '',
  });

  const updated = await getClientSettings(clientName);
  return NextResponse.json({ settings: updated });
}
