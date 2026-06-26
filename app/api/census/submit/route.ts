import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { parseCensusFile } from '@/lib/census/parser';
import { validateEmployees } from '@/lib/census/validator';
import { cleanFieldValue } from '@/lib/census/processor';
import { buildAdminPanelXlsx, buildLtTrustXlsx } from '@/lib/census/excel-writer';
import { sendCensusNotification, sendConfirmationEmail } from '@/lib/email';
import { uploadSubmissionToDrive } from '@/lib/google-drive';
import { getSupabase } from '@/lib/supabase';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_SUBMISSIONS_PER_EMAIL = 4;

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export const maxDuration = 60;

function todayIsoStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayDotStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}.${dd}.${yyyy}`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const sponsorName = (formData.get('sponsorName') as string | null)?.trim();
  const uploaderName = (formData.get('uploaderName') as string | null)?.trim() ?? '';
  const uploaderEmail = (formData.get('uploaderEmail') as string | null)?.trim() ?? '';
  const acknowledgedRaw = formData.get('acknowledgedFields') as string | null;
  const acknowledgedFields: string[] = acknowledgedRaw ? JSON.parse(acknowledgedRaw) : [];
  const fixesRaw = formData.get('perEmployeeFixes') as string | null;
  const perEmployeeFixes: Record<string, Record<string, string>> = fixesRaw ? JSON.parse(fixesRaw) : {};
  const rowFixesRaw = formData.get('rowFixes') as string | null;
  const rowFixes: Array<{ rowIndex: number; field: string; value: string }> = rowFixesRaw ? JSON.parse(rowFixesRaw) : [];
  const replaceExisting = formData.get('replaceExisting') === 'true';

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (!sponsorName) return NextResponse.json({ error: 'Sponsor name is required' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum allowed size is 25 MB.' }, { status: 413 });
  }

  // Rate limit + replace logic (stored as irreversible email hash — no PII)
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
          { error: `Maximum ${MAX_SUBMISSIONS_PER_EMAIL} submissions reached for this email address. Please contact your implementation team if you need to submit again.` },
          { status: 429 },
        );
      }
    }
  }

  const buffer = await file.arrayBuffer();

  let parseResult;
  try {
    parseResult = await parseCensusFile(buffer, file.name);
  } catch (err) {
    return NextResponse.json({ error: `Parse error: ${(err as Error).message}` }, { status: 422 });
  }

  if (parseResult.employees.length === 0) {
    return NextResponse.json({ error: 'No employee records found' }, { status: 422 });
  }

  // Apply fixes — bulk first (lower priority), row fixes second (override bulk)
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
  const blockingFlags = flags.filter(
    f => f.severity === 'error' && !acknowledgedFields.includes(f.field),
  );
  if (blockingFlags.length > 0) {
    return NextResponse.json(
      { error: 'Unresolved validation errors', flags: blockingFlags },
      { status: 422 },
    );
  }

  const isoDate = todayIsoStr();
  const dotDate = todayDotStr();
  const safeName = sponsorName.replace(/[^a-zA-Z0-9\s\-]/g, '').trim();
  const adminFilename = `${isoDate}-${safeName}-new-hire-report.xlsx`;

  const [adminBuffer, ltResult] = await Promise.all([
    buildAdminPanelXlsx(parseResult.employees),
    buildLtTrustXlsx(parseResult.employees, safeName, dotDate),
  ]);

  // Upload 3 files to a private Drive subfolder (only accessible to folder owner)
  // Non-fatal: if Drive credentials are missing, submission still completes
  let driveFolderUrl: string | undefined;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    try {
      const driveResult = await uploadSubmissionToDrive({
        sponsorName: safeName,
        dateStr: isoDate,
        originalBuffer: Buffer.from(buffer),
        originalFilename: file.name,
        adminBuffer,
        adminFilename,
        ltBuffer: ltResult.buffer,
        ltFilename: ltResult.filename,
      });
      driveFolderUrl = driveResult.folderUrl;
    } catch (err) {
      console.error('Drive upload failed (non-fatal):', err);
    }
  }

  await sendCensusNotification({
    sponsorName,
    employeeCount: parseResult.employees.length,
    uploaderName,
    uploaderEmail,
    adminBuffer,
    adminFilename,
    ltBuffer: ltResult.buffer,
    ltFilename: ltResult.filename,
    originalBuffer: Buffer.from(buffer),
    originalFilename: file.name,
    driveFolderUrl,
  });

  // Send confirmation to the submitter — non-fatal
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
      sponsor_name: sponsorName,
      original_filename: file.name,
      status: 'processed',
      employee_count: parseResult.employees.length,
      issues_count: flags.length,
      acknowledged_fields: acknowledgedFields,
      uploader_email_hash: uploaderEmail ? hashEmail(uploaderEmail) : null,
      drive_url_admin: driveFolderUrl ?? null,
    })
    .select('id')
    .single();

  return NextResponse.json({
    success: true,
    submissionId: submission?.id,
    employeeCount: parseResult.employees.length,
    adminFilename,
    adminBase64: adminBuffer.toString('base64'),
  });
}
