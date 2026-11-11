create schema auth authorization supabase_auth_admin;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to supabase_auth_admin;
grant usage on schema auth to authenticated;
revoke create on schema public from public;
