import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSupabase } from '@/lib/supabase';

const TOKEN_DAYS = 60;

function checkAuth(req: Request): boolean {
  const password = process.env.DASHBOARD_PASSWORD ?? '';
  return req.headers.get('x-admin-password') === password;
}

async function sendLinkEmail(to: string, sponsorName: string, link: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sponsorName, sponsorEmail, createdBy, sendEmail } = await req.json() as {
    sponsorName: string; sponsorEmail: string; createdBy: string; sendEmail?: boolean;
  };

  if (!sponsorName?.trim() || !sponsorEmail?.trim() || !createdBy?.trim()) {
    return NextResponse.json(
      { error: 'sponsorName, sponsorEmail, and createdBy are required' },
      { status: 400 },
    );
  }

  const token     = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const link      = `${appUrl}/upload/${token}`;

  const supabase = getSupabase();
  const { error } = await supabase.from('sponsor_tokens').insert({
    token,
    sponsor_name:  sponsorName.trim(),
    sponsor_email: sponsorEmail.trim(),
    created_by:    createdBy.trim(),
    expires_at:    expiresAt,
  });

  if (error) {
    console.error('sponsor_tokens insert failed:', error);
    return NextResponse.json({ error: 'Failed to save token' }, { status: 500 });
  }

  if (sendEmail) {
    try {
      await sendLinkEmail(sponsorEmail.trim(), sponsorName.trim(), link);
    } catch (err) {
      console.error('Email send failed (non-fatal):', err);
    }
  }

  return NextResponse.json({ token, link, expiresAt });
}
