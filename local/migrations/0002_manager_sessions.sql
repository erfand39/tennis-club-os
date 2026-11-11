delete from tennis_runtime.web_sessions as s
where not exists (
  select from public.organization_members as m where m.user_id=s.user_id and m.active and m.role in ('owner','admin')
);
