import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function POST(request: NextRequest) {
  const { password } = await request.json() as { password: string };
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: '認証が設定されていません' }, { status: 500 });
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 });
  }

  const token = hashPassword(adminPassword + 'echonote-salt');
  const res = NextResponse.json({ ok: true });
  res.cookies.set('echonote-auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30日
  });

  return res;
}

export async function GET(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ authenticated: true });
  }

  const cookie = request.cookies.get('echonote-auth')?.value;
  const expected = hashPassword(adminPassword + 'echonote-salt');

  return NextResponse.json({ authenticated: cookie === expected });
}
