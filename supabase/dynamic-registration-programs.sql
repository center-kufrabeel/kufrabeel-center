-- أنواع تسجيل ديناميكية يضيفها فريق الإدارة من لوحة الموقع.
-- شغّل هذا الملف مرة واحدة بعد owner-controls.sql.

alter table public.registration_settings
  drop constraint if exists registration_settings_program_check;

alter table public.registration_settings
  add column if not exists description text,
  add column if not exists sort_order integer not null default 100,
  add column if not exists is_archived boolean not null default false,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.registration_settings
set description = case program
  when 'permanent' then 'الحفظ والمراجعة والمتابعة طوال العام'
  when 'tajweed' then 'مسارات التلاوة والتجويد بمستوياتها'
  else coalesce(description, 'برنامج من برامج المركز')
end
where description is null;

update public.registration_settings
set sort_order = case program when 'permanent' then 10 when 'tajweed' then 20 else sort_order end;

create index if not exists registration_settings_sort_idx
on public.registration_settings (is_archived, sort_order, created_at);

grant select on public.registration_settings to anon, authenticated;
grant insert, update on public.registration_settings to authenticated;

drop policy if exists registration_settings_staff_insert on public.registration_settings;
create policy registration_settings_staff_insert on public.registration_settings
for insert to authenticated
with check (public.is_staff());

drop policy if exists registration_settings_public_read on public.registration_settings;
create policy registration_settings_public_read on public.registration_settings
for select to anon, authenticated
using (
  (public.site_is_available() and is_archived = false)
  or public.is_staff()
  or public.is_owner()
);

drop policy if exists registrations_public_insert_when_open on public.registrations;
create policy registrations_public_insert_when_open on public.registrations
for insert to anon, authenticated
with check (
  public.site_is_available()
  and exists (
    select 1
    from public.registration_settings settings
    where settings.program = registrations.program
      and settings.is_archived = false
      and settings.is_open = true
      and (settings.opens_at is null or settings.opens_at <= now())
      and (settings.closes_at is null or settings.closes_at > now())
  )
);

select 'Dynamic registration programs are ready' as result;
