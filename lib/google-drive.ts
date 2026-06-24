import { google } from 'googleapis';
import { Readable } from 'stream';

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

function getMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

async function createFolder(drive: ReturnType<typeof getDriveClient>, name: string, parentId: string): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return res.data.id!;
}

async function uploadFile(
  drive: ReturnType<typeof getDriveClient>,
  buffer: Buffer,
  filename: string,
  folderId: string,
): Promise<void> {
  await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: getMimeType(filename),
      body: Readable.from(buffer),
    },
    fields: 'id',
  });
}

export interface DriveUploadResult {
  folderUrl: string;
}

export async function uploadSubmissionToDrive(params: {
  sponsorName: string;
  dateStr: string;          // YYYY-MM-DD
  originalBuffer: Buffer;
  originalFilename: string;
  adminBuffer: Buffer;
  adminFilename: string;
  ltBuffer: Buffer;
  ltFilename: string;
}): Promise<DriveUploadResult> {
  const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!parentFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set');

  const drive = getDriveClient();

  // Create a subfolder: "SponsorName - YYYY-MM-DD"
  const safeName = params.sponsorName.replace(/[/\\:*?"<>|]/g, '').trim();
  const folderName = `${safeName} - ${params.dateStr}`;
  const subFolderId = await createFolder(drive, folderName, parentFolderId);

  // Upload all 3 files in parallel
  await Promise.all([
    uploadFile(drive, params.originalBuffer, params.originalFilename, subFolderId),
    uploadFile(drive, params.adminBuffer, params.adminFilename, subFolderId),
    uploadFile(drive, params.ltBuffer, params.ltFilename, subFolderId),
  ]);

  return {
    folderUrl: `https://drive.google.com/drive/folders/${subFolderId}`,
  };
}
