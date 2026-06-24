-- Add uploader_email_hash to track submission rate limit per email (no PII stored)
alter table census_submissions
  add column if not exists uploader_email_hash text;

create index if not exists idx_census_submissions_email_hash
  on census_submissions (uploader_email_hash)
  where uploader_email_hash is not null;
