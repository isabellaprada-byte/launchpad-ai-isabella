'use client';

import { useState, useEffect } from 'react';

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
  const [lockedSponsor, setLockedSponsor] = useState(false);
  const [isConversion, setIsConversion] = useState(false);
  const [sponsorToken, setSponsorToken] = useState('');
  const [uploaderName, setUploaderName] = useState('');

  // Read pre-filled sponsor from URL params (set by /upload/[token] page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const company = params.get('company');
    if (company) {
      setSponsorName(company);
      setLockedSponsor(params.get('locked') === '1');
      const tok = params.get('token');
      if (tok) setSponsorToken(tok);
      const contact = params.get('contact');
      if (contact) setUploaderName(contact);
      if (params.get('planType') === 'conversion') setIsConversion(true);
      // Stay on welcome so sponsor sees personalized instructions first
    }
  }, []);
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
  const [contactCopied, setContactCopied] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

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
      const res = await fetch(`/api/census/validate`, { method: 'POST', body: fd, signal: controller.signal });
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
    let res: Response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any;
    try {
      res = await fetch(`/api/census/preview`, { method: 'POST', body: fd });
      json = await res.json();
    } catch {
      setErrorMsg('Could not reach the server. Please try again.');
      setStep('error');
      return;
    }
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
      setErrorMsg(String(json?.error ?? 'Preview failed'));
      setStep('error');
      return;
    }
    setPreviewEmployees(json.employees as CensusEmployee[]);
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
    if (sponsorToken) fd.append('sponsorToken', sponsorToken);
    const res = await fetch(`/api/census/submit`, { method: 'POST', body: fd });
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

  function handleContactUs() {
    setShowContactModal(true);
  }

  function handleCopyEmail() {
    const email = 'implementations@forusall.com';
    const fallback = () => {
      const el = document.createElement('textarea');
      el.value = email;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setContactCopied(true);
      setTimeout(() => setContactCopied(false), 3000);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(email).then(() => {
        setContactCopied(true);
        setTimeout(() => setContactCopied(false), 3000);
      }).catch(fallback);
    } else {
      fallback();
    }
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
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <svg height="32" viewBox="0 0 104 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="ForUsAll" className="shrink-0 w-auto">
              <path fillRule="evenodd" clipRule="evenodd" d="M57.5114 26.6909C58.5518 27.0565 59.8474 27.2396 61.3987 27.2396C62.9485 27.2396 64.2394 26.7698 65.2705 25.8307C66.3001 24.8921 66.8157 23.6408 66.8157 22.0788C66.8157 21.1102 66.6104 20.2952 66.2003 19.6317C65.7902 18.9697 65.2901 18.4856 64.6999 18.1791C64.1097 17.873 63.5191 17.6152 62.9294 17.4083C62.3382 17.1998 61.8386 16.9735 61.4285 16.7254C61.0179 16.4783 60.8132 16.158 60.8132 15.7619C60.8132 15.0496 61.3534 14.6942 62.4339 14.6942C62.9742 14.6942 63.5299 14.7984 64.1 15.0053C64.6701 15.2133 64.9649 15.317 64.9855 15.317C65.2453 15.317 65.5257 15.016 65.8257 14.4125C66.1257 13.809 66.2759 13.3798 66.2759 13.1221C66.2759 12.3512 65.5551 11.8072 64.1144 11.491C63.3946 11.3328 62.6341 11.254 61.834 11.254C60.1324 11.254 58.7869 11.6842 57.797 12.544C56.8065 13.4042 56.311 14.5757 56.311 16.0588C56.311 17.0473 56.5168 17.8572 56.9269 18.4902C57.337 19.1232 57.8371 19.5783 58.4273 19.8549C59.0169 20.132 59.6081 20.3689 60.1978 20.5662C60.7879 20.7645 61.2881 21.007 61.6982 21.2933C62.1082 21.58 62.3135 21.9604 62.3135 22.4353C62.3135 23.3245 61.7033 23.7694 60.4833 23.7694C59.9225 23.7694 59.3025 23.6311 58.6223 23.354C57.9416 23.0769 57.5819 22.9386 57.5418 22.9386C57.2413 22.9386 56.9017 23.2254 56.5215 23.7989C56.1407 24.3724 55.9509 24.8173 55.9509 25.1331C55.9509 25.8062 56.4716 26.3249 57.5114 26.6909ZM41.5718 26.0676C42.2922 26.8491 43.403 27.2396 44.9039 27.2396C45.8239 27.2396 46.679 27.0214 47.4694 26.5872C48.2602 26.152 48.8951 25.6186 49.3752 24.9851C49.3947 25.0451 49.4297 25.2129 49.4807 25.49C49.5306 25.7671 49.5753 25.9593 49.6155 26.0676C49.6551 26.1764 49.7158 26.3249 49.7955 26.5125C49.8753 26.7006 49.9808 26.8338 50.111 26.9126C50.2406 26.9925 50.5056 27.0321 50.9064 27.0321C51.3057 27.0321 51.9113 26.9533 52.7212 26.7947C53.5321 26.636 53.937 26.3991 53.937 26.0828L53.7574 24.8671C53.6375 24.0358 53.5773 23.0088 53.5773 21.7824V12.3807C53.5773 11.7482 52.9774 11.432 51.776 11.432H50.9363C49.7359 11.432 49.1354 11.7482 49.1354 12.3807V21.9009C48.535 23.0479 47.7343 23.6215 46.7341 23.6215C45.5337 23.6215 44.9338 23.0088 44.9338 21.7824V12.3807C44.9338 11.7482 44.3333 11.432 43.1329 11.432H42.2922C41.0918 11.432 40.4913 11.7482 40.4913 12.3807V22.4353C40.4913 24.076 40.852 25.2866 41.5718 26.0676ZM71.5915 18.9997C71.5915 29.0389 63.3555 37.1771 53.1971 37.1771C43.0377 37.1771 34.8027 29.0389 34.8027 18.9997C34.8027 8.96144 43.0377 0.822754 53.1971 0.822754C63.3555 0.822754 71.5915 8.96144 71.5915 18.9997ZM3.3784 27.3149H3.25851C2.05349 27.3149 1.80085 26.8222 1.80085 26.4084V13.8808H0.857721C0.537169 13.8808 0 13.7318 0 12.7368V12.3798C0 11.3848 0.537169 11.2363 0.857721 11.2363H1.80085V8.67276C1.80085 6.88609 2.30664 5.67548 3.30431 5.075C4.12138 4.57876 5.00483 4.32657 5.92944 4.32657C6.53504 4.32657 8.37808 4.32657 8.37808 5.47057C8.37808 5.69632 8.3148 5.99936 8.18513 6.39391C8.12648 6.57339 7.94742 7.11794 7.49 7.11794C7.44627 7.11794 7.37372 7.11235 7.01767 7.03964C6.79436 6.99337 6.47381 6.96998 6.06476 6.96998C5.70407 6.96998 5.41594 7.08489 5.18388 7.32284C5.02489 7.48453 4.83606 7.89179 4.83606 8.91021V11.2363H7.19003C7.51059 11.2363 8.04775 11.3848 8.04775 12.3798V12.7368C8.04775 13.7318 7.51059 13.8808 7.19003 13.8808H4.83606V26.4084C4.83606 26.8222 4.58343 27.3149 3.3784 27.3149ZM12.8922 15.0055C13.5266 14.129 14.5094 13.7029 15.8945 13.7029C17.2801 13.7029 18.2721 14.1346 18.9282 15.0218C19.5924 15.9222 19.9289 17.3489 19.9289 19.2617C19.9289 21.174 19.5924 22.5951 18.9287 23.4854C18.2732 24.364 17.2806 24.7911 15.8945 24.7911C14.5089 24.7911 13.5266 24.365 12.8922 23.4884C12.247 22.5981 11.9198 21.1709 11.9198 19.2465C11.9198 17.3225 12.247 15.8953 12.8922 15.0055ZM10.6139 25.331C11.8498 26.7267 13.6517 27.4345 15.9696 27.4345C18.2881 27.4345 20.0709 26.7308 21.2677 25.3432C22.4537 23.9674 23.0547 21.9356 23.0547 19.3065C23.0547 16.6768 22.4439 14.6262 21.2389 13.2107C20.0221 11.783 18.2438 11.059 15.9542 11.059C13.6656 11.059 11.874 11.7876 10.6273 13.2239C9.39085 14.6491 8.76466 16.6956 8.76466 19.3065C8.76466 21.9183 9.38673 23.946 10.6139 25.331ZM27.2699 27.3155H27.15C25.9445 27.3155 25.6923 26.8228 25.6923 26.4089V15.9995C25.6923 14.8159 25.6424 13.9642 25.5462 13.4675C25.3317 12.3774 25.3317 12.3052 25.3317 12.2619C25.3317 12.0128 25.4623 11.6788 26.0875 11.4993C26.9421 11.2557 27.3661 11.299 27.5946 11.4123C27.7103 11.4698 27.8153 11.5583 27.9069 11.6757C27.9897 11.7804 28.0556 11.8882 28.1045 11.9955C28.1492 12.0942 28.194 12.2248 28.2382 12.3891C28.2768 12.5309 28.3098 12.6448 28.3391 12.7302C28.3571 12.7856 28.3761 12.8553 28.3957 12.9387C29.4129 11.6905 30.5366 11.059 31.7417 11.059C32.355 11.059 32.8407 11.1851 33.1844 11.4347C33.5523 11.7016 33.7391 12.0504 33.7391 12.4699C33.7391 12.8324 33.6742 13.2127 33.5466 13.6012C33.488 13.7802 33.3089 14.3262 32.8819 14.3262C32.8001 14.3262 32.6555 14.3049 32.2109 14.1478C31.929 14.0496 31.5832 13.9993 31.1855 13.9993C30.8099 13.9993 30.4096 14.1391 29.9943 14.4157C29.5616 14.704 29.2395 14.9877 29.0373 15.2602L28.7276 15.6431V26.4089C28.7276 26.8228 28.4744 27.3155 27.2699 27.3155ZM78.9496 20.034C79.5969 19.7854 81.0664 19.6552 83.3216 19.6461V22.6967C82.6465 23.281 81.9792 23.7396 81.336 24.0624C80.6815 24.3904 79.8861 24.5572 78.9738 24.5572C77.4482 24.5572 76.7382 23.8824 76.7382 22.4344C76.7382 21.5248 77.0855 20.9065 77.8027 20.544C78.201 20.3381 78.5848 20.1667 78.9496 20.034ZM75.0577 26.0225C76.0189 26.7908 77.297 27.1807 78.8565 27.1807C80.7104 27.1807 82.3116 26.5421 83.6246 25.2807C83.6488 25.4179 83.6746 25.5237 83.7008 25.6015C83.7286 25.6834 83.7605 25.7988 83.7975 25.9447C83.8418 26.1186 83.8855 26.2513 83.9298 26.3469C83.975 26.4496 84.0383 26.5574 84.115 26.6652C84.2071 26.7969 84.3131 26.893 84.4314 26.9519C84.6573 27.0612 85.0808 27.1029 85.9086 26.867C86.523 26.6906 86.6516 26.3606 86.6516 26.115C86.6516 26.0744 86.6516 26.0362 86.4412 24.939C86.347 24.4346 86.2992 23.6028 86.2992 22.4634V15.9715C86.2992 14.4676 85.7538 13.2747 84.6768 12.4251C83.618 11.5908 82.2416 11.1672 80.5874 11.1672C78.9609 11.1672 77.5444 11.3823 76.377 11.8058C75.0917 12.2736 74.4928 12.7404 74.4928 13.2763C74.4928 13.5244 74.6224 13.8432 74.8987 14.2804C75.2002 14.7574 75.4786 14.9796 75.777 14.9796C75.8511 14.9796 75.901 14.9796 76.5684 14.6333C77.7189 14.0552 78.9918 13.7623 80.3522 13.7623C82.3496 13.7623 83.3216 14.4757 83.3216 15.9426V17.0566C81.7193 17.0998 80.2673 17.2005 79.0006 17.3571C77.6335 17.5259 76.3847 18.0094 75.2887 18.7944C74.1573 19.6044 73.5841 20.8292 73.5841 22.4344C73.5841 24.0345 74.0801 25.2415 75.0577 26.0225ZM93.406 27.181C92.3728 27.181 91.4374 26.8658 90.6234 26.244C89.7883 25.6079 89.3649 24.4919 89.3649 22.9274V8.30854C89.3649 7.90179 89.6134 7.41673 90.7953 7.41673H90.9126C92.0944 7.41673 92.3435 7.90179 92.3435 8.30854V22.695C92.3435 24.3897 93.0998 24.5859 93.6694 24.5859C93.9838 24.5859 94.2529 24.5641 94.4675 24.5188C94.8178 24.4471 94.8863 24.441 94.9305 24.441C95.23 24.441 95.46 24.681 95.6149 25.1528C95.7425 25.5393 95.8037 25.8352 95.8037 26.0574C95.8037 27.181 93.9992 27.181 93.406 27.181ZM98.8169 26.244C99.6309 26.8658 100.566 27.181 101.6 27.181C102.192 27.181 103.997 27.181 103.997 26.0574C103.997 25.8352 103.936 25.5393 103.808 25.1528C103.653 24.681 103.424 24.441 103.124 24.441C103.08 24.441 103.011 24.4471 102.66 24.5188C102.446 24.5641 102.177 24.5859 101.863 24.5859C101.293 24.5859 100.537 24.3897 100.537 22.695V8.30854C100.537 7.90179 100.288 7.41673 99.1056 7.41673H98.9888C97.8069 7.41673 97.5579 7.90179 97.5579 8.30854V22.9274C97.5579 24.4919 97.9818 25.6079 98.8169 26.244Z" fill="#242526"/>
            </svg>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Census Upload Portal</h1>
              <p className="text-sm text-slate-400 mt-0.5">Implementation Team</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleContactUs}
            className="flex items-center gap-2 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl px-4 py-2 text-sm font-medium transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Contact Us
          </button>
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
              {lockedSponsor ? (
                <div className="text-center space-y-3">
                  <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Welcome</p>
                  <h2 className="text-3xl font-bold text-slate-900">{sponsorName}</h2>
                  <p className="text-slate-500 text-base max-w-xl mx-auto">
                    Your secure census upload page is ready. Please review the instructions below before uploading your file.
                  </p>
                </div>
              ) : (
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Welcome to ForUsAll</h2>
                <p className="text-slate-500 text-base max-w-xl mx-auto">
                  This is the secure page to submit your employee census. Please read the instructions below before uploading your file.
                </p>
              </div>
              )}

              {/* Required fields */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                <div>
                  <p className="font-semibold text-slate-800 text-base">Required information for every participant</p>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                    The fields below are <span className="font-medium text-slate-700">requested for every participant</span> in your census. This information is what we need to correctly enroll every participant, verify their eligibility and vesting schedule, and deliver required plan notices — keeping your 401(k) plan fully compliant from day one.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* First Name + Last Name side by side */}
                  <div className="sm:col-span-2 flex items-stretch bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 flex-1">
                      <span className="text-lg shrink-0">👤</span>
                      <p className="text-sm font-medium text-slate-800">First Name</p>
                    </div>
                    <div className="w-px bg-slate-200" />
                    <div className="flex items-center gap-3 px-4 py-3 flex-1">
                      <span className="text-lg shrink-0">👤</span>
                      <p className="text-sm font-medium text-slate-800">Last Name</p>
                    </div>
                  </div>
                  {[
                    { icon: '🔐', label: 'Social Security Number (SSN)', note: 'Format: XXX-XX-XXXX' },
                    { icon: '🏠', label: 'Address, City, State & ZIP',    note: '' },
                    { icon: '📅', label: 'Date of Birth',                 note: 'Format: MM/DD/YYYY' },
                    { icon: '📅', label: 'Date of Hire',                  note: 'Format: MM/DD/YYYY' },
                    { icon: '✉️', label: 'Email',                         note: 'Work email preferred' },
                    { icon: '📞', label: 'Phone Number',                  note: 'e.g. (555) 555-1234' },
                  ].map(({ icon, label, note }) => (
                    <div key={label} className="flex items-start gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
                      <span className="text-lg shrink-0">{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{label}</p>
                        {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
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
                  <span className="font-medium text-slate-700">Our template includes additional optional columns.</span> Fields like gender, middle initial, division, termination date, rehire date, and contribution amounts are not required — but if you have them, please include them. The more complete your file, the richer the picture we have of your workforce and the smoother your onboarding will be.
                </p>
              </div>

              {/* Conversion plan notice */}
              {isConversion && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-amber-900">Additional info needed — Conversion plan</p>
                    <p className="text-sm text-amber-800 leading-relaxed">
                      Since this is a conversion from a previous provider, please make sure your census includes the <strong>previous savings rate</strong> for each participant if you can get them.
                    </p>
                    <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                      <li>Terminated employees <strong>with a remaining balance</strong> should be included — yes, they are mandatory.</li>
                      <li>If you have any questions about which employees to include, contact us before uploading.</li>
                    </ul>
                  </div>
                </div>
              )}

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
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setStep('welcome')}
                    disabled={step === 'validating'}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    ← Back to instructions
                  </button>
                  <button
                    onClick={handleContactUs}
                    className="text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Contact us
                  </button>
                </div>
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
                {lockedSponsor ? (
                  <div className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base bg-slate-50 text-slate-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    {sponsorName}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={sponsorName}
                    onChange={e => setSponsorName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
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
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setStep('welcome')}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ← Back to instructions
                  </button>
                  <button
                    onClick={handleContactUs}
                    className="text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Contact us
                  </button>
                </div>
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
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setValidation(null);
                  setResolvedFlags({});
                  setPerEmployeeFixes({});
                  setErrorMsg('');
                  setShowReplaceWarning(false);
                  setReplaceExisting(false);
                  setPreviewEmployees([]);
                  setDownloadInfo(null);
                  setStep('input');
                }}
                className="w-full rounded-xl h-11"
              >
                Try a different file
              </Button>
              <button
                onClick={reset}
                className="w-full text-sm text-slate-400 hover:text-slate-600 underline underline-offset-2"
              >
                Start over (clears all fields)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Contact Us modal ── */}
      {showContactModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowContactModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Need help?</h3>
              <button
                onClick={() => setShowContactModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-slate-500">
              Email our implementation team and we'll get back to you shortly.
            </p>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-blue-800 break-all">implementations@forusall.com</span>
              <button
                onClick={handleCopyEmail}
                className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-300 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                {contactCopied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <a
              href="mailto:implementations@forusall.com?subject=Census%20Upload%20Help&body=Hi%2C%20I%20need%20help%20with%20my%20census%20upload."
              className="block w-full text-center text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-xl px-4 py-3 transition-colors"
            >
              Open in email app →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
