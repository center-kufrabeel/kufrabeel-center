(() => {
  "use strict";

  const form = document.getElementById("studentRegistrationForm");
  if (!form) return;

  const alertBox = document.getElementById("registrationAlert");
  const submitButton = form.querySelector("[type='submit']");
  const programInputs = [...form.querySelectorAll("input[name='program']")];
  const statusCards = [...document.querySelectorAll("[data-program-status]")];
  const programLabels = { permanent: "النادي الدائم", tajweed: "دورات التجويد" };
  let settings = {};
  form.elements.birth_date.max = new Date().toISOString().slice(0, 10);

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
    const selected = form.elements.program.value;
    submitButton.disabled = !selected || !isProgramOpen(settings[selected]);
  };

  const paintSettings = () => {
    statusCards.forEach(card => {
      const key = card.dataset.programStatus;
      const item = settings[key];
      const message = card.querySelector("small");
      const open = isProgramOpen(item);
      card.classList.toggle("open", open);
      card.classList.toggle("closed", !open);
      message.textContent = open ? "التسجيل مفتوح الآن" : scheduleMessage(item);
      const input = programInputs.find(option => option.value === key);
      input.disabled = !open;
      input.closest(".program-choice").classList.toggle("disabled", !open);
      if (!open && input.checked) input.checked = false;
    });
    updateSubmitState();
  };

  const loadSettings = async () => {
    if (!window.CenterDB?.configured) {
      statusCards.forEach(card => card.querySelector("small").textContent = "بانتظار تفعيل الاتصال بقاعدة البيانات");
      showAlert(window.CenterDB?.configError || "خدمة التسجيل غير مفعلة بعد.", "warning");
      return;
    }

    const { data, error } = await CenterDB.client
      .from("registration_settings")
      .select("program,title,is_open,closed_message,opens_at,closes_at");

    if (error) {
      showAlert("تعذر التحقق من حالة التسجيل حاليًا. يرجى المحاولة لاحقًا.", "error");
      return;
    }

    settings = Object.fromEntries(data.map(item => [item.program, item]));
    paintSettings();
    if (!data.some(isProgramOpen)) {
      showAlert("التسجيل مغلق حاليًا في جميع البرامج، وسيُعلن عن فتحه لاحقًا.", "info");
    }
  };

  programInputs.forEach(input => input.addEventListener("change", updateSubmitState));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    alertBox.hidden = true;

    if (!form.reportValidity()) return;
    if (form.elements.website.value) return;

    const program = form.elements.program.value;
    if (!isProgramOpen(settings[program])) {
      showAlert(`التسجيل في ${programLabels[program] || "هذا البرنامج"} مغلق حاليًا.`, "warning");
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
