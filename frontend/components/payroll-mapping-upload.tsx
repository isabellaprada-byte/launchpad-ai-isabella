"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UploadedRun } from "@/app/payroll/mapping/page";

export function PayrollMappingUpload({ onUploaded }: { onUploaded: (r: UploadedRun) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("runNumber", "1");

      const uploadRes = await fetch("/api/payroll/upload", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json();
      if (uploadJson.error) throw new Error(uploadJson.error);

      const { run, headers, rows } = uploadJson.data;

      const mapRes = await fetch("/api/payroll/suggest-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: headers, runId: run.id }),
      });
      const mapJson = await mapRes.json();
      if (mapJson.error) throw new Error(mapJson.error);

      onUploaded({ run, headers, rows, mappings: mapJson.data.mappings });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Upload Payroll Run 1</CardTitle>
        <CardDescription>
          Upload the first payroll CSV to define the column mapping. This mapping will be
          used for all subsequent payroll runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary hover:bg-muted/50"
        >
          {file ? (
            <p className="text-sm font-medium">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium">Click to select a CSV</p>
              <p className="mt-1 text-xs text-muted-foreground">CSV files only</p>
            </>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleUpload} disabled={!file || loading} className="w-full">
          {loading ? "Detecting columns…" : "Upload & Suggest Mapping"}
        </Button>
      </CardContent>
    </Card>
  );
}
