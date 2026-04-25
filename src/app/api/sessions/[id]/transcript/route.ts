import { NextRequest, NextResponse } from 'next/server';
import { getSessionTranscript } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const transcript = await getSessionTranscript(id);
  if (transcript === null) {
    return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  }
  // ETag/キャッシュ: transcript は更新時のみ変わる。クライアント側の楽観的更新と整合させるため
  // 強キャッシュは付けず、ブラウザ同一タブ内の再フェッチ抑制のみ no-cache でOK。
  return NextResponse.json(
    { transcript },
    { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } }
  );
}
