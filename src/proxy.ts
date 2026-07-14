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

  // ── 共有リンクの独自ドメイン対応（NEXT_PUBLIC_SHARE_BASE_URL 設定時のみ有効） ──
  const shareBase = process.env.NEXT_PUBLIC_SHARE_BASE_URL;
  if (shareBase) {
    const shareHost = new URL(shareBase).host;
    // nextUrl.host はバインド先を返すため、実際にリクエストされたホストはヘッダから取る
    const host =
      request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
    const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');

    // 旧ドメインで開かれた共有リンクは独自ドメインへ恒久リダイレクト（発行済みリンクの互換維持）
    if (!isLocalhost && host !== shareHost && pathname.startsWith('/share/')) {
      return NextResponse.redirect(
        new URL(pathname + request.nextUrl.search, shareBase),
        308
      );
    }

    // 共有ドメインでは共有ページと必要なAPI・アセット以外を出さない。
    // ルート等にアクセスされたらStudioサイトへ誘導し、管理画面をこのドメインに露出させない
    if (
      host === shareHost &&
      !pathname.startsWith('/share/') &&
      !pathname.startsWith('/api/share/') &&
      !pathname.startsWith('/_next/') &&
      !pathname.startsWith('/avatars/') &&
      pathname !== '/favicon.ico'
    ) {
      return NextResponse.redirect('https://studio.botarhythm.com', 307);
    }
  }

  // 認証不要なパス
  if (
    pathname.startsWith('/share/') ||
    pathname.startsWith('/api/share/') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/drive/poll') ||
    pathname.startsWith('/api/ingest') ||  // Bearerトークンで別途認証
    pathname.startsWith('/api/s2s/') ||    // Bearerトークン(ECHONOTE_READ_TOKEN)で別途認証
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
