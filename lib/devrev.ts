const DEVREV_API = 'https://api.devrev.ai';
const IMPLEMENTATIONS_GROUP = 'don:identity:dvrv-us-1:devo/1is7v8y722:group/4';
const FORUSALL_PART = 'don:core:dvrv-us-1:devo/1is7v8y722:product/1';
const UNASSIGNED = 'don:identity:dvrv-us-1:devo/1is7v8y722:svcacc/2';

async function uploadArtifact(
  token: string,
  fileName: string,
  content: Buffer,
  mimeType: string,
): Promise<string> {
  const prepRes = await fetch(`${DEVREV_API}/artifacts.prepare`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, file_type: mimeType, file_size: content.length }),
  });
  if (!prepRes.ok) {
    throw new Error(`artifacts.prepare ${prepRes.status}: ${await prepRes.text()}`);
  }
  const { artifact, upload_url, form_data } = await prepRes.json();

  const fd = new FormData();
  for (const { key, value } of (form_data ?? [])) fd.append(key, value);
  fd.append('file', new Blob([content], { type: mimeType }), fileName);

  const uploadRes = await fetch(upload_url, { method: 'POST', body: fd });
  if (!uploadRes.ok) {
    throw new Error(`artifact S3 upload ${uploadRes.status}: ${await uploadRes.text()}`);
  }

  return artifact.id as string;
}

export async function createCensusTicket({
  sponsorName,
  employeeCount,
  uploaderName,
  uploaderEmail,
  acknowledgedFields,
  fixedCount,
  adminBuffer,
  adminFilename,
  ltBuffer,
  ltFilename,
  originalBuffer,
  originalFilename,
}: {
  sponsorName: string;
  employeeCount: number;
  uploaderName: string;
  uploaderEmail: string;
  acknowledgedFields: string[];
  fixedCount: number;
  adminBuffer: Buffer;
  adminFilename: string;
  ltBuffer: Buffer;
  ltFilename: string;
  originalBuffer: Buffer;
  originalFilename: string;
}): Promise<void> {
  const token = process.env.DEVREV_TOKEN?.trim();
  if (!token) {
    console.warn('DEVREV_TOKEN not set — skipping DevRev ticket creation');
    return;
  }
  console.log(`DEVREV_TOKEN length: ${token.length}, starts with: ${token.slice(0, 8)}`);

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const filesToUpload = [
    { name: adminFilename, content: adminBuffer, mime: XLSX_MIME },
    { name: ltFilename, content: ltBuffer, mime: XLSX_MIME },
    { name: originalFilename, content: originalBuffer, mime: 'application/octet-stream' },
  ];

  const artifactIds: string[] = [];
  for (const f of filesToUpload) {
    try {
      const id = await uploadArtifact(token, f.name, f.content, f.mime);
      artifactIds.push(id);
      console.log(`Artifact uploaded: ${f.name} → ${id}`);
    } catch (err) {
      console.error(`Artifact upload failed for ${f.name} (non-fatal):`, err);
    }
  }

  const lines = [
    `**Company:** ${sponsorName}`,
    `**Submitted by:** ${uploaderName} (${uploaderEmail})`,
    `**Employees:** ${employeeCount}`,
  ];
  if (fixedCount > 0) lines.push(`**Fields corrected:** ${fixedCount}`);
  if (acknowledgedFields.length > 0) lines.push(`**Fields left blank (confirmed unavailable):** ${acknowledgedFields.join(', ')}`);

  const body: Record<string, unknown> = {
    type: 'ticket',
    title: `Census submitted — ${sponsorName} (${employeeCount} employees)`,
    body: lines.join('\n'),
    group: IMPLEMENTATIONS_GROUP,
    applies_to_part: FORUSALL_PART,
    owned_by: [UNASSIGNED],
    severity: 'medium',
    source_channel: 'Census Upload Portal',
  };
  if (artifactIds.length > 0) body.artifacts = artifactIds;

  const res = await fetch(`${DEVREV_API}/works.create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`DevRev API error — status: ${res.status} — body: ${text}`);
    throw new Error(`DevRev API ${res.status}: ${text}`);
  }
  console.log(`DevRev ticket created OK — ${res.status} — artifacts: ${artifactIds.length}`);
}
