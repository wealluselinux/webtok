/* Mini Desktop Capri Pet + Click-to-Chat WebTok AI (Copyright 2026 Lachy, capri-desktop, PolyForm Noncommercial 1.0.0) */
(function () {
  if (window.wtCapri) return;
  const BASE = "/images/capri_assets/";
  const SIZES = { sm: 200, md: 280, lg: 360 };

  function getCfg() {
    try { return { enabled: false, size: "md", cursor: false, gravityBtn: false, gravityCollide: true, prompt: "", _ts: 0, ...JSON.parse(localStorage.getItem("wt_capri_cfg") || "{}") }; }
    catch { return { enabled: false, size: "md", cursor: false, gravityBtn: false, gravityCollide: true, prompt: "", _ts: 0 }; }
  }
  function saveLocal(c) { localStorage.setItem("wt_capri_cfg", JSON.stringify(c)); }

  let _sbClient = null, localDirty = false;
  function getSbClient() {
    if (window.sb) return window.sb;
    if (!_sbClient && window.supabase && window.WT_CONFIG?.SUPABASE_URL) {
      _sbClient = window.supabase.createClient(WT_CONFIG.SUPABASE_URL, WT_CONFIG.SUPABASE_ANON_KEY);
    }
    return _sbClient;
  }
  async function getToken() {
    const client = getSbClient(); if (!client?.auth?.getSession) return null;
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function pushToServer(c) {
    try {
      const tok = await getToken(); if (!tok) return;
      await fetch("/api/secret-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
        body: JSON.stringify(c)
      });
    } catch {}
  }

  async function syncFromServer() {
    try {
      const tok = await getToken(); if (!tok) return;
      const r = await fetch("/api/secret-settings", { headers: { Authorization: "Bearer " + tok } });
      const j = await r.json().catch(() => ({}));
      if (localDirty) return;
      const local = getCfg();
      const srv = j?.data;
      if (srv && Number(srv._ts || 0) >= Number(local._ts || 0)) {
        saveLocal({
          enabled: !!srv.enabled,
          size: srv.size || "md",
          cursor: !!srv.cursor,
          gravityBtn: !!srv.gravityBtn,
          gravityCollide: srv.gravityCollide !== false,
          prompt: srv.prompt || "",
          _ts: Number(srv._ts || 0)
        });
        sync();
        if (window.wtGravity) window.wtGravity.sync();
      } else if (local._ts || local.enabled || local.cursor || local.gravityBtn || local.size !== "md" || local.prompt) {
        pushToServer(local);
      }
    } catch {}
  }

  let wrap = null, img = null, bubble = null, menu = null, chatBox = null, raf = 0, aiTmr = 0, talkTmr = 0, cursorUrl = "";
  let x = 80, y = 200, vx = 1.6, vy = 0, dir = 1, state = "idle", dragging = false, moved = false, chatOpen = false;
  let dx = 0, dy = 0, lx = 0, ly = 0, pvx = 0, pvy = 0;
  const chatHistory = [];

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
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 36;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(ci, 0, 0, 36, 36);
        cursorUrl = c.toDataURL("image/png");
      } catch { cursorUrl = BASE + "cursor.png"; }
      if (getCfg().cursor) inject(cursorUrl);
    };
    ci.onerror = () => { if (getCfg().cursor) inject(BASE + "cursor.png"); };
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
    else if (s === "talk") { setPose("talk"); vx = 0; }
    else { setPose("idle"); vx = 0; }
  }

  function appendChatMsg(role, text) {
    if (!chatBox) return null;
    const list = chatBox.querySelector("#wt-cc-msgs");
    const d = document.createElement("div");
    d.className = "wt-cc-m " + (role === "user" ? "me" : "ai");
    d.textContent = text;
    list.appendChild(d);
    list.scrollTop = 1e9;
    return d;
  }

  function toggleChat(force) {
    if (!chatBox) return;
    chatOpen = force != null ? force : !chatOpen;
    chatBox.classList.toggle("hidden", !chatOpen);
    if (chatOpen) {
      setState("talk");
      positionChatBox();
      chatBox.querySelector("#wt-cc-in").focus();
    } else setState("idle");
  }

  function positionChatBox() {
    if (!chatBox || !chatOpen) return;
    const w = 290, h = 320;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, x - 60));
    const top = Math.max(12, Math.min(window.innerHeight - h - 12, y - h + 40));
    chatBox.style.left = Math.round(left) + "px";
    chatBox.style.top = Math.round(top) + "px";
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
        #wt-capri-bub.hidden,#wt-capri-menu.hidden,#wt-capri-chat.hidden{display:none}
        #wt-capri-menu{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);display:flex;gap:4px;background:var(--bg,#16121e);padding:6px;border-radius:999px;box-shadow:0 8px 24px #0006;z-index:9999}
        #wt-capri-menu button{border:0;background:var(--surface,#221c2e);color:var(--text,#fff);border-radius:999px;padding:6px 11px;font:700 12px system-ui,sans-serif;cursor:pointer}
        #wt-capri-menu button:hover{background:var(--primary,#d0bcff);color:var(--on-primary,#1d192b)}
        #wt-capri-chat{position:fixed;width:min(92vw,290px);height:320px;background:var(--bg,#f6f1fc);color:var(--text,#1d192b);border-radius:28px;box-shadow:0 16px 48px #0006;z-index:10000;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--card,#e2d4f4);font-family:inherit}
        .wt-cc-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card,#e2d4f4);font-weight:700;font-size:14px}
        .wt-cc-head button{border:0;background:var(--surface,#ede5f7);color:var(--text,#1d192b);width:28px;height:28px;border-radius:50%;cursor:pointer;font-weight:700;display:grid;place-items:center}
        #wt-cc-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.4}
        .wt-cc-m{max-width:85%;padding:8px 12px;border-radius:18px;background:var(--surface,#ede5f7);align-self:flex-start;word-break:break-word}
        .wt-cc-m.me{background:var(--primary,#6750a4);color:var(--on-primary,#fff);align-self:flex-end}
        #wt-cc-form{display:flex;gap:6px;padding:8px;border-top:1px solid var(--surface,#ede5f7)}
        #wt-cc-in{flex:1;min-width:0;border:0;border-radius:999px;padding:8px 12px;background:var(--surface,#ede5f7);color:var(--text,#1d192b);font:inherit;font-size:13px;outline:0}
        #wt-cc-send{border:0;border-radius:999px;padding:8px 13px;background:var(--primary,#6750a4);color:var(--on-primary,#fff);font:700 12px inherit;cursor:pointer}
      `;
      document.head.appendChild(st);
    }

    wrap = document.createElement("div");
    wrap.id = "wt-capri";
    wrap.innerHTML = `<div id="wt-capri-bub" class="hidden"></div>
      <div id="wt-capri-menu" class="hidden">
        <button type="button" data-a="chat">Chat</button>
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

    chatBox = document.createElement("div");
    chatBox.id = "wt-capri-chat";
    chatBox.className = "hidden";
    chatBox.innerHTML = `
      <div class="wt-cc-head"><span>Capri · Web Tok AI</span><button type="button" id="wt-cc-close" aria-label="Close">✕</button></div>
      <div id="wt-cc-msgs"><div class="wt-cc-m ai">Hey! Click me anytime to chat. What's up?</div></div>
      <form id="wt-cc-form"><input id="wt-cc-in" maxlength="500" placeholder="Talk to Capri…" autocomplete="off"><button id="wt-cc-send">Send</button></form>`;
    document.body.appendChild(chatBox);
    chatBox.querySelector("#wt-cc-close").onclick = () => toggleChat(false);
    chatBox.querySelector("#wt-cc-form").onsubmit = async e => {
      e.preventDefault();
      const inp = chatBox.querySelector("#wt-cc-in");
      const msg = inp.value.trim(); if (!msg) return;
      inp.value = "";
      appendChatMsg("user", msg);
      const waitEl = appendChatMsg("ai", "Thinking…");
      setPose("glitch");
      try {
        const tok = await getToken();
        if (!tok) throw new Error("Sign in to Web Tok to chat with Capri!");
        const r = await fetch("/api/capri/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
          body: JSON.stringify({ message: msg, history: chatHistory, customPrompt: getCfg().prompt || "" })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error?.message || "Could not reach Web Tok AI");
        const reply = j.data.reply || "…";
        waitEl.textContent = reply;
        chatHistory.push({ role: "user", content: msg }, { role: "assistant", content: reply });
        if (chatHistory.length > 10) chatHistory.splice(0, 2);
        setPose("talk");
      } catch (err) {
        waitEl.textContent = err.message;
        setPose("talk");
      }
    };

    const h = SIZES[getCfg().size] || 280;
    wrap.style.setProperty("--capri-h", h + "px");
    x = Math.max(20, window.innerWidth - Math.round(h * 0.7) - 32);
    y = Math.max(20, window.innerHeight - h);
    setPose("idle");

    wrap.onpointerenter = () => { if (!dragging && !chatOpen && state === "idle") setPose("grin"); };
    wrap.onpointerleave = () => { if (!dragging && !chatOpen && state === "idle") setPose("idle"); };
    wrap.oncontextmenu = e => { e.preventDefault(); menu.classList.toggle("hidden"); };
    menu.onclick = e => {
      e.stopPropagation();
      const a = e.target.dataset.a; if (!a) return;
      menu.classList.add("hidden");
      if (a === "hide") { toggleChat(false); const c = getCfg(); c.enabled = false; saveAndSync(c); }
      else if (a === "chat") toggleChat(true);
      else { toggleChat(false); setState(a); }
    };

    wrap.onpointerdown = e => {
      if (document.body.dataset.wtGravity === "1" || e.button === 2 || e.target.closest("#wt-capri-menu")) return;
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
      positionChatBox();
    };
    wrap.onpointerup = () => {
      if (!dragging) return;
      dragging = false;
      if (!moved) { toggleChat(); return; }
      if (Math.hypot(pvx, pvy) > 4 || y < window.innerHeight - (SIZES[getCfg().size] || 280) - 8) {
        state = "tossed"; vx = Math.max(-18, Math.min(18, pvx)); vy = Math.max(-18, Math.min(18, pvy));
        setPose("tossed");
      } else setState(chatOpen ? "talk" : "idle");
    };

    aiTmr = setInterval(() => {
      if (dragging || chatOpen || state === "tossed" || document.body.dataset.wtGravity === "1") return;
      const r = Math.random();
      if (r < 0.38) setState("walk");
      else if (r < 0.62) setState("idle");
      else if (r < 0.78) setState("perch");
      else if (r < 0.90) setState("music");
      else setState("sleep");
    }, 5500);

    (function loop() {
      if (document.body.dataset.wtGravity !== "1") {
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
              else { vy = 0; vx = 0; setState(chatOpen ? "talk" : "idle"); }
            }
          } else if (state === "walk" && !chatOpen) {
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
      }
      img.style.transform = dir < 0 ? "scaleX(-1)" : "";
      if (chatOpen) positionChatBox();
      raf = requestAnimationFrame(loop);
    })();
  }

  function unmount() {
    cancelAnimationFrame(raf); clearInterval(aiTmr); clearTimeout(talkTmr);
    if (wrap) { wrap.remove(); wrap = img = bubble = menu = null; }
    if (chatBox) { chatBox.remove(); chatBox = null; chatOpen = false; }
  }

  function sync() {
    const c = getCfg();
    applyCursor(!!c.cursor);
    if (c.enabled) { mount(); if (wrap) wrap.style.setProperty("--capri-h", (SIZES[c.size] || 280) + "px"); }
    else unmount();
  }

  function saveAndSync(c) {
    localDirty = true;
    c._ts = c._ts || Date.now();
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
    client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN") { localDirty = false; syncFromServer(); } });
  }
})();