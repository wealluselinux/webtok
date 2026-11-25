/* Layout & Customization Engine: General Settings, Video Preferences, Sidebar/Rail order, Corner roundness */
(function () {
  if (window.wtApplyLayoutPrefs) return;

  const DEFAULT_SB = ["explore", "fyp", "following", "friends", "upload", "games", "activity", "messages", "profile"];
  const DEFAULT_RAIL = ["follow", "like", "comment", "share"];

  window.WT_DEFAULT_SB_ORDER = DEFAULT_SB;
  window.WT_DEFAULT_RAIL_ORDER = DEFAULT_RAIL;

  function getPrefs() {
    try { return JSON.parse(localStorage.getItem("wt_theme") || "{}"); } catch { return {}; }
  }

  function getAuthToken() {
    try {
      const s = JSON.parse(localStorage.getItem("wt_session") || "null");
      return s && s.access_token ? s.access_token : null;
    } catch { return null; }
  }

  async function syncThemeToDb(patch) {
    const tok = getAuthToken();
    if (!tok || !patch || typeof patch !== "object") return null;
    try {
      const r = await fetch("/api/account/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
        body: JSON.stringify(patch)
      });
      if (!r.ok) return null;
      const j = await r.json().catch(() => ({}));
      if (j && j.data && typeof j.data === "object") {
        try { localStorage.setItem("wt_theme", JSON.stringify(j.data)); } catch {}
        return j.data;
      }
    } catch {}
    return null;
  }

  async function loadThemeFromDb() {
    const tok = getAuthToken();
    if (!tok) return;
    try {
      const r = await fetch("/api/account/theme", { headers: { Authorization: "Bearer " + tok } });
      if (!r.ok) return;
      const j = await r.json().catch(() => ({}));
      if (j && j.data && typeof j.data === "object") {
        const merged = { ...getPrefs(), ...j.data };
        try { localStorage.setItem("wt_theme", JSON.stringify(merged)); } catch {}
        window.wtApplyLayoutPrefs(merged);
      }
    } catch {}
  }

  async function persistPrefs(patch) {
    const cur = getPrefs();
    const next = { ...cur, ...patch };
    try { localStorage.setItem("wt_theme", JSON.stringify(next)); } catch {}
    window.wtApplyLayoutPrefs(next);
    await syncThemeToDb(patch);
  }

  // Wrap global saveTheme (from theme.js) so every theme/layout setting also saves reliably to the DB
  function wrapSaveTheme() {
    if (typeof window.saveTheme === "function" && !window.saveTheme.__wtWrapped) {
      const orig = window.saveTheme;
      const wrapped = async function (patch) {
        let res;
        try { res = await orig.apply(this, arguments); } catch {}
        if (patch && typeof patch === "object") {
          const cur = getPrefs();
          const next = { ...cur, ...patch };
          try { localStorage.setItem("wt_theme", JSON.stringify(next)); } catch {}
          window.wtApplyLayoutPrefs(next);
          await syncThemeToDb(patch);
        }
        return res;
      };
      wrapped.__wtWrapped = true;
      window.saveTheme = wrapped;
    }
  }

  function buildToggleRow(id, label, desc, checked, onChange) {
    const row = document.createElement("label");
    row.className = "wt-gen-row";
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px;cursor:pointer;border-bottom:1px solid var(--surface)";
    row.innerHTML = `<div style="min-width:0"><div style="font-size:14px;font-weight:600">${label}</div>${desc ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${desc}</div>` : ""}</div>
      <input type="checkbox" id="${id}" style="width:18px;height:18px;accent-color:var(--primary);flex-shrink:0">`;
    const chk = row.querySelector("input");
    chk.checked = !!checked;
    chk.onchange = () => onChange(!!chk.checked);
    return row;
  }

  function buildSelectRow(id, label, desc, value, options, onChange) {
    const row = document.createElement("div");
    row.className = "wt-gen-row";
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px;border-bottom:1px solid var(--surface)";
    row.innerHTML = `<div style="min-width:0"><div style="font-size:14px;font-weight:600">${label}</div>${desc ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${desc}</div>` : ""}</div>
      <select id="${id}" style="padding:7px 12px;border-radius:999px;border:1px solid var(--surface);background:var(--surface);color:var(--text);font:inherit;font-size:13px;font-weight:600;outline:0">${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`;
    const sel = row.querySelector("select");
    sel.value = value;
    sel.onchange = () => onChange(sel.value);
    return row;
  }

  function ensureGeneralSettings() {
    const themeSec = document.getElementById("st-sec-theme");
    if (!themeSec || document.getElementById("st-sec-general")) return;

    const p = getPrefs();
    const genSec = document.createElement("div");
    genSec.id = "st-sec-general";
    genSec.className = themeSec.className || "st-sec";
    genSec.style.display = "none";

    const vidCard = document.createElement("div");
    vidCard.className = "st-card";
    vidCard.innerHTML = `<h3 style="margin:0 0 6px;font-size:15px">Video Preferences</h3><p style="margin:0 0 10px;font-size:12px;color:var(--muted)">Customize how videos look and play in your feed.</p>`;
    vidCard.append(
      buildToggleRow("st-gen-vid-round", "Rounded borders on videos", "Keep rounded corners on feed video players and cards", p.videoRound !== false, v => persistPrefs({ videoRound: v })),
      buildToggleRow("st-gen-vid-autoplay", "Autoplay videos", "Automatically play videos as you scroll through the feed", p.vidAutoplay !== false, v => persistPrefs({ vidAutoplay: v })),
      buildToggleRow("st-gen-vid-loop", "Loop videos", "Replay videos automatically when they finish", p.vidLoop !== false, v => persistPrefs({ vidLoop: v })),
      buildToggleRow("st-gen-vid-sound", "Start videos with sound", "Unmute feed videos automatically when supported by your browser", p.vidStartUnmuted === true, v => persistPrefs({ vidStartUnmuted: v })),
      buildToggleRow("st-gen-vid-caps", "Show captions & hashtags", "Display video titles, creator handle, and hashtags over videos", p.vidShowCaptions !== false, v => persistPrefs({ vidShowCaptions: v })),
      buildSelectRow("st-gen-vid-fit", "Video framing", "Choose whether videos fit inside or fill the player", p.vidFit || "default", [["default", "Default"], ["contain", "Fit (no crop)"], ["cover", "Fill screen"]], v => persistPrefs({ vidFit: v }))
    );
    const lastVidRow = vidCard.querySelector(".wt-gen-row:last-child");
    if (lastVidRow) lastVidRow.style.borderBottom = "0";

    const appCard = document.createElement("div");
    appCard.className = "st-card";
    appCard.style.marginTop = "14px";
    appCard.innerHTML = `<h3 style="margin:0 0 6px;font-size:15px">General &amp; Experience</h3><p style="margin:0 0 10px;font-size:12px;color:var(--muted)">Calls, motion, and feed layout preferences.</p>`;
    appCard.append(
      buildToggleRow("st-gen-ring", "Incoming call ringtone", "Play a ringtone when someone calls you or starts a group call", p.callRingtone !== false, v => persistPrefs({ callRingtone: v })),
      buildToggleRow("st-gen-motion", "Reduce motion", "Minimize page transitions and button animations", p.reduceMotion === true, v => persistPrefs({ reduceMotion: v })),
      buildToggleRow("st-gen-compact", "Compact feed controls", "Use slightly smaller like, comment, and share buttons", p.compactControls === true, v => persistPrefs({ compactControls: v }))
    );
    const lastAppRow = appCard.querySelector(".wt-gen-row:last-child");
    if (lastAppRow) lastAppRow.style.borderBottom = "0";

    genSec.append(vidCard, appCard);
    themeSec.parentElement.insertBefore(genSec, themeSec);

    // Wire a "General" tab button into the settings tab bar
    const dlg = themeSec.closest("dialog, .st-dlg, .modal, main, body") || document;
    const tabBtns = [...dlg.querySelectorAll("button, .st-tab")].filter(b => {
      const txt = (b.textContent || "").trim().toLowerCase();
      return b.dataset?.sec || b.dataset?.tab || ["theme", "appearance", "account", "security", "layout"].some(k => txt.includes(k));
    });
    const tabBar = tabBtns.length ? tabBtns[0].parentElement : null;
    if (tabBar && !document.getElementById("st-tab-general")) {
      const refBtn = tabBtns[0];
      const genBtn = document.createElement("button");
      genBtn.type = "button";
      genBtn.id = "st-tab-general";
      genBtn.className = refBtn.className.replace(/\b(act|on|active)\b/g, "").trim();
      genBtn.innerHTML = `<span class="ms" style="font-size:18px;vertical-align:middle;margin-right:4px">tune</span>General`;
      tabBar.insertBefore(genBtn, refBtn);

      const allSecs = [...themeSec.parentElement.children].filter(el => el.id && el.id.startsWith("st-sec-"));
      genBtn.addEventListener("click", () => {
        allSecs.forEach(s => { s.style.display = s === genSec ? "" : "none"; s.classList.toggle("hidden", s !== genSec); });
        tabBar.querySelectorAll("button, .st-tab").forEach(b => b.classList.remove("act", "on", "active"));
        genBtn.classList.add("act", "on");
      });
      tabBar.addEventListener("click", e => {
        const b = e.target.closest("button, .st-tab");
        if (!b || b === genBtn) return;
        genBtn.classList.remove("act", "on", "active");
        genSec.style.display = "none";
        genSec.classList.add("hidden");
      });
    }
  }

  window.wtApplyLayoutPrefs = function (t) {
    if (!t) t = getPrefs();
    const root = document.documentElement;

    const rad = t.radius || "round";
    if (rad === "sharp") {
      root.style.setProperty("--r-xl", "14px");
      root.style.setProperty("--r-lg", "10px");
      root.style.setProperty("--r-md", "8px");
    } else if (rad === "pill") {
      root.style.setProperty("--r-xl", "44px");
      root.style.setProperty("--r-lg", "32px");
      root.style.setProperty("--r-md", "24px");
    } else {
      root.style.setProperty("--r-xl", "32px");
      root.style.setProperty("--r-lg", "24px");
      root.style.setProperty("--r-md", "18px");
    }

    let st = document.getElementById("wt-layout-prefs-css");
    if (!st) { st = document.createElement("style"); st.id = "wt-layout-prefs-css"; document.head.appendChild(st); }

    const sbPos = t.sbPos || "left";
    const sbOrder = Array.isArray(t.sbOrder) && t.sbOrder.length ? t.sbOrder : DEFAULT_SB;
    const railOrder = Array.isArray(t.railOrder) && t.railOrder.length ? t.railOrder : DEFAULT_RAIL;

    let css = "";
    if (sbPos === "right") {
      css += `@media(min-width:801px){
        :root{--sbw:0px!important}
        #sb{left:auto!important;right:0!important;border-right:0!important;border-left:1px solid var(--surface)!important}
        body.has-sb #feed,body.has-sb #landing,body.has-sb #app{left:0!important;right:240px!important}
        body.has-sb .wrap,body.has-sb .acct-wrap{padding-left:0!important;padding-right:240px!important}
        #wt-top-tools{right:254px!important}
        #wt-stories-bar{left:14px!important;right:254px!important}
      }`;
    } else if (sbPos === "compact") {
      css += `@media(min-width:801px){
        :root{--sbw:84px!important}
        #sb{width:84px!important;padding:18px 12px!important;align-items:center}
        #sb .brand span,#sb .lbl,#sb .srch-wrap{display:none!important}
        #sb .it{justify-content:center;padding:12px!important;width:52px!important}
      }`;
    }

    if (t.videoRound === false) {
      css += `#feed .player,#feed .player video,#feed .vcard,#feed .vframe,#feed video,.vid-card,.vid-wrap{border-radius:0!important}`;
    }
    if (t.vidShowCaptions === false) {
      css += `#feed .cap{display:none!important}`;
    }
    if (t.vidFit === "contain" || t.vidFit === "cover") {
      css += `#feed .player video{object-fit:${t.vidFit}!important}`;
    }
    if (t.reduceMotion === true) {
      css += `*{animation-duration:0.001ms!important;transition-duration:0.001ms!important}`;
    }
    if (t.compactControls === true) {
      css += `#feed .rail .fab,#feed .sound-left .fab{transform:scale(.88)}`;
    }

    css += `#sb .brand{order:-10}#sb .srch-wrap{order:-5}#sb #sbmore{order:100}`;
    sbOrder.forEach((id, i) => { css += `#sb .it[data-id="${id}"]{order:${i}}`; });
    railOrder.forEach((id, i) => { css += `.rail .fab[data-a="${id}"]{order:${i}}`; });

    st.textContent = css;

    const syncChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    syncChk("st-gen-vid-round", t.videoRound !== false);
    syncChk("st-gen-vid-autoplay", t.vidAutoplay !== false);
    syncChk("st-gen-vid-loop", t.vidLoop !== false);
    syncChk("st-gen-vid-sound", t.vidStartUnmuted === true);
    syncChk("st-gen-vid-caps", t.vidShowCaptions !== false);
    syncChk("st-gen-ring", t.callRingtone !== false);
    syncChk("st-gen-motion", t.reduceMotion === true);
    syncChk("st-gen-compact", t.compactControls === true);
    const fitEl = document.getElementById("st-gen-vid-fit");
    if (fitEl) fitEl.value = t.vidFit || "default";
  };

  window.wtExtractColorFromCanvas = function (canvas) {
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let bestScore = -1, best = [103, 80, 164];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
      if (d < 0.08) continue;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      const score = s * (1 - Math.abs(l - 0.52) * 1.4);
      if (score > bestScore) { bestScore = score; best = [data[i], data[i + 1], data[i + 2]]; }
    }
    return "#" + best.map(v => v.toString(16).padStart(2, "0")).join("");
  };

  window.wtExtractWallpaperColor = function (wp, fallbackHex) {
    return new Promise(resolve => {
      if (!wp) return resolve(fallbackHex || "#6750a4");
      const hexes = wp.match(/#[0-9a-fA-F]{6}/g);
      if (hexes && hexes.length && wp.includes("gradient")) {
        return resolve(hexes[0]);
      }
      const urlMatch = /url\(["']?([^"')]+)["']?\)/.exec(wp);
      const src = urlMatch ? urlMatch[1] : wp;
      if (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("/")) {
        return resolve(fallbackHex || "#6750a4");
      }
      const img = new Image();
      if (src.startsWith("http")) img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = c.height = 32;
          c.getContext("2d").drawImage(img, 0, 0, 32, 32);
          resolve(window.wtExtractColorFromCanvas(c));
        } catch { resolve(fallbackHex || "#6750a4"); }
      };
      img.onerror = () => resolve(fallbackHex || "#6750a4");
      img.src = src;
    });
  };

  window.wtApplyLayoutPrefs();
  loadThemeFromDb();
  wrapSaveTheme();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { wrapSaveTheme(); ensureGeneralSettings(); });
  } else {
    ensureGeneralSettings();
  }
})();
