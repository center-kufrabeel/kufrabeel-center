(() => {
  "use strict";

  const db = window.CenterDB?.client;
  const setup = document.getElementById("adminSetup");
  const loginSection = document.getElementById("adminLogin");
  const dashboard = document.getElementById("adminDashboard");
  const loginForm = document.getElementById("adminLoginForm");
  const loginAlert = document.getElementById("loginAlert");
  const adminAlert = document.getElementById("adminAlert");
  const programLabels = { permanent: "النادي الدائم", tajweed: "دورات التجويد" };
  const genderLabels = { male: "ذكر", female: "أنثى" };
  const statusLabels = { new: "جديد", reviewed: "تمت المراجعة", accepted: "مقبول", rejected: "مرفوض" };
  const auditActionLabels = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف", LOGIN: "دخول", EXPORT: "تصدير", RESTORE: "استعادة" };
  const auditEntityLabels = { profiles: "الحسابات", registration_settings: "إعدادات التسجيل", registrations: "طلبات التسجيل", groups: "المجموعات", group_media: "مرفقات المجموعات", news: "الأخبار", slider_items: "السلايد شو", video_items: "المكتبة المرئية", resources: "الملفات العامة", backup: "النسخ الاحتياطي" };
  const loginAliases = { owner: "mohammadalfaqeeh73@gmail.com", admin: "loordmohammad79@gmail.com" };
  const state = { profile: null, registrations: [], groups: [], news: [], slider: [], videos: [], resources: [], media: [], activity: [], trash: [] };
  let realtimeChannel = null;

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const formatDate = value => value ? new Intl.DateTimeFormat("ar-JO", { dateStyle: "medium" }).format(new Date(value)) : "—";
  const formatDateTime = value => value ? new Intl.DateTimeFormat("ar-JO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  const youtubeIdFromUrl = value => {
    const input = String(value || "").trim();
    if (/^[\w-]{11}$/.test(input)) return input;
    try {
      const url = new URL(input);
      const host = url.hostname.replace(/^www\./, "");
      if (!["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) return null;
      let id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v");
      if (!id && ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0])) id = parts[1];
      }
      return /^[\w-]{11}$/.test(id || "") ? id : null;
    } catch { return null; }
  };
  const toLocalInput = value => {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const isEffectivelyOpen = item => {
    const now = Date.now();
    return Boolean(item?.is_open) && (!item.opens_at || new Date(item.opens_at).getTime() <= now) && (!item.closes_at || new Date(item.closes_at).getTime() > now);
  };
  const showAdminAlert = (message, type = "success") => {
    adminAlert.textContent = message;
    adminAlert.className = `admin-alert ${type}`;
    adminAlert.hidden = false;
    window.setTimeout(() => { adminAlert.hidden = true; }, 6000);
  };
  const showLoginAlert = message => {
    loginAlert.textContent = message;
    loginAlert.className = "form-alert error";
    loginAlert.hidden = false;
  };
  const downloadJson = (data, name) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  };
  const logEvent = async (action, entity, label) => {
    const { error } = await db.rpc("log_staff_event", { event_action: action, event_entity: entity, event_label: label || null });
    if (error) console.warn("تعذر تسجيل العملية في سجل النشاط", error);
  };

  const uploadFile = async (file, folder) => {
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024) throw new Error("حجم الملف أكبر من 10 ميجابايت.");
    const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "bin";
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage.from("center-public").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return { path, url: CenterDB.publicFileUrl(path) };
  };
  const deleteStoredFile = async path => {
    if (!path || state.profile?.role !== "owner") return;
    const { error } = await db.storage.from("center-public").remove([path]);
    if (error) throw error;
  };

  const requireStaff = async session => {
    if (!session?.user) return false;
    const { data, error } = await db.from("profiles").select("id,full_name,role").eq("id", session.user.id).single();
    if (error || !["owner", "admin"].includes(data?.role)) {
      await db.auth.signOut(); showLoginAlert("هذا الحساب لا يملك صلاحية دخول لوحة الإدارة."); return false;
    }
    state.profile = data;
    document.getElementById("adminName").textContent = data.full_name || "مستخدم إداري";
    document.getElementById("adminRole").textContent = data.role === "owner" ? "مالك النظام" : "إدارة المركز";
    document.getElementById("activityTab").hidden = data.role !== "owner";
    document.getElementById("backupTab").hidden = data.role !== "owner";
    loginSection.hidden = true; dashboard.hidden = false;
    await loadAll(); setupRealtime();
    const loginKey = `center-login-${session.access_token.slice(-12)}`;
    if (!sessionStorage.getItem(loginKey)) {
      await logEvent("LOGIN", "profiles", data.full_name || "مستخدم إداري"); sessionStorage.setItem(loginKey, "1");
    }
    return true;
  };

  const loadSettings = async () => {
    const { data, error } = await db.from("registration_settings").select("*").order("program");
    if (error) throw error;
    document.getElementById("registrationSwitches").innerHTML = data.map(item => {
      const effective = isEffectivelyOpen(item);
      const scheduleText = item.opens_at || item.closes_at
        ? `${item.opens_at ? `يفتح: ${formatDateTime(item.opens_at)}` : "مفتوح من الآن"} · ${item.closes_at ? `يغلق: ${formatDateTime(item.closes_at)}` : "دون موعد إغلاق"}`
        : "لا توجد جدولة زمنية";
      return `<div class="registration-switch registration-schedule" data-program-card="${item.program}">
        <div class="registration-switch-main"><div><strong>${escapeHtml(item.title)}</strong><span class="effective-status ${effective ? "open" : "closed"}">${effective ? "متاح للزوار الآن" : "غير متاح للزوار الآن"}</span></div><button type="button" class="switch-button ${item.is_open ? "open" : ""}" data-toggle-program="${item.program}" data-current="${item.is_open}" aria-label="${item.is_open ? "إغلاق" : "فتح"} التسجيل"><span></span></button></div>
        <small class="schedule-summary">${escapeHtml(scheduleText)}</small>
        <div class="schedule-fields"><label><span>موعد الفتح (اختياري)</span><input type="datetime-local" data-opens-at value="${toLocalInput(item.opens_at)}"></label><label><span>موعد الإغلاق (اختياري)</span><input type="datetime-local" data-closes-at value="${toLocalInput(item.closes_at)}"></label><button class="btn btn-outline schedule-save" type="button" data-save-schedule="${item.program}">حفظ المواعيد</button></div>
      </div>`;
    }).join("");
  };

  const loadRegistrations = async () => {
    const { data, error } = await db.from("registrations").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    state.registrations = data || []; renderRegistrations(); renderStats();
  };
  const filteredRegistrations = () => {
    const search = document.getElementById("registrationSearch").value.trim().toLowerCase();
    const program = document.getElementById("registrationProgramFilter").value;
    const gender = document.getElementById("registrationGenderFilter").value;
    return state.registrations.filter(item => (!program || item.program === program) && (!gender || item.gender === gender) && (!search || `${item.full_name} ${item.phone} ${item.guardian_name}`.toLowerCase().includes(search)));
  };
  const renderRegistrations = () => {
    const rows = filteredRegistrations();
    document.getElementById("registrationsTable").innerHTML = rows.length ? rows.map(item => `<tr>
      <td><strong>${escapeHtml(item.full_name)}</strong></td><td>${genderLabels[item.gender]}</td><td>${escapeHtml(item.birth_date)}</td><td dir="ltr">${escapeHtml(item.phone)}</td><td>${escapeHtml(item.guardian_name)}</td><td>${programLabels[item.program]}</td>
      <td><select class="table-status" data-registration-status="${item.id}">${Object.entries(statusLabels).map(([key,label]) => `<option value="${key}" ${item.status === key ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td><textarea class="registration-note" rows="2" data-registration-notes="${item.id}" placeholder="ملاحظة داخلية...">${escapeHtml(item.admin_notes || "")}</textarea></td>
      <td>${formatDate(item.created_at)}</td><td><button class="danger-text-button" type="button" data-delete-registration="${item.id}">نقل للسلة</button></td></tr>`).join("") : '<tr><td colspan="10" class="empty-cell">لا توجد طلبات مطابقة.</td></tr>';
  };
  const renderStats = () => {
    const all = state.registrations; const newCount = all.filter(item => item.status === "new").length;
    const stats = [["إجمالي الطلبات", all.length], ["طلبات الذكور", all.filter(x => x.gender === "male").length], ["طلبات الإناث", all.filter(x => x.gender === "female").length], ["طلبات جديدة", newCount]];
    document.getElementById("adminStats").innerHTML = stats.map(([label,value]) => `<article><span>${label}</span><strong>${value.toLocaleString("ar-JO")}</strong></article>`).join("");
    const badge = document.getElementById("registrationBadge"); badge.textContent = newCount.toLocaleString("ar-JO"); badge.hidden = newCount === 0;
  };

  const loadGroups = async () => {
    const { data, error } = await db.from("groups").select("*").is("deleted_at", null).order("gender").order("sort_order");
    if (error) throw error;
    state.groups = data || [];
    document.getElementById("adminGroupsList").innerHTML = state.groups.map(item => `<div class="admin-list-item">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : '<span class="list-placeholder"></span>'}<div><strong>${escapeHtml(item.name)}</strong><small>${item.gender === "male" ? "ذكور" : "إناث"} · ${item.student_count} طالب/ـة</small></div><div class="item-actions"><button type="button" data-edit-group="${item.id}">تعديل</button><button class="danger" type="button" data-delete-group="${item.id}">نقل للسلة</button></div></div>`).join("") || '<p class="empty-message">لا توجد مجموعات.</p>';
    const selected = document.getElementById("mediaGroupSelect").value;
    document.getElementById("mediaGroupSelect").innerHTML = state.groups.map(item => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
    await loadMedia();
  };
  const loadMedia = async () => {
    const groupId = document.getElementById("mediaGroupSelect").value;
    if (!groupId) { state.media = []; document.getElementById("groupMediaList").innerHTML = '<p class="empty-message">أضف مجموعة أولًا.</p>'; return; }
    const { data, error } = await db.from("group_media").select("*").eq("group_id", groupId).is("deleted_at", null).order("sort_order");
    if (error) throw error;
    state.media = data || [];
    document.getElementById("groupMediaList").innerHTML = state.media.map(item => `<div class="admin-list-item">${item.kind === "image" ? `<img src="${escapeHtml(item.file_url)}" alt="">` : '<span class="file-chip">ملف</span>'}<div><strong>${escapeHtml(item.title)}</strong><small>${item.kind === "image" ? "صورة" : "ملف"}</small></div><div class="item-actions"><a href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener">فتح</a><button class="danger" type="button" data-delete-media="${item.id}">نقل للسلة</button></div></div>`).join("") || '<p class="empty-message">لا توجد مرفقات لهذه المجموعة.</p>';
  };
  const loadNews = async () => {
    const { data, error } = await db.from("news").select("*").is("deleted_at", null).order("news_date", { ascending: false }); if (error) throw error;
    state.news = data || [];
    document.getElementById("adminNewsList").innerHTML = state.news.map(item => `<div class="admin-list-item">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : '<span class="list-placeholder"></span>'}<div><strong>${escapeHtml(item.title)}</strong><small>${formatDate(item.news_date)} · ${item.is_published ? "منشور" : "مسودة"}</small></div><div class="item-actions"><button type="button" data-edit-news="${item.id}">تعديل</button><button class="danger" type="button" data-delete-news="${item.id}">نقل للسلة</button></div></div>`).join("") || '<p class="empty-message">لا توجد أخبار.</p>';
  };
  const loadSlider = async () => {
    const { data, error } = await db.from("slider_items").select("*").is("deleted_at", null).order("sort_order"); if (error) throw error;
    state.slider = data || [];
    document.getElementById("adminSliderList").innerHTML = state.slider.map(item => `<div class="admin-list-item"><img src="${escapeHtml(item.image_url)}" alt=""><div><strong>${escapeHtml(item.title)}</strong><small>${item.year || "بدون سنة"} · ترتيب ${item.sort_order}</small></div><div class="item-actions"><button type="button" data-edit-slider="${item.id}">تعديل</button><button class="danger" type="button" data-delete-slider="${item.id}">نقل للسلة</button></div></div>`).join("") || '<p class="empty-message">لا توجد صور.</p>';
  };
  const loadVideos = async () => {
    const { data, error } = await db.from("video_items").select("*").is("deleted_at", null).order("is_featured", { ascending: false }).order("sort_order").order("created_at", { ascending: false }); if (error) throw error;
    state.videos = data || [];
    document.getElementById("adminVideosList").innerHTML = state.videos.map(item => `<div class="admin-list-item"><span class="admin-video-thumb"><img src="https://i.ytimg.com/vi/${escapeHtml(item.youtube_id)}/mqdefault.jpg" alt=""></span><div><strong>${escapeHtml(item.title)}</strong><small>${item.category ? `${escapeHtml(item.category)} · ` : ""}${item.is_featured ? "مميز · " : ""}${item.is_published ? "منشور" : "مسودة"}</small></div><div class="item-actions"><a href="${escapeHtml(item.youtube_url)}" target="_blank" rel="noopener">فتح</a><button type="button" data-edit-video="${item.id}">تعديل</button><button class="danger" type="button" data-delete-video="${item.id}">نقل للسلة</button></div></div>`).join("") || '<p class="empty-message">لا توجد فيديوهات بعد.</p>';
  };
  const loadResources = async () => {
    const { data, error } = await db.from("resources").select("*").is("deleted_at", null).order("created_at", { ascending: false }); if (error) throw error;
    state.resources = data || [];
    document.getElementById("adminResourcesList").innerHTML = state.resources.map(item => `<div class="admin-list-item"><span class="file-chip">ملف</span><div><strong>${escapeHtml(item.title)}</strong><small>${item.is_published ? "ظاهر للزوار" : "مخفي"}</small></div><div class="item-actions"><a href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener">فتح</a><button type="button" data-edit-resource="${item.id}">تعديل</button><button class="danger" type="button" data-delete-resource="${item.id}">نقل للسلة</button></div></div>`).join("") || '<p class="empty-message">لا توجد ملفات.</p>';
  };

  const trashDefinitions = {
    registrations: { label: "طلب تسجيل", title: item => `${item.full_name} — ${programLabels[item.program]}`, path: null },
    groups: { label: "مجموعة", title: item => item.name, path: "image_path" },
    group_media: { label: "مرفق مجموعة", title: item => item.title, path: "file_path" },
    news: { label: "خبر", title: item => item.title, path: "image_path" },
    slider_items: { label: "صورة سلايد", title: item => item.title, path: "image_path" },
    video_items: { label: "فيديو", title: item => item.title, path: null },
    resources: { label: "ملف عام", title: item => item.title, path: "file_path" }
  };
  const loadTrash = async () => {
    const results = await Promise.all(Object.keys(trashDefinitions).map(async table => {
      const { data, error } = await db.from(table).select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false }); if (error) throw error;
      return (data || []).map(item => ({ ...item, _table: table }));
    }));
    state.trash = results.flat().sort((a,b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    document.getElementById("trashList").innerHTML = state.trash.length ? state.trash.map(item => {
      const definition = trashDefinitions[item._table];
      return `<div class="admin-list-item trash-item"><span class="file-chip">${escapeHtml(definition.label)}</span><div><strong>${escapeHtml(definition.title(item))}</strong><small>نُقل إلى السلة: ${formatDateTime(item.deleted_at)}</small></div><div class="item-actions"><button type="button" data-restore-table="${item._table}" data-restore-id="${item.id}">استعادة</button>${state.profile.role === "owner" ? `<button class="danger" type="button" data-purge-table="${item._table}" data-purge-id="${item.id}">حذف نهائي</button>` : ""}</div></div>`;
    }).join("") : '<p class="empty-message">سلة المحذوفات فارغة.</p>';
  };
  const loadActivity = async () => {
    if (state.profile?.role !== "owner") return;
    const { data, error } = await db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw error;
    state.activity = data || [];
    document.getElementById("activityTable").innerHTML = state.activity.length ? state.activity.map(item => `<tr><td>${formatDate(item.created_at)}<small class="activity-time">${new Intl.DateTimeFormat("ar-JO", { hour: "numeric", minute: "2-digit" }).format(new Date(item.created_at))}</small></td><td><strong>${escapeHtml(item.actor_name)}</strong></td><td>${item.actor_role === "owner" ? "مالك النظام" : "إدارة المركز"}</td><td><span class="audit-action ${item.action.toLowerCase()}">${auditActionLabels[item.action] || item.action}</span></td><td>${auditEntityLabels[item.entity_type] || escapeHtml(item.entity_type)}</td><td>${escapeHtml(item.record_label || item.entity_id || "—")}</td></tr>`).join("") : '<tr><td colspan="6" class="empty-cell">لا توجد عمليات إدارية مسجلة بعد.</td></tr>';
  };

  const setupRealtime = () => {
    if (realtimeChannel) db.removeChannel(realtimeChannel);
    realtimeChannel = db.channel(`admin-live-${state.profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "registration_settings" }, loadSettings)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, payload => { loadRegistrations(); loadTrash(); if (payload.eventType === "INSERT") showAdminAlert("وصل طلب تسجيل جديد الآن.", "notice"); })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => { loadGroups(); loadTrash(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_media" }, () => { loadMedia(); loadTrash(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "news" }, () => { loadNews(); loadTrash(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "slider_items" }, () => { loadSlider(); loadTrash(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "video_items" }, () => { loadVideos(); loadTrash(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "resources" }, () => { loadResources(); loadTrash(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, loadActivity).subscribe();
  };
  const loadAll = async () => {
    const loaders = [loadSettings(), loadRegistrations(), loadGroups(), loadNews(), loadSlider(), loadVideos(), loadResources(), loadTrash()];
    if (state.profile?.role === "owner") loaders.push(loadActivity());
    try { await Promise.all(loaders); } catch (error) { showAdminAlert(`تعذر تحميل بعض البيانات: ${error.message}`, "error"); }
  };

  const fillForm = (form, item, fields) => { fields.forEach(field => { if (form.elements[field]) form.elements[field].value = item[field] ?? ""; }); if (form.elements.is_published) form.elements.is_published.checked = item.is_published; form.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const resetHiddenFileFields = form => { form.querySelectorAll("input[type='hidden']").forEach(input => { input.value = ""; }); if (form.elements.is_published) form.elements.is_published.checked = true; };
  const softDelete = async (table, id, successMessage) => { const { error } = await db.from(table).update({ deleted_at: new Date().toISOString(), deleted_by: state.profile.id }).eq("id", id); if (error) throw error; showAdminAlert(successMessage || "تم نقل العنصر إلى سلة المحذوفات."); };

  document.querySelectorAll("[data-admin-view]").forEach(button => button.addEventListener("click", async () => {
    document.querySelectorAll("[data-admin-view]").forEach(item => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-admin-panel]").forEach(panel => { panel.hidden = panel.dataset.adminPanel !== button.dataset.adminView; panel.classList.toggle("active", !panel.hidden); });
    if (button.dataset.adminView === "trash") await loadTrash(); if (button.dataset.adminView === "activity") await loadActivity();
  }));
  loginForm.addEventListener("submit", async event => {
    event.preventDefault(); loginAlert.hidden = true; const button = loginForm.querySelector("button"); button.disabled = true;
    const enteredUsername = loginForm.elements.username.value.trim().toLowerCase(); const email = loginAliases[enteredUsername] || enteredUsername;
    const { data, error } = await db.auth.signInWithPassword({ email, password: loginForm.elements.password.value }); button.disabled = false;
    if (error) { showLoginAlert("اسم المستخدم أو كلمة المرور غير صحيحة."); return; } await requireStaff(data.session);
  });
  document.getElementById("adminLogout").addEventListener("click", async () => { sessionStorage.clear(); await db.auth.signOut(); location.reload(); });

  document.getElementById("registrationSwitches").addEventListener("click", async event => {
    const toggle = event.target.closest("[data-toggle-program]"); const save = event.target.closest("[data-save-schedule]");
    try {
      if (toggle) { toggle.disabled = true; const isOpen = toggle.dataset.current === "true"; const { error } = await db.from("registration_settings").update({ is_open: !isOpen, updated_by: state.profile.id }).eq("program", toggle.dataset.toggleProgram); if (error) throw error; await loadSettings(); showAdminAlert(`تم ${isOpen ? "إغلاق" : "فتح"} التسجيل بنجاح.`); }
      if (save) { const card = save.closest("[data-program-card]"); const opensValue = card.querySelector("[data-opens-at]").value; const closesValue = card.querySelector("[data-closes-at]").value; if (opensValue && closesValue && new Date(closesValue) <= new Date(opensValue)) throw new Error("موعد الإغلاق يجب أن يكون بعد موعد الفتح."); save.disabled = true; const { error } = await db.from("registration_settings").update({ opens_at: opensValue ? new Date(opensValue).toISOString() : null, closes_at: closesValue ? new Date(closesValue).toISOString() : null, updated_by: state.profile.id }).eq("program", save.dataset.saveSchedule); if (error) throw error; await loadSettings(); showAdminAlert("تم حفظ مواعيد التسجيل."); }
    } catch (error) { showAdminAlert(error.message, "error"); if (toggle) toggle.disabled = false; if (save) save.disabled = false; }
  });

  ["registrationSearch", "registrationProgramFilter", "registrationGenderFilter"].forEach(id => document.getElementById(id).addEventListener("input", renderRegistrations));
  document.getElementById("refreshRegistrations").addEventListener("click", loadRegistrations); document.getElementById("refreshActivity").addEventListener("click", loadActivity); document.getElementById("refreshTrash").addEventListener("click", loadTrash);
  document.getElementById("registrationsTable").addEventListener("change", async event => {
    const status = event.target.closest("[data-registration-status]"); const notes = event.target.closest("[data-registration-notes]");
    try { if (status) { const { error } = await db.from("registrations").update({ status: status.value }).eq("id", status.dataset.registrationStatus); if (error) throw error; showAdminAlert("تم تحديث حالة الطلب."); } if (notes) { const { error } = await db.from("registrations").update({ admin_notes: notes.value.trim() || null }).eq("id", notes.dataset.registrationNotes); if (error) throw error; showAdminAlert("تم حفظ ملاحظة الإدارة."); } } catch (error) { showAdminAlert(error.message, "error"); }
  });
  document.getElementById("registrationsTable").addEventListener("click", async event => { const button = event.target.closest("[data-delete-registration]"); if (!button || !confirm("نقل طلب التسجيل إلى سلة المحذوفات؟")) return; try { await softDelete("registrations", button.dataset.deleteRegistration, "تم نقل الطلب إلى السلة."); await loadRegistrations(); await loadTrash(); } catch (error) { showAdminAlert(error.message, "error"); } });

  document.getElementById("exportRegistrations").addEventListener("click", async () => {
    if (!window.XLSX) { showAdminAlert("تعذر تحميل أداة Excel.", "error"); return; }
    const toRow = item => ({ "الاسم الرباعي": item.full_name, "الجنس": genderLabels[item.gender], "تاريخ الميلاد": item.birth_date, "رقم الهاتف": item.phone, "ولي الأمر": item.guardian_name, "البرنامج": programLabels[item.program], "الحالة": statusLabels[item.status], "ملاحظات الإدارة": item.admin_notes || "", "تاريخ التسجيل": formatDate(item.created_at) });
    const males = state.registrations.filter(item => item.gender === "male").map(toRow); const females = state.registrations.filter(item => item.gender === "female").map(toRow);
    const statistics = [{ "البيان": "إجمالي التسجيلات", "العدد": state.registrations.length }, { "البيان": "إجمالي الذكور", "العدد": males.length }, { "البيان": "إجمالي الإناث", "العدد": females.length }, ...Object.keys(programLabels).flatMap(program => [{ "البيان": `${programLabels[program]} - ذكور`, "العدد": state.registrations.filter(x => x.program === program && x.gender === "male").length }, { "البيان": `${programLabels[program]} - إناث`, "العدد": state.registrations.filter(x => x.program === program && x.gender === "female").length }])];
    const workbook = XLSX.utils.book_new();
    [[males,"الذكور"],[females,"الإناث"],[statistics,"الإحصائيات"]].forEach(([rows,name]) => { const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "لا توجد بيانات": "" }]); sheet["!views"] = [{ rightToLeft: true }]; sheet["!cols"] = Object.keys(rows[0] || { "لا توجد بيانات": "" }).map(() => ({ wch: 24 })); XLSX.utils.book_append_sheet(workbook, sheet, name); });
    XLSX.writeFile(workbook, `تسجيلات-مركز-كفرأبيل-${new Date().toISOString().slice(0,10)}.xlsx`); await logEvent("EXPORT", "registrations", `تصدير ${state.registrations.length} طلبًا إلى Excel`);
  });

  const groupForm = document.getElementById("groupForm");
  groupForm.addEventListener("reset", () => setTimeout(() => resetHiddenFileFields(groupForm)));
  groupForm.addEventListener("submit", async event => {
    event.preventDefault();
    try { const values = Object.fromEntries(new FormData(groupForm)); const upload = await uploadFile(groupForm.elements.image.files[0], "groups"); const payload = { name: values.name.trim(), slug: values.slug.trim().toLowerCase(), gender: values.gender, supervisor_name: values.supervisor_name.trim() || null, student_count: Number(values.student_count), student_ages: values.student_ages.trim() || null, establishment: values.establishment.trim() || null, hafiz_count: Number(values.hafiz_count || 0), tajweed_achievement: values.tajweed_achievement.trim() || null, average_memorization: values.average_memorization.trim() || null, achievements: values.achievements.trim() || null, image_url: upload?.url || values.current_image_url || null, image_path: upload?.path || values.current_image_path || null, is_published: groupForm.elements.is_published.checked }; const { error } = await (values.id ? db.from("groups").update(payload).eq("id", values.id) : db.from("groups").insert(payload)); if (error) throw error; groupForm.reset(); await loadGroups(); showAdminAlert("تم حفظ المجموعة."); } catch (error) { showAdminAlert(error.message, "error"); }
  });
  document.getElementById("adminGroupsList").addEventListener("click", async event => { const edit = event.target.closest("[data-edit-group]"); const remove = event.target.closest("[data-delete-group]"); if (edit) { const item = state.groups.find(x => x.id === edit.dataset.editGroup); fillForm(groupForm, item, ["id","name","slug","gender","supervisor_name","student_count","student_ages","establishment","hafiz_count","tajweed_achievement","average_memorization","achievements"]); groupForm.elements.current_image_url.value = item.image_url || ""; groupForm.elements.current_image_path.value = item.image_path || ""; } if (remove && confirm("نقل المجموعة إلى سلة المحذوفات؟")) { try { await softDelete("groups", remove.dataset.deleteGroup); await loadGroups(); await loadTrash(); } catch (error) { showAdminAlert(error.message, "error"); } } });

  const mediaForm = document.getElementById("groupMediaForm"); document.getElementById("mediaGroupSelect").addEventListener("change", loadMedia);
  mediaForm.addEventListener("submit", async event => { event.preventDefault(); try { const file = mediaForm.elements.file.files[0]; const upload = await uploadFile(file, `groups/${mediaForm.elements.group_id.value}`); const { error } = await db.from("group_media").insert({ group_id: mediaForm.elements.group_id.value, kind: mediaForm.elements.kind.value, title: mediaForm.elements.title.value.trim(), file_url: upload.url, file_path: upload.path }); if (error) throw error; mediaForm.elements.title.value = ""; mediaForm.elements.file.value = ""; await loadMedia(); showAdminAlert("تمت إضافة المرفق."); } catch (error) { showAdminAlert(error.message, "error"); } });
  document.getElementById("groupMediaList").addEventListener("click", async event => { const button = event.target.closest("[data-delete-media]"); if (!button || !confirm("نقل هذا المرفق إلى السلة؟")) return; try { await softDelete("group_media", button.dataset.deleteMedia); await loadMedia(); await loadTrash(); } catch (error) { showAdminAlert(error.message, "error"); } });

  const bindContentForm = ({ formId, listId, table, stateKey, actionKey = stateKey, folder, fileField, urlField, pathField, fields, load, buildPayload }) => {
    const form = document.getElementById(formId); form.addEventListener("reset", () => setTimeout(() => resetHiddenFileFields(form)));
    form.addEventListener("submit", async event => { event.preventDefault(); try { const values = Object.fromEntries(new FormData(form)); const file = form.elements[fileField]?.files[0]; const upload = file ? await uploadFile(file, folder) : null; const payload = buildPayload(values, form, upload); const { error } = await (values.id ? db.from(table).update(payload).eq("id", values.id) : db.from(table).insert(payload)); if (error) throw error; form.reset(); await load(); showAdminAlert("تم الحفظ بنجاح."); } catch (error) { showAdminAlert(error.message, "error"); } });
    document.getElementById(listId).addEventListener("click", async event => { const edit = event.target.closest(`[data-edit-${actionKey}]`); const remove = event.target.closest(`[data-delete-${actionKey}]`); const actionProperty = `${actionKey[0].toUpperCase()}${actionKey.slice(1)}`; if (edit) { const id = edit.dataset[`edit${actionProperty}`]; const item = state[stateKey].find(x => x.id === id); fillForm(form,item,["id",...fields]); form.elements[urlField].value = item[urlField.replace("current_","")] || ""; form.elements[pathField].value = item[pathField.replace("current_","")] || ""; } if (remove && confirm("نقل هذا العنصر إلى سلة المحذوفات؟")) { try { const id = remove.dataset[`delete${actionProperty}`]; await softDelete(table, id); await load(); await loadTrash(); } catch (error) { showAdminAlert(error.message, "error"); } } });
  };
  bindContentForm({ formId:"newsForm", listId:"adminNewsList", table:"news", stateKey:"news", folder:"news", fileField:"image", urlField:"current_image_url", pathField:"current_image_path", fields:["title","news_date","body"], load:loadNews, buildPayload:(v,f,u) => ({ title:v.title.trim(), body:v.body.trim(), news_date:v.news_date, image_url:u?.url || v.current_image_url || null, image_path:u?.path || v.current_image_path || null, is_published:f.elements.is_published.checked }) });
  bindContentForm({ formId:"sliderForm", listId:"adminSliderList", table:"slider_items", stateKey:"slider", folder:"slider", fileField:"image", urlField:"current_image_url", pathField:"current_image_path", fields:["title","year","alt_text","sort_order"], load:loadSlider, buildPayload:(v,f,u) => { if (!u && !v.current_image_url) throw new Error("اختر صورة للسلايد."); return { title:v.title.trim(), year:v.year ? Number(v.year) : null, alt_text:v.alt_text.trim(), sort_order:Number(v.sort_order || 0), image_url:u?.url || v.current_image_url, image_path:u?.path || v.current_image_path || null, is_published:f.elements.is_published.checked }; } });
  bindContentForm({ formId:"resourceForm", listId:"adminResourcesList", table:"resources", stateKey:"resources", actionKey:"resource", folder:"resources", fileField:"file", urlField:"current_file_url", pathField:"current_file_path", fields:["title","description"], load:loadResources, buildPayload:(v,f,u) => { if (!u && !v.current_file_url) throw new Error("اختر الملف المطلوب."); return { title:v.title.trim(), description:v.description.trim() || null, file_url:u?.url || v.current_file_url, file_path:u?.path || v.current_file_path || null, is_published:f.elements.is_published.checked }; } });

  const videoForm = document.getElementById("videoForm");
  videoForm.addEventListener("reset", () => window.setTimeout(() => { videoForm.elements.id.value = ""; videoForm.elements.is_featured.checked = false; videoForm.elements.is_published.checked = true; }));
  videoForm.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(videoForm));
      const youtubeId = youtubeIdFromUrl(values.youtube_url);
      if (!youtubeId) throw new Error("رابط يوتيوب غير صحيح. استخدم رابط الفيديو أو Shorts أو youtu.be.");
      const payload = { title: values.title.trim(), description: values.description.trim() || null, youtube_url: values.youtube_url.trim(), youtube_id: youtubeId, category: values.category.trim() || null, sort_order: Number(values.sort_order || 0), is_featured: videoForm.elements.is_featured.checked, is_published: videoForm.elements.is_published.checked };
      const { error } = await (values.id ? db.from("video_items").update(payload).eq("id", values.id) : db.from("video_items").insert(payload));
      if (error) throw error;
      videoForm.reset(); await loadVideos(); showAdminAlert("تم حفظ الفيديو وسيظهر للزوار مباشرة إذا كان منشورًا.");
    } catch (error) { showAdminAlert(error.message, "error"); }
  });
  document.getElementById("adminVideosList").addEventListener("click", async event => {
    const edit = event.target.closest("[data-edit-video]"); const remove = event.target.closest("[data-delete-video]");
    if (edit) {
      const item = state.videos.find(video => video.id === edit.dataset.editVideo); if (!item) return;
      fillForm(videoForm, item, ["id","title","youtube_url","category","description","sort_order"]); videoForm.elements.is_featured.checked = item.is_featured;
    }
    if (remove && confirm("نقل هذا الفيديو إلى سلة المحذوفات؟")) { try { await softDelete("video_items", remove.dataset.deleteVideo); await loadVideos(); await loadTrash(); } catch (error) { showAdminAlert(error.message, "error"); } }
  });

  document.getElementById("trashList").addEventListener("click", async event => {
    const restore = event.target.closest("[data-restore-table]"); const purge = event.target.closest("[data-purge-table]");
    try {
      if (restore) { const { error } = await db.from(restore.dataset.restoreTable).update({ deleted_at: null, deleted_by: null }).eq("id", restore.dataset.restoreId); if (error) throw error; showAdminAlert("تمت استعادة العنصر وإعادته إلى الموقع."); await loadAll(); }
      if (purge) { if (state.profile.role !== "owner" || !confirm("هذا حذف نهائي لا يمكن التراجع عنه. هل أنت متأكد؟")) return; const item = state.trash.find(x => x._table === purge.dataset.purgeTable && String(x.id) === purge.dataset.purgeId); if (!item) return; if (item._table === "groups") { const { data: media } = await db.from("group_media").select("file_path").eq("group_id", item.id); for (const child of media || []) await deleteStoredFile(child.file_path); } const { error } = await db.from(item._table).delete().eq("id", item.id); if (error) throw error; const pathField = trashDefinitions[item._table].path; if (pathField) await deleteStoredFile(item[pathField]); showAdminAlert("تم الحذف النهائي."); await loadAll(); }
    } catch (error) { showAdminAlert(error.message, "error"); }
  });

  document.getElementById("exportBackup").addEventListener("click", async () => {
    if (state.profile.role !== "owner") return;
    try { const tables = ["registration_settings", "registrations", "groups", "group_media", "news", "slider_items", "video_items", "resources"]; const entries = await Promise.all(tables.map(async table => { const { data, error } = await db.from(table).select("*"); if (error) throw error; return [table, data || []]; })); const backup = { format: "kufrabeel-center-backup-v1", created_at: new Date().toISOString(), created_by: state.profile.full_name, data: Object.fromEntries(entries) }; downloadJson(backup, `نسخة-احتياطية-مركز-كفرأبيل-${new Date().toISOString().slice(0,10)}.json`); await logEvent("EXPORT", "backup", "تنزيل نسخة احتياطية كاملة"); showAdminAlert("تم إنشاء النسخة الاحتياطية وتنزيلها."); } catch (error) { showAdminAlert(error.message, "error"); }
  });
  document.getElementById("restoreBackup").addEventListener("click", async () => {
    if (state.profile.role !== "owner") return; const file = document.getElementById("backupFile").files[0]; if (!file) { showAdminAlert("اختر ملف النسخة الاحتياطية أولًا.", "error"); return; }
    try { const backup = JSON.parse(await file.text()); if (backup.format !== "kufrabeel-center-backup-v1" || !backup.data) throw new Error("هذا الملف ليس نسخة احتياطية صالحة للموقع."); if (!confirm(`سيتم استعادة النسخة المنشأة بتاريخ ${formatDateTime(backup.created_at)}. هل تريد المتابعة؟`)) return; const order = ["registration_settings", "groups", "registrations", "news", "slider_items", "video_items", "resources", "group_media"]; for (const table of order) { const rows = backup.data[table]; if (!Array.isArray(rows) || !rows.length) continue; const { error } = await db.from(table).upsert(rows, { onConflict: table === "registration_settings" ? "program" : "id" }); if (error) throw new Error(`${table}: ${error.message}`); } const { error: sequenceError } = await db.rpc("sync_registration_sequence"); if (sequenceError) throw sequenceError; await logEvent("RESTORE", "backup", `استعادة نسخة ${backup.created_at || "غير مؤرخة"}`); await loadAll(); showAdminAlert("اكتملت استعادة النسخة الاحتياطية بنجاح."); } catch (error) { showAdminAlert(`تعذرت الاستعادة: ${error.message}`, "error"); }
  });

  const init = async () => { if (!window.CenterDB?.configured) { setup.hidden = false; loginSection.hidden = true; return; } const { data: { session } } = await db.auth.getSession(); if (session) await requireStaff(session); };
  init();
})();
