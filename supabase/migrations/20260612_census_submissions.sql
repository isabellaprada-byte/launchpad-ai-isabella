create table if not exists census_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  sponsor_name text not null,
  original_filename text not null,
  status text not null default 'pending_validation',
  employee_count int,
  issues_count int default 0,
  drive_url_admin text,
  drive_url_lt text,
  acknowledged_fields jsonb default '[]'::jsonb
);

-- status values: 'pending_validation' | 'submitted' | 'processed'
-- acknowledged_fields: array of field names the sponsor confirmed they don't have
-- NO PII stored in this table
