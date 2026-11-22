/* Sidebar More-menu links (Admin panel + Talk Coins Shop) & Profile Decorations renderer */
(function () {
  if (window.wtShopDecoInit) return;
  window.wtShopDecoInit = true;

  // 1. Ensure Admin panel is visible and Shop is in the Sidebar More menu
  function wireMoreMenu() {
    const menu = document.getElementById("sbmenu");
    if (!menu) return;
    const adm = document.getElementById("sbadmin");
    if (adm) adm.classList.remove("hidden");
    else {
      const a = document.createElement("a");
      a.className = "it"; a.id = "sbadmin"; a.href = "/admin";
      a.innerHTML = '<span class="ms">admin_panel_settings</span>Admin panel';
      menu.insertBefore(a, menu.firstChild);
    }
    if (!document.getElementById("sbshop")) {
      const s = document.createElement("a");
      s.className = "it"; s.id = "sbshop"; s.href = "/shop";
      s.innerHTML = '<span class="ms">storefront</span>Shop';
      const dev = menu.querySelector('a[href="/developer"]');
      if (dev) menu.insertBefore(s, dev);
      else menu.insertBefore(s, menu.firstChild);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireMoreMenu);
  else wireMoreMenu();
  setTimeout(wireMoreMenu, 250);

  // 2. Render equipped Talk Coins decorations on /profile
  function injectDecoCss() {
    if (document.getElementById("wt-deco-css")) return;
    const st = document.createElement("style");
    st.id = "wt-deco-css";
    st.textContent = `
      .wt-pfp-wrap{position:relative;display:inline-grid;place-items:center;flex-shrink:0}
      .wt-pfp-ring{position:absolute;inset:-8px;clip-path:var(--m3-cookie-7);pointer-events:none;z-index:0}
      .wt-pfp-wrap .pfp{position:relative;z-index:1}
      .wt-pfp-over{position:absolute;inset:-10px;width:calc(100% + 20px);height:calc(100% + 20px);object-fit:contain;pointer-events:none;z-index:2}
      .wt-pfp-badge{position:absolute;bottom:-4px;right:-4px;width:30px;height:30px;clip-path:var(--m3-cookie-4);display:grid;place-items:center;z-index:3;box-shadow:0 3px 10px #0004}
      .wt-card-deco-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;margin-left:auto}
      .wt-card-deco-img{position:absolute;top:12px;right:14px;width:44px;height:44px;border-radius:14px;object-fit:cover;box-shadow:0 4px 14px #0003;pointer-events:none}
    `;
    document.head.appendChild(st);
  }

  function applyProfileDecos(data) {
    const pfp = document.getElementById("p-pfp");
    const card = document.querySelector(".profile-card");
    if (!pfp || !card) return;
    injectDecoCss();

    const av = data?.avatar;
    if (av) {
      let wrap = pfp.parentElement;
      if (!wrap.classList.contains("wt-pfp-wrap")) {
        wrap = document.createElement("div");
        wrap.className = "wt-pfp-wrap";
        pfp.parentNode.insertBefore(wrap, pfp);
        wrap.appendChild(pfp);
      }
      const ring = document.createElement("div");
      ring.className = "wt-pfp-ring";
      ring.style.background = av.style === "prism"
        ? "conic-gradient(#d0bcff,#ff9ed2,#ffd58a,#a8dab5,#8ab4f8,#d0bcff)"
        : av.style === "cyber"
        ? "linear-gradient(135deg,#00e5ff,#ff4081)"
        : `linear-gradient(135deg, ${av.color || "var(--primary)"}, var(--accent))`;
      wrap.appendChild(ring);

      if (av.image_url) {
        const im = document.createElement("img");
        im.className = "wt-pfp-over";
        im.src = av.image_url;
        im.alt = av.name || "";
        wrap.appendChild(im);
      } else {
        const bd = document.createElement("div");
        bd.className = "wt-pfp-badge";
        bd.style.background = av.color || "var(--primary)";
        bd.style.color = "#16121e";
        bd.innerHTML = `<span class="ms fill" style="font-size:16px">${av.icon || "auto_awesome"}</span>`;
        wrap.appendChild(bd);
      }
    }

    const pr = data?.profile;
    if (pr) {
      card.style.position = "relative";
      card.style.boxShadow = `0 0 0 3px ${pr.color || "var(--primary)"}, 0 10px 30px #0003`;
      if (pr.image_url) {
        const im = document.createElement("img");
        im.className = "wt-card-deco-img";
        im.src = pr.image_url;
        im.alt = pr.name || "";
        card.appendChild(im);
      } else {
        const names = card.querySelector(".p-names");
        if (names) {
          const tag = document.createElement("span");
          tag.className = "wt-card-deco-tag";
          tag.style.background = pr.color || "var(--primary)";
          tag.style.color = "#16121e";
          tag.innerHTML = `<span class="ms fill" style="font-size:14px">${pr.icon || "auto_awesome"}</span>${pr.name}`;
          names.appendChild(tag);
        }
      }
    }
  }

  if (document.getElementById("p-pfp")) {
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      if (typeof targetId !== "undefined" && targetId) {
        clearInterval(poll);
        try {
          const r = await fetch("/api/shop/equipped?userId=" + encodeURIComponent(targetId));
          const j = await r.json();
          if (j?.data) applyProfileDecos(j.data);
        } catch {}
      } else if (tries > 40) clearInterval(poll);
    }, 150);
  }
})();
