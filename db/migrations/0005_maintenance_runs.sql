-- One-time maintenance operations triggered from a deploy (e.g. the production clean-up).
-- Each token can run only once, so leaving a setting on can never repeat a destructive operation.
create table atelier.maintenance_runs (
  token text primary key,
  action text not null,
  ran_at timestamptz not null default now()
);
alter table atelier.maintenance_runs enable row level security;
-- No grants and no policies: only scripts using the schema-owner connection can read or write it.
