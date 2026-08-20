import { NextResponse } from 'next/server';
import { parseCensusFile } from '@/lib/census/parser';
import { validateEmployees } from '@/lib/census/validator';
import { cleanFieldValue } from '@/lib/census/processor';

export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_EMPLOYEE_FIELDS = new Set([
  'firstName','lastName','middleName','ssn','email','email2','phone',
  'street1','street2','city','state','zip','dob','doh','dot',
  'gender','division','rehireDate','salary','employmentType',
  'deferralRate','rothRate','prevDeferralRate',
]);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum allowed size is 25 MB.' }, { status: 413 });
    }

    const acknowledgedFields: string[] = JSON.parse((formData.get('acknowledgedFields') as string) ?? '[]');
    const perEmployeeFixes: Record<string, Record<string, string>> = JSON.parse((formData.get('perEmployeeFixes') as string) ?? '{}');
    const rowFixes: Array<{ rowIndex: number; field: string; value: string }> = JSON.parse((formData.get('rowFixes') as string) ?? '[]');

    let parseResult;
    try {
      parseResult = await parseCensusFile(buffer, file.name);
    } catch (err) {
      return NextResponse.json({ error: `Parse error: ${(err as Error).message}` }, { status: 422 });
    }

    for (const [field, values] of Object.entries(perEmployeeFixes)) {
      if (!ALLOWED_EMPLOYEE_FIELDS.has(field)) continue;
      for (const [idxStr, val] of Object.entries(values)) {
        const emp = parseResult.employees[parseInt(idxStr)];
        if (emp && val) (emp as unknown as Record<string, unknown>)[field] = cleanFieldValue(field, val);
      }
    }
    for (const fix of rowFixes) {
      if (!ALLOWED_EMPLOYEE_FIELDS.has(fix.field)) continue;
      const emp = parseResult.employees[fix.rowIndex];
      if (emp && fix.value) (emp as unknown as Record<string, unknown>)[fix.field] = cleanFieldValue(fix.field, fix.value);
    }

    const flags = validateEmployees(parseResult.employees);
    const blockingFlags = flags.filter(f => f.severity === 'error' && !acknowledgedFields.includes(f.field));
    if (blockingFlags.length > 0) {
      return NextResponse.json({ error: 'Unresolved validation errors', flags: blockingFlags }, { status: 422 });
    }

    return NextResponse.json({ employees: parseResult.employees });
  } catch (err) {
    console.error('Preview error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
