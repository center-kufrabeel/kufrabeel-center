-- المكتبة المرئية: شغّل هذا الملف مرة واحدة في Supabase SQL Editor.

create table if not exists public.video_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 180),
  description text,
  youtube_url text not null,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  category text,
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists video_items_public_order_idx
on public.video_items (is_published, is_featured desc, sort_order, created_at desc)
where deleted_at is null;

drop trigger if exists set_video_items_updated_at on public.video_items;
create trigger set_video_items_updated_at before update on public.video_items
for each row execute procedure public.set_updated_at();

alter table public.video_items enable row level security;
grant select on public.video_items to anon, authenticated;
grant insert, update, delete on public.video_items to authenticated;

drop policy if exists video_items_public_read on public.video_items;
drop policy if exists video_items_staff_all on public.video_items;
drop policy if exists video_items_staff_insert on public.video_items;
drop policy if exists video_items_staff_update on public.video_items;
drop policy if exists video_items_owner_delete on public.video_items;

create policy video_items_public_read on public.video_items for select to anon, authenticated
using ((is_published = true and deleted_at is null) or public.is_staff());
create policy video_items_staff_insert on public.video_items for insert to authenticated
with check (public.is_staff());
create policy video_items_staff_update on public.video_items for update to authenticated
using (public.is_staff()) with check (public.is_staff());
create policy video_items_owner_delete on public.video_items for delete to authenticated
using (public.is_owner());

create or replace function public.record_video_activity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  row_data jsonb;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('owner', 'admin') then return coalesce(new, old); end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, record_label)
  values (actor.id, coalesce(nullif(actor.full_name, ''), 'مستخدم إداري'), actor.role, tg_op, 'video_items', row_data ->> 'id', row_data ->> 'title');
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_video_items_changes on public.video_items;
create trigger audit_video_items_changes after insert or update or delete on public.video_items
for each row execute procedure public.record_video_activity();

alter table public.video_items replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'video_items'
  ) then
    alter publication supabase_realtime add table public.video_items;
  end if;
end $$;

select 'Video library is ready' as result;
