const SUBDOMAIN = process.env.SHAREFILE_SUBDOMAIN ?? 'forus-all';
const FOLDER_ID = process.env.SHAREFILE_FOLDER_ID ?? 'fo19927c-2e24-4dbe-8b09-6cdce709415a';
const AUTH_URL  = `https://${SUBDOMAIN}.sharefile.com/oauth/token`;
const API_BASE  = `https://${SUBDOMAIN}.sf-api.com/sf/v3`;

// Token cached in memory for the lifetime of the process.
// On server restart, falls back to password grant automatically.
let tokenCache: {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number; // ms since epoch
} | null = null;

const REFRESH_BUFFER_MS = 30 * 60 * 1000; // renew 30 min before the 8-hour expiry

function getEnvCredentials() {
  const clientId     = process.env.SHAREFILE_CLIENT_ID;
  const clientSecret = process.env.SHAREFILE_CLIENT_SECRET;
  const username     = process.env.SHAREFILE_USERNAME;
  const password     = process.env.SHAREFILE_PASSWORD;
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('ShareFile credentials not configured (SHAREFILE_CLIENT_ID, SHAREFILE_CLIENT_SECRET, SHAREFILE_USERNAME, SHAREFILE_PASSWORD)');
  }
  return { clientId, clientSecret, username, password };
}

async function authWithPassword(): Promise<void> {
  const { clientId, clientSecret, username, password } = getEnvCredentials();
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: clientId, client_secret: clientSecret, username, password }),
  });
  if (!res.ok) throw new Error(`ShareFile password auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  tokenCache = {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:    Date.now() + json.expires_in * 1000,
  };
}

async function authWithRefresh(): Promise<void> {
  if (!tokenCache?.refreshToken) throw new Error('No refresh token available');
  const { clientId, clientSecret } = getEnvCredentials();
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenCache.refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`ShareFile token refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  tokenCache = {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:    Date.now() + json.expires_in * 1000,
  };
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Token is valid and not near expiry
  if (tokenCache && tokenCache.expiresAt - REFRESH_BUFFER_MS > now) {
    return tokenCache.accessToken;
  }

  // Token is near expiry — try refresh first, fall back to password grant
  if (tokenCache?.refreshToken) {
    try {
      await authWithRefresh();
      return tokenCache!.accessToken;
    } catch {
      // refresh failed (e.g. revoked), fall through to password grant
    }
  }

  // No token or refresh failed — authenticate fresh
  await authWithPassword();
  return tokenCache!.accessToken;
}

async function uploadFile(token: string, folderId: string, fileName: string, content: Buffer, mimeType: string): Promise<void> {
  const uploadInfoRes = await fetch(`${API_BASE}/Items(${folderId})/Upload2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Method: 'Standard', Raw: true, FileName: fileName }),
  });
  if (!uploadInfoRes.ok) throw new Error(`ShareFile Upload2 failed: ${uploadInfoRes.status} ${await uploadInfoRes.text()}`);
  const { ChunkUri } = await uploadInfoRes.json() as { ChunkUri: string };

  const uploadRes = await fetch(ChunkUri, {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: new Uint8Array(content),
  });
  if (!uploadRes.ok) throw new Error(`ShareFile file upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
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

  const safeName   = params.sponsorName.replace(/[/\\:*?"<>|]/g, '').trim();
  const folderName = `${safeName} - ${params.dateStr}`;

  const folderRes = await fetch(`${API_BASE}/Items(${FOLDER_ID})/Folder`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Name: folderName, Description: 'Census submission' }),
  });
  if (!folderRes.ok) throw new Error(`ShareFile folder creation failed: ${folderRes.status} ${await folderRes.text()}`);
  const { Id: subFolderId } = await folderRes.json() as { Id: string };

  await Promise.all([
    uploadFile(token, subFolderId, params.originalFilename, params.originalBuffer, 'application/octet-stream'),
    uploadFile(token, subFolderId, params.adminFilename,    params.adminBuffer,    XLSX_MIME),
    uploadFile(token, subFolderId, params.ltFilename,       params.ltBuffer,       XLSX_MIME),
  ]);

  return { folderUrl: `https://${SUBDOMAIN}.sharefile.com/folderID/${subFolderId}` };
}
