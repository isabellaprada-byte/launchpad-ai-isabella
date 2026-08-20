import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase  = getSupabase();

  const { data, error } = await supabase
    .from('sponsor_tokens')
    .select('sponsor_name, sponsor_email, expires_at, used_count')
    .eq('token', token)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  // Bump last_used_at and used_count (fire and forget)
  supabase.from('sponsor_tokens')
    .update({ last_used_at: new Date().toISOString(), used_count: (data.used_count || 0) + 1 })
    .eq('token', token)
    .then(() => {});

  return NextResponse.json({ sponsorName: data.sponsor_name });
}
