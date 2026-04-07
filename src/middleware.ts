import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 認証不要なパス
  if (
    pathname.startsWith('/share/') ||
    pathname.startsWith('/api/share/') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/drive/poll') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.next(); // パスワード未設定なら認証スキップ
  }

  const cookie = request.cookies.get('echonote-auth')?.value;
  const expected = hashPassword(adminPassword + 'echonote-salt');

  if (cookie === expected) {
    return NextResponse.next();
  }

  // API呼び出しは401を返す
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  // ページアクセスはログインにリダイレクト
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
