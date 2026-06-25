import * as XLSX from 'exceljs';
import { processEmployee } from './processor';
import type { CensusEmployee } from './processor';

// Exact-match aliases (after normalization: lowercase, _ and - → space, parens stripped)
const HEADER_MAP: Record<string, keyof CensusEmployee> = {
  // SSN
  ssn: 'ssn', ss: 'ssn', 'ss number': 'ssn', 'social security': 'ssn',
  'social security number': 'ssn', 'social security no': 'ssn',
  // Name
  'last name': 'lastName', lastname: 'lastName', surname: 'lastName',
  'legal lastname': 'lastName', 'legal last name': 'lastName',
  'first name': 'firstName', firstname: 'firstName',
  'legal firstname': 'firstName', 'legal first name': 'firstName',
  'middle initial': 'mi', mi: 'mi', middle: 'mi',
  'name middle': 'mi', 'name middle initial': 'mi', 'name mi': 'mi', 'm.i.': 'mi',
  // Address
  'address 1': 'street1', 'street 1': 'street1', 'street address': 'street1',
  'primary address line 1': 'street1', 'address line 1': 'street1',
  'address street 1': 'street1',
  'address 2': 'street2', 'street 2': 'street2', apt: 'street2',
  'primary address line 2': 'street2', 'address line 2': 'street2',
  'address street 2': 'street2', address2: 'street2', addr2: 'street2',
  'apt number': 'street2', suite: 'street2', 'apt suite': 'street2',
  city: 'city', 'primary city': 'city', 'address city': 'city',
  state: 'state', 'primary state': 'state', 'address state': 'state',
  zip: 'zip', 'zip code': 'zip', postal: 'zip',
  'primary zip': 'zip', 'primary zip code': 'zip',
  'address postal code': 'zip', 'address zip code': 'zip',
  // Email aliases used by some HR/payroll exports
  'internet address': 'email', 'internet address other': 'email',
  'email address other': 'email',
  // Dates
  dob: 'dob', 'date of birth': 'dob', birthdate: 'dob', birthday: 'dob',
  'birth date': 'dob',
  doh: 'doh', 'date of hire': 'doh', 'hire date': 'doh',
  'termination date': 'termDate', 'term date': 'termDate', terminated: 'termDate',
  'rehire date': 'rehireDate', 'date of rehire': 'rehireDate',
  // Contact
  email: 'email', 'email address': 'email',
  phone: 'phone', 'phone number': 'phone', telephone: 'phone', mobile: 'phone',
  gender: 'gender', sex: 'gender',
  'division id': 'divisionId', division: 'divisionId',
  // Contribution
  'pre tax deferral': 'pretaxDeferral', pretax: 'pretaxDeferral', '401k': 'pretaxDeferral',
  'pre-tax deferral': 'pretaxDeferral',
  'roth amount': 'rothAmount', roth: 'rothAmount',
  'matching amount': 'matchingAmount', match: 'matchingAmount',
  'matching sh': 'matchingSH',
  'profit sharing': 'profitSharing',
  'non elective sh': 'nonElectiveSH', 'non-elective sh': 'nonElectiveSH',
  'plan compensation': 'planCompensation', compensation: 'planCompensation',
  'current hours': 'currentHours', hours: 'currentHours',
  'marital status': 'maritalStatus', marital: 'maritalStatus',
  'loan payments': 'loanPayments', loan: 'loanPayments',
};

// Keyword-based fallback rules — checked when no exact match found.
// Order matters: more specific rules first.
type FieldKey = keyof CensusEmployee;
const KEYWORD_RULES: Array<{ test: (h: string) => boolean; field: FieldKey }> = [
  // SSN — must check before generic "number" rules
  { test: h => (h.includes('ss') || h.includes('social') || h.includes('tin')) && (h.includes('number') || h.includes('num') || h.includes('no') || h === 'ss' || h === 'ssn'), field: 'ssn' },
  // Name
  { test: h => (h.includes('legal') || h.includes('last')) && h.includes('name') && !h.includes('first'), field: 'lastName' },
  { test: h => (h.includes('legal') || h.includes('first')) && h.includes('name') && !h.includes('last'), field: 'firstName' },
  { test: h => h.includes('middle') || (h === 'mi'), field: 'mi' },
  // Address — specific compound variants BEFORE generic street1 rule
  { test: h => (h.includes('address') || h.includes('addr')) && (h.includes('2') || h.includes('line 2') || h.includes('apt') || h.includes('suite') || h.includes('unit')), field: 'street2' },
  { test: h => h.includes('internet') && (h.includes('address') || h.includes('email')), field: 'email' },
  { test: h => (h.includes('address') || h.includes('addr')) && h.includes('city'), field: 'city' },
  { test: h => (h.includes('address') || h.includes('addr')) && (h.includes('state') || h.includes('province')) && !h.includes('status'), field: 'state' },
  { test: h => (h.includes('address') || h.includes('addr')) && (h.includes('zip') || h.includes('postal')), field: 'zip' },
  // Generic street1 — only after city/state/zip/internet have already been handled above
  { test: h => (h.includes('address') || h.includes('addr') || h.includes('street')) && !h.includes('email') && !h.includes('internet') && !h.includes('city') && !h.includes('state') && !h.includes('zip') && !h.includes('postal'), field: 'street1' },
  { test: h => h.includes('city'), field: 'city' },
  { test: h => h === 'state' || (h.includes('state') && !h.includes('status') && !h.includes('employee')), field: 'state' },
  { test: h => h.includes('zip') || h.includes('postal'), field: 'zip' },
  // Dates — rehire before hire, termination standalone
  { test: h => h.includes('rehire') || h.includes('re hire') || h.includes('re-hire'), field: 'rehireDate' },
  { test: h => (h.includes('term') && (h.includes('date') || h.includes('dt'))) || h === 'termination date', field: 'termDate' },
  { test: h => (h.includes('hire') && !h.includes('rehire')) && (h.includes('date') || h.includes('dt') || h === 'hire date' || h === 'doh'), field: 'doh' },
  { test: h => h.includes('birth') || h === 'dob', field: 'dob' },
  // Contact
  // Skip personal/work email here — handled separately in buildRawRow with priority logic
  { test: h => h.includes('email') && !h.includes('personal') && !h.includes('work'), field: 'email' },
  { test: h => h.includes('phone') || h.includes('mobile') || h.includes('cell') || h.includes('telephone'), field: 'phone' },
  { test: h => h.includes('gender') || h === 'sex', field: 'gender' },
  // Contribution
  { test: h => h.includes('roth'), field: 'rothAmount' },
  { test: h => (h.includes('pre') && h.includes('tax')) || h.includes('pretax') || h.includes('401k') || h.includes('deferral'), field: 'pretaxDeferral' },
  { test: h => h.includes('match') && !h.includes('mismatch'), field: 'matchingAmount' },
  { test: h => h.includes('profit') && h.includes('shar'), field: 'profitSharing' },
  { test: h => h.includes('compensation') || h.includes('comp') && h.includes('plan'), field: 'planCompensation' },
  { test: h => h.includes('hour'), field: 'currentHours' },
  { test: h => h.includes('marital'), field: 'maritalStatus' },
  { test: h => h.includes('division'), field: 'divisionId' },
  { test: h => h.includes('loan'), field: 'loanPayments' },
];

function matchHeader(raw: unknown): FieldKey | undefined {
  // Normalize: lowercase, replace _ and - and ( and ) with space, collapse spaces
  const norm = String(cellValue(raw) ?? '')
    .toLowerCase()
    .replace(/[_\-\(\)\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Exact match
  if (HEADER_MAP[norm]) return HEADER_MAP[norm];

  // 2. Keyword rules
  for (const rule of KEYWORD_RULES) {
    if (rule.test(norm)) return rule.field;
  }

  return undefined;
}

// Tracks which column indices need special (non-direct) handling
interface SpecialCols {
  combinedName?: number;
  combinedAddress?: number;
  workEmailCol?: number;
  personalEmailCol?: number;
}

function normSpecial(h: unknown): string {
  return String(cellValue(h) ?? '').toLowerCase().replace(/[_\-\(\)\/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSpecialCols(headers: unknown[]): SpecialCols {
  const special: SpecialCols = {};
  headers.forEach((h, i) => {
    const norm = normSpecial(h);
    if (/^(name|full name|employee name|participant name)$/.test(norm)) special.combinedName = i;
    if (/^address$/.test(norm)) special.combinedAddress = i;
    if (norm.includes('work') && norm.includes('email')) special.workEmailCol = i;
    if (norm.includes('personal') && norm.includes('email')) special.personalEmailCol = i;
  });
  return special;
}

function splitCombinedName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // Assume "First Last" or "First MI Last" — take first as firstName, last token as lastName
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

// Parse "3512 Clint Drive Trenton OH 45067" → street1, city, state, zip
function splitCombinedAddress(addr: string): { street1: string; city: string; state: string; zip: string } {
  const zipMatch = addr.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
  const zip = zipMatch?.[1] ?? '';
  const withoutZip = zip ? addr.slice(0, addr.lastIndexOf(zip)).trim() : addr;

  const stateMatch = withoutZip.match(/\b([A-Z]{2})\s*$/);
  const state = stateMatch?.[1] ?? '';
  const withoutState = state ? withoutZip.slice(0, withoutZip.lastIndexOf(state)).trim() : withoutZip;

  // Heuristic: last word(s) before state = city, rest = street
  // Split on last comma if present, else try to guess
  if (withoutState.includes(',')) {
    const lastComma = withoutState.lastIndexOf(',');
    return {
      street1: withoutState.slice(0, lastComma).trim(),
      city: withoutState.slice(lastComma + 1).trim(),
      state,
      zip,
    };
  }
  // No comma — take last word as city, rest as street
  const parts = withoutState.split(/\s+/);
  const city = parts[parts.length - 1] ?? '';
  const street1 = parts.slice(0, -1).join(' ');
  return { street1, city, state, zip };
}

// exceljs returns hyperlinks as {text, hyperlink} and formulas as {result, ...}
// Extract the display value in all cases
function cellValue(v: unknown): unknown {
  if (v == null) return '';
  if (typeof v === 'object') {
    // Date objects from exceljs are stored as UTC midnight — use UTC methods to
    // avoid the date shifting one day back in US timezones (UTC-5/6)
    if (typeof (v as Date).toISOString === 'function') {
      const d = v as Date;
const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }
    const o = v as Record<string, unknown>;
    if ('result' in o) return cellValue(o.result); // formula — unwrap recursively
    if ('text' in o) return o.text;                // hyperlink cell (emails, URLs)
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map(r => r.text ?? '').join('');
    }
  }
  return v;
}

function normalizeHeader(h: unknown): string {
  return String(cellValue(h) ?? '').trim().toLowerCase().replace(/[_\-]+/g, ' ');
}

function buildFieldMap(headers: unknown[]): Record<number, keyof CensusEmployee> {
  const map: Record<number, keyof CensusEmployee> = {};
  headers.forEach((h, i) => {
    const key = matchHeader(h);
    if (key) map[i] = key;
  });
  return map;
}

function buildRawRow(
  cells: unknown[],
  fieldMap: Record<number, keyof CensusEmployee>,
  special: SpecialCols,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};

  // Direct mapped fields — run through cellValue to unwrap hyperlinks/formulas
  Object.entries(fieldMap).forEach(([i, key]) => {
    raw[key] = cellValue(cells[parseInt(i)]);
  });

  // Combined NAME → firstName + lastName (only if not already set by direct map)
  if (special.combinedName !== undefined && !raw.firstName) {
    const fullName = String(cellValue(cells[special.combinedName]) ?? '').trim();
    if (fullName) {
      const { firstName, lastName } = splitCombinedName(fullName);
      raw.firstName = firstName;
      raw.lastName = lastName;
    }
  }

  // Combined ADDRESS → street1 + city + state + zip (always override direct mapping)
  if (special.combinedAddress !== undefined) {
    const addr = String(cellValue(cells[special.combinedAddress]) ?? '').trim();
    if (addr) {
      const parts = splitCombinedAddress(addr);
      raw.street1 = parts.street1;
      raw.city = parts.city;
      raw.state = parts.state;
      raw.zip = parts.zip;
    }
  }

  // Email priority: Work email first, fall back to Personal email
  if (special.workEmailCol !== undefined || special.personalEmailCol !== undefined) {
    const work = special.workEmailCol !== undefined
      ? String(cellValue(cells[special.workEmailCol]) ?? '').trim() : '';
    const personal = special.personalEmailCol !== undefined
      ? String(cellValue(cells[special.personalEmailCol]) ?? '').trim() : '';
    raw.email = work || personal;
  }

  return raw;
}

export interface ParseResult {
  employees: CensusEmployee[];
  rawCount: number;
}

export async function parseCensusFile(buffer: ArrayBuffer, filename: string): Promise<ParseResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return parseCSV(buffer);
  if (lower.endsWith('.pdf')) return parsePDF(buffer);
  // .xlsx / .xls
  return parseXLSX(buffer);
}

async function parseXLSX(buffer: ArrayBuffer): Promise<ParseResult> {
  const wb = new XLSX.Workbook();
  // exceljs types expect legacy Buffer — cast required for Node 22 compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(new Uint8Array(buffer)) as any);

  // Use first non-empty sheet
  let ws: XLSX.Worksheet | undefined;
  wb.eachSheet(sheet => { if (!ws && sheet.rowCount > 0) ws = sheet; });
  if (!ws) return { employees: [], rawCount: 0 };

  const rows: unknown[][] = [];
  ws.eachRow(row => { rows.push(row.values as unknown[]); });
  // exceljs uses 1-based arrays; index 0 is undefined
  const headerRow = (rows[0] as unknown[]).slice(1);
  const fieldMap = buildFieldMap(headerRow);
  const special = buildSpecialCols(headerRow);

  const employees: CensusEmployee[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = (rows[r] as unknown[]).slice(1);
    if (cells.every(c => c == null || c === '')) continue; // skip blank rows
    employees.push(processEmployee(buildRawRow(cells, fieldMap, special)));
  }

  return { employees, rawCount: employees.length };
}

async function parseCSV(buffer: ArrayBuffer): Promise<ParseResult> {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { employees: [], rawCount: 0 };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  };

  const headers = parseRow(lines[0]);
  const fieldMap = buildFieldMap(headers);
  const special = buildSpecialCols(headers);
  const employees: CensusEmployee[] = [];

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r].trim();
    if (!line) continue;
    const cells = parseRow(line);
    if (cells.every(c => !c.trim())) continue;
    employees.push(processEmployee(buildRawRow(cells.map(c => c.trim()), fieldMap, special)));
  }

  return { employees, rawCount: employees.length };
}

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b/;

async function parsePDF(buffer: ArrayBuffer): Promise<ParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
  const nodeBuffer: Buffer = Buffer.from(new Uint8Array(buffer));
  const data = await pdfParse(nodeBuffer);
  const text = data.text;

  const lines = text.split(/\n/).map((l: string) => l.trim()).filter(Boolean);
  const employees: CensusEmployee[] = [];

  // Strategy 1: look for a header row with SSN + name keywords on the same line
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if ((lower.includes('ssn') || lower.includes('social')) &&
        (lower.includes('name') || lower.includes('first'))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx !== -1) {
    const headers = lines[headerIdx].split(/\s{2,}|\t/);
    const fieldMap = buildFieldMap(headers);
    for (let r = headerIdx + 1; r < lines.length; r++) {
      const line = lines[r];
      if (!line.trim()) continue;
      const cells = line.split(/\s{2,}|\t/);
      if (cells.length < 3) continue;
      const raw: Record<string, unknown> = {};
      Object.entries(fieldMap).forEach(([i, key]) => {
        raw[key] = cells[parseInt(i)]?.trim() ?? '';
      });
      employees.push(processEmployee(raw));
    }
    if (employees.length > 0) return { employees, rawCount: employees.length };
  }

  // Strategy 2: scan for lines that contain an SSN pattern — treat each as a data row
  // Works for PDFs where headers and data are on separate pages or mixed-format layouts
  const ssnLines = lines.filter(l => SSN_RE.test(l));
  for (const line of ssnLines) {
    const ssnMatch = line.match(SSN_RE);
    if (!ssnMatch) continue;
    const ssn = ssnMatch[0];
    // Remove SSN from line and try to extract name from the remaining tokens
    const rest = line.replace(SSN_RE, '').trim();
    const tokens = rest.split(/\s{2,}|\t/).map((t: string) => t.trim()).filter(Boolean);
    // Try splitting first token as "LastName FirstName" or just use tokens
    let firstName = '', lastName = '', dob = '', doh = '';
    const dateRe = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
    const dates = rest.match(dateRe) ?? [];
    if (dates[0]) dob = dates[0];
    if (dates[1]) doh = dates[1];
    // Name heuristic: first token that has no digits and is 2+ words
    for (const t of tokens) {
      if (/\d/.test(t)) continue;
      const parts = t.split(/\s+/);
      if (parts.length >= 2) { lastName = parts[0]; firstName = parts.slice(1).join(' '); break; }
      if (!lastName) lastName = t;
      else if (!firstName) { firstName = t; break; }
    }
    employees.push(processEmployee({ ssn, firstName, lastName, dob, doh }));
  }

  return { employees, rawCount: employees.length };
}
