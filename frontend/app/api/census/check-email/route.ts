import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  if (!email) return NextResponse.json({ hasExisting: false });

  const emailHash = createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  const supabase = getSupabase();
  const { count } = await supabase
    .from('census_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('uploader_email_hash', emailHash);

  return NextResponse.json({ hasExisting: (count ?? 0) > 0 });
}
