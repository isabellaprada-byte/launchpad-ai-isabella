import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that must stay public — no session required
const PUBLIC_PREFIXES = [
  '/upload',
  '/api/census/',
  '/api/auth/',
  '/login',
  '/_next/',
  '/favicon',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const session = request.cookies.get('dashboard_session')?.value;
  const secret = process.env.SESSION_SECRET;

  if (!secret || session !== secret) {
    // API calls → 401 JSON, page navigations → redirect to /login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
