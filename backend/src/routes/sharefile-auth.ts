import { FastifyInstance } from 'fastify';
import { getSupabase } from '../services/supabase';

const REDIRECT_URI = `${process.env.BACKEND_PUBLIC_URL ?? 'http://localhost:4000'}/api/sharefile/callback`;

export async function sharefileAuthRoutes(app: FastifyInstance) {

  // Step 1 — Isabella opens this URL once to start the auth flow
  app.get('/api/sharefile/setup', async (req, reply) => {
    const clientId = process.env.SHAREFILE_CLIENT_ID;
    if (!clientId) return reply.status(500).send('SHAREFILE_CLIENT_ID not configured');

    const authUrl = new URL('https://secure.sharefile.com/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);

    return reply.redirect(authUrl.toString());
  });

  // Step 2 — ShareFile redirects here after Isabella logs in
  app.get('/api/sharefile/callback', async (req, reply) => {
    const { code, subdomain, apicp, error, error_description } = req.query as Record<string, string>;

    if (error) {
      return reply.type('text/html').send(
        `<html><body style="font-family:sans-serif;padding:40px">
          <h2>❌ Error de autenticación</h2>
          <p>${error_description ?? error}</p>
        </body></html>`
      );
    }

    if (!code) return reply.status(400).send('Missing code');

    const clientId     = process.env.SHAREFILE_CLIENT_ID;
    const clientSecret = process.env.SHAREFILE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return reply.status(500).send('ShareFile credentials not configured');

    const resolvedSubdomain = subdomain ?? process.env.SHAREFILE_SUBDOMAIN ?? 'forus-all';
    const resolvedApicp     = apicp ?? 'sharefile.com';
    const tokenUrl = `https://${resolvedSubdomain}.${resolvedApicp}/oauth/token`;

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return reply.type('text/html').send(
        `<html><body style="font-family:sans-serif;padding:40px">
          <h2>❌ Error al obtener token</h2><pre>${text}</pre>
        </body></html>`
      );
    }

    const json = await res.json() as {
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
      return reply.type('text/html').send(
        `<html><body style="font-family:sans-serif;padding:40px">
          <h2>❌ Error al guardar token</h2><pre>${dbError.message}</pre>
        </body></html>`
      );
    }

    return reply.type('text/html').send(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>✅ ShareFile conectado exitosamente</h2>
        <p>El portal ya puede subir archivos a tu carpeta. Puedes cerrar esta ventana.</p>
      </body></html>`
    );
  });

  // Status check
  app.get('/api/sharefile/status', async (req, reply) => {
    const supabase = getSupabase();
    const { data } = await supabase.from('sharefile_tokens').select('expires_at, subdomain').eq('id', 1).single();
    if (!data) return reply.send({ connected: false });
    const expiresAt = new Date(data.expires_at);
    return reply.send({ connected: true, expiresAt, subdomain: data.subdomain });
  });
}
