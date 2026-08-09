(() => {
  "use strict";

  const body = document.body;
  const menuButton = document.querySelector(".menu-toggle");
  const navList = document.querySelector(".nav-list");
  const menuOverlay = document.querySelector(".menu-overlay");

  const setMenu = open => {
    if (!menuButton || !navList || !menuOverlay) return;
    menuButton.classList.toggle("open", open);
    navList.classList.toggle("open", open);
    menuOverlay.classList.toggle("open", open);
    body.classList.toggle("menu-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل");
  };

  menuButton?.addEventListener("click", () => setMenu(!navList.classList.contains("open")));
  menuOverlay?.addEventListener("click", () => setMenu(false));
  navList?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setMenu(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) setMenu(false);
  });

  document.querySelectorAll("[data-current-year]").forEach(item => {
    item.textContent = new Date().getFullYear();
  });

  const clock = document.querySelector("[data-live-clock]");
  if (clock) {
    const updateClock = () => {
      const now = new Date();
      const time = new Intl.DateTimeFormat("ar-JO", { hour: "numeric", minute: "2-digit" }).format(now);
      const date = new Intl.DateTimeFormat("ar-JO", { weekday: "short", day: "numeric", month: "short" }).format(now);
      clock.textContent = `${date} - ${time}`;
    };
    updateClock();
    window.setInterval(updateClock, 30000);
  }

  /* أضف صور السلايد أو احذفها من هذه القائمة فقط. */
  const sliderImages = [
    { src: "assets/images/slider/slide-1.jpg", alt: "فعاليات مركز كفرأبيل القرآني" },
    { src: "assets/images/slider/slide-2.jpg", alt: "أنشطة طلبة المركز" },
    { src: "assets/images/slider/slide-3.jpg", alt: "برامج المركز القرآنية" },
    { src: "assets/images/slider/slide-4.jpg", alt: "تكريم طلبة المركز" },
    { src: "assets/images/slider/slide-5.jpg", alt: "لقاء من لقاءات المركز" }
  ];

  const slider = document.querySelector("[data-slider]");
  if (slider) {
    const slidesRoot = slider.querySelector(".slides");
    const dotsRoot = slider.querySelector(".slider-dots");
    const nextButton = slider.querySelector(".slider-next");
    const previousButton = slider.querySelector(".slider-prev");
    let current = 0;
    let timer;
    let touchStart = 0;

    slidesRoot.innerHTML = sliderImages.map((image, index) => `
      <figure class="slide${index === 0 ? " active" : ""}" aria-hidden="${index === 0 ? "false" : "true"}">
        <div class="slide-backdrop" style="background-image:url('${image.src}')" aria-hidden="true"></div>
        <img src="${image.src}" alt="${image.alt}" ${index === 0 ? "fetchpriority=\"high\"" : "loading=\"lazy\""}>
      </figure>
    `).join("");

    dotsRoot.innerHTML = sliderImages.map((_, index) => `
      <button class="slider-dot${index === 0 ? " active" : ""}" type="button" aria-label="عرض الصورة ${index + 1}" data-slide-index="${index}"></button>
    `).join("");

    const slides = [...slidesRoot.children];
    const dots = [...dotsRoot.children];
    const show = index => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === current;
        slide.classList.toggle("active", active);
        slide.setAttribute("aria-hidden", String(!active));
        dots[slideIndex].classList.toggle("active", active);
      });
    };
    const stop = () => window.clearInterval(timer);
    const start = () => {
      stop();
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        timer = window.setInterval(() => show(current + 1), 5200);
      }
    };
    const manualShow = index => { show(index); start(); };

    nextButton.addEventListener("click", () => manualShow(current + 1));
    previousButton.addEventListener("click", () => manualShow(current - 1));
    dots.forEach(dot => dot.addEventListener("click", () => manualShow(Number(dot.dataset.slideIndex))));
    slider.addEventListener("mouseenter", stop);
    slider.addEventListener("mouseleave", start);
    slider.addEventListener("focusin", stop);
    slider.addEventListener("focusout", start);
    slider.addEventListener("touchstart", event => { touchStart = event.changedTouches[0].clientX; }, { passive: true });
    slider.addEventListener("touchend", event => {
      const distance = event.changedTouches[0].clientX - touchStart;
      if (Math.abs(distance) > 45) manualShow(current + (distance < 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
    start();
  }

  document.querySelectorAll("[data-tabs]").forEach(tabGroup => {
    const tabs = [...tabGroup.querySelectorAll("[data-tab-target]")];
    tabs.forEach(tab => tab.addEventListener("click", () => {
      tabs.forEach(item => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
        const panel = document.getElementById(item.dataset.tabTarget);
        if (panel) panel.hidden = !selected;
      });
    }));
  });

  const countElements = document.querySelectorAll("[data-count]");
  const animateCount = element => {
    if (element.dataset.counted === "true") return;
    element.dataset.counted = "true";
    const target = Number(element.dataset.count);
    const prefix = element.dataset.prefix || "";
    const suffix = element.dataset.suffix || "";
    const startTime = performance.now();
    const duration = 2600;
    const step = now => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${prefix}${Math.round(target * eased).toLocaleString("ar-JO")}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if ("IntersectionObserver" in window) {
    const countObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .35 });
    countElements.forEach(item => countObserver.observe(item));

    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .08 });
    document.querySelectorAll(".reveal").forEach(item => revealObserver.observe(item));
  } else {
    countElements.forEach(animateCount);
    document.querySelectorAll(".reveal").forEach(item => item.classList.add("visible"));
  }

})();
