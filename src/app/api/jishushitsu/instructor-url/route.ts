import { NextRequest, NextResponse } from 'next/server';
import {
  JishushitsuConfigError,
  issueJishushitsuInvite,
  parseInitialRec,
} from '@/lib/jishushitsu-invite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 講師用ワンタイム URL を JSON で返す。
 *
 * - サーバー側で Jishushitsu の `/api/invite-token` (instructor) を発行
 * - レスポンス: { url, expiresAt, initialRec }
 *
 * クエリ:
 *   ?rec=audio|screen|both|off  入室直後に自動 ON にしたい録音/録画
 */
export async function GET(request: NextRequest) {
  const rec = parseInitialRec(request.nextUrl.searchParams.get('rec'));
  try {
    const invite = await issueJishushitsuInvite({
      role: 'instructor',
      initialRec: rec,
    });
    return NextResponse.json({
      url: invite.url,
      expiresAt: invite.expiresAt,
      initialRec: invite.initialRec,
    });
  } catch (err) {
    const status = err instanceof JishushitsuConfigError ? 503 : 502;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status });
  }
}
