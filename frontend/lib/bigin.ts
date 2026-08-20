const TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const API_BASE  = 'https://www.zohoapis.com/bigin/v2';

let cachedToken: { access: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.access;
  }

  const clientId     = process.env.BIGIN_CLIENT_ID;
  const clientSecret = process.env.BIGIN_CLIENT_SECRET;
  const refreshToken = process.env.BIGIN_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Bigin credentials not configured');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!data.access_token) {
    console.error('Bigin token refresh failed:', JSON.stringify(data));
    throw new Error('Bigin authentication failed');
  }

  cachedToken = {
    access:    data.access_token as string,
    expiresAt: Date.now() + (Number(data.expires_in ?? 3600) * 1000),
  };
  return cachedToken.access;
}

export interface BiginContact {
  id:       string;
  name:     string;
  email:    string;
  company:  string;
  planType?: 'conversion' | 'startup' | null;
}

async function getPlanTypeForCompany(companyName: string, token: string): Promise<'conversion' | 'startup' | null> {
  if (!companyName) return null;
  const params = new URLSearchParams({ word: companyName, fields: 'id,Type,Stage', per_page: '5' });
  const res = await fetch(`${API_BASE}/Pipelines/search?${params}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok || res.status === 204) return null;
  const data = await res.json() as { data?: Record<string, unknown>[] };
  if (!data.data?.length) return null;
  const type = String(data.data[0].Type ?? '').toLowerCase();
  if (type.includes('conversion')) return 'conversion';
  if (type.includes('start')) return 'startup';
  return null;
}

export async function searchContacts(query: string): Promise<BiginContact[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({ word: query, fields: 'id,Full_Name,Email,Account_Name', per_page: '10' });
  const res = await fetch(`${API_BASE}/Contacts/search?${params}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    console.error(`Bigin search failed (${res.status}):`, await res.text());
    throw new Error('Bigin search failed');
  }

  const data = await res.json() as { data?: Record<string, unknown>[] };
  if (!data.data) return [];

  return Promise.all(data.data.map(async c => {
    const company = String((c.Account_Name as Record<string, unknown>)?.name ?? c.Account_Name ?? '');
    const planType = company ? await getPlanTypeForCompany(company, token).catch(() => null) : null;
    return {
      id:      String(c.id ?? ''),
      name:    String(c.Full_Name ?? ''),
      email:   String(c.Email ?? ''),
      company,
      planType,
    };
  }));
}
