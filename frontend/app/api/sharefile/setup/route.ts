import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/api/sharefile/callback`;
}

export async function GET() {
  const clientId = process.env.SHAREFILE_CLIENT_ID;
  if (!clientId) {
    return new Response('SHAREFILE_CLIENT_ID not configured', { status: 500 });
  }

  const state = randomBytes(16).toString('hex');

  const authUrl = new URL('https://secure.sharefile.com/oauth/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', getRedirectUri());
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('sf_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
