import { NextRequest, NextResponse } from 'next/server';
import { updateSessionClientName } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S2S書込API: セッションを指定クライアントに割り当て直す。
 * 伴走ボットが「直近の録音を〇〇さんのコーチングに紐づけて」を実行するためのエンドポイント。
 * 録音ファイル名の規約に依存せず、後からclient_nameを正す運用を可能にする。
 *
 * 認証: Authorization: Bearer <ECHONOTE_READ_TOKEN>（S2S同一信頼圏のため読取と共通）
 * ボディ: { "clientName": "みおり" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const expected = process.env.ECHONOTE_READ_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 's2s API 無効（ECHONOTE_READ_TOKEN 未設定）' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let clientName = '';
  try {
    const body = (await request.json()) as { clientName?: string };
    clientName = (body.clientName ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'JSONボディが必要です' }, { status: 400 });
  }
  if (!clientName) {
    return NextResponse.json({ error: 'clientName が必要です' }, { status: 400 });
  }

  const updated = await updateSessionClientName(id, clientName);
  if (!updated) {
    return NextResponse.json({ error: `セッション ${id} が見つかりません` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id, clientName });
}
