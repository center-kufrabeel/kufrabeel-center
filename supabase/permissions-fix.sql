-- شغّل هذه الأوامر مرة واحدة إذا تم تشغيل schema.sql قبل إضافة أوامر GRANT.
grant usage on schema public to anon, authenticated;

grant select on
  public.registration_settings,
  public.groups,
  public.group_media,
  public.news,
  public.slider_items,
  public.resources
to anon, authenticated;

grant insert on public.registrations to anon, authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.registration_settings,
  public.registrations,
  public.groups,
  public.group_media,
  public.news,
  public.slider_items,
  public.resources
to authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;
