import { redirect } from 'next/navigation';

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000';

export default async function SponsorUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ contact?: string; planType?: string }>;
}) {
  const { token } = await params;
  const { contact, planType } = await searchParams;

  let sponsorName: string | null = null;
  let errorMsg = '';

  try {
    const res = await fetch(`${BACKEND}/api/sponsor-token/${token}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json() as { sponsorName: string };
      sponsorName = data.sponsorName;
    } else if (res.status === 410) {
      errorMsg = 'This upload link has expired. Please contact your ForUsAll implementation specialist for a new link.';
    } else {
      errorMsg = 'This upload link is not valid. Please check the link in your email or contact ForUsAll.';
    }
  } catch {
    errorMsg = 'Unable to verify this link. Please try again or contact implementations@forusall.com.';
  }

  if (sponsorName) {
    const url = new URL('/upload', 'http://x');
    url.searchParams.set('company', sponsorName);
    url.searchParams.set('locked', '1');
    if (contact) url.searchParams.set('contact', contact);
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
