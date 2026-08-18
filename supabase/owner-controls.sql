-- تحكم المالك: الصيانة، قفل الإدارة، وإنهاء الجلسات والاحتفاظ بالتسجيلات.
-- شغّل هذا الملف مرة واحدة بعد ملفات الإعداد السابقة.

alter table public.profiles add column if not exists is_active boolean not null default true;

create table if not exists public.system_controls (
  id text primary key check (id = 'main'),
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default 'نجري حاليًا بعض التحسينات على الموقع، وسنعود قريبًا بإذن الله.',
  expected_return_at timestamptz,
  registration_retention_months integer not null default 24 check (registration_retention_months between 1 and 120),
  force_logout_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.system_controls (id) values ('main') on conflict (id) do nothing;

drop trigger if exists set_system_controls_updated_at on public.system_controls;
create trigger set_system_controls_updated_at before update on public.system_controls
for each row execute procedure public.set_updated_at();

alter table public.system_controls enable row level security;
grant select on public.system_controls to anon, authenticated;
grant insert, update on public.system_controls to authenticated;
revoke delete on public.system_controls from anon, authenticated;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner' and is_active = true);
$$;

create or replace function public.site_is_available()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not coalesce((select maintenance_enabled from public.system_controls where id = 'main'), false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role in ('owner', 'admin')
      and (
        profile.role = 'owner'
        or (
          public.site_is_available()
          and (
            (select force_logout_at from public.system_controls where id = 'main') is null
            or coalesce((select last_sign_in_at from auth.users where id = auth.uid()), '-infinity'::timestamptz)
               > (select force_logout_at from public.system_controls where id = 'main')
          )
        )
      )
  );
$$;

grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.site_is_available() to anon, authenticated;

drop policy if exists system_controls_public_read on public.system_controls;
drop policy if exists system_controls_owner_insert on public.system_controls;
drop policy if exists system_controls_owner_update on public.system_controls;
create policy system_controls_public_read on public.system_controls for select to anon, authenticated using (true);
create policy system_controls_owner_insert on public.system_controls for insert to authenticated with check (public.is_owner());
create policy system_controls_owner_update on public.system_controls for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists registration_settings_public_read on public.registration_settings;
create policy registration_settings_public_read on public.registration_settings for select to anon, authenticated
using (public.site_is_available() or public.is_staff() or public.is_owner());

drop policy if exists registrations_public_insert_when_open on public.registrations;
create policy registrations_public_insert_when_open on public.registrations for insert to anon, authenticated
with check (public.site_is_available() and exists (
  select 1 from public.registration_settings settings
  where settings.program = registrations.program
    and settings.is_open = true
    and (settings.opens_at is null or settings.opens_at <= now())
    and (settings.closes_at is null or settings.closes_at > now())
));

drop policy if exists groups_public_read on public.groups;
create policy groups_public_read on public.groups for select to anon, authenticated
using ((public.site_is_available() and is_published = true and deleted_at is null) or public.is_staff() or public.is_owner());

drop policy if exists group_media_public_read on public.group_media;
create policy group_media_public_read on public.group_media for select to anon, authenticated
using (public.is_staff() or public.is_owner() or (public.site_is_available() and deleted_at is null and exists (
  select 1 from public.groups where groups.id = group_media.group_id and groups.is_published and groups.deleted_at is null
)));

drop policy if exists news_public_read on public.news;
create policy news_public_read on public.news for select to anon, authenticated
using ((public.site_is_available() and is_published and deleted_at is null) or public.is_staff() or public.is_owner());

drop policy if exists slider_public_read on public.slider_items;
create policy slider_public_read on public.slider_items for select to anon, authenticated
using ((public.site_is_available() and is_published and deleted_at is null) or public.is_staff() or public.is_owner());

drop policy if exists resources_public_read on public.resources;
create policy resources_public_read on public.resources for select to anon, authenticated
using ((public.site_is_available() and is_published and deleted_at is null) or public.is_staff() or public.is_owner());

drop policy if exists video_items_public_read on public.video_items;
create policy video_items_public_read on public.video_items for select to anon, authenticated
using ((public.site_is_available() and is_published and deleted_at is null) or public.is_staff() or public.is_owner());

create or replace function public.archive_old_registrations()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  retention integer;
  affected integer;
begin
  if not public.is_owner() then raise exception 'Only owner can archive registrations'; end if;
  select registration_retention_months into retention from public.system_controls where id = 'main';
  update public.registrations
  set deleted_at = timezone('utc', now()), deleted_by = auth.uid()
  where deleted_at is null and created_at < timezone('utc', now()) - make_interval(months => retention);
  get diagnostics affected = row_count;
  return affected;
end;
$$;
grant execute on function public.archive_old_registrations() to authenticated;

drop trigger if exists audit_system_controls_changes on public.system_controls;
create trigger audit_system_controls_changes after insert or update or delete on public.system_controls
for each row execute procedure public.record_staff_activity();

alter table public.system_controls replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'system_controls'
  ) then
    alter publication supabase_realtime add table public.system_controls;
  end if;
end $$;

select 'Owner controls are ready' as result;
