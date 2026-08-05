import * as XLSX from 'exceljs';
import type { CensusEmployee } from './processor';

// ── Admin Panel (26 cols, sheet name MUST be "Template") ─────────────────────
// Column order is IMMUTABLE — Ruby importer validates position, not header name

const ADMIN_HEADERS = [
  'Social Security Number', 'Name - Last',   'Name - First',              'Gender',          // 1-4
  'Date of Birth',          'Date of Hire - Original', 'Date of Rehire', 'Termination Date', // 5-8
  'Address - Street 1',     'Address - Street 2', 'Address - City', 'Address - State',       // 9-12
  'Address - Postal Code',  'Division ID',                                                    // 13-14
  'Pre-tax Deferral',       'Roth Amount',       'Matching Amount',   'Matching Safe Harbor', // 15-18
  'Profit Sharing',         'Non Elective Safe Harbor', 'Plan Compensation', 'Current Hours', // 19-22
  'Marital Status',         'Loan Payments',     'Internet Address - Other', 'phone',         // 23-26
];

function adminRow(e: CensusEmployee): string[] {
  return [
    e.ssn,            e.lastName,       e.firstName,        e.gender,
    e.dob,            e.doh,            e.rehireDate,       e.termDate,
    e.street1,        e.street2,        e.city,             e.state,
    e.zip,            e.divisionId,
    e.pretaxDeferral, e.rothAmount,     e.matchingAmount,   e.matchingSH,
    e.profitSharing,  e.nonElectiveSH,  e.planCompensation, e.currentHours,
    e.maritalStatus,  e.loanPayments,   e.email,            e.phone,
  ];
}

export async function buildAdminPanelXlsx(
  employees: CensusEmployee[],
): Promise<Buffer> {
  const wb = new XLSX.Workbook();
  const ws = wb.addWorksheet('Template'); // MUST be "Template" — Ruby importer validates this

  ws.addRow(ADMIN_HEADERS);
  ws.getRow(1).eachCell(cell => { cell.font = { bold: true }; });

  // SSN = col 1, Address - Postal Code = col 13 — must be TEXT to preserve leading zeros
  ws.getColumn(1).numFmt = '@';
  ws.getColumn(13).numFmt = '@';

  for (const emp of employees) {
    const row = ws.addRow(adminRow(emp));
    row.getCell(1).numFmt = '@';  // SSN
    row.getCell(13).numFmt = '@'; // ZIP
  }

  // NO blank rows at the end — Ruby importer throws nil:NilClass on empty trailing rows
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ── LT Trust (16 cols, sheet = Sheet1) ───────────────────────────────────────
// "Divison ID" intentional typo — NEVER correct. "First Name " has trailing space — keep it.

const LT_HEADERS = [
  'SSN',        'Last Name', 'First Name ', 'MI',           // A-D (note trailing space on First Name)
  'Address1',   'Address 2', 'City',         'State',        // E-H
  'Zip',        'Date of Birth', 'Date of Hire', 'Termination Date', // I-L
  'Most Recent Hire/Rehire Date', 'Email Addresses', 'Electronic Statements', 'Divison ID', // M-P
  '', '',  // Q-R: two extra empty columns present in the LT Trust template
];

// LT Trust SSN = 9 digits NO dashes (different from Admin Panel)
function ltSsn(ssn: string): string {
  return ssn.replace(/-/g, '');
}

function ltRow(e: CensusEmployee): string[] {
  return [
    ltSsn(e.ssn), e.lastName,  e.firstName, e.mi,
    e.street1,    e.street2,   e.city,      e.state,
    e.zip,        e.dob,       e.doh,       e.termDate,
    e.rehireDate, e.email,     'Y',         e.divisionId, // Electronic Statements always Y
    '', '',  // two empty cols to match template structure
  ];
}

export async function buildLtTrustXlsx(
  employees: CensusEmployee[],
  employerName: string,
  dateStr: string, // "MM.DD.YYYY"
): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new XLSX.Workbook();
  const ws = wb.addWorksheet('Sheet1');

  ws.addRow(LT_HEADERS);
  ws.getRow(1).eachCell(cell => { cell.font = { bold: true }; });

  // SSN = col 1 (A), ZIP = col 9 (I) — both must be TEXT
  ws.getColumn(1).numFmt = '@';
  ws.getColumn(9).numFmt = '@';

  for (const emp of employees) {
    const row = ws.addRow(ltRow(emp));
    row.getCell(1).numFmt = '@'; // SSN
    row.getCell(9).numFmt = '@'; // ZIP
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `LT Trust Census - ${employerName} - ${dateStr} - Completed.xlsx`;
  return { buffer: Buffer.from(buffer), filename };
}
