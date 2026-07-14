import { NextRequest, NextResponse } from 'next/server';
import { getShareData, getClientSettings } from '@/lib/db';
import { toClientFacingSummary, type SpeakerNames } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const data = await getShareData(token);

  if (!data) {
    return NextResponse.json({ error: '共有リンクが無効です' }, { status: 404 });
  }

  const { session, isAnonymized, maskedTerms } = data;

  // 話者名（匿名化共有の場合は実名を出さない）
  let speakerNames: SpeakerNames | undefined;
  if (!isAnonymized) {
    try {
      const settings = await getClientSettings(session.meta.clientName);
      speakerNames = {
        A: settings.speakerA || 'もっちゃん',
        B: settings.speakerB || session.meta.clientName,
      };
    } catch {
      // 設定が取れなくても共有ページ自体は表示する
    }
  }

  return NextResponse.json({
    session: {
      meta: session.meta,
      // クライアントに見せる資料なので、コーチ側の戦略・分析フィールドは配信しない
      summary: session.summary ? toClientFacingSummary(session.summary) : session.summary,
      status: session.status,
    },
    speakerNames,
    isAnonymized,
    maskedTerms,
  });
}
