import { NextRequest, NextResponse } from 'next/server';
import {
  JishushitsuConfigError,
  issueJishushitsuInvite,
  parseInitialRec,
} from '@/lib/jishushitsu-invite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 受講生用ワンタイム URL を JSON で返す。
 *
 * - サーバー側で Jishushitsu の `/api/invite-token` (student) を発行
 * - レスポンス: { url, expiresAt, initialRec }
 *
 * クエリ:
 *   ?rec=audio|screen|both|off  入室直後に自動 ON にしたい録音/録画
 *                                受講生は通常 off (録音/録画は講師側操作)
 */
export async function GET(request: NextRequest) {
  const rec = parseInitialRec(request.nextUrl.searchParams.get('rec'));
  try {
    const invite = await issueJishushitsuInvite({
      role: 'student',
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
