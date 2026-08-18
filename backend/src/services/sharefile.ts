import { getSupabase } from './supabase';

const DEFAULT_SUBDOMAIN = process.env.SHAREFILE_SUBDOMAIN ?? 'forus-all';
const FOLDER_ID         = process.env.SHAREFILE_FOLDER_ID ?? '';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// In-memory cache to avoid hitting Supabase on every upload
let memCache: { accessToken: string; refreshToken: string; expiresAt: number; subdomain: string; apicp: string } | null = null;
const REFRESH_BUFFER_MS = 30 * 60 * 1000;

function authUrl(subdomain: string, apicp: string) {
  return `https://${subdomain}.${apicp}/oauth/token`;
}

function apiBase(subdomain: string, apicp: string) {
  return `https://${subdomain}.sf-api.com/sf/v3`;
}

async function loadTokenFromSupabase(): Promise<typeof memCache> {
  const supabase = getSupabase();
  const { data } = await supabase.from('sharefile_tokens').select('*').eq('id', 1).single();
  if (!data) return null;
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    new Date(data.expires_at).getTime(),
    subdomain:    data.subdomain ?? DEFAULT_SUBDOMAIN,
    apicp:        data.apicp ?? 'sharefile.com',
  };
}

async function saveTokenToSupabase(token: typeof memCache) {
  if (!token) return;
  const supabase = getSupabase();
  await supabase.from('sharefile_tokens').upsert({
    id:            1,
    access_token:  token.accessToken,
    refresh_token: token.refreshToken,
    expires_at:    new Date(token.expiresAt).toISOString(),
    subdomain:     token.subdomain,
    apicp:         token.apicp,
  });
}

async function refreshAccessToken(token: NonNullable<typeof memCache>): Promise<NonNullable<typeof memCache>> {
  const clientId     = process.env.SHAREFILE_CLIENT_ID;
  const clientSecret = process.env.SHAREFILE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('ShareFile credentials not configured');

  const res = await fetch(authUrl(token.subdomain, token.apicp), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: token.refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(`ShareFile token refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number };

  return {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:    Date.now() + json.expires_in * 1000,
    subdomain:    token.subdomain,
    apicp:        token.apicp,
  };
}

async function getAccessToken(): Promise<{ token: string; subdomain: string; apicp: string }> {
  const now = Date.now();

  // Try memory cache first
  if (memCache && memCache.expiresAt - REFRESH_BUFFER_MS > now) {
    return { token: memCache.accessToken, subdomain: memCache.subdomain, apicp: memCache.apicp };
  }

  // Load from Supabase if not in memory
  if (!memCache) {
    memCache = await loadTokenFromSupabase();
  }

  if (!memCache) {
    throw new Error('ShareFile not connected. Visit http://localhost:4000/api/sharefile/setup to connect.');
  }

  // Refresh if near expiry
  if (memCache.expiresAt - REFRESH_BUFFER_MS <= now) {
    try {
      memCache = await refreshAccessToken(memCache);
      await saveTokenToSupabase(memCache);
    } catch (err) {
      console.error('ShareFile token refresh failed, clearing cache:', err);
      memCache = null;
      throw new Error('ShareFile token expired. Visit http://localhost:4000/api/sharefile/setup to reconnect.');
    }
  }

  return { token: memCache.accessToken, subdomain: memCache.subdomain, apicp: memCache.apicp };
}

async function uploadFile(token: string, subdomain: string, apicp: string, folderId: string, fileName: string, content: Buffer, mimeType: string): Promise<void> {
  const base = apiBase(subdomain, apicp);
  const uploadInfoRes = await fetch(`${base}/Items(${folderId})/Upload2`, {
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

export async function uploadCensusToShareFile(params: {
  sponsorName:      string;
  uploaderName:     string;
  uploaderEmail:    string;
  dateStr:          string;
  originalBuffer:   Buffer;
  originalFilename: string;
  adminBuffer:      Buffer;
  adminFilename:    string;
  ltBuffer:         Buffer;
  ltFilename:       string;
}): Promise<{ folderUrl: string }> {
  const { token, subdomain, apicp } = await getAccessToken();
  const base = apiBase(subdomain, apicp);

  const sanitize  = (s: string) => s.replace(/[/\\:*?"<>|]/g, '').trim();
  const safeName  = sanitize(params.sponsorName);
  const uploader  = params.uploaderName ? sanitize(params.uploaderName) : '';
  const email     = params.uploaderEmail ? params.uploaderEmail.trim() : '';
  const uploaderPart = uploader ? (email ? `${uploader} (${email})` : uploader) : '';
  const folderName = uploaderPart
    ? `${safeName} - ${uploaderPart} - ${params.dateStr}`
    : `${safeName} - ${params.dateStr}`;

  const folderRes = await fetch(`${base}/Items(${FOLDER_ID})/Folder`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Name: folderName, Description: 'Census submission' }),
  });
  if (!folderRes.ok) throw new Error(`ShareFile folder creation failed: ${folderRes.status} ${await folderRes.text()}`);
  const { Id: subFolderId } = await folderRes.json() as { Id: string };

  await Promise.all([
    uploadFile(token, subdomain, apicp, subFolderId, params.originalFilename, params.originalBuffer, 'application/octet-stream'),
    uploadFile(token, subdomain, apicp, subFolderId, params.adminFilename,    params.adminBuffer,    XLSX_MIME),
    uploadFile(token, subdomain, apicp, subFolderId, params.ltFilename,       params.ltBuffer,       XLSX_MIME),
  ]);

  return { folderUrl: `https://${subdomain}.sharefile.com/folderID/${subFolderId}` };
}
