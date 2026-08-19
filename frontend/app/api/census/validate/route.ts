import { NextResponse } from 'next/server';
import { parseCensusFile } from '@/lib/census/parser';
import { validateEmployees } from '@/lib/census/validator';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    let parseResult;
    try {
      parseResult = await parseCensusFile(buffer, file.name);
    } catch (err) {
      return NextResponse.json({ error: `Parse error: ${(err as Error).message}` }, { status: 422 });
    }

    if (parseResult.missingRequiredHeaders?.length) {
      return NextResponse.json({
        error: `Missing required columns: ${parseResult.missingRequiredHeaders.join(', ')}`,
        missingHeaders: parseResult.missingRequiredHeaders,
      }, { status: 422 });
    }

    if (parseResult.employees.length === 0) {
      return NextResponse.json({ error: 'No employee records found in file.' }, { status: 422 });
    }

    const flags = validateEmployees(parseResult.employees);
    return NextResponse.json({
      employeeCount: parseResult.employees.length,
      flags,
      hasErrors: flags.some(f => f.severity === 'error'),
      employeeNames: parseResult.employees.map(e => ({ firstName: e.firstName, lastName: e.lastName })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
