import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { getSupabase } from '../services/supabase';
import { searchContacts } from '../services/bigin';

const ADMIN_PASSWORD = process.env.DASHBOARD_PASSWORD ?? '';
const FRONTEND_URL   = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const TOKEN_DAYS     = 60;

function checkAuth(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const auth = req.headers['x-admin-password'];
  return typeof auth === 'string' && auth === ADMIN_PASSWORD;
}

async function sendLinkEmail(to: string, sponsorName: string, link: string): Promise<void> {
  if (!RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'ForUsAll Implementations <implementations@forusall.com>',
      to:      [to],
      subject: `Your ForUsAll Census Upload Link — ${sponsorName}`,
      html: `
        <p>Hi,</p>
        <p>Here is your personalized census upload link for <strong>${sponsorName}</strong>:</p>
        <p><a href="${link}" style="font-size:16px;">${link}</a></p>
        <p>This link is ready to use and will work for 60 days. You can upload your census file directly — no login required.</p>
        <p>If you have any questions, reply to this email or contact us at <a href="mailto:implementations@forusall.com">implementations@forusall.com</a>.</p>
        <p>— ForUsAll Implementations Team</p>
      `,
    }),
  });
}

export async function adminRoutes(app: FastifyInstance) {
  // Search Bigin contacts
  app.get('/api/admin/bigin-search', async (req, reply) => {
    if (!checkAuth(req as Parameters<typeof checkAuth>[0])) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return reply.code(400).send({ error: 'Query must be at least 2 characters' });
    }
    try {
      const contacts = await searchContacts(q.trim());
      return { contacts };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: 'Bigin search failed' });
    }
  });

  // Create a sponsor link (+ optionally send email)
  app.post('/api/admin/create-link', async (req, reply) => {
    if (!checkAuth(req as Parameters<typeof checkAuth>[0])) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const { sponsorName, sponsorEmail, createdBy, sendEmail } = req.body as {
      sponsorName: string;
      sponsorEmail: string;
      createdBy: string;
      sendEmail?: boolean;
    };

    if (!sponsorName?.trim() || !sponsorEmail?.trim() || !createdBy?.trim()) {
      return reply.code(400).send({ error: 'sponsorName, sponsorEmail, and createdBy are required' });
    }

    const token     = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const link      = `${FRONTEND_URL}/upload/${token}`;

    const supabase = getSupabase();
    const { error } = await supabase.from('sponsor_tokens').insert({
      token,
      sponsor_name:  sponsorName.trim(),
      sponsor_email: sponsorEmail.trim(),
      created_by:    createdBy.trim(),
      expires_at:    expiresAt,
    });

    if (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Failed to save token' });
    }

    if (sendEmail) {
      try {
        await sendLinkEmail(sponsorEmail.trim(), sponsorName.trim(), link);
      } catch (err) {
        app.log.error({ err }, 'Email send failed');
        // don't fail the whole request — link was created
      }
    }

    return { token, link, expiresAt };
  });

  // List all sponsor links
  app.get('/api/admin/links', async (req, reply) => {
    if (!checkAuth(req as Parameters<typeof checkAuth>[0])) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sponsor_tokens')
      .select('id, token, sponsor_name, sponsor_email, created_by, created_at, expires_at, used_count, last_used_at')
      .order('created_at', { ascending: false });

    if (error) return reply.code(500).send({ error: 'Failed to fetch links' });
    return { links: data };
  });

  // Validate a sponsor token (called by the upload page)
  app.get('/api/sponsor-token/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const supabase  = getSupabase();
    const { data, error } = await supabase
      .from('sponsor_tokens')
      .select('sponsor_name, sponsor_email, expires_at')
      .eq('token', token)
      .single();

    if (error || !data) return reply.code(404).send({ error: 'Invalid link' });
    if (new Date(data.expires_at) < new Date()) {
      return reply.code(410).send({ error: 'Link expired' });
    }

    // Bump usage counter (fire and forget)
    supabase.from('sponsor_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)
      .then(() => {});

    return { sponsorName: data.sponsor_name };
  });
}
