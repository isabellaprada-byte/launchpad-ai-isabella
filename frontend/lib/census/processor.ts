// Census data transformation rules — TypeScript port of SKILL.md rules

const PARTICLES = new Set(['de','la','del','von','van','los','las','el','di','da','dos','das','du','le']);
const ROMANS = new Set(['II','III','IV','VI','VII','VIII','IX']);
const DIRECTIONALS = new Set(['N','S','E','W','NE','NW','SE','SW','PO']);
const STATE_MAP: Record<string, string> = {
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',
  colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',
  hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',
  kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',
  michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',
  nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',
  ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI',
  'south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',
  utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',
  wisconsin:'WI',wyoming:'WY',
};

export function cleanSSN(v: unknown): string {
  if (!v) return '';
  const s = String(v).replace(/[\s\t\-]/g, '');
  // Pad to 9 digits — Excel drops leading zeros when SSN is stored as a number
  // (e.g. 023-45-6789 becomes integer 23456789, 8 digits)
  if (/^\d{7,9}$/.test(s)) {
    const padded = s.padStart(9, '0');
    return `${padded.slice(0,3)}-${padded.slice(3,5)}-${padded.slice(5)}`;
  }
  // already formatted
  if (/^\d{3}-\d{2}-\d{4}$/.test(String(v).trim())) return String(v).trim();
  return String(v).trim();
}

export function cleanPhone(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim();
  // Strip formatting: +, dashes, spaces, dots, parentheses
  const digits = s.replace(/[\s\-\.\(\)\+]/g, '').replace(/\D/g, '');
  if (!digits) return s; // no digits at all — preserve original so validator can flag it
  // If more than 10 digits, assume the leading digits are a country code → take the last 10
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function cleanDate(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim();
  if (!s || s === '00/00/0000' || s.toLowerCase() === 'n/a') return '';
  // Already mm/dd/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  // Excel serial number — only 5-digit serials (all valid employee dates land here:
  // 1940=14610, 2030=47118). 4-digit values are almost certainly years like "1985",
  // not serials — treating them as serials produces nonsense dates around 1903.
  if (/^\d{5}$/.test(s)) {
    const d = new Date((parseInt(s) - 25569) * 86400000);
    if (!isNaN(d.getTime())) {
      return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
  }
  // Try JS Date parse as fallback — use UTC to avoid timezone-driven off-by-one day
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  return s;
}

export function cleanZIP(v: unknown): string {
  if (!v) return '';
  const s = String(v).replace(/\.0+$/, '').trim();
  if (/^\d{5}-\d{4}$/.test(s)) return s; // ZIP+4 preserved
  const digits = s.replace(/\D/g, '');
  // If value has no digits (e.g. "NY" put in wrong column), preserve as-is so validator flags it
  if (!digits) return s;
  if (digits.length > 5) return digits.slice(0, 5);
  return digits.padStart(5, '0'); // pad numeric-only values for leading zeros (e.g. "1234" → "01234")
}

export function cleanState(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return STATE_MAP[s.toLowerCase()] ?? s.toUpperCase();
}

function capToken(t: string): string {
  const upper = t.toUpperCase();
  const lower = t.toLowerCase();
  if (ROMANS.has(upper)) return upper;
  if (DIRECTIONALS.has(upper) && t.length <= 2) return upper;
  if (PARTICLES.has(lower)) return lower;
  // Preserve internal mixed case (McDaniel, MacDonald)
  if (t !== upper && t !== lower) return t;
  if (t.includes('-')) return t.split('-').map(p => capToken(p)).join('-');
  if (t.includes("'")) {
    const parts = t.split("'");
    return parts.map((p, i) => i === 0 ? capToken(p) : capToken(p)).join("'");
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function titleCase(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim();
  if (!s) return '';
  const tokens = s.split(/\s+/);
  const result = tokens.map((t, i) => {
    const capped = capToken(t);
    if (!capped) return capped;
    // First token always capitalized
    if (i === 0 && capped[0] === capped[0].toLowerCase()) {
      return capped.charAt(0).toUpperCase() + capped.slice(1);
    }
    return capped;
  });
  return result.join(' ');
}

export function cleanEmail(v: unknown): string {
  return v ? String(v).trim().toLowerCase() : '';
}

export interface CensusEmployee {
  ssn: string;
  lastName: string;
  firstName: string;
  mi: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  dob: string;
  doh: string;
  termDate: string;
  rehireDate: string;
  email: string;
  phone: string;
  gender: string;
  divisionId: string;
  // contribution fields (pass-through for admin panel)
  pretaxDeferral: string;
  rothAmount: string;
  matchingAmount: string;
  matchingSH: string;
  profitSharing: string;
  nonElectiveSH: string;
  planCompensation: string;
  currentHours: string;
  maritalStatus: string;
  loanPayments: string;
}

// Apply the correct cleaning function for a given field when someone manually enters a fix
export function cleanFieldValue(field: string, value: string): string {
  switch (field) {
    case 'ssn':       return cleanSSN(value);
    case 'phone':     return cleanPhone(value);
    case 'email':     return cleanEmail(value);
    case 'zip':       return cleanZIP(value);
    case 'state':     return cleanState(value);
    case 'dob':
    case 'doh':
    case 'termDate':
    case 'rehireDate': return cleanDate(value);
    case 'firstName':
    case 'lastName':
    case 'street1':
    case 'street2':
    case 'city':      return titleCase(value);
    default:          return value.trim();
  }
}

const NULLISH = new Set(['n/a', 'na', 'n.a.', 'none', 'null', 'nil', '-', '--', '---', 'not applicable', 'not available']);

function nullish(v: unknown): unknown {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || NULLISH.has(s.toLowerCase())) return '';
  return v;
}

export function processEmployee(raw: Record<string, unknown>): CensusEmployee {
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, nullish(v)]));
  return {
    ssn: cleanSSN(r.ssn),
    lastName: titleCase(r.lastName),
    firstName: titleCase(r.firstName),
    mi: r.mi ? String(r.mi).trim().charAt(0).toUpperCase() : '',
    street1: titleCase(r.street1),
    street2: r.street2 ? String(r.street2).trim() : '',
    city: titleCase(r.city),
    state: cleanState(r.state),
    zip: cleanZIP(r.zip),
    dob: cleanDate(r.dob),
    doh: cleanDate(r.doh),
    termDate: cleanDate(r.termDate),
    rehireDate: cleanDate(r.rehireDate),
    email: cleanEmail(r.email),
    phone: cleanPhone(r.phone),
    gender: r.gender ? String(r.gender).trim() : '',
    divisionId: r.divisionId ? String(r.divisionId).trim() : '',
    pretaxDeferral: r.pretaxDeferral ? String(r.pretaxDeferral) : '',
    rothAmount: r.rothAmount ? String(r.rothAmount) : '',
    matchingAmount: r.matchingAmount ? String(r.matchingAmount) : '',
    matchingSH: r.matchingSH ? String(r.matchingSH) : '',
    profitSharing: r.profitSharing ? String(r.profitSharing) : '',
    nonElectiveSH: r.nonElectiveSH ? String(r.nonElectiveSH) : '',
    planCompensation: r.planCompensation ? String(r.planCompensation) : '',
    currentHours: r.currentHours ? String(r.currentHours) : '',
    maritalStatus: r.maritalStatus ? String(r.maritalStatus) : '',
    loanPayments: r.loanPayments ? String(r.loanPayments) : '',
  };
}
