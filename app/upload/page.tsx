'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UploadZone } from '@/components/census/UploadZone';
import { ValidationPanel } from '@/components/census/ValidationPanel';
import { PreviewTable } from '@/components/census/PreviewTable';
import type { ValidationFlag } from '@/lib/census/validator';
import type { CensusEmployee } from '@/lib/census/processor';

type Step = 'welcome' | 'input' | 'validating' | 'review' | 'confirming-missing' | 'previewing' | 'preview' | 'submitting' | 'done' | 'error';

interface ValidationResult {
  employeeCount: number;
  flags: ValidationFlag[];
  hasErrors: boolean;
  employeeNames?: Array<{ firstName: string; lastName: string }>;
}

const STEPS = [
  { key: 'input',   label: 'Upload' },
  { key: 'review',  label: 'Review' },
  { key: 'preview', label: 'Confirm' },
  { key: 'done',    label: 'Done' },
];

function stepIndex(step: Step): number {
  if (step === 'welcome') return -1;
  if (step === 'validating') return 0;
  if (step === 'previewing') return 2;
  if (step === 'submitting') return 2;
  return STEPS.findIndex(s => s.key === step);
}

export default function UploadPage() {
  const [step, setStep] = useState<Step>('welcome');
  const [sponsorName, setSponsorName] = useState('');
  const [uploaderName, setUploaderName] = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [uploaderEmailError, setUploaderEmailError] = useState('');
  const [uploaderNameError, setUploaderNameError] = useState('');
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [resolvedFlags, setResolvedFlags] = useState<Record<string, { resolution: 'fixed' | 'acknowledged'; value?: string }>>({});
  const [perEmployeeFixes, setPerEmployeeFixes] = useState<Record<string, Record<number, string>>>({});
  const [previewEmployees, setPreviewEmployees] = useState<CensusEmployee[]>([]);
  const [downloadInfo, setDownloadInfo] = useState<{ filename: string; base64: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  function hasFullName(name: string): boolean {
    return name.trim().split(/\s+/).length >= 2;
  }

  async function handleValidate(skipExistingCheck = false) {
    if (!file || !sponsorName.trim() || !uploaderName.trim() || !uploaderEmail.trim()) return;
    if (!hasFullName(uploaderName)) {
      setUploaderNameError('Please enter your first and last name — e.g. Jane Smith');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uploaderEmail.trim())) {
      setUploaderEmailError('Please enter a valid email address');
      return;
    }

    // Check for existing submissions before proceeding (unless user already confirmed replace)
    if (!skipExistingCheck) {
      setStep('validating');
      try {
        const checkCtrl = new AbortController();
        const checkTimeout = setTimeout(() => checkCtrl.abort(), 8000);
        const checkRes = await fetch(`/api/census/check-email?email=${encodeURIComponent(uploaderEmail.trim())}`, { signal: checkCtrl.signal });
        clearTimeout(checkTimeout);
        const checkJson = await checkRes.json();
        if (checkJson.hasExisting) {
          setStep('input');
          setShowReplaceWarning(true);
          return;
        }
      } catch {
        // If check fails or times out, proceed anyway
      }
    }

    setStep('validating');
    setResolvedFlags({});
    const fd = new FormData();
    fd.append('file', file);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 28000);
      const res = await fetch('/api/census/validate', { method: 'POST', body: fd, signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? 'Validation failed'); setStep('error'); return; }
      setValidation(json);
      setStep('review');
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Validation timed out. Try a smaller file or check your connection.'
        : 'Could not reach the server. Please try again.';
      setErrorMsg(msg);
      setStep('error');
    }
  }

  async function handleConfirmReplace() {
    setShowReplaceWarning(false);
    setReplaceExisting(true);
    await handleValidate(true);
  }

  function handleResolve(flagId: string, resolution: 'fixed' | 'acknowledged', newValue?: string) {
    setResolvedFlags(prev => ({ ...prev, [flagId]: { resolution, value: newValue } }));
  }

  function handleUnresolve(flagId: string) {
    setResolvedFlags(prev => { const n = { ...prev }; delete n[flagId]; return n; });
    // Also clear any per-employee fixes for this flag's field
    const field = validation?.flags.find(f => f.id === flagId)?.field;
    if (field) setPerEmployeeFixes(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  function handleResolveAllRows(flagId: string, field: string, values: Record<number, string>) {
    setResolvedFlags(prev => ({ ...prev, [flagId]: { resolution: 'fixed' } }));
    setPerEmployeeFixes(prev => ({ ...prev, [field]: { ...(prev[field] ?? {}), ...values } }));
  }

  function handleResolveMany(flagIds: string[], resolution: 'acknowledged') {
    setResolvedFlags(prev => {
      const n = { ...prev };
      for (const id of flagIds) n[id] = { resolution };
      return n;
    });
  }

  const unresolvedErrors = validation?.flags.filter(f => !resolvedFlags[f.id] && f.severity === 'error') ?? [];
  const acknowledgedFlags = validation?.flags.filter(f => resolvedFlags[f.id]?.resolution === 'acknowledged') ?? [];

  function acknowledgedFieldsList(): string[] {
    return [...new Set(
      Object.entries(resolvedFlags)
        .filter(([, r]) => r.resolution === 'acknowledged')
        .map(([flagId]) => validation?.flags.find(f => f.id === flagId)?.field ?? '')
        .filter(Boolean)
    )];
  }

  function rowFixesList() {
    return (validation?.flags ?? [])
      .filter(f => f.scope === 'row' && resolvedFlags[f.id]?.resolution === 'fixed' && f.rowIndex != null)
      .map(f => ({ rowIndex: f.rowIndex!, field: f.field, value: resolvedFlags[f.id]?.value ?? '' }));
  }

  async function handlePreview() {
    if (!file) return;
    setStep('previewing');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('acknowledgedFields', JSON.stringify(acknowledgedFieldsList()));
    fd.append('perEmployeeFixes', JSON.stringify(perEmployeeFixes));
    fd.append('rowFixes', JSON.stringify(rowFixesList()));
    const res = await fetch('/api/census/preview', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) {
      if (res.status === 422 && Array.isArray(json.flags) && json.flags.length > 0) {
        const serverFlags = json.flags as ValidationFlag[];
        // Match flags by field+scope+row+name — IDs are re-generated each call so they can't be trusted
        const flagSig = (f: ValidationFlag) =>
          `${f.field}|${f.scope}|${f.rowIndex ?? ''}|${f.employeeName ?? ''}`;
        const serverSigs = new Set(serverFlags.map(flagSig));

        setValidation(prev => {
          if (!prev) return prev;
          const existingSigMap = new Map(prev.flags.map(f => [flagSig(f), f]));
          // Upgrade existing warnings → errors when the server now blocks them
          const updated = prev.flags.map(f =>
            serverSigs.has(flagSig(f)) && f.severity !== 'error'
              ? { ...f, severity: 'error' as const }
              : f
          );
          // Add truly new flags not present in prev at all
          const added = serverFlags.filter(f => !existingSigMap.has(flagSig(f)));
          return { ...prev, flags: [...updated, ...added], hasErrors: true };
        });

        // If a flag the user "fixed" is still blocking, clear that resolution so they can re-try
        setResolvedFlags(prev => {
          const next = { ...prev };
          for (const [flagId, resolution] of Object.entries(prev)) {
            if (resolution.resolution !== 'fixed') continue;
            const orig = validation?.flags.find(f => f.id === flagId);
            if (orig && serverSigs.has(flagSig(orig))) delete next[flagId];
          }
          return next;
        });

        setStep('review');
        return;
      }
      setErrorMsg(json.error ?? 'Preview failed');
      setStep('error');
      return;
    }
    setPreviewEmployees(json.employees);
    setStep('preview');
  }

  async function handleSubmit() {
    if (!file || !sponsorName.trim()) return;
    setStep('submitting');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sponsorName', sponsorName.trim());
    fd.append('uploaderName', uploaderName.trim());
    fd.append('uploaderEmail', uploaderEmail.trim());
    fd.append('acknowledgedFields', JSON.stringify(acknowledgedFieldsList()));
    fd.append('perEmployeeFixes', JSON.stringify(perEmployeeFixes));
    fd.append('rowFixes', JSON.stringify(rowFixesList()));
    fd.append('replaceExisting', String(replaceExisting));
    const res = await fetch('/api/census/submit', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) { setErrorMsg(json.error ?? 'Submission failed'); setStep('error'); return; }
    if (json.adminBase64) setDownloadInfo({ filename: json.adminFilename, base64: json.adminBase64 });
    setStep('done');
  }

  function handleSponsorDownload() {
    if (!downloadInfo) return;
    const bytes = Uint8Array.from(atob(downloadInfo.base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadInfo.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setStep('welcome'); setSponsorName(''); setUploaderName(''); setUploaderEmail(''); setFile(null);
    setValidation(null); setResolvedFlags({}); setPerEmployeeFixes({}); setUploaderEmailError('');
    setShowReplaceWarning(false); setReplaceExisting(false); setUploaderNameError('');
    setPreviewEmployees([]); setDownloadInfo(null); setErrorMsg('');
  }

  const currentStepIdx = stepIndex(step);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Census Upload Portal</h1>
            <p className="text-sm font-semibold text-violet-600 mt-0.5">ForUsAll <span className="font-normal text-slate-400">— Implementation Team</span></p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">

        {/* Step indicator — hidden on welcome screen */}
        {step !== 'welcome' && (
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const isDone = i < currentStepIdx;
              const isActive = i === currentStepIdx;
              return (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors
                      ${isDone ? 'bg-blue-600 text-white' : isActive ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-400'}`}>
                      {isDone ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${isActive ? 'text-blue-600' : isDone ? 'text-slate-500' : 'text-slate-400'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mb-5 mx-2 ${i < currentStepIdx ? 'bg-blue-600' : 'bg-slate-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* ── Welcome / Instructions ── */}
          {step === 'welcome' && (
            <div className="p-10 space-y-8">
              {/* Header */}
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Welcome to ForUsAll</h2>
                <p className="text-slate-500 text-base max-w-xl mx-auto">
                  This is the secure page to submit your employee census. Please read the instructions below before uploading your file.
                </p>
              </div>

              {/* Required fields */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                <p className="font-semibold text-slate-800 text-base">We need the following information for all your employees:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { icon: '🔐', label: 'Social Security Number (SSN)', note: 'Format: XXX-XX-XXXX' },
                    { icon: '👤', label: 'First Name & Last Name', note: '' },
                    { icon: '🏠', label: 'Address, City, State, and ZIP', note: '' },
                    { icon: '📅', label: 'Date of Birth', note: 'Format: MM/DD/YYYY' },
                    { icon: '📅', label: 'Date of Hire', note: 'Format: MM/DD/YYYY' },
                    { icon: '✉️', label: 'Email', note: 'Work email preferred — e.g. name@company.com' },
                    { icon: '📞', label: 'Phone Number', note: 'Include country code — e.g. +1 5551234567' },
                  ].map(({ icon, label, note }) => (
                    <div key={label} className="flex items-start gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
                      <span className="text-lg shrink-0">{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{label}</p>
                        {note && <p className="text-xs text-slate-400 mt-0.5 font-mono">{note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Accepted formats + verification note */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Accepted file formats</p>
                  <p className="text-sm text-slate-700">Excel <span className="text-slate-400">(.xlsx, .xls)</span> or CSV <span className="text-slate-400">(.csv)</span></p>
                  <p className="text-xs text-slate-400">PDFs are not accepted.</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">What happens next</p>
                  <p className="text-sm text-slate-700">We will verify that all information is complete and accurate for each participant before processing your census.</p>
                </div>
              </div>

              {/* Extra info note */}
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 flex items-start gap-3">
                <svg className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">Additional columns are always helpful.</span> If your file includes gender, middle initial, division, termination date, rehire date, or contribution amounts — include them. The more complete the file, the faster we can process your census.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href="/api/census/template"
                  className="flex items-center justify-center gap-2 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl px-6 py-3 text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download census template (.xlsx)
                </a>
                <Button
                  size="lg"
                  className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-base font-semibold"
                  onClick={() => setStep('input')}
                >
                  I'm ready — upload my file →
                </Button>
              </div>
            </div>
          )}

          {/* ── Upload ── */}
          {(step === 'input' || step === 'validating') && (
            <div className="p-8 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">Upload your employee census</h2>
                  <p className="text-slate-500 mt-1">We'll validate your data and flag any issues before submitting.</p>
                </div>
                <button
                  onClick={() => setStep('welcome')}
                  disabled={step === 'validating'}
                  className="shrink-0 text-sm text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors disabled:opacity-40 disabled:pointer-events-none mt-1"
                >
                  ← Back to instructions
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Your name</label>
                  <input
                    type="text"
                    value={uploaderName}
                    onChange={e => { setUploaderName(e.target.value); if (uploaderNameError) setUploaderNameError(''); }}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v && !hasFullName(v)) setUploaderNameError('Please enter your first and last name — e.g. Jane Smith');
                      else setUploaderNameError('');
                    }}
                    placeholder="e.g. Jane Smith"
                    className={`w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent ${uploaderNameError ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'}`}
                  />
                  {uploaderNameError && <p className="text-sm text-red-500">{uploaderNameError}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Your email</label>
                  <input
                    type="email"
                    value={uploaderEmail}
                    onChange={e => { setUploaderEmail(e.target.value); if (uploaderEmailError) setUploaderEmailError(''); }}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                        setUploaderEmailError('Please enter a valid email address');
                      } else {
                        setUploaderEmailError('');
                      }
                    }}
                    placeholder="e.g. jane@company.com"
                    className={`w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent ${uploaderEmailError ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'}`}
                  />
                  {uploaderEmailError && <p className="text-sm text-red-500">{uploaderEmailError}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Company name</label>
                <input
                  type="text"
                  value={sponsorName}
                  onChange={e => setSponsorName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Replace existing warning — shown when a previous submission is detected */}
              {showReplaceWarning && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 space-y-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-amber-900 text-base">We already have a submission from this email</p>
                      <p className="text-sm text-amber-700 mt-1">
                        A census was previously submitted using <span className="font-medium">{uploaderEmail}</span>.
                        Would you like to delete the existing record and start fresh with this new file?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl border-amber-300 text-amber-700 hover:bg-amber-100"
                      onClick={() => setShowReplaceWarning(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={handleConfirmReplace}
                    >
                      Yes, replace existing →
                    </Button>
                  </div>
                </div>
              )}

              {!showReplaceWarning && <UploadZone onFile={f => setFile(f)} disabled={step === 'validating'} />}

              {file && (
                <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-700 truncate">{file.name}</span>
                  <button onClick={() => setFile(null)} className="ml-auto text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
                </div>
              )}

              <Button
                size="lg"
                className="w-full text-base h-12 rounded-xl bg-blue-600 hover:bg-blue-700"
                onClick={() => handleValidate()}
                disabled={!file || !sponsorName.trim() || !uploaderName.trim() || !uploaderEmail.trim() || !!uploaderNameError || !!uploaderEmailError || step === 'validating'}
              >
                {step === 'validating' ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Validating…
                  </span>
                ) : 'Validate file →'}
              </Button>
            </div>
          )}

          {/* ── Review flags ── */}
          {(step === 'review' || step === 'confirming-missing') && validation && (
            <div className="p-8 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">Review your file</h2>
                  <p className="text-slate-500 mt-1">
                    Found <span className="font-semibold text-slate-700">{validation.employeeCount} employees</span> in <span className="font-medium">{file?.name}</span>
                  </p>
                </div>
                {unresolvedErrors.length === 0 && acknowledgedFlags.length === 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-sm font-medium px-3 py-1.5 rounded-full border border-green-200">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    All clear
                  </span>
                )}
              </div>

              <ValidationPanel
                flags={validation.flags}
                resolvedFlags={resolvedFlags}
                employeeNames={validation.employeeNames}
                onResolve={handleResolve}
                onResolveMany={handleResolveMany}
                onUnresolve={handleUnresolve}
                onResolveAllRows={handleResolveAllRows}
                onReupload={() => { setFile(null); setValidation(null); setStep('input'); }}
              />

              {/* Confirmation modal for acknowledged fields */}
              {step === 'confirming-missing' && acknowledgedFlags.length > 0 && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 space-y-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-amber-900 text-base">You confirmed the following data is not available:</p>
                      <ul className="mt-2 space-y-1">
                        {acknowledgedFlags.map(f => (
                          <li key={f.id} className="text-sm text-amber-800 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span className="font-medium">{f.scope === 'all' ? 'All participants' : f.employeeName}</span>
                            <span>— {f.fieldLabel}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-sm text-amber-700">
                        These fields will be left blank in the submitted file. Are you sure you want to proceed?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-100"
                      onClick={() => setStep('review')}>
                      Go back
                    </Button>
                    <Button className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={handlePreview}>
                      Yes, proceed to preview →
                    </Button>
                  </div>
                </div>
              )}

              {step === 'review' && (
                <>
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={reset} className="rounded-xl h-11 px-6">Start over</Button>
                    <Button
                      className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-base"
                      onClick={() => acknowledgedFlags.length > 0 ? setStep('confirming-missing') : handlePreview()}
                      disabled={unresolvedErrors.length > 0}
                    >
                      Preview & confirm →
                    </Button>
                  </div>
                  {unresolvedErrors.length > 0 && (
                    <p className="text-sm text-red-500 text-center">
                      Resolve all errors above or confirm you don't have that data.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Loading preview ── */}
          {step === 'previewing' && (
            <div className="p-16 text-center text-slate-400">
              <svg className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Preparing your data preview…
            </div>
          )}

          {/* ── Preview & confirm ── */}
          {step === 'preview' && previewEmployees.length > 0 && (
            <div className="p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">Confirm your data</h2>
                  <p className="text-slate-500 mt-1">This is your final submission. Review the summary below before confirming.</p>
                </div>
                <button
                  onClick={() => setStep('welcome')}
                  className="shrink-0 text-sm text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors mt-1">
                  ← Back to instructions
                </button>
              </div>

              {/* Submission summary */}
              {(() => {
                const fixedFlags = validation?.flags.filter(f => resolvedFlags[f.id]?.resolution === 'fixed') ?? [];
                const missingFlags = validation?.flags.filter(f => resolvedFlags[f.id]?.resolution === 'acknowledged') ?? [];
                const fixedByField = fixedFlags.reduce<Record<string, number>>((acc, f) => {
                  acc[f.fieldLabel ?? f.field] = (acc[f.fieldLabel ?? f.field] ?? 0) + 1;
                  return acc;
                }, {});
                return (
                  <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                      <p className="font-semibold text-slate-700 text-sm">Submission summary — {sponsorName}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center">
                        <p className="text-2xl font-bold text-slate-800">{previewEmployees.length}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Employees</p>
                      </div>
                      <div className={`bg-white rounded-xl border px-4 py-3 text-center ${fixedFlags.length > 0 ? 'border-green-200' : 'border-slate-200'}`}>
                        <p className={`text-2xl font-bold ${fixedFlags.length > 0 ? 'text-green-600' : 'text-slate-400'}`}>{fixedFlags.length}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Fields corrected</p>
                      </div>
                      <div className={`bg-white rounded-xl border px-4 py-3 text-center ${missingFlags.length > 0 ? 'border-amber-200' : 'border-slate-200'}`}>
                        <p className={`text-2xl font-bold ${missingFlags.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{missingFlags.length}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Fields left blank</p>
                      </div>
                    </div>

                    {fixedFlags.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Corrected</p>
                        <div className="space-y-1.5">
                          {fixedFlags.map(f => {
                            const val = resolvedFlags[f.id]?.value;
                            const who = f.scope === 'all' ? 'All participants' : f.employeeName;
                            return (
                              <div key={f.id} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-xs font-medium text-green-800">{who}</span>
                                <span className="text-xs text-green-600">— {f.fieldLabel}</span>
                                {val && (
                                  <>
                                    <span className="text-xs text-green-400">→</span>
                                    <span className="text-xs font-semibold text-green-800 font-mono">{val}</span>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {missingFlags.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Left blank — confirmed not available</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[...new Set(missingFlags.map(f => f.fieldLabel ?? f.field))].map(field => (
                            <span key={field} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-2.5 py-1">{field}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {fixedFlags.length === 0 && missingFlags.length === 0 && (
                      <p className="text-sm text-green-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        All fields complete — no corrections needed.
                      </p>
                    )}
                  </div>
                );
              })()}

              <PreviewTable
                employees={previewEmployees}
                sponsorName={sponsorName}
                onConfirm={handleSubmit}
                onBack={() => setStep('review')}
                submitting={false}
              />
            </div>
          )}

          {/* ── Submitting ── */}
          {step === 'submitting' && (
            <div className="p-16 text-center text-slate-400">
              <svg className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Submitting your census…
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-800">Census submitted!</h2>
                <p className="text-slate-500 mt-2">
                  Your implementation team has been notified and will be in touch at <span className="font-medium text-slate-700">{uploaderEmail}</span>.
                </p>
              </div>
              {downloadInfo && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-left flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Download your copy</p>
                    <p className="text-xs text-blue-600 mt-0.5">{downloadInfo.filename}</p>
                  </div>
                  <Button
                    onClick={handleSponsorDownload}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 shrink-0"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download .xlsx
                  </Button>
                </div>
              )}
              <Button variant="outline" onClick={reset} className="rounded-xl h-11 px-8">
                Upload another census
              </Button>
            </div>
          )}

          {/* ── Error ── */}
          {step === 'error' && (
            <div className="p-8 space-y-6">
              <div className="rounded-xl bg-red-50 border border-red-200 p-5">
                <p className="font-semibold text-red-800 text-base">Something went wrong</p>
                <p className="text-red-600 mt-1">{errorMsg}</p>
              </div>
              <Button variant="outline" onClick={reset} className="w-full rounded-xl h-11">Try again</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
