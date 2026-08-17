(() => {
  "use strict";

  const config = window.CENTER_SUPABASE_CONFIG || {};
  const hasKey = Boolean(config.publishableKey && !config.publishableKey.includes("PASTE_"));
  const configured = Boolean(window.supabase && config.url && hasKey);
  const client = configured
    ? window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const publicFileUrl = path => {
    if (!path || !client) return "";
    return client.storage.from("center-public").getPublicUrl(path).data.publicUrl;
  };

  window.CenterDB = {
    client,
    configured,
    publicFileUrl,
    configError: configured ? "" : "لم يُضف المفتاح العام لمشروع Supabase بعد."
  };
})();

