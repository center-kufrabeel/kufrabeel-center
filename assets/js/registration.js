(() => {
  "use strict";

  const form = document.getElementById("studentRegistrationForm");
  if (!form) return;

  const alertBox = document.getElementById("registrationAlert");
  const submitButton = form.querySelector("[type='submit']");
  const statusContainer = document.getElementById("registrationProgramsStatus");
  const choiceContainer = document.getElementById("registrationProgramChoices");
  let settings = {};
  form.elements.birth_date.max = new Date().toISOString().slice(0, 10);

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const selectedProgram = () => form.querySelector("input[name='program']:checked")?.value || "";

  const isProgramOpen = item => {
    const now = Date.now();
    return Boolean(item?.is_open)
      && (!item.opens_at || new Date(item.opens_at).getTime() <= now)
      && (!item.closes_at || new Date(item.closes_at).getTime() > now);
  };

  const scheduleMessage = item => {
    if (!item?.is_open) return item?.closed_message || "التسجيل مغلق حاليًا";
    const now = Date.now();
    if (item.opens_at && new Date(item.opens_at).getTime() > now) {
      return `يفتح التسجيل في ${new Intl.DateTimeFormat("ar-JO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.opens_at))}`;
    }
    if (item.closes_at && new Date(item.closes_at).getTime() <= now) return "انتهت مدة التسجيل المحددة";
    return item?.closed_message || "التسجيل مغلق حاليًا";
  };

  const showAlert = (message, type = "info") => {
    alertBox.textContent = message;
    alertBox.className = `form-alert ${type}`;
    alertBox.hidden = false;
  };

  const updateSubmitState = () => {
    const selected = selectedProgram();
    submitButton.disabled = !selected || !isProgramOpen(settings[selected]);
  };

  const paintSettings = items => {
    if (!items.length) {
      statusContainer.innerHTML = '<p class="empty-message">لا توجد برامج تسجيل معلنة حاليًا.</p>';
      choiceContainer.innerHTML = '<p class="empty-message">لا توجد برامج متاحة للاختيار.</p>';
      updateSubmitState();
      return;
    }
    statusContainer.innerHTML = items.map(item => {
      const open = isProgramOpen(item);
      return `<article class="program-option-status ${open ? "open" : "closed"}" data-program-status="${escapeHtml(item.program)}"><span class="status-dot"></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(open ? "التسجيل مفتوح الآن" : scheduleMessage(item))}</small></div></article>`;
    }).join("");
    choiceContainer.innerHTML = items.map(item => {
      const open = isProgramOpen(item);
      return `<label class="program-choice ${open ? "" : "disabled"}"><input type="radio" name="program" value="${escapeHtml(item.program)}" ${open ? "" : "disabled"} required><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description || "برنامج من برامج المركز")}</small></span></label>`;
    }).join("");
    updateSubmitState();
  };

  const loadSettings = async () => {
    if (!window.CenterDB?.configured) {
      statusContainer.querySelectorAll("small").forEach(item => { item.textContent = "بانتظار تفعيل الاتصال بقاعدة البيانات"; });
      showAlert(window.CenterDB?.configError || "خدمة التسجيل غير مفعلة بعد.", "warning");
      return;
    }

    const { data, error } = await CenterDB.client
      .from("registration_settings")
      .select("*");

    if (error) {
      showAlert("تعذر التحقق من حالة التسجيل حاليًا. يرجى المحاولة لاحقًا.", "error");
      return;
    }

    const visibleItems = (data || []).filter(item => !item.is_archived).sort((a,b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.title).localeCompare(String(b.title), "ar"));
    settings = Object.fromEntries(visibleItems.map(item => [item.program, item]));
    paintSettings(visibleItems);
    if (!visibleItems.some(isProgramOpen)) {
      showAlert("التسجيل مغلق حاليًا في جميع البرامج، وسيُعلن عن فتحه لاحقًا.", "info");
    }
  };

  choiceContainer.addEventListener("change", updateSubmitState);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    alertBox.hidden = true;

    if (!form.reportValidity()) return;
    if (form.elements.website.value) return;

    const program = selectedProgram();
    if (!isProgramOpen(settings[program])) {
      showAlert(`برنامج «${settings[program]?.title || "البرنامج المحدد"}» مغلق حاليًا.`, "warning");
      return;
    }

    const payload = {
      full_name: form.elements.full_name.value.trim(),
      gender: form.elements.gender.value,
      birth_date: form.elements.birth_date.value,
      phone: form.elements.phone.value.trim(),
      guardian_name: form.elements.guardian_name.value.trim(),
      program
    };

    submitButton.disabled = true;
    submitButton.classList.add("loading");
    const { error } = await CenterDB.client.from("registrations").insert(payload);
    submitButton.classList.remove("loading");

    if (error) {
      showAlert(error.code === "42501"
        ? "أُغلق التسجيل في هذا البرنامج قبل إكمال الطلب."
        : error.code === "23505"
          ? "يوجد طلب تسجيل سابق لرقم الهاتف نفسه في هذا البرنامج. لا حاجة لإرسال الطلب مرة أخرى."
          : "لم نتمكن من إرسال الطلب. تحقق من البيانات أو حاول مرة أخرى.", "error");
      updateSubmitState();
      return;
    }

    form.reset();
    updateSubmitState();
    showAlert("تم إرسال طلب التسجيل بنجاح. ستتواصل معكم إدارة المركز عند مراجعة الطلب.", "success");
  });

  loadSettings();
  if (window.CenterDB?.configured) {
    CenterDB.client.channel("registration-status-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "registration_settings" }, loadSettings)
      .subscribe();
    window.setInterval(loadSettings, 60000);
  }
})();
