create role anon nologin;
create role authenticated nologin;
create role supabase_auth_admin login noinherit password :'auth_password';
create role tennis_web login noinherit password :'web_password';
grant authenticated to tennis_web with inherit false;
alter role supabase_auth_admin set search_path = auth, extensions, public;
