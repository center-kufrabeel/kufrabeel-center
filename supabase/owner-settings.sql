-- إعدادات التواصل التي يديرها مالك النظام فقط.
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.

create table if not exists public.site_settings (
  id text primary key,
  phone text not null,
  location_text text not null,
  map_url text not null,
  whatsapp_url text not null,
  facebook_url text not null,
  instagram_url text not null,
  youtube_url text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null,
  constraint site_settings_contact_only check (id = 'contact')
);

insert into public.site_settings (id, phone, location_text, map_url, whatsapp_url, facebook_url, instagram_url, youtube_url)
values (
  'contact',
  '0777120841',
  'إربد — لواء الكورة — كفرأبيل',
  'https://maps.app.goo.gl/kMnVGHEGyxCKAeeh9?g_st=aw',
  'https://wa.me/962777120841',
  'https://www.facebook.com/share/1BbQF7fhoz/',
  'https://www.instagram.com/kufrabil_center_quranic/',
  'https://www.youtube.com/@kufrabilcenterquranic'
)
on conflict (id) do nothing;

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at before update on public.site_settings
for each row execute procedure public.set_updated_at();

alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;
revoke delete on public.site_settings from anon, authenticated;

drop policy if exists site_settings_public_read on public.site_settings;
drop policy if exists site_settings_owner_insert on public.site_settings;
drop policy if exists site_settings_owner_update on public.site_settings;
drop policy if exists site_settings_owner_delete on public.site_settings;

create policy site_settings_public_read on public.site_settings for select to anon, authenticated using (true);
create policy site_settings_owner_insert on public.site_settings for insert to authenticated with check (public.is_owner());
create policy site_settings_owner_update on public.site_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop trigger if exists audit_site_settings_changes on public.site_settings;
create trigger audit_site_settings_changes after insert or update or delete on public.site_settings
for each row execute procedure public.record_staff_activity();

alter table public.site_settings replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_settings'
  ) then
    alter publication supabase_realtime add table public.site_settings;
  end if;
end $$;

select 'Owner contact settings are ready' as result;
