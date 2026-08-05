import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email) return NextResponse.json({ hasExisting: false, count: 0 });

  const hash = createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  const { count } = await getSupabase()
    .from('census_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('uploader_email_hash', hash);

  return NextResponse.json({ hasExisting: (count ?? 0) > 0, count: count ?? 0 });
}
