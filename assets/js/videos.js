(() => {
  "use strict";

  const root = document.getElementById("videoLibraryGrid");
  if (!root) return;

  const db = window.CenterDB?.client;
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const renderEmpty = message => { root.innerHTML = `<div class="video-empty"><span aria-hidden="true"><i class="fa-solid fa-circle-play"></i></span><h2>ستُضاف الفيديوهات قريبًا</h2><p>${escapeHtml(message)}</p></div>`; };

  const renderVideos = items => {
    if (!items.length) { renderEmpty("لم تُنشر فيديوهات في المكتبة المرئية بعد."); return; }
    root.innerHTML = items.map(item => `<article class="video-card${item.is_featured ? " featured" : ""}" data-video-card>
      <div class="video-player" data-video-player="${escapeHtml(item.youtube_id)}">
        <img src="https://i.ytimg.com/vi/${escapeHtml(item.youtube_id)}/hqdefault.jpg" alt="صورة معاينة: ${escapeHtml(item.title)}" loading="lazy">
        <span class="video-shade" aria-hidden="true"></span>
        <button class="video-play" type="button" data-play-video="${escapeHtml(item.youtube_id)}" aria-label="تشغيل ${escapeHtml(item.title)}"><i class="fa-solid fa-play" aria-hidden="true"></i></button>
        ${item.is_featured ? '<span class="video-featured-label">مختار</span>' : ""}
      </div>
      <div class="video-card-copy">${item.category ? `<span class="video-category">${escapeHtml(item.category)}</span>` : ""}<h2>${escapeHtml(item.title)}</h2>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</div>
    </article>`).join("");
  };

  const loadVideos = async () => {
    if (!db) { renderEmpty("تعذر الاتصال بالمكتبة الآن."); return; }
    const { data, error } = await db.from("video_items").select("id,title,description,youtube_id,category,is_featured,sort_order,created_at").eq("is_published", true).is("deleted_at", null).order("is_featured", { ascending: false }).order("sort_order").order("created_at", { ascending: false });
    if (error) { console.error("تعذر تحميل المكتبة المرئية", error); renderEmpty("تعذر تحميل الفيديوهات مؤقتًا. حاول مرة أخرى لاحقًا."); return; }
    renderVideos(data || []);
  };

  root.addEventListener("click", event => {
    const button = event.target.closest("[data-play-video]");
    if (!button) return;
    const id = button.dataset.playVideo;
    const player = button.closest("[data-video-player]");
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0" title="مشغل فيديو مركز كفرأبيل القرآني" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  });

  loadVideos();
  if (db) db.channel("video-library-live").on("postgres_changes", { event: "*", schema: "public", table: "video_items" }, loadVideos).subscribe();
})();
