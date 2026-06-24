import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface CensusNotificationParams {
  sponsorName: string;
  employeeCount: number;
  uploaderName: string;
  uploaderEmail: string;
  adminBuffer: Buffer;
  adminFilename: string;
  ltBuffer: Buffer;
  ltFilename: string;
  originalBuffer: Buffer;
  originalFilename: string;
  driveFolderUrl?: string;
}

export async function sendCensusNotification({
  sponsorName,
  employeeCount,
  uploaderName,
  uploaderEmail,
  adminBuffer,
  adminFilename,
  ltBuffer,
  ltFilename,
  originalBuffer,
  originalFilename,
  driveFolderUrl,
}: CensusNotificationParams): Promise<void> {
  const to = process.env.NOTIFICATION_EMAIL ?? 'isabella.prada@forusall.com';

  await resend.emails.send({
    from: 'Census Portal <onboarding@resend.dev>',
    to,
    subject: `Census ready — ${esc(sponsorName)} (${employeeCount} employees)`,
    html: `
      <h2>Census processed: ${esc(sponsorName)}</h2>
      <p><strong>${employeeCount}</strong> employee records processed and attached below.</p>
      <table style="margin:16px 0;border-collapse:collapse">
        <tr>
          <td style="padding:4px 12px 4px 0;color:#666;font-size:13px">Submitted by</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600">${esc(uploaderName)}</td>
        </tr>
        <tr>
          <td style="padding:4px 12px 4px 0;color:#666;font-size:13px">Contact email</td>
          <td style="padding:4px 0;font-size:13px"><a href="mailto:${esc(uploaderEmail)}">${esc(uploaderEmail)}</a></td>
        </tr>
      </table>
      ${driveFolderUrl ? `<p style="margin:16px 0"><a href="${esc(driveFolderUrl)}" style="display:inline-block;background:#1a73e8;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">📁 Open folder in Google Drive</a></p>` : ''}
      <ul>
        <li><strong>${esc(adminFilename)}</strong> — upload to ForUsAll Admin Panel</li>
        <li><strong>${esc(ltFilename)}</strong> — upload to LT Trust</li>
      </ul>
      <p style="color:#666;font-size:12px;margin-top:24px">
        Sent by Census Upload Portal.
      </p>
    `,
    attachments: [
      {
        filename: originalFilename,
        content: originalBuffer,
      },
      {
        filename: adminFilename,
        content: adminBuffer,
      },
      {
        filename: ltFilename,
        content: ltBuffer,
      },
    ],
  });
}
