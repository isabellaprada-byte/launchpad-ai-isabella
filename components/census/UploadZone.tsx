'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const ACCEPT = '.xlsx,.xls,.csv';

export function UploadZone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [formatError, setFormatError] = useState(false);

  function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.pdf') || (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv'))) {
      setFormatError(true);
      return;
    }
    setFormatError(false);
    onFile(file);
  }

  if (formatError) {
    return (
      <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <p className="text-red-700 font-semibold text-base">PDFs are not supported</p>
          <p className="text-red-500 text-sm mt-1">
            We only accept <strong>Excel (.xlsx)</strong> or <strong>CSV</strong> files.<br />
            Please convert your file and try again.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-100 rounded-xl"
          onClick={() => { setFormatError(false); setTimeout(() => inputRef.current?.click(), 50); }}
        >
          Choose a different file
        </Button>
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-150
        ${dragging ? 'border-blue-400 bg-blue-50 scale-[1.01]' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} disabled={disabled} />
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <p className="text-slate-600 font-medium">Drop your file here, or <span className="text-blue-600">browse</span></p>
      <p className="text-slate-400 text-sm mt-1">Excel (.xlsx / .xls) or CSV — up to 10 MB</p>
    </div>
  );
}
