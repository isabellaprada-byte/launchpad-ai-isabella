import { NextResponse } from 'next/server';
import { searchContacts } from '@/lib/bigin';

export async function GET(req: Request) {
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
