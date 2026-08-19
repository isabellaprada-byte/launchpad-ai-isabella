import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUBDOMAIN = process.env.SHAREFILE_SUBDOMAIN ?? 'forus-all';
const FOLDER_ID         = process.env.SHAREFILE_FOLDER_ID ?? '';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

let memCache: { accessToken: string; refreshToken: string; expiresAt: number; subdomain: string; apicp: string } | null = null;
const REFRESH_BUFFER_MS = 30 * 60 * 1000;

function authUrl(subdomain: string, apicp: string) {
  return `https://${subdomain}.${apicp}/oauth/token`;
}

function apiBase(subdomain: string, apicp: string) {
  return `https://${subdomain}.sf-api.com/sf/v3`;
}

async function loadToken() {
  const supabase = getSupabase();
  const { data } = await supabase.from('sharefile_tokens').select('*').eq('id', 1).single();
  if (!data) return null;
  return {
    accessToken:  data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt:    new Date(data.expires_at as string).getTime(),
    subdomain:    (data.subdomain as string) ?? DEFAULT_SUBDOMAIN,
    apicp:        (data.apicp as string) ?? 'sharefile.com',
  };
}

async function saveToken(token: NonNullable<typeof memCache>) {
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

async function refreshToken(current: NonNullable<typeof memCache>): Promise<NonNullable<typeof memCache>> {
  const clientId     = process.env.SHAREFILE_CLIENT_ID;
  const clientSecret = process.env.SHAREFILE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('ShareFile credentials not configured');

  const res = await fetch(authUrl(current.subdomain, current.apicp), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: current.refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`ShareFile refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as Record<string, unknown>;

  const refreshed = {
    accessToken:  json.access_token as string,
    refreshToken: (json.refresh_token as string) ?? current.refreshToken,
    expiresAt:    Date.now() + (Number(json.expires_in ?? 28800) * 1000),
    subdomain:    current.subdomain,
    apicp:        current.apicp,
  };
  await saveToken(refreshed);
  return refreshed;
}

async function getAccessToken() {
  if (memCache && memCache.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return { token: memCache.accessToken, subdomain: memCache.subdomain, apicp: memCache.apicp };
  }
  let loaded = await loadToken();
  if (!loaded) throw new Error('ShareFile not connected. Run /api/sharefile/setup to authorize.');
  if (loaded.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
    loaded = await refreshToken(loaded);
  }
  memCache = loaded;
  return { token: loaded.accessToken, subdomain: loaded.subdomain, apicp: loaded.apicp };
}

async function uploadFile(token: string, subdomain: string, apicp: string, folderId: string, fileName: string, content: Buffer, mimeType: string) {
  const base = apiBase(subdomain, apicp);
  const uploadInfoRes = await fetch(`${base}/Items(${folderId})/Upload2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Method: 'Standard', Raw: true, FileName: fileName }),
  });
  if (!uploadInfoRes.ok) throw new Error(`ShareFile Upload2 failed: ${uploadInfoRes.status}`);
  const { ChunkUri } = await uploadInfoRes.json() as { ChunkUri: string };

  const uploadRes = await fetch(ChunkUri, {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: new Uint8Array(content),
  });
  if (!uploadRes.ok) throw new Error(`ShareFile file upload failed: ${uploadRes.status}`);
}

export async function uploadCensusToShareFile(params: {
  sponsorName:    string;
  uploaderName:   string;
  uploaderEmail:  string;
  dateStr:        string;
  originalBuffer: Buffer;
  originalFilename: string;
  adminBuffer:    Buffer;
  adminFilename:  string;
  ltBuffer:       Buffer;
  ltFilename:     string;
}): Promise<{ folderUrl: string }> {
  const { token, subdomain, apicp } = await getAccessToken();
  const base = apiBase(subdomain, apicp);

  const sanitize     = (s: string) => s.replace(/[/\\:*?"<>|]/g, '').trim();
  const safeName     = sanitize(params.sponsorName);
  const uploader     = params.uploaderName ? sanitize(params.uploaderName) : '';
  const email        = params.uploaderEmail?.trim() ?? '';
  const uploaderPart = uploader ? (email ? `${uploader} (${email})` : uploader) : '';
  const folderName   = uploaderPart
    ? `${safeName} - ${uploaderPart} - ${params.dateStr}`
    : `${safeName} - ${params.dateStr}`;

  const folderRes = await fetch(`${base}/Items(${FOLDER_ID})/Folder`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Name: folderName, Description: 'Census submission' }),
  });
  if (!folderRes.ok) throw new Error(`ShareFile folder creation failed: ${folderRes.status}`);
  const { Id: subFolderId } = await folderRes.json() as { Id: string };

  await Promise.all([
    uploadFile(token, subdomain, apicp, subFolderId, params.originalFilename, params.originalBuffer, 'application/octet-stream'),
    uploadFile(token, subdomain, apicp, subFolderId, params.adminFilename,    params.adminBuffer,    XLSX_MIME),
    uploadFile(token, subdomain, apicp, subFolderId, params.ltFilename,       params.ltBuffer,       XLSX_MIME),
  ]);

  return { folderUrl: `https://${subdomain}.sharefile.com/folderID/${subFolderId}` };
}
