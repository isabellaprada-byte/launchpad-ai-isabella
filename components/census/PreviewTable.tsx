'use client';

import { Button } from '@/components/ui/button';
import type { CensusEmployee } from '@/lib/census/processor';

interface Props {
  employees: CensusEmployee[];
  sponsorName: string;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
}

const COLS: { key: keyof CensusEmployee; label: string }[] = [
  { key: 'ssn',       label: 'SSN' },
  { key: 'lastName',  label: 'Last Name' },
  { key: 'firstName', label: 'First Name' },
  { key: 'mi',        label: 'MI' },
  { key: 'dob',       label: 'Date of Birth' },
  { key: 'doh',       label: 'Date of Hire' },
  { key: 'termDate',  label: 'Term Date' },
  { key: 'email',     label: 'Email' },
  { key: 'phone',     label: 'Phone' },
  { key: 'street1',   label: 'Address' },
  { key: 'street2',   label: 'Address 2' },
  { key: 'city',      label: 'City' },
  { key: 'state',     label: 'State' },
  { key: 'zip',       label: 'ZIP' },
];

function downloadCSV(employees: CensusEmployee[], sponsorName: string) {
  const headers = COLS.map(c => c.label).join(',');
  const rows = employees.map(emp =>
    COLS.map(c => {
      const v = String(emp[c.key] ?? '');
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Census Preview - ${sponsorName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PreviewTable({ employees, sponsorName, onConfirm, onBack, submitting }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-800">
            Review your cleaned data — {employees.length} employees
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            This is exactly what will be submitted. Download a copy for your records before confirming.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCSV(employees, sponsorName)}
        >
          Download copy (.csv)
        </Button>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-80">
        <table className="text-xs w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left text-gray-500 font-medium w-8">#</th>
              {COLS.map(c => (
                <th key={c.key} className="px-2 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map((emp, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                {COLS.map(c => (
                  <td key={c.key} className={`px-2 py-1.5 whitespace-nowrap ${!emp[c.key] ? 'text-gray-300 italic' : 'text-gray-700'}`}>
                    {emp[c.key] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sensitive data warning */}
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="font-semibold text-amber-900 text-sm">Please verify all data before submitting</p>
        </div>
        <ul className="text-sm text-amber-800 space-y-1 pl-7 list-disc">
          <li>This file contains <strong>sensitive employee information</strong> (SSNs, addresses, dates of birth).</li>
          <li>Scroll through the table above and confirm every row looks correct.</li>
          <li>Once submitted, your implementation team will receive this data immediately.</li>
          <li>By clicking <strong>Confirm &amp; Submit</strong>, you confirm the information is accurate and complete to the best of your knowledge.</li>
        </ul>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={submitting} className="flex-1">
          ← Go back
        </Button>
        <Button onClick={onConfirm} disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700 font-semibold">
          {submitting ? 'Submitting…' : 'Confirm & Submit →'}
        </Button>
      </div>
    </div>
  );
}
