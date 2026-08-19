import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/api/sharefile/callback`;
}

function html(title: string, body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code        = searchParams.get('code');
  const subdomain   = searchParams.get('subdomain');
  const apicp       = searchParams.get('apicp');
  const error       = searchParams.get('error');
  const errorDesc   = searchParams.get('error_description');

  if (error) {
    return html('Error', `<h2>❌ Authentication error</h2><p>${errorDesc ?? error}</p>`);
  }

  if (!code) return new Response('Missing code', { status: 400 });

  const clientId     = process.env.SHAREFILE_CLIENT_ID;
  const clientSecret = process.env.SHAREFILE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response('ShareFile credentials not configured', { status: 500 });
  }

  const resolvedSubdomain = subdomain ?? process.env.SHAREFILE_SUBDOMAIN ?? 'forus-all';
  const resolvedApicp     = apicp ?? 'sharefile.com';
  const tokenUrl = `https://${resolvedSubdomain}.${resolvedApicp}/oauth/token`;

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  getRedirectUri(),
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return html('Error', `<h2>❌ Token exchange failed</h2><pre style="text-align:left">${text}</pre>`);
  }

  const json = await tokenRes.json() as {
    access_token: string; refresh_token: string; expires_in: number;
    subdomain?: string; apicp?: string;
  };

  const supabase = getSupabase();
  const { error: dbError } = await supabase.from('sharefile_tokens').upsert({
    id:            1,
    access_token:  json.access_token,
    refresh_token: json.refresh_token,
    expires_at:    new Date(Date.now() + json.expires_in * 1000).toISOString(),
    subdomain:     json.subdomain ?? resolvedSubdomain,
    apicp:         json.apicp ?? resolvedApicp,
  });

  if (dbError) {
    return html('Error', `<h2>❌ Failed to save token</h2><pre style="text-align:left">${dbError.message}</pre>`);
  }

  return html('ShareFile Connected', `
    <h2>✅ ShareFile connected successfully</h2>
    <p>The portal can now upload files to your folder. You can close this window.</p>
  `);
}
