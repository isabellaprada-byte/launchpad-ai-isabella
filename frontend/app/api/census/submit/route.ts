import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { parseCensusFile } from '@/lib/census/parser';
import { validateEmployees } from '@/lib/census/validator';
import { cleanFieldValue } from '@/lib/census/processor';
import { buildAdminPanelXlsx, buildLtTrustXlsx } from '@/lib/census/excel-writer';
import { sendCensusNotification, sendConfirmationEmail } from '@/lib/email';
import { createCensusTicket } from '@/lib/devrev';
import { uploadCensusToShareFile } from '@/lib/sharefile';
import { getSupabase } from '@/lib/supabase';

export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_SUBMISSIONS_PER_EMAIL = 4;

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function todayIsoStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayDotStr(): string {
  const d = new Date();
  return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${d.getFullYear()}`;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const sponsorName = ((formData.get('sponsorName') as string) ?? '').trim();
    if (!sponsorName) return NextResponse.json({ error: 'Sponsor name is required' }, { status: 400 });

    const uploaderName  = ((formData.get('uploaderName')  as string) ?? '').trim();
    const uploaderEmail = ((formData.get('uploaderEmail') as string) ?? '').trim();
    const replaceExisting = formData.get('replaceExisting') === 'true';
    const acknowledgedFields: string[] = JSON.parse((formData.get('acknowledgedFields') as string) ?? '[]');
    const perEmployeeFixes: Record<string, Record<string, string>> = JSON.parse((formData.get('perEmployeeFixes') as string) ?? '{}');
    const rowFixes: Array<{ rowIndex: number; field: string; value: string }> = JSON.parse((formData.get('rowFixes') as string) ?? '[]');

    const rawBuffer = await file.arrayBuffer();
    if (rawBuffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum allowed size is 25 MB.' }, { status: 413 });
    }
    const fileBuffer = Buffer.from(rawBuffer);

    // Rate-limit / replace check
    if (uploaderEmail) {
      const emailHash = hashEmail(uploaderEmail);
      const supabase = getSupabase();
      if (replaceExisting) {
        await supabase.from('census_submissions').delete().eq('uploader_email_hash', emailHash);
      } else {
        const { count } = await supabase
          .from('census_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('uploader_email_hash', emailHash);
        if (count !== null && count >= MAX_SUBMISSIONS_PER_EMAIL) {
          return NextResponse.json(
            { error: `Maximum ${MAX_SUBMISSIONS_PER_EMAIL} submissions reached for this email address.` },
            { status: 429 },
          );
        }
      }
    }

    let parseResult;
    try {
      parseResult = await parseCensusFile(rawBuffer, file.name);
    } catch (err) {
      return NextResponse.json({ error: `Parse error: ${(err as Error).message}` }, { status: 422 });
    }

    if (parseResult.employees.length === 0) {
      return NextResponse.json({ error: 'No employee records found' }, { status: 422 });
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

    const isoDate = todayIsoStr();
    const dotDate = todayDotStr();
    const safeName = sponsorName.replace(/[^a-zA-Z0-9\s\-]/g, '').trim();
    const adminFilename = `${isoDate}-${safeName}-new-hire-report.xlsx`;
    const submissionId = randomUUID();

    const [adminBuffer, ltResult] = await Promise.all([
      buildAdminPanelXlsx(parseResult.employees),
      buildLtTrustXlsx(parseResult.employees, safeName, dotDate),
    ]);

    let shareFileFolderUrl: string | undefined;
    if (process.env.SHAREFILE_CLIENT_ID && process.env.SHAREFILE_CLIENT_SECRET) {
      try {
        const sfResult = await uploadCensusToShareFile({
          sponsorName: safeName,
          uploaderName,
          uploaderEmail,
          dateStr: isoDate,
          originalBuffer: fileBuffer,
          originalFilename: file.name,
          adminBuffer,
          adminFilename,
          ltBuffer:    ltResult.buffer,
          ltFilename:  ltResult.filename,
        });
        shareFileFolderUrl = sfResult.folderUrl;
      } catch (err) {
        console.error('ShareFile upload failed (non-fatal):', err);
      }
    }

    try {
      await sendCensusNotification({
        sponsorName,
        employeeCount: parseResult.employees.length,
        uploaderName,
        uploaderEmail,
        adminBuffer,
        adminFilename,
        ltBuffer:       ltResult.buffer,
        ltFilename:     ltResult.filename,
        originalBuffer: fileBuffer,
        originalFilename: file.name,
        driveFolderUrl: shareFileFolderUrl,
      });
    } catch (err) {
      console.error('Census notification email failed (non-fatal):', err);
    }

    if (uploaderEmail) {
      try {
        await sendConfirmationEmail({
          uploaderName,
          uploaderEmail,
          sponsorName,
          employeeCount: parseResult.employees.length,
          replaceExisting,
        });
      } catch (err) {
        console.error('Confirmation email failed (non-fatal):', err);
      }
    }

    const supabase = getSupabase();
    const { data: submission } = await supabase
      .from('census_submissions')
      .insert({
        id:                 submissionId,
        sponsor_name:       sponsorName,
        original_filename:  file.name,
        status:             'processed',
        employee_count:     parseResult.employees.length,
        issues_count:       flags.length,
        acknowledged_fields: acknowledgedFields,
        uploader_email_hash: uploaderEmail ? hashEmail(uploaderEmail) : null,
        drive_url_admin:    shareFileFolderUrl ?? null,
      })
      .select('id')
      .single();

    try {
      await createCensusTicket({
        sponsorName,
        employeeCount: parseResult.employees.length,
        uploaderName,
        uploaderEmail,
        acknowledgedFields,
        fixedCount: rowFixes.length + Object.values(perEmployeeFixes).reduce((n, v) => n + Object.keys(v).length, 0),
        adminBuffer,
        adminFilename,
        ltBuffer:       ltResult.buffer,
        ltFilename:     ltResult.filename,
        originalBuffer: fileBuffer,
        originalFilename: file.name,
      });
    } catch (err) {
      console.error('DevRev ticket creation failed (non-fatal):', err);
    }

    return NextResponse.json({
      success: true,
      submissionId: submission?.id,
      employeeCount: parseResult.employees.length,
      adminFilename,
    });
  } catch (err) {
    console.error('Census submit error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
