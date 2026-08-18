import { NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await fetch(`${BACKEND}/api/sponsor-token/${token}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
