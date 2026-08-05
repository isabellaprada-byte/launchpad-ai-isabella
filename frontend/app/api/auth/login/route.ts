import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password, next } = await req.json() as { password?: string; next?: string };

  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!dashboardPassword || !sessionSecret) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  if (password !== dashboardPassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const redirectTo = next && next.startsWith('/') && !next.startsWith('/login') ? next : '/';

  const response = NextResponse.json({ ok: true, redirectTo });
  response.cookies.set('dashboard_session', sessionSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return response;
}
