(() => {
  "use strict";

  if (!window.CenterDB?.configured) return;
  const db = CenterDB.client;
  const onMaintenancePage = document.body.classList.contains("maintenance-page");

  const formatReturnTime = value => value ? new Intl.DateTimeFormat("ar-JO", { dateStyle: "full", timeStyle: "short" }).format(new Date(value)) : "سيُعاد فتح الموقع فور انتهاء أعمال الصيانة.";
  const applyMaintenanceCopy = controls => {
    const message = document.getElementById("maintenanceMessage");
    const returnTime = document.getElementById("maintenanceReturnTime");
    if (message) message.textContent = controls.maintenance_message || "نجري حاليًا بعض التحسينات على الموقع.";
    if (returnTime) returnTime.textContent = formatReturnTime(controls.expected_return_at);
  };

  const checkMaintenance = async () => {
    const { data: controls, error } = await db.from("system_controls").select("maintenance_enabled,maintenance_message,expected_return_at").eq("id", "main").maybeSingle();
    if (error || !controls) return;
    const { data: { session } } = await db.auth.getSession();
    let isOwner = false;
    if (session?.user) {
      const { data: profile } = await db.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      isOwner = profile?.role === "owner";
    }
    if (controls.maintenance_enabled && !isOwner) {
      if (onMaintenancePage) applyMaintenanceCopy(controls);
      else location.replace(`maintenance.html?from=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
      return;
    }
    if (!controls.maintenance_enabled && onMaintenancePage) location.replace("index.html");
  };

  checkMaintenance();
  db.channel("maintenance-gate-live").on("postgres_changes", { event: "*", schema: "public", table: "system_controls" }, checkMaintenance).subscribe();
})();
