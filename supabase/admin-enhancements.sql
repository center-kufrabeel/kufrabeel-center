-- تحسينات الإدارة: الجدولة، الملاحظات، منع التكرار، السلة، النسخ الاحتياطي، وتشديد الصلاحيات.

alter table public.registration_settings
  add column if not exists opens_at timestamptz,
  add column if not exists closes_at timestamptz;

alter table public.registrations
  add column if not exists admin_notes text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.groups
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.group_media
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.news
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.slider_items
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.resources
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

drop index if exists public.registrations_unique_active_phone_program;
create unique index registrations_unique_active_phone_program
on public.registrations ((right(regexp_replace(phone, '[^0-9]', '', 'g'), 9)), program)
where deleted_at is null;

drop policy if exists registrations_public_insert_when_open on public.registrations;
create policy registrations_public_insert_when_open on public.registrations for insert to anon, authenticated
with check (exists (
  select 1 from public.registration_settings settings
  where settings.program = registrations.program
    and settings.is_open = true
    and (settings.opens_at is null or settings.opens_at <= now())
    and (settings.closes_at is null or settings.closes_at > now())
));

drop policy if exists registrations_staff_all on public.registrations;
drop policy if exists registrations_staff_read on public.registrations;
drop policy if exists registrations_staff_update on public.registrations;
drop policy if exists registrations_owner_delete on public.registrations;
create policy registrations_staff_read on public.registrations for select to authenticated using (public.is_staff());
create policy registrations_staff_update on public.registrations for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy registrations_owner_delete on public.registrations for delete to authenticated using (public.is_owner());

drop policy if exists groups_public_read on public.groups;
drop policy if exists groups_staff_all on public.groups;
drop policy if exists groups_staff_insert on public.groups;
drop policy if exists groups_staff_update on public.groups;
drop policy if exists groups_owner_delete on public.groups;
create policy groups_public_read on public.groups for select to anon, authenticated
using ((is_published = true and deleted_at is null) or public.is_staff());
create policy groups_staff_insert on public.groups for insert to authenticated with check (public.is_staff());
create policy groups_staff_update on public.groups for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy groups_owner_delete on public.groups for delete to authenticated using (public.is_owner());

drop policy if exists group_media_public_read on public.group_media;
drop policy if exists group_media_staff_all on public.group_media;
drop policy if exists group_media_staff_insert on public.group_media;
drop policy if exists group_media_staff_update on public.group_media;
drop policy if exists group_media_owner_delete on public.group_media;
create policy group_media_public_read on public.group_media for select to anon, authenticated
using (public.is_staff() or (deleted_at is null and exists (
  select 1 from public.groups where groups.id = group_media.group_id and groups.is_published and groups.deleted_at is null
)));
create policy group_media_staff_insert on public.group_media for insert to authenticated with check (public.is_staff());
create policy group_media_staff_update on public.group_media for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy group_media_owner_delete on public.group_media for delete to authenticated using (public.is_owner());

drop policy if exists news_public_read on public.news;
drop policy if exists news_staff_all on public.news;
drop policy if exists news_staff_insert on public.news;
drop policy if exists news_staff_update on public.news;
drop policy if exists news_owner_delete on public.news;
create policy news_public_read on public.news for select to anon, authenticated using ((is_published and deleted_at is null) or public.is_staff());
create policy news_staff_insert on public.news for insert to authenticated with check (public.is_staff());
create policy news_staff_update on public.news for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy news_owner_delete on public.news for delete to authenticated using (public.is_owner());

drop policy if exists slider_public_read on public.slider_items;
drop policy if exists slider_staff_all on public.slider_items;
drop policy if exists slider_staff_insert on public.slider_items;
drop policy if exists slider_staff_update on public.slider_items;
drop policy if exists slider_owner_delete on public.slider_items;
create policy slider_public_read on public.slider_items for select to anon, authenticated using ((is_published and deleted_at is null) or public.is_staff());
create policy slider_staff_insert on public.slider_items for insert to authenticated with check (public.is_staff());
create policy slider_staff_update on public.slider_items for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy slider_owner_delete on public.slider_items for delete to authenticated using (public.is_owner());

drop policy if exists resources_public_read on public.resources;
drop policy if exists resources_staff_all on public.resources;
drop policy if exists resources_staff_insert on public.resources;
drop policy if exists resources_staff_update on public.resources;
drop policy if exists resources_owner_delete on public.resources;
create policy resources_public_read on public.resources for select to anon, authenticated using ((is_published and deleted_at is null) or public.is_staff());
create policy resources_staff_insert on public.resources for insert to authenticated with check (public.is_staff());
create policy resources_staff_update on public.resources for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy resources_owner_delete on public.resources for delete to authenticated using (public.is_owner());

drop policy if exists center_staff_files_delete on storage.objects;
drop policy if exists center_owner_files_delete on storage.objects;
create policy center_owner_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'center-public' and public.is_owner());

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check
check (action in ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'RESTORE'));

create or replace function public.log_staff_event(event_action text, event_entity text, event_label text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('owner', 'admin') then raise exception 'Not authorized'; end if;
  if event_action not in ('LOGIN', 'EXPORT', 'RESTORE') then raise exception 'Invalid event'; end if;
  insert into public.audit_logs (actor_id, actor_name, actor_role, action, entity_type, record_label)
  values (actor.id, coalesce(nullif(actor.full_name, ''), 'مستخدم إداري'), actor.role, event_action, event_entity, event_label);
end;
$$;

create or replace function public.sync_registration_sequence()
returns void
language plpgsql
security definer set search_path = public
as $$
declare max_id bigint;
begin
  if not public.is_owner() then raise exception 'Only owner can restore backups'; end if;
  select max(id) into max_id from public.registrations;
  if max_id is null then
    perform setval(pg_get_serial_sequence('public.registrations','id'), 1, false);
  else
    perform setval(pg_get_serial_sequence('public.registrations','id'), max_id, true);
  end if;
end;
$$;

grant execute on function public.log_staff_event(text, text, text) to authenticated;
grant execute on function public.sync_registration_sequence() to authenticated;

select 'Admin enhancements are ready' as result;
