import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sponsor_tokens')
    .select('id, token, sponsor_name, sponsor_email, created_by, created_at, expires_at, used_count, last_used_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  return NextResponse.json({ links: data });
}
