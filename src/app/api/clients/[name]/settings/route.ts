import { NextRequest, NextResponse } from 'next/server';
import { getClientSettings, upsertClientSettings } from '@/lib/db';
import type { ClientSettings } from '@/lib/types';
import { getBrandConfig } from '@/lib/branding';

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

  const brand = await getBrandConfig();
  await upsertClientSettings({
    clientName,
    notes: body.notes ?? '',
    speakerA: body.speakerA ?? brand?.hostName ?? '',
    speakerB: body.speakerB ?? '',
  });

  const updated = await getClientSettings(clientName);
  return NextResponse.json({ settings: updated });
}
