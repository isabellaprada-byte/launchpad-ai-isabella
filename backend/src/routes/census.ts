import { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'crypto';
import { parseCensusFile } from '../services/parser';
import { validateEmployees } from '../services/validator';
import { cleanFieldValue } from '../services/processor';
import { buildAdminPanelXlsx, buildLtTrustXlsx } from '../services/excelWriter';
import { sendCensusNotification, sendConfirmationEmail } from '../services/email';
import { createCensusTicket } from '../services/devrev';
import { uploadCensusToShareFile } from '../services/sharefile';
import { uploadToS3, getSignedDownloadUrl, buildS3Key } from '../services/s3';
import { getSupabase } from '../services/supabase';

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

export async function censusRoutes(app: FastifyInstance) {

  // ── Validate ──────────────────────────────────────────────────────────────
  app.post('/api/census/validate', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const buffer = await data.toBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return reply.status(413).send({ error: 'File too large. Maximum allowed size is 25 MB.' });
    }

    let parseResult;
    try {
      parseResult = await parseCensusFile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, data.filename);
    } catch (err) {
      return reply.status(422).send({ error: `Parse error: ${(err as Error).message}` });
    }

    if (parseResult.missingRequiredHeaders?.length) {
      return reply.status(422).send({
        error: `Missing required columns: ${parseResult.missingRequiredHeaders.join(', ')}`,
        missingHeaders: parseResult.missingRequiredHeaders,
      });
    }

    if (parseResult.employees.length === 0) {
      return reply.status(422).send({ error: 'No employee records found in file.' });
    }

    const flags = validateEmployees(parseResult.employees);
    return reply.send({
      employeeCount: parseResult.employees.length,
      flags,
      hasErrors: flags.some(f => f.severity === 'error'),
      employeeNames: parseResult.employees.map(e => ({ firstName: e.firstName, lastName: e.lastName })),
    });
  });

  // ── Preview ───────────────────────────────────────────────────────────────
  app.post('/api/census/preview', async (req, reply) => {
    const parts = req.parts();
    let fileBuffer: Buffer | null = null;
    let filename = '';
    let acknowledgedFields: string[] = [];
    let perEmployeeFixes: Record<string, Record<string, string>> = {};
    let rowFixes: Array<{ rowIndex: number; field: string; value: string }> = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename = part.filename;
      } else {
        const val = (part as { value: string }).value;
        if (part.fieldname === 'acknowledgedFields') acknowledgedFields = JSON.parse(val);
        if (part.fieldname === 'perEmployeeFixes') perEmployeeFixes = JSON.parse(val);
        if (part.fieldname === 'rowFixes') rowFixes = JSON.parse(val);
      }
    }

    if (!fileBuffer) return reply.status(400).send({ error: 'No file uploaded' });
    if (fileBuffer.byteLength > MAX_FILE_SIZE) {
      return reply.status(413).send({ error: 'File too large. Maximum allowed size is 25 MB.' });
    }

    let parseResult;
    try {
      parseResult = await parseCensusFile(fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer, filename);
    } catch (err) {
      return reply.status(422).send({ error: `Parse error: ${(err as Error).message}` });
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
      return reply.status(422).send({ error: 'Unresolved validation errors', flags: blockingFlags });
    }

    return reply.send({ employees: parseResult.employees });
  });


  // ── Submit ────────────────────────────────────────────────────────────────
  app.post('/api/census/submit', async (req, reply) => {
    const parts = req.parts();
    let fileBuffer: Buffer | null = null;
    let filename = '';
    let sponsorName = '';
    let uploaderName = '';
    let uploaderEmail = '';
    let acknowledgedFields: string[] = [];
    let perEmployeeFixes: Record<string, Record<string, string>> = {};
    let rowFixes: Array<{ rowIndex: number; field: string; value: string }> = [];
    let replaceExisting = false;

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename = part.filename;
      } else {
        const val = (part as { value: string }).value;
        if (part.fieldname === 'sponsorName') sponsorName = val.trim();
        if (part.fieldname === 'uploaderName') uploaderName = val.trim();
        if (part.fieldname === 'uploaderEmail') uploaderEmail = val.trim();
        if (part.fieldname === 'acknowledgedFields') acknowledgedFields = JSON.parse(val);
        if (part.fieldname === 'perEmployeeFixes') perEmployeeFixes = JSON.parse(val);
        if (part.fieldname === 'rowFixes') rowFixes = JSON.parse(val);
        if (part.fieldname === 'replaceExisting') replaceExisting = val === 'true';
      }
    }

    if (!fileBuffer) return reply.status(400).send({ error: 'No file uploaded' });
    if (!sponsorName) return reply.status(400).send({ error: 'Sponsor name is required' });
    if (fileBuffer.byteLength > MAX_FILE_SIZE) {
      return reply.status(413).send({ error: 'File too large. Maximum allowed size is 25 MB.' });
    }

    // Rate limit check
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
          return reply.status(429).send({
            error: `Maximum ${MAX_SUBMISSIONS_PER_EMAIL} submissions reached for this email address.`,
          });
        }
      }
    }

    let parseResult;
    try {
      parseResult = await parseCensusFile(fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer, filename);
    } catch (err) {
      return reply.status(422).send({ error: `Parse error: ${(err as Error).message}` });
    }

    if (parseResult.employees.length === 0) {
      return reply.status(422).send({ error: 'No employee records found' });
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
      return reply.status(422).send({ error: 'Unresolved validation errors', flags: blockingFlags });
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

    // Upload to S3 (non-fatal if not configured)
    let s3Urls: { original?: string; admin?: string; lt?: string } = {};
    if (process.env.S3_BUCKET_NAME) {
      try {
        const [origKey, adminKey, ltKey] = await Promise.all([
          uploadToS3(buildS3Key(submissionId, filename, 'raw'), fileBuffer, 'application/octet-stream'),
          uploadToS3(buildS3Key(submissionId, adminFilename, 'processed'), adminBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
          uploadToS3(buildS3Key(submissionId, ltResult.filename, 'processed'), ltResult.buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        ]);
        const [origUrl, adminUrl, ltUrl] = await Promise.all([
          getSignedDownloadUrl(origKey),
          getSignedDownloadUrl(adminKey),
          getSignedDownloadUrl(ltKey),
        ]);
        s3Urls = { original: origUrl, admin: adminUrl, lt: ltUrl };
      } catch (err) {
        console.error('S3 upload failed (non-fatal):', err);
      }
    }

    // Upload to ShareFile (non-fatal if credentials missing)
    let shareFileFolderUrl: string | undefined;
    if (process.env.SHAREFILE_CLIENT_ID && process.env.SHAREFILE_CLIENT_SECRET) {
      try {
        const sfResult = await uploadCensusToShareFile({
          sponsorName: safeName,
          uploaderName: uploaderName,
          uploaderEmail: uploaderEmail,
          dateStr: isoDate,
          originalBuffer: fileBuffer,
          originalFilename: filename,
          adminBuffer,
          adminFilename,
          ltBuffer: ltResult.buffer,
          ltFilename: ltResult.filename,
        });
        shareFileFolderUrl = sfResult.folderUrl;
      } catch (err) {
        console.error('ShareFile upload failed (non-fatal):', err);
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
      originalBuffer: fileBuffer,
      originalFilename: filename,
      driveFolderUrl: shareFileFolderUrl ?? s3Urls.admin,
    });

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
        id: submissionId,
        sponsor_name: sponsorName,
        original_filename: filename,
        status: 'processed',
        employee_count: parseResult.employees.length,
        issues_count: flags.length,
        acknowledged_fields: acknowledgedFields,
        uploader_email_hash: uploaderEmail ? hashEmail(uploaderEmail) : null,
        drive_url_admin: shareFileFolderUrl ?? s3Urls.admin ?? null,
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
        ltBuffer: ltResult.buffer,
        ltFilename: ltResult.filename,
        originalBuffer: fileBuffer,
        originalFilename: filename,
      });
    } catch (err) {
      console.error('DevRev ticket creation failed (non-fatal):', err);
    }

    return reply.send({
      success: true,
      submissionId: submission?.id,
      employeeCount: parseResult.employees.length,
      adminFilename,
    });
  });

  // ── Check email ───────────────────────────────────────────────────────────
  app.get('/api/census/check-email', async (req, reply) => {
    const { email } = req.query as { email?: string };
    if (!email) return reply.send({ hasExisting: false });
    const supabase = getSupabase();
    const emailHash = hashEmail(email);
    const { count } = await supabase
      .from('census_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('uploader_email_hash', emailHash);
    return reply.send({ hasExisting: (count ?? 0) > 0 });
  });
}
