import { NextRequest, NextResponse } from 'next/server';
import { saveScreenshot } from '@/lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S2S書込API: 伴走ボットが解析済みスクショを Drive のクライアント別フォルダへアーカイブする。
 * Processed/{clientName}/screenshots/ に 画像＋.json サイドカー（解析結果）をペア保存する。
 *
 * 認証: Authorization: Bearer <ECHONOTE_S2S_WRITE_TOKEN>（書込専用・読取とは分離）
 * ボディ: { clientName, imageBase64, mediaType, description, capturedAt }
 */
export async function POST(request: NextRequest) {
  const expected = process.env.ECHONOTE_S2S_WRITE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 's2s screenshots 無効（ECHONOTE_S2S_WRITE_TOKEN 未設定）' },
      { status: 503 }
    );
  }
  const authHeader = request.headers.get('authorization') || '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    clientName?: string;
    imageBase64?: string;
    mediaType?: string;
    description?: string;
    capturedAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSONボディが必要です' }, { status: 400 });
  }

  const clientName = (body.clientName ?? '').trim();
  const imageBase64 = body.imageBase64 ?? '';
  const mediaType = body.mediaType ?? '';
  if (!clientName || !imageBase64 || !mediaType) {
    return NextResponse.json(
      { error: 'clientName, imageBase64, mediaType が必要です' },
      { status: 400 }
    );
  }

  try {
    const fileId = await saveScreenshot({
      clientName,
      imageBase64,
      mediaType,
      description: body.description ?? '',
      capturedAt: body.capturedAt ?? '',
    });
    return NextResponse.json({ ok: true, fileId });
  } catch (err) {
    console.error('[s2s/screenshots] 保存失敗:', err);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}
