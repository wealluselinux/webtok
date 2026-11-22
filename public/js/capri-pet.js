/* Mini Desktop Capri Pet — assets from /images/capri_assets/ (Copyright 2026 Lachy, capri-desktop, PolyForm Noncommercial 1.0.0) */
(function () {
  if (window.wtCapri) return;
  const BASE = "/images/capri_assets/";
  const SIZES = { sm: 200, md: 280, lg: 360 };
  const LINES = ["Scrolling Web Tok?", "Nice Material You!", "Catch me!", "Vibing~", "Glitch check!", "Need a break?"];

  function getCfg() {
    try { return { enabled: false, size: "md", cursor: false, ...JSON.parse(localStorage.getItem("wt_capri_cfg") || "{}") }; }
    catch { return { enabled: false, size: "md", cursor: false }; }
  }
  function saveLocal(c) { localStorage.setItem("wt_capri_cfg", JSON.stringify(c)); }

  let _sbClient = null;
  function getSbClient() {
    if (window.sb) return window.sb;
    if (!_sbClient && window.supabase && window.WT_CONFIG?.SUPABASE_URL) {
      _sbClient = window.supabase.createClient(WT_CONFIG.SUPABASE_URL, WT_CONFIG.SUPABASE_ANON_KEY);
    }
    return _sbClient;
  }

  async function pushToServer(c) {
    try {
      const client = getSbClient(); if (!client?.auth?.getSession) return;
      const { data } = await client.auth.getSession();
      const tok = data?.session?.access_token; if (!tok) return;
      await fetch("/api/secret-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
        body: JSON.stringify(c)
      });
    } catch {}
  }

  async function syncFromServer() {
    try {
      const client = getSbClient(); if (!client?.auth?.getSession) return;
      const { data } = await client.auth.getSession();
      const tok = data?.session?.access_token; if (!tok) return;
      const r = await fetch("/api/secret-settings", { headers: { Authorization: "Bearer " + tok } });
      const j = await r.json().catch(() => ({}));
      if (j?.data) {
        saveLocal({ enabled: !!j.data.enabled, size: j.data.size || "md", cursor: !!j.data.cursor });
        sync();
      } else {
        const local = getCfg();
        if (local.enabled || local.cursor || local.size !== "md") pushToServer(local);
      }
    } catch {}
  }

  let wrap = null, img = null, bubble = null, menu = null, raf = 0, aiTmr = 0, talkTmr = 0, cursorUrl = "";
  let x = 80, y = 200, vx = 1.6, vy = 0, dir = 1, state = "idle", dragging = false, moved = false;
  let dx = 0, dy = 0, lx = 0, ly = 0, pvx = 0, pvy = 0;

  function applyCursor(on) {
    const existing = document.getElementById("wt-capri-cursor-css");
    if (!on) { if (existing) existing.remove(); document.documentElement.style.cursor = ""; return; }
    const inject = url => {
      let st = document.getElementById("wt-capri-cursor-css");
      if (!st) { st = document.createElement("style"); st.id = "wt-capri-cursor-css"; document.head.appendChild(st); }
      st.textContent = `html,body,*{cursor:url("${url}") 4 4,auto!important}`;
    };
    if (cursorUrl) return inject(cursorUrl);
    const ci = new Image();
    ci.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 36;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(ci, 0, 0, 36, 36);
      cursorUrl = c.toDataURL("image/png");
      if (getCfg().cursor) inject(cursorUrl);
    };
    ci.src = BASE + "cursor.png";
  }

  function setPose(name) {
    if (!img) return;
    const src = BASE + name + ".webp";
    if (!img.src.endsWith(src)) img.src = src;
  }
  function say(txt, ms = 2200) {
    if (!bubble) return;
    bubble.textContent = txt;
    bubble.classList.remove("hidden");
    clearTimeout(talkTmr);
    talkTmr = setTimeout(() => bubble && bubble.classList.add("hidden"), ms);
  }
  function setState(s) {
    state = s;
    if (s === "walk") { setPose("walk"); vx = (Math.random() < 0.5 ? -1 : 1) * 1.7; dir = vx > 0 ? 1 : -1; }
    else if (s === "sleep") { setPose("sleep"); vx = 0; say("zZz...", 2600); }
    else if (s === "music") { setPose("perch_music"); vx = 0; say("♪ vibing ♪", 2600); }
    else if (s === "glitch") { setPose("glitch"); vx = 0; say("0xCAPR1!", 1400); }
    else if (s === "perch") { setPose("perch"); vx = 0; }
    else { setPose("idle"); vx = 0; }
  }

  function mount() {
    if (wrap || !document.body) return;
    if (!document.getElementById("wt-capri-css")) {
      const st = document.createElement("style");
      st.id = "wt-capri-css";
      st.textContent = `
        #wt-capri{position:fixed;left:0;top:0;z-index:9998;user-select:none;touch-action:none;cursor:grab;will-change:transform}
        #wt-capri:active{cursor:grabbing}
        #wt-capri img{display:block;height:var(--capri-h,280px);width:auto;pointer-events:none;filter:drop-shadow(0 8px 18px #0005)}
        #wt-capri-bub{position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:var(--card,#312842);color:var(--text,#f6f1fc);padding:7px 14px;border-radius:999px;font:700 13px/1.2 system-ui,sans-serif;white-space:nowrap;box-shadow:0 4px 14px #0004;pointer-events:none}
        #wt-capri-bub.hidden,#wt-capri-menu.hidden{display:none}
        #wt-capri-menu{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);display:flex;gap:4px;background:var(--bg,#16121e);padding:6px;border-radius:999px;box-shadow:0 8px 24px #0006;z-index:9999}
        #wt-capri-menu button{border:0;background:var(--surface,#221c2e);color:var(--text,#fff);border-radius:999px;padding:6px 11px;font:700 12px system-ui,sans-serif;cursor:pointer}
        #wt-capri-menu button:hover{background:var(--primary,#d0bcff);color:var(--on-primary,#1d192b)}
      `;
      document.head.appendChild(st);
    }

    wrap = document.createElement("div");
    wrap.id = "wt-capri";
    wrap.innerHTML = `<div id="wt-capri-bub" class="hidden"></div>
      <div id="wt-capri-menu" class="hidden">
        <button type="button" data-a="walk">Walk</button>
        <button type="button" data-a="sleep">Sleep</button>
        <button type="button" data-a="music">Music</button>
        <button type="button" data-a="glitch">Glitch</button>
        <button type="button" data-a="hide">Hide</button>
      </div><img alt="Capri">`;
    document.body.appendChild(wrap);
    img = wrap.querySelector("img");
    bubble = wrap.querySelector("#wt-capri-bub");
    menu = wrap.querySelector("#wt-capri-menu");

    const h = SIZES[getCfg().size] || 280;
    wrap.style.setProperty("--capri-h", h + "px");
    x = Math.max(20, window.innerWidth - Math.round(h * 0.7) - 32);
    y = Math.max(20, window.innerHeight - h);
    setPose("idle");

    wrap.onpointerenter = () => { if (!dragging && state === "idle") setPose("grin"); };
    wrap.onpointerleave = () => { if (!dragging && state === "idle") setPose("idle"); };
    wrap.oncontextmenu = e => { e.preventDefault(); menu.classList.toggle("hidden"); };
    menu.onclick = e => {
      e.stopPropagation();
      const a = e.target.dataset.a; if (!a) return;
      menu.classList.add("hidden");
      if (a === "hide") { const c = getCfg(); c.enabled = false; saveAndSync(c); }
      else setState(a);
    };

    wrap.onpointerdown = e => {
      if (e.button === 2 || e.target.closest("#wt-capri-menu")) return;
      menu.classList.add("hidden");
      dragging = true; moved = false;
      wrap.setPointerCapture(e.pointerId);
      dx = e.clientX - x; dy = e.clientY - y;
      lx = e.clientX; ly = e.clientY; pvx = 0; pvy = 0;
      state = "dangle"; setPose("dangle");
    };
    wrap.onpointermove = e => {
      if (!dragging) return;
      const nx = e.clientX - dx, ny = e.clientY - dy;
      if (Math.hypot(e.clientX - lx, e.clientY - ly) > 3) moved = true;
      pvx = (e.clientX - lx) * 0.7; pvy = (e.clientY - ly) * 0.7;
      lx = e.clientX; ly = e.clientY;
      x = nx; y = ny;
    };
    wrap.onpointerup = () => {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        const isGlitch = Math.random() < 0.35;
        state = isGlitch ? "glitch" : "talk";
        setPose(state);
        say(LINES[Math.floor(Math.random() * LINES.length)]);
        setTimeout(() => { if (!dragging && (state === "talk" || state === "glitch")) setState("idle"); }, 1800);
        return;
      }
      if (Math.hypot(pvx, pvy) > 4 || y < window.innerHeight - (SIZES[getCfg().size] || 280) - 8) {
        state = "tossed"; vx = Math.max(-18, Math.min(18, pvx)); vy = Math.max(-18, Math.min(18, pvy));
        setPose("tossed");
      } else setState("idle");
    };

    aiTmr = setInterval(() => {
      if (dragging || state === "tossed") return;
      const r = Math.random();
      if (r < 0.38) setState("walk");
      else if (r < 0.62) setState("idle");
      else if (r < 0.78) setState("perch");
      else if (r < 0.90) setState("music");
      else setState("sleep");
    }, 5500);

    (function loop() {
      const hCur = SIZES[getCfg().size] || 280;
      const wCur = img.offsetWidth || hCur * 0.65;
      const floor = Math.max(0, window.innerHeight - hCur);
      const maxX = Math.max(0, window.innerWidth - wCur);
      if (!dragging) {
        if (state === "tossed") {
          vy += 0.65; x += vx; y += vy; vx *= 0.99;
          if (x <= 0) { x = 0; vx = Math.abs(vx) * 0.65; }
          if (x >= maxX) { x = maxX; vx = -Math.abs(vx) * 0.65; }
          if (y >= floor) {
            y = floor;
            if (Math.abs(vy) > 3.5) vy = -vy * 0.45;
            else { vy = 0; vx = 0; setState("idle"); }
          }
        } else if (state === "walk") {
          x += vx;
          if (x <= 0) { x = 0; vx = Math.abs(vx); dir = 1; }
          if (x >= maxX) { x = maxX; vx = -Math.abs(vx); dir = -1; }
          y = floor;
        } else {
          x = Math.max(0, Math.min(maxX, x));
          y = Math.min(floor, y + 6);
        }
      }
      wrap.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
      img.style.transform = dir < 0 ? "scaleX(-1)" : "";
      raf = requestAnimationFrame(loop);
    })();
  }

  function unmount() {
    cancelAnimationFrame(raf); clearInterval(aiTmr); clearTimeout(talkTmr);
    if (wrap) { wrap.remove(); wrap = img = bubble = menu = null; }
  }

  function sync() {
    const c = getCfg();
    applyCursor(!!c.cursor);
    if (c.enabled) { mount(); if (wrap) wrap.style.setProperty("--capri-h", (SIZES[c.size] || 280) + "px"); }
    else unmount();
  }

  function saveAndSync(c) {
    saveLocal(c);
    sync();
    pushToServer(c);
  }

  window.wtCapri = {
    sync,
    save: saveAndSync,
    syncFromServer,
    setState: s => { if (getCfg().enabled) setState(s); },
    center: () => { if (wrap) { const h = SIZES[getCfg().size] || 280; x = window.innerWidth / 2 - 80; y = window.innerHeight - h; } }
  };

  sync();
  setTimeout(syncFromServer, 200);
  const client = getSbClient();
  if (client?.auth?.onAuthStateChange) {
    client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN") syncFromServer(); });
  }
})();