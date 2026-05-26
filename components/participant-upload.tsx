"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Participant } from "@/app/participants/page";
import type { ParticipantRecord, ParticipantFlag } from "@/lib/agents/participant-import-agent";

export function ParticipantUpload({ onImported }: { onImported: (p: Participant[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ records: ParticipantRecord[]; flags: ParticipantFlag[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/participants/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPreview(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/participants/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: preview.records }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onImported(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  const flagMap = new Map(preview?.flags.map((f) => [f.employee_id, f]));

  return (
    <div className="space-y-6">
      {!preview && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Upload Participant Census</CardTitle>
            <CardDescription>
              Upload the participant CSV. The agent will normalize all records and flag issues.
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
              {loading ? "Normalizing records…" : "Upload & Preview"}
            </Button>
          </CardContent>
        </Card>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {preview.records.length} records · {preview.flags.length} flags
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
              <Button onClick={handleImport} disabled={saving}>
                {saving ? "Importing…" : `Import All ${preview.records.length} Records`}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Hire Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.records.slice(0, 30).map((r) => {
                  const flag = flagMap.get(r.employee_id);
                  return (
                    <TableRow key={r.employee_id} className={flag ? "bg-amber-50/50 dark:bg-amber-950/20" : undefined}>
                      <TableCell className="text-xs font-mono">{r.employee_id}</TableCell>
                      <TableCell className="text-sm">{r.first_name} {r.last_name}</TableCell>
                      <TableCell className="text-xs">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.hire_date ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {flag && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-900 text-xs dark:bg-amber-950 dark:text-amber-200" title={flag.description}>
                            {flag.field}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
