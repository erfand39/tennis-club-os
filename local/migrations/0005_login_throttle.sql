create table tennis_runtime.login_failures (
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  failed_at timestamptz not null default clock_timestamp()
);
create index login_failures_email_idx on tennis_runtime.login_failures (email_hash, failed_at desc);
create index login_failures_time_idx on tennis_runtime.login_failures (failed_at);
alter table tennis_runtime.login_failures enable row level security;
create policy login_failures_service on tennis_runtime.login_failures to tennis_web
  using (true) with check (true);
revoke all on tennis_runtime.login_failures from public, anon, authenticated;
grant select, insert, delete on tennis_runtime.login_failures to tennis_web;
