import { redirect } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

export default async function SponsorUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ contact?: string; planType?: string }>;
}) {
  const { token } = await params;
  const { contact, planType } = await searchParams;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sponsor_tokens')
    .select('sponsor_name, expires_at, used_count')
    .eq('token', token)
    .single();

  let sponsorName: string | null = null;
  let errorMsg = '';

  if (error || !data) {
    errorMsg = 'This upload link is not valid. Please check the link in your email or contact ForUsAll.';
  } else if (new Date(data.expires_at) < new Date()) {
    errorMsg = 'This upload link has expired. Please contact your ForUsAll implementation specialist for a new link.';
  } else {
    sponsorName = data.sponsor_name;
    // Bump last_used_at and used_count (fire and forget)
    supabase.from('sponsor_tokens')
      .update({ last_used_at: new Date().toISOString(), used_count: (data.used_count || 0) + 1 })
      .eq('token', token)
      .then(() => {});
  }

  if (sponsorName) {
    const url = new URL('/upload', 'http://x');
    url.searchParams.set('company', sponsorName);
    url.searchParams.set('locked', '1');
    url.searchParams.set('token', token);
    if (contact)  url.searchParams.set('contact', contact);
    if (planType) url.searchParams.set('planType', planType);
    redirect(url.pathname + url.search);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-10 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Link not available</h2>
        <p className="text-slate-500 text-sm leading-relaxed">{errorMsg}</p>
        <a
          href="mailto:implementations@forusall.com?subject=Census%20Upload%20Link%20Help"
          className="inline-block mt-2 text-sm text-blue-600 hover:underline"
        >
          Contact implementations@forusall.com
        </a>
      </div>
    </div>
  );
}
