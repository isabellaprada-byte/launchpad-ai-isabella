import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('sharefile_tokens')
    .select('expires_at, subdomain')
    .eq('id', 1)
    .single();

  if (!data) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    expiresAt: data.expires_at,
    subdomain: data.subdomain,
  });
}
