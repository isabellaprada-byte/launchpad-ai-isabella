import { NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? '';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const res = await fetch(`${BACKEND}/api/admin/bigin-search?q=${encodeURIComponent(q)}`, {
    headers: { 'x-admin-password': PASSWORD },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
