'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ValidationFlag } from '@/lib/census/validator';

const ROW_INLINE_LIMIT = 10; // above this, individual Options are replaced by bulk actions

interface Props {
  flags: ValidationFlag[];
  resolvedFlags: Record<string, { resolution: 'fixed' | 'acknowledged'; value?: string }>;
  employeeNames?: Array<{ firstName: string; lastName: string }>;
  onResolve: (flagId: string, resolution: 'fixed' | 'acknowledged', newValue?: string) => void;
  onResolveMany: (flagIds: string[], resolution: 'acknowledged') => void;
  onUnresolve: (flagId: string) => void;
  onResolveAllRows?: (flagId: string, field: string, values: Record<number, string>) => void;
  onReupload: () => void;
}

export function ValidationPanel({
  flags, resolvedFlags, employeeNames,
  onResolve, onResolveMany, onUnresolve, onResolveAllRows, onReupload,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [bulkEdits, setBulkEdits] = useState<Record<string, Record<number, string>>>({});

  const DATE_FIELDS = new Set(['dob', 'doh', 'termDate', 'rehireDate']);
  const DATE_RE = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
  const SSN_RE = /^\d{3}-\d{2}-\d{4}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ZIP_RE = /^\d{5}(-\d{4})?$/;

  const FIELD_HINTS: Record<string, string> = {
    dob:        'Format: MM/DD/YYYY — e.g. 01/15/1990',
    doh:        'Format: MM/DD/YYYY — e.g. 03/01/2020',
    termDate:   'Format: MM/DD/YYYY — e.g. 06/30/2023',
    rehireDate: 'Format: MM/DD/YYYY — e.g. 01/15/2024',
    ssn:        'Format: XXX-XX-XXXX — e.g. 123-45-6789',
    phone:      'Must start with + and country code — e.g. +1 5551234567 (US) or +52 5551234567 (International)',
    email:      'Format: name@company.com',
    zip:        'Format: 5 digits — e.g. 12345',
  };

  function validateFieldFormat(field: string, value: string): string {
    const v = value.trim();
    if (!v) return '';
    if (DATE_FIELDS.has(field) && !DATE_RE.test(v)) return 'Please use MM/DD/YYYY format — e.g. 01/15/1990';
    if (field === 'ssn' && !SSN_RE.test(v)) return 'Please use XXX-XX-XXXX format — e.g. 123-45-6789';
    if (field === 'email' && !EMAIL_RE.test(v)) return 'Please enter a valid email — e.g. name@company.com';
    if (field === 'zip' && !ZIP_RE.test(v)) return 'Please enter a 5-digit ZIP — e.g. 12345';
    if (field === 'phone') {
      if (!v.startsWith('+')) return 'Must include country code — e.g. +1 5551234567 (US) or +52 5551234567 (International)';
      if (v.replace(/\D/g, '').length < 10) return 'Number too short — include full number with country code';
    }
    return '';
  }

  // Keep backward compat alias used in bulk section
  function validateDateField(field: string, value: string): string {
    return validateFieldFormat(field, value);
  }

  if (flags.length === 0) return null;

  const unresolved = flags.filter(f => !resolvedFlags[f.id]);
  const fixed = flags.filter(f => resolvedFlags[f.id]?.resolution === 'fixed');
  const acknowledged = flags.filter(f => resolvedFlags[f.id]?.resolution === 'acknowledged');
  const errorCount = unresolved.filter(f => f.severity === 'error').length;

  // Split unresolved into bulk (scope=all) and individual (scope=row)
  const bulkFlags = unresolved.filter(f => f.scope === 'all');
  const rowFlags  = unresolved.filter(f => f.scope === 'row');
  const tooManyRows = rowFlags.length > ROW_INLINE_LIMIT;

  function toggle(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 font-medium text-sm px-3 py-1 rounded-full border border-red-200">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errorCount} unresolved error{errorCount > 1 ? 's' : ''}
            </span>
          )}
          {acknowledged.length > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 font-medium text-sm px-3 py-1 rounded-full border border-slate-200">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {acknowledged.length} confirmed missing
            </span>
          )}
        </div>
        <button onClick={onReupload} className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2">
          Re-upload file
        </button>
      </div>

      {/* ── Bulk (scope=all) flags — always show with full Options ── */}
      {bulkFlags.length > 0 && (
        <div className="space-y-2">
          {bulkFlags.map(flag => (
            <div key={flag.id} className={`rounded-xl border overflow-hidden ${flag.severity === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${flag.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div>
                    <span className={`font-semibold text-sm ${flag.severity === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
                      All participants
                    </span>
                    <span className={`text-sm ml-1 ${flag.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                      — {flag.message}
                    </span>
                  </div>
                </div>
                <button
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-lg shrink-0"
                  onClick={() => toggle(flag.id)}
                >
                  {expanded.has(flag.id) ? 'Close' : 'Options'}
                </button>
              </div>

              {expanded.has(flag.id) && (
                <div className="border-t border-white/50 px-4 py-3 bg-white/40 space-y-2">
                  <p className="text-xs font-medium text-slate-600 mb-2">How would you like to handle this?</p>

                  {/* ≤50 employees → per-employee inputs */}
                  {employeeNames && employeeNames.length > 0 && employeeNames.length <= 50 && (
                    <>
                      <p className="text-xs text-slate-500 mt-1 mb-2">Enter {flag.fieldLabel} for each participant:</p>
                      {FIELD_HINTS[flag.field] && (
                        <p className="text-xs text-slate-400 mb-1">{FIELD_HINTS[flag.field]}</p>
                      )}
                      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                        {employeeNames.map((emp, idx) => {
                          const bulkKey = `${flag.id}_${idx}`;
                          const bulkVal = bulkEdits[flag.id]?.[idx] ?? '';
                          const bulkErr = inputErrors[bulkKey];
                          return (
                            <div key={idx} className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600 w-36 shrink-0 truncate">
                                  {emp.firstName} {emp.lastName}
                                </span>
                                <input
                                  type="text"
                                  placeholder={DATE_FIELDS.has(flag.field) ? 'MM/DD/YYYY' : flag.fieldLabel}
                                  value={bulkVal}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBulkEdits(prev => ({
                                      ...prev,
                                      [flag.id]: { ...(prev[flag.id] ?? {}), [idx]: val },
                                    }));
                                    setInputErrors(prev => ({ ...prev, [bulkKey]: validateDateField(flag.field, val) }));
                                  }}
                                  className={`flex-1 border rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 ${bulkErr ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'}`}
                                />
                              </div>
                              {bulkErr && <p className="text-xs text-red-500 pl-[9.5rem]">{bulkErr}</p>}
                            </div>
                          );
                        })}
                      </div>
                      <Button
                        size="sm"
                        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 mt-2"
                        disabled={
                          !Object.values(bulkEdits[flag.id] ?? {}).some(v => v.trim()) ||
                          Object.entries(bulkEdits[flag.id] ?? {}).some(([idx, v]) => !!validateDateField(flag.field, v))
                        }
                        onClick={() => {
                          const raw = bulkEdits[flag.id] ?? {};
                          // Validate all date fields before applying
                          const errors: Record<string, string> = {};
                          for (const [idx, val] of Object.entries(raw)) {
                            const err = validateDateField(flag.field, val);
                            if (err) errors[`${flag.id}_${idx}`] = err;
                          }
                          if (Object.keys(errors).length > 0) {
                            setInputErrors(prev => ({ ...prev, ...errors }));
                            return;
                          }
                          const nonEmpty = Object.fromEntries(
                            Object.entries(raw).filter(([, v]) => v.trim())
                          ) as Record<number, string>;
                          onResolveAllRows?.(flag.id, flag.field, nonEmpty);
                          toggle(flag.id);
                        }}
                      >
                        Apply fixes
                      </Button>
                    </>
                  )}

                  {/* >50 employees → only re-upload */}
                  {(!employeeNames || employeeNames.length === 0 || employeeNames.length > 50) && (
                    <button
                      className="w-full text-sm text-slate-500 hover:text-slate-700 py-2 rounded-lg hover:bg-white/60 transition-colors text-left px-1"
                      onClick={onReupload}
                    >
                      → Re-upload file with this column included
                    </button>
                  )}

                  {flag.severity !== 'error' && (
                    <button
                      className="w-full text-sm text-slate-500 hover:text-slate-700 py-2 rounded-lg hover:bg-white/60 transition-colors text-left px-1"
                      onClick={() => { onResolve(flag.id, 'acknowledged'); toggle(flag.id); }}
                    >
                      → We don't have this data — mark as confirmed missing
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Individual (scope=row) flags ── */}
      {rowFlags.length > 0 && (
        tooManyRows ? (
          /* > 20 individual errors: show full list read-only + bulk actions at bottom */
          <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-red-100 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-sm font-semibold text-red-800">
                {rowFlags.length} participants with missing data
              </span>
            </div>

            {/* Scrollable list — all errors visible */}
            <div className="max-h-72 overflow-y-auto divide-y divide-red-100">
              {rowFlags.map(flag => (
                <div key={flag.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${flag.severity === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <span className="text-sm font-medium text-red-800">{flag.employeeName}</span>
                  <span className="text-sm text-red-600">— {flag.message}</span>
                </div>
              ))}
            </div>

            {/* Bulk actions — too many errors to fix inline, re-upload only */}
            <div className="px-4 py-3 bg-white/60 border-t border-red-100">
              <button
                className="w-full text-sm text-slate-600 hover:text-slate-800 border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors"
                onClick={onReupload}
              >
                Re-upload file with this data corrected
              </button>
            </div>
          </div>
        ) : (
          /* ≤ 20: individual Options per flag */
          <div className="space-y-2">
            {rowFlags.map(flag => (
              <div key={flag.id} className={`rounded-xl border overflow-hidden ${flag.severity === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${flag.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <div>
                      <span className={`font-semibold text-sm ${flag.severity === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
                        {flag.employeeName}
                      </span>
                      <span className={`text-sm ml-1 ${flag.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                        — {flag.message}
                      </span>
                    </div>
                  </div>
                  <button
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-lg shrink-0"
                    onClick={() => toggle(flag.id)}
                  >
                    {expanded.has(flag.id) ? 'Close' : 'Options'}
                  </button>
                </div>

                {expanded.has(flag.id) && (
                  <div className="border-t border-white/50 px-4 py-3 bg-white/40 space-y-2">
                    <p className="text-xs font-medium text-slate-600 mb-2">How would you like to handle this?</p>
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={FIELD_HINTS[flag.field] ? FIELD_HINTS[flag.field].split(' — ')[0].replace('Format: ', '') : `Enter correct ${flag.fieldLabel}`}
                          value={editValues[flag.id] ?? flag.currentValue ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            setEditValues(prev => ({ ...prev, [flag.id]: val }));
                            setInputErrors(prev => ({ ...prev, [flag.id]: validateFieldFormat(flag.field, val) }));
                          }}
                          className={`flex-1 border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 ${inputErrors[flag.id] ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'}`}
                        />
                        <Button
                          size="sm"
                          className="rounded-lg bg-blue-600 hover:bg-blue-700"
                          onClick={() => {
                            const val = editValues[flag.id];
                            const err = validateFieldFormat(flag.field, val ?? '');
                            if (err) { setInputErrors(prev => ({ ...prev, [flag.id]: err })); return; }
                            onResolve(flag.id, 'fixed', val);
                            toggle(flag.id);
                          }}
                          disabled={!editValues[flag.id]?.trim()}
                        >
                          Fix it
                        </Button>
                      </div>
                      {FIELD_HINTS[flag.field] && !inputErrors[flag.id] && (
                        <p className="text-xs text-slate-400">{FIELD_HINTS[flag.field]}</p>
                      )}
                      {inputErrors[flag.id] && (
                        <p className="text-xs text-red-500">{inputErrors[flag.id]}</p>
                      )}
                    </div>
                    {flag.severity !== 'error' && (
                      <button
                        className="w-full text-sm text-slate-500 hover:text-slate-700 py-2 rounded-lg hover:bg-white/60 transition-colors text-left px-1"
                        onClick={() => { onResolve(flag.id, 'acknowledged'); toggle(flag.id); }}
                      >
                        → We don't have this data — mark as confirmed missing
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Fixed flags — show the value that was entered */}
      {fixed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Fixed</p>
          {fixed.map(flag => {
            const enteredValue = resolvedFlags[flag.id]?.value;
            return (
              <div key={flag.id} className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-green-800">
                      {flag.scope === 'all' ? 'All participants' : flag.employeeName}
                    </span>
                    <span className="text-sm text-green-700"> — {flag.fieldLabel}</span>
                    {enteredValue && (
                      <span className="text-sm text-green-600"> → <span className="font-medium">{enteredValue}</span></span>
                    )}
                    {!enteredValue && flag.scope === 'all' && (
                      <span className="text-sm text-green-600"> → values entered</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onUnresolve(flag.id)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline shrink-0"
                >
                  Undo
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Acknowledged flags */}
      {acknowledged.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Confirmed missing</p>
          {acknowledged.map(flag => (
            <div key={flag.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-slate-500 line-through">
                  {flag.scope === 'all' ? 'All participants' : flag.employeeName} — {flag.message}
                </span>
              </div>
              <button
                onClick={() => onUnresolve(flag.id)}
                className="text-xs text-slate-400 hover:text-slate-600 underline shrink-0"
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
