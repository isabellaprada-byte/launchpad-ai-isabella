import type { CensusEmployee } from './processor';

export type FlagSeverity = 'error' | 'warning';
export type FlagScope = 'row' | 'all';

export interface ValidationFlag {
  id: string;
  scope: FlagScope;
  rowIndex?: number;           // 0-based, only when scope='row'
  employeeName?: string;       // "First Last" for display
  field: string;               // field key from CensusEmployee
  fieldLabel: string;          // human label
  severity: FlagSeverity;
  message: string;
  currentValue?: string;
}

const REQUIRED_FIELDS: Array<{ key: keyof CensusEmployee; label: string }> = [
  { key: 'ssn',       label: 'SSN' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName',  label: 'Last Name' },
  { key: 'street1',   label: 'Address Street 1' },
  { key: 'city',      label: 'City' },
  { key: 'state',     label: 'State' },
  { key: 'zip',       label: 'ZIP Code' },
  { key: 'dob',       label: 'Date of Birth' },
  { key: 'doh',       label: 'Date of Hire' },
  { key: 'email',     label: 'Email' },
  { key: 'phone',     label: 'Phone' },
];

function isBlank(v: string): boolean {
  return !v || v.trim() === '';
}

function isValidSSN(v: string): boolean {
  return /^\d{3}-\d{2}-\d{4}$/.test(v);
}

function isValidDate(v: string): boolean {
  if (!v) return true; // blank handled by required check
  return /^\d{2}\/\d{2}\/\d{4}$/.test(v);
}

function isValidEmail(v: string): boolean {
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function validateEmployees(employees: CensusEmployee[]): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  let flagId = 0;

  // Detect fields missing in ALL rows (bulk alert)
  for (const { key, label } of REQUIRED_FIELDS) {
    const allBlank = employees.every(e => isBlank(e[key] as string));
    if (allBlank) {
      flags.push({
        id: `f${flagId++}`,
        scope: 'all',
        field: key,
        fieldLabel: label,
        severity: 'error',
        message: `"${label}" is missing from all ${employees.length} participants`,
      });
    }
  }

  // Per-row validation
  const bulkMissingFields = new Set(
    flags.filter(f => f.scope === 'all').map(f => f.field)
  );

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const displayName = [emp.firstName, emp.lastName].filter(Boolean).join(' ') || `Row ${i + 1}`;

    for (const { key, label } of REQUIRED_FIELDS) {
      if (bulkMissingFields.has(key)) continue; // already flagged at bulk level
      if (isBlank(emp[key] as string)) {
        flags.push({
          id: `f${flagId++}`,
          scope: 'row',
          rowIndex: i,
          employeeName: displayName,
          field: key,
          fieldLabel: label,
          severity: 'error',
          message: `"${label}" is missing`,
        });
      }
    }

    // SSN format check (only if not blank)
    if (!isBlank(emp.ssn) && !isValidSSN(emp.ssn)) {
      flags.push({
        id: `f${flagId++}`,
        scope: 'row',
        rowIndex: i,
        employeeName: displayName,
        field: 'ssn',
        fieldLabel: 'SSN',
        severity: 'error',
        message: `SSN "${emp.ssn}" is not in XXX-XX-XXXX format`,
        currentValue: emp.ssn,
      });
    }

    // Date format checks
    for (const [key, label] of [['dob','Date of Birth'],['doh','Date of Hire']] as const) {
      const val = emp[key];
      if (!isBlank(val) && !isValidDate(val)) {
        flags.push({
          id: `f${flagId++}`,
          scope: 'row',
          rowIndex: i,
          employeeName: displayName,
          field: key,
          fieldLabel: label,
          severity: 'error',
          message: `Date "${val}" is not in mm/dd/yyyy format`,
          currentValue: val,
        });
      }
    }

    // Email format check
    if (!isBlank(emp.email) && !isValidEmail(emp.email)) {
      flags.push({
        id: `f${flagId++}`,
        scope: 'row',
        rowIndex: i,
        employeeName: displayName,
        field: 'email',
        fieldLabel: 'Email',
        severity: 'error',
        message: `"${emp.email}" is not a valid email address`,
        currentValue: emp.email,
      });
    }

    // Phone format check — after cleaning should have at least 7 digits
    if (!isBlank(emp.phone) && !/^\d{7,}$/.test(emp.phone)) {
      flags.push({
        id: `f${flagId++}`,
        scope: 'row',
        rowIndex: i,
        employeeName: displayName,
        field: 'phone',
        fieldLabel: 'Phone',
        severity: 'error',
        message: `"${emp.phone}" is not a valid phone number`,
        currentValue: emp.phone,
      });
    }
  }

  return flags;
}
