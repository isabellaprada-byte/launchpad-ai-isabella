const DEVREV_API = 'https://api.devrev.ai';
const IMPLEMENTATIONS_GROUP = 'don:identity:dvrv-us-1:devo/1is7v8y722:group/4';
const FORUSALL_PART = 'don:core:dvrv-us-1:devo/1is7v8y722:product/1';
const UNASSIGNED = 'don:identity:dvrv-us-1:devo/1is7v8y722:svcacc/2';

export async function createCensusTicket({
  sponsorName,
  employeeCount,
  uploaderName,
  uploaderEmail,
  acknowledgedFields,
  fixedCount,
}: {
  sponsorName: string;
  employeeCount: number;
  uploaderName: string;
  uploaderEmail: string;
  acknowledgedFields: string[];
  fixedCount: number;
}): Promise<void> {
  const token = process.env.DEVREV_TOKEN?.trim();
  if (!token) {
    console.warn('DEVREV_TOKEN not set — skipping DevRev ticket creation');
    return;
  }
  console.log(`DEVREV_TOKEN length: ${token.length}, starts with: ${token.slice(0, 8)}`);

  const lines = [
    `**Company:** ${sponsorName}`,
    `**Submitted by:** ${uploaderName} (${uploaderEmail})`,
    `**Employees:** ${employeeCount}`,
  ];
  if (fixedCount > 0) lines.push(`**Fields corrected:** ${fixedCount}`);
  if (acknowledgedFields.length > 0) lines.push(`**Fields left blank (confirmed unavailable):** ${acknowledgedFields.join(', ')}`);
  lines.push('', 'Census files are attached to the internal notification email.');

  const res = await fetch(`${DEVREV_API}/works.create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'ticket',
      title: `Census submitted — ${sponsorName} (${employeeCount} employees)`,
      body: lines.join('\n'),
      group: IMPLEMENTATIONS_GROUP,
      applies_to_part: FORUSALL_PART,
      owned_by: [UNASSIGNED],
      severity: 'medium',
      source_channel: 'Census Upload Portal',
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`DevRev API error — status: ${res.status} — body: ${text}`);
    throw new Error(`DevRev API ${res.status}: ${text}`);
  }
  console.log(`DevRev ticket created OK — ${res.status}`);
}
