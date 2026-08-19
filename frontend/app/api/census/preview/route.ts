import { NextResponse } from 'next/server';
import { parseCensusFile } from '@/lib/census/parser';
import { validateEmployees } from '@/lib/census/validator';
import { cleanFieldValue } from '@/lib/census/processor';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = await file.arrayBuffer();
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
      for (const [idxStr, val] of Object.entries(values)) {
        const emp = parseResult.employees[parseInt(idxStr)];
        if (emp && val) (emp as unknown as Record<string, unknown>)[field] = cleanFieldValue(field, val);
      }
    }
    for (const fix of rowFixes) {
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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
