create role anon nologin;
create role authenticated nologin;
create role supabase_auth_admin login noinherit password :'auth_password';
create role tennis_web login noinherit password :'web_password';
grant authenticated to tennis_web with inherit false;

create schema auth authorization supabase_auth_admin;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to supabase_auth_admin;
grant usage on schema auth to authenticated;
alter role supabase_auth_admin set search_path = auth, extensions, public;
revoke create on schema public from public;
