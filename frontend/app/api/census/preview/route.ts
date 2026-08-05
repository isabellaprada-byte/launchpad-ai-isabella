import { NextRequest, NextResponse } from 'next/server';
import { parseCensusFile } from '@/lib/census/parser';
import { validateEmployees } from '@/lib/census/validator';
import { cleanFieldValue } from '@/lib/census/processor';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const acknowledgedRaw = formData.get('acknowledgedFields') as string | null;
  const acknowledgedFields: string[] = acknowledgedRaw ? JSON.parse(acknowledgedRaw) : [];
  const fixesRaw = formData.get('perEmployeeFixes') as string | null;
  const perEmployeeFixes: Record<string, Record<string, string>> = fixesRaw ? JSON.parse(fixesRaw) : {};
  const rowFixesRaw = formData.get('rowFixes') as string | null;
  const rowFixes: Array<{ rowIndex: number; field: string; value: string }> = rowFixesRaw ? JSON.parse(rowFixesRaw) : [];

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const parseResult = await parseCensusFile(buffer, file.name);

  if (parseResult.employees.length === 0) {
    return NextResponse.json({ error: 'No records found' }, { status: 422 });
  }

  const employees = parseResult.employees;

  // Apply bulk per-employee fixes first (lower priority)
  for (const [field, values] of Object.entries(perEmployeeFixes)) {
    for (const [idxStr, val] of Object.entries(values)) {
      const emp = employees[parseInt(idxStr)];
      if (emp && val) (emp as unknown as Record<string, unknown>)[field] = cleanFieldValue(field, val);
    }
  }

  // Apply per-row fixes second — individual fixes override bulk fixes for the same row
  for (const fix of rowFixes) {
    const emp = employees[fix.rowIndex];
    if (emp && fix.value) (emp as unknown as Record<string, unknown>)[fix.field] = cleanFieldValue(fix.field, fix.value);
  }

  // Re-validate after applying fixes — acknowledged fields are the only remaining exceptions
  const flags = validateEmployees(employees);
  const blockingFlags = flags.filter(
    f => f.severity === 'error' && !acknowledgedFields.includes(f.field),
  );

  if (blockingFlags.length > 0) {
    return NextResponse.json({ error: 'Unresolved errors', flags: blockingFlags }, { status: 422 });
  }

  // Return cleaned employee data so sponsor can preview what they're submitting.
  // no-store prevents browser/CDN from caching the PII response.
  const res = NextResponse.json({ employees, employeeCount: employees.length });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
