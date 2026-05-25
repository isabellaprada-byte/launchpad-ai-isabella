"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanData } from "@/app/plan/page";

export function PlanUpload({ onExtracted }: { onExtracted: (plan: PlanData) => void }) {
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

      const uploadRes = await fetch("/api/plan/upload", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json();
      if (uploadJson.error) throw new Error(uploadJson.error);

      const extractRes = await fetch("/api/plan/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: uploadJson.data.base64, fileName: file.name }),
      });
      const extractJson = await extractRes.json();
      if (extractJson.error) throw new Error(extractJson.error);

      onExtracted(extractJson.data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Upload Plan Document</CardTitle>
        <CardDescription>
          Upload the Acme Robotics 401(k) plan PDF. The AI agent will extract all plan
          details automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary hover:bg-muted/50"
        >
          {file ? (
            <p className="text-sm font-medium text-foreground">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Click to select a PDF</p>
              <p className="mt-1 text-xs text-muted-foreground">PDF files only</p>
            </>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleUpload} disabled={!file || loading} className="w-full">
          {loading ? "Extracting plan details…" : "Upload & Extract"}
        </Button>
      </CardContent>
    </Card>
  );
}
