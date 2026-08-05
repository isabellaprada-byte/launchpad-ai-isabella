import { NextRequest, NextResponse } from 'next/server';
import { parseCensusFile } from '@/lib/census/parser';
import { validateEmployees } from '@/lib/census/validator';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum allowed size is 25 MB.' }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();

  let parseResult;
  try {
    parseResult = await parseCensusFile(buffer, file.name);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse file: ${(err as Error).message}` },
      { status: 422 },
    );
  }

  if (parseResult.missingRequiredHeaders && parseResult.missingRequiredHeaders.length > 0) {
    return NextResponse.json(
      {
        error: `Your file is missing required columns: ${parseResult.missingRequiredHeaders.join(', ')}. Please check that your file has a header row with all required column names, or download and use the provided template.`,
      },
      { status: 422 },
    );
  }

  if (parseResult.employees.length === 0) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    return NextResponse.json(
      {
        error: isPdf
          ? 'Could not extract employee records from this PDF. PDFs with scanned or non-tabular layouts are not supported — please convert to Excel (.xlsx) or CSV and re-upload.'
          : 'No employee records found. Make sure the file has a header row with column names like SSN, First Name, Last Name, etc.',
      },
      { status: 422 },
    );
  }

  const flags = validateEmployees(parseResult.employees);

  // Only return names (no SSN/DOB/address) and only when ≤50 employees — used to
  // render per-employee fix inputs in the UI. Sponsor sees their own data back.
  const employeeNames = parseResult.employees.length <= 50
    ? parseResult.employees.map(e => ({ firstName: e.firstName, lastName: e.lastName }))
    : [];

  return NextResponse.json({
    employeeCount: parseResult.rawCount,
    flags,
    hasErrors: flags.some(f => f.severity === 'error'),
    employeeNames,
  });
}
