import { NextRequest, NextResponse } from 'next/server';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 認証不要なパス
  if (
    pathname.startsWith('/share/') ||
    pathname.startsWith('/api/share/') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/drive/poll') ||
    pathname.startsWith('/api/ingest') ||  // Bearerトークンで別途認証
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
  const expected = await hashPassword(adminPassword + 'echonote-salt');

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
