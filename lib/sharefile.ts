const SUBDOMAIN  = process.env.SHAREFILE_SUBDOMAIN ?? 'forus-all';
const FOLDER_ID  = process.env.SHAREFILE_FOLDER_ID  ?? 'fo19927c-2e24-4dbe-8b09-6cdce709415a';
const AUTH_URL   = `https://${SUBDOMAIN}.sharefile.com/oauth/token`;
const API_BASE   = `https://${SUBDOMAIN}.sf-api.com/sf/v3`;

async function getAccessToken(): Promise<string> {
  const clientId     = process.env.SHAREFILE_CLIENT_ID;
  const clientSecret = process.env.SHAREFILE_CLIENT_SECRET;
  const username     = process.env.SHAREFILE_USERNAME;
  const password     = process.env.SHAREFILE_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('ShareFile credentials are not configured (SHAREFILE_CLIENT_ID, SHAREFILE_CLIENT_SECRET, SHAREFILE_USERNAME, SHAREFILE_PASSWORD)');
  }

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'password',
      client_id:     clientId,
      client_secret: clientSecret,
      username,
      password,
    }),
  });

  if (!res.ok) throw new Error(`ShareFile auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

async function uploadFile(
  token: string,
  folderId: string,
  fileName: string,
  content: Buffer,
  mimeType: string,
): Promise<void> {
  // Step 1 — request an upload URL
  const uploadInfoRes = await fetch(
    `${API_BASE}/Items(${folderId})/Upload2`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Method: 'Standard', Raw: true, FileName: fileName }),
    },
  );
  if (!uploadInfoRes.ok) {
    throw new Error(`ShareFile Upload2 failed: ${uploadInfoRes.status} ${await uploadInfoRes.text()}`);
  }
  const { ChunkUri } = await uploadInfoRes.json() as { ChunkUri: string };

  // Step 2 — POST the file to the pre-signed chunk URL
  const uploadRes = await fetch(ChunkUri, {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: content,
  });
  if (!uploadRes.ok) {
    throw new Error(`ShareFile file upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function uploadCensusToShareFile(params: {
  sponsorName:      string;
  dateStr:          string;
  originalBuffer:   Buffer;
  originalFilename: string;
  adminBuffer:      Buffer;
  adminFilename:    string;
  ltBuffer:         Buffer;
  ltFilename:       string;
}): Promise<{ folderUrl: string }> {
  const token = await getAccessToken();

  // Create a subfolder: "SponsorName - YYYY-MM-DD"
  const safeName   = params.sponsorName.replace(/[/\\:*?"<>|]/g, '').trim();
  const folderName = `${safeName} - ${params.dateStr}`;

  const folderRes = await fetch(`${API_BASE}/Items(${FOLDER_ID})/Folder`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Name: folderName, Description: 'Census submission' }),
  });
  if (!folderRes.ok) {
    throw new Error(`ShareFile folder creation failed: ${folderRes.status} ${await folderRes.text()}`);
  }
  const { Id: subFolderId } = await folderRes.json() as { Id: string };

  // Upload all 3 files in parallel
  await Promise.all([
    uploadFile(token, subFolderId, params.originalFilename, params.originalBuffer, 'application/octet-stream'),
    uploadFile(token, subFolderId, params.adminFilename,    params.adminBuffer,    XLSX_MIME),
    uploadFile(token, subFolderId, params.ltFilename,       params.ltBuffer,       XLSX_MIME),
  ]);

  return {
    folderUrl: `https://${SUBDOMAIN}.sharefile.com/folderID/${subFolderId}`,
  };
}
