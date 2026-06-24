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
  if (/^\d{9}$/.test(s)) return `${s.slice(0,3)}-${s.slice(3,5)}-${s.slice(5)}`;
  // already formatted
  if (/^\d{3}-\d{2}-\d{4}$/.test(String(v).trim())) return String(v).trim();
  return String(v).trim();
}

export function cleanPhone(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim();
  if (s.startsWith('+1')) {
    const digits = s.slice(2).replace(/\D/g, '');
    return digits.length === 10 ? digits : digits;
  }
  if (s.startsWith('+')) {
    // Non-US country code — keep full number, just remove the +
    return s.slice(1).replace(/\D/g, '');
  }
  let digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
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
  // Excel serial number
  if (/^\d{4,5}$/.test(s)) {
    const d = new Date((parseInt(s) - 25569) * 86400000);
    if (!isNaN(d.getTime())) {
      return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
  }
  // Try JS Date parse as fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  }
  return s;
}

export function cleanZIP(v: unknown): string {
  if (!v) return '';
  const s = String(v).replace(/\.0+$/, '').trim();
  if (/^\d{5}-\d{4}$/.test(s)) return s; // ZIP+4 preserved
  const digits = s.replace(/\D/g, '');
  return digits.length <= 5 ? digits.padStart(5, '0') : digits.slice(0, 5);
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

export function processEmployee(raw: Record<string, unknown>): CensusEmployee {
  return {
    ssn: cleanSSN(raw.ssn),
    lastName: titleCase(raw.lastName),
    firstName: titleCase(raw.firstName),
    mi: raw.mi ? String(raw.mi).trim().charAt(0).toUpperCase() : '',
    street1: titleCase(raw.street1),
    street2: raw.street2 ? String(raw.street2).trim() : '',
    city: titleCase(raw.city),
    state: cleanState(raw.state),
    zip: cleanZIP(raw.zip),
    dob: cleanDate(raw.dob),
    doh: cleanDate(raw.doh),
    termDate: cleanDate(raw.termDate),
    rehireDate: cleanDate(raw.rehireDate),
    email: cleanEmail(raw.email),
    phone: cleanPhone(raw.phone),
    gender: raw.gender ? String(raw.gender).trim() : '',
    divisionId: raw.divisionId ? String(raw.divisionId).trim() : '',
    pretaxDeferral: raw.pretaxDeferral ? String(raw.pretaxDeferral) : '',
    rothAmount: raw.rothAmount ? String(raw.rothAmount) : '',
    matchingAmount: raw.matchingAmount ? String(raw.matchingAmount) : '',
    matchingSH: raw.matchingSH ? String(raw.matchingSH) : '',
    profitSharing: raw.profitSharing ? String(raw.profitSharing) : '',
    nonElectiveSH: raw.nonElectiveSH ? String(raw.nonElectiveSH) : '',
    planCompensation: raw.planCompensation ? String(raw.planCompensation) : '',
    currentHours: raw.currentHours ? String(raw.currentHours) : '',
    maritalStatus: raw.maritalStatus ? String(raw.maritalStatus) : '',
    loanPayments: raw.loanPayments ? String(raw.loanPayments) : '',
  };
}
