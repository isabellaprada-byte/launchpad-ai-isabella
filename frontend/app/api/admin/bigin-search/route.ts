import { NextResponse } from 'next/server';
import { searchContacts } from '@/lib/bigin';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json([]);

  try {
    const contacts = await searchContacts(q);
    return NextResponse.json({ contacts });
  } catch (err) {
    console.error('Bigin search error:', err);
    return NextResponse.json({ error: 'Search unavailable. Please try again.' }, { status: 500 });
  }
}
