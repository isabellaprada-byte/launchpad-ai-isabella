import { NextResponse } from 'next/server';
import { searchContacts } from '@/lib/bigin';

function checkAuth(req: Request): boolean {
  const password = process.env.DASHBOARD_PASSWORD ?? '';
  return req.headers.get('x-admin-password') === password;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json([]);

  try {
    const contacts = await searchContacts(q);
    return NextResponse.json(contacts);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
