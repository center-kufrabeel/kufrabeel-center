(() => {
  "use strict";

  if (!window.CenterDB?.configured) return;
  const db = CenterDB.client;
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const placeholder = '<div class="project-placeholder"><span class="project-mark" aria-hidden="true"></span></div>';
  const accountLabel = (type, url, phone) => {
    if (type === "facebook") return "Kufrabeel Quranic Center";
    if (type === "whatsapp") return phone;
    try {
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      const value = decodeURIComponent(parts.at(-1) || "");
      return value.startsWith("@") ? value : `@${value}`;
    } catch { return "الحساب الرسمي"; }
  };

  const loadContactSettings = async () => {
    const targets = document.querySelectorAll("[data-contact-href], [data-contact-text], [data-contact-label]");
    if (!targets.length) return;
    const { data, error } = await db.from("site_settings").select("phone,location_text,map_url,whatsapp_url,facebook_url,instagram_url,youtube_url").eq("id", "contact").maybeSingle();
    if (error || !data) return;
    const hrefs = { phone: `tel:${data.phone.replace(/[^+\d]/g, "")}`, map: data.map_url, whatsapp: data.whatsapp_url, facebook: data.facebook_url, instagram: data.instagram_url, youtube: data.youtube_url };
    document.querySelectorAll("[data-contact-href]").forEach(element => { const href = hrefs[element.dataset.contactHref]; if (href) element.href = href; });
    document.querySelectorAll('[data-contact-text="phone"]').forEach(element => { element.textContent = data.phone; });
    document.querySelectorAll('[data-contact-text="location"]').forEach(element => { element.textContent = data.location_text; });
    document.querySelectorAll("[data-contact-label]").forEach(element => { const type = element.dataset.contactLabel; element.textContent = accountLabel(type, hrefs[type], data.phone); });
  };

  const groupCard = item => `<a class="project-card reveal visible" href="group.html?id=${encodeURIComponent(item.slug)}"><div class="project-visual">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy">` : placeholder}</div><div class="project-card-copy"><h3>${escapeHtml(item.name)}</h3></div></a>`;

  const loadGroups = async () => {
    const maleRoot = document.getElementById("maleGroupsGrid");
    const femaleRoot = document.getElementById("femaleGroupsGrid");
    if (!maleRoot || !femaleRoot) return;
    const { data, error } = await db.from("groups").select("slug,name,gender,image_url,sort_order").eq("is_published", true).is("deleted_at", null).order("sort_order");
    if (error || !data?.length) return;
    maleRoot.innerHTML = data.filter(item => item.gender === "male").map(groupCard).join("") || '<p class="empty-message">لا توجد مجموعات ذكور منشورة حاليًا.</p>';
    femaleRoot.innerHTML = data.filter(item => item.gender === "female").map(groupCard).join("") || '<p class="empty-message">لا توجد مجموعات إناث منشورة حاليًا.</p>';
  };

  const loadResources = async () => {
    const root = document.getElementById("publicResourcesGrid");
    if (!root) return;
    const { data, error } = await db.from("resources").select("title,description,file_url").eq("is_published", true).is("deleted_at", null).order("created_at", { ascending: false });
    if (error || !data?.length) return;
    root.innerHTML = data.map((item,index) => `<article class="resource-card reveal visible"><span class="resource-index">${String(index + 1).padStart(2,"0")}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || "ملف متاح لجميع مجموعات المركز.")}</p><a class="link-arrow" href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener noreferrer" download>فتح أو تنزيل الملف</a></div></article>`).join("");
  };

  const loadNews = async () => {
    const root = document.getElementById("publicNewsList");
    if (!root) return;
    const { data, error } = await db.from("news").select("title,body,news_date,image_url").eq("is_published", true).is("deleted_at", null).order("news_date", { ascending: false }).limit(4);
    if (error || !data?.length) return;
    root.innerHTML = data.map((item, index) => {
      const date = new Date(`${item.news_date}T12:00:00`);
      const day = new Intl.DateTimeFormat("ar-JO", { day: "2-digit" }).format(date);
      const monthYear = new Intl.DateTimeFormat("ar-JO", { month: "long", year: "numeric" }).format(date);
      const visual = item.image_url
        ? `<div class="news-visual"><img class="news-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy"><span class="news-visual-label">من أخبار المركز</span></div>`
        : '<div class="news-visual news-placeholder" aria-hidden="true"><span>خبر</span><strong>مركز كفرأبيل القرآني</strong></div>';
      return `<article class="news-item ${index === 0 ? "news-featured" : "news-compact"} reveal visible">${visual}<div class="news-copy"><div class="news-meta"><span class="news-badge">إعلان رسمي</span><time class="news-date" datetime="${item.news_date}"><strong>${day}</strong><span>${monthYear}</span></time></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div></article>`;
    }).join("");
  };

  const loadGroupDetails = async () => {
    const nameRoot = document.getElementById("groupName");
    if (!nameRoot) return;
    const slug = new URLSearchParams(location.search).get("id") || "almanar";
    const { data: group, error } = await db.from("groups").select("*").eq("slug", slug).eq("is_published", true).is("deleted_at", null).maybeSingle();
    if (error || !group) return;
    const { data: media } = await db.from("group_media").select("*").eq("group_id", group.id).is("deleted_at", null).order("sort_order");
    document.title = `${group.name} | مركز كفرأبيل القرآني`;
    nameRoot.textContent = group.name;
    document.getElementById("groupImage").innerHTML = group.image_url ? `<img src="${escapeHtml(group.image_url)}" alt="${escapeHtml(group.name)}">` : placeholder;
    const studentLabel = group.gender === "female" ? "عدد الطالبات" : "عدد الطلاب";
    const facts = [
      ["المشرف أو المشرفة", group.supervisor_name || "تُضاف لاحقًا"],
      [studentLabel, `${group.student_count} ${group.gender === "female" ? "طالبات" : "طالبًا"}`],
      ["أعمار الطلاب", group.student_ages || "تُضاف لاحقًا"],
      ["نشأة المشروع", group.establishment || "تُضاف لاحقًا"],
      ["عدد الحفاظ", group.hafiz_count ? `${group.hafiz_count}` : "لا يوجد حاليًا أو لم يُحدد"],
      ["إنجازات التجويد", group.tajweed_achievement || "تُضاف لاحقًا"],
      ["متوسط الحفظ", group.average_memorization || "تُضاف لاحقًا"]
    ];
    document.getElementById("groupFacts").innerHTML = facts.map(([label,value]) => `<article class="fact-card"><span class="fact-label">${escapeHtml(label)}</span><strong class="fact-value">${escapeHtml(value)}</strong></article>`).join("");
    const achievements = (group.achievements || "تُضاف إنجازات المجموعة لاحقًا").split(/\n+/).filter(Boolean);
    document.getElementById("groupAchievements").innerHTML = achievements.map(item => `<li>${escapeHtml(item)}</li>`).join("");
    const images = (media || []).filter(item => item.kind === "image");
    document.getElementById("groupGallery").innerHTML = images.length ? images.map((item,index) => `<figure class="gallery-slot"><img src="${escapeHtml(item.file_url)}" alt="${escapeHtml(item.title || `${group.name} - الصورة ${index + 1}`)}" loading="lazy"></figure>`).join("") : [1,2,3].map(index => `<div class="gallery-slot">مكان الصورة ${index}</div>`).join("");
    const files = (media || []).filter(item => item.kind === "file");
    const filesCard = document.getElementById("groupFilesCard");
    if (files.length) {
      filesCard.hidden = false;
      document.getElementById("groupFiles").innerHTML = files.map(item => `<a class="group-file-link" href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener noreferrer" download><span>${escapeHtml(item.title)}</span><strong>فتح أو تنزيل</strong></a>`).join("");
    } else filesCard.hidden = true;
  };

  loadGroups();
  loadResources();
  loadNews();
  loadGroupDetails();
  loadContactSettings();

  let refreshTimer;
  const debounce = callback => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(callback, 250);
  };
  db.channel("public-content-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => debounce(() => { loadGroups(); loadGroupDetails(); }))
    .on("postgres_changes", { event: "*", schema: "public", table: "group_media" }, () => debounce(loadGroupDetails))
    .on("postgres_changes", { event: "*", schema: "public", table: "news" }, () => debounce(loadNews))
    .on("postgres_changes", { event: "*", schema: "public", table: "resources" }, () => debounce(loadResources))
    .on("postgres_changes", { event: "*", schema: "public", table: "slider_items" }, () => window.dispatchEvent(new CustomEvent("center:slider-updated")))
    .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => debounce(loadContactSettings))
    .subscribe();
})();
