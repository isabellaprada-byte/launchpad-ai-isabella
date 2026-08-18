import { NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? '';

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/admin/create-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': PASSWORD },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
