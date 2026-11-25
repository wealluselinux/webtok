/* Drop-in replacement for the Supabase browser client.
   The site's other scripts still call supabase.createClient(...), sb.from(...), sb.auth..., sb.storage..., sb.rpc(...).
   Here those calls go to our own server (/api/...), which uses Turso for data and Cloudflare R2 for files. */
(function () {
  const KEY = "wt_session";
  const listeners = [];
  let session = load();

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
  function save(s) { session = s; try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} }
  function emit(ev) { listeners.forEach(cb => { try { cb(ev, session); } catch (e) { console.error(e); } }); }
  async function post(url, body, token) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body || {}) });
    let j = {}; try { j = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, json: j };
  }
  const errOf = r => ({ message: (r.json.error && r.json.error.message) || r.json.error || "Request failed", code: r.json.error && r.json.error.code });

  // A session with a still-valid access token (refreshes it when it is about to expire)
  async function fresh() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session;
    const r = await post("/api/auth/refresh", { refresh_token: session.refresh_token });
    if (!r.ok) { save(null); emit("SIGNED_OUT"); return null; }
    save(r.json.data.session); emit("TOKEN_REFRESHED");
    return session;
  }
  const token = async () => { const s = await fresh(); return s ? s.access_token : null; };
  addEventListener("storage", e => {
    if (e.key !== KEY) return;
    const was = !!session; session = load();
    emit(session ? "SIGNED_IN" : (was ? "SIGNED_OUT" : "INITIAL_SESSION"));
  });

  async function pingPresence() {
    if (document.hidden) return;
    try {
      const t = await token();
      if (t) fetch("/api/presence/ping", { method: "POST", headers: { Authorization: "Bearer " + t }, keepalive: true }).catch(() => {});
    } catch {}
  }
  setTimeout(pingPresence, 300);
  setInterval(pingPresence, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pingPresence(); });

  const auth = {
    async getSession() { return { data: { session: await fresh() }, error: null }; },
    async getUser() { const s = await fresh(); return { data: { user: s ? s.user : null }, error: null }; },
    async signInWithPassword({ email, password }) {
      const r = await post("/api/auth/login", { email, password });
      if (!r.ok) return { data: { user: null, session: null }, error: errOf(r) };
      save(r.json.data.session); emit("SIGNED_IN");
      pingPresence();
      return { data: { user: session.user, session }, error: null };
    },
    async signUp({ email, password, options = {} }) {
      const r = await post("/api/auth/signup", { email, password, data: options.data || {} });
      if (!r.ok) return { data: { user: null, session: null }, error: errOf(r) };
      save(r.json.data.session); emit("SIGNED_IN");
      pingPresence();
      return { data: { user: session.user, session }, error: null };
    },
    async refreshSession(arg) {
      const rt = (arg && arg.refresh_token) || (session && session.refresh_token);
      const r = await post("/api/auth/refresh", { refresh_token: rt });
      if (!r.ok) return { data: { user: null, session: null }, error: errOf(r) };
      const changed = !session || session.user.id !== r.json.data.session.user.id;
      save(r.json.data.session); emit(changed ? "SIGNED_IN" : "TOKEN_REFRESHED");
      return { data: { user: session.user, session }, error: null };
    },
    async signOut() {
      const t = session && session.access_token;
      if (t) fetch("/api/presence/offline", { method: "POST", headers: { Authorization: "Bearer " + t }, keepalive: true }).catch(() => {});
      save(null); emit("SIGNED_OUT");
      return { error: null };
    },
    onAuthStateChange(cb) {
      listeners.push(cb);
      setTimeout(() => { try { cb("INITIAL_SESSION", session); } catch (e) { console.error(e); } }, 0);
      return { data: { subscription: { unsubscribe() { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); } } } };
    },
  };

  /* ---- query builder: from("table").select().eq()... ---- */
  function splitTop(s) {
    const out = []; let d = 0, cur = "";
    for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch; }
    if (cur) out.push(cur);
    return out;
  }
  function parseOr(str) {   // "a.eq.1,and(b.eq.2,c.eq.3)" -> groups joined by OR, each group joined by AND
    return splitTop(str).map(part => {
      const m = /^and\((.*)\)$/.exec(part);
      return (m ? splitTop(m[1]) : [part]).map(c => { const [col, op, ...rest] = c.split("."); return { c: col, o: op, v: rest.join(".") }; });
    });
  }
  class Query {
    constructor(table) { this.p = { table, filters: [], ors: [], order: [] }; }
    select(cols = "*", opt = {}) {
      if (this.p.op) this.p.returning = true; else this.p.op = "select";
      this.p.columns = cols; if (opt.count) this.p.count = true; if (opt.head) this.p.head = true; return this;
    }
    insert(data) { this.p.op = "insert"; this.p.data = data; return this; }
    update(data) { this.p.op = "update"; this.p.data = data; return this; }
    upsert(data, opt = {}) { this.p.op = "upsert"; this.p.data = data; this.p.onConflict = opt.onConflict; this.p.ignoreDuplicates = !!opt.ignoreDuplicates; return this; }
    delete() { this.p.op = "delete"; return this; }
    _f(o, c, v) { this.p.filters.push({ c, o, v }); return this; }
    eq(c, v) { return this._f("eq", c, v); } neq(c, v) { return this._f("neq", c, v); }
    gt(c, v) { return this._f("gt", c, v); } gte(c, v) { return this._f("gte", c, v); }
    lt(c, v) { return this._f("lt", c, v); } lte(c, v) { return this._f("lte", c, v); }
    in(c, v) { return this._f("in", c, v); } is(c, v) { return this._f("is", c, v); }
    like(c, v) { return this._f("like", c, v); } ilike(c, v) { return this._f("ilike", c, v); }
    or(str) { this.p.ors.push(parseOr(str)); return this; }
    order(c, o = {}) { this.p.order.push({ c, asc: o.ascending !== false }); return this; }
    limit(n) { this.p.limit = n; return this; }
    single() { this.p.single = "one"; return this; }
    maybeSingle() { this.p.single = "maybe"; return this; }
    async _run() {
      const r = await post("/api/db", this.p, await token());
      const j = r.json || {};
      if (!r.ok || j.error) return { data: null, error: errOf(r), count: null };
      return { data: j.data === undefined ? null : j.data, error: null, count: j.count == null ? null : j.count };
    }
    then(res, rej) { return this._run().then(res, rej); }
  }

  /* ---- live updates (new chat messages) by checking every few seconds ---- */
  function channel() {
    const handlers = []; let timer = null;
    const ch = {
      on(_type, opts, cb) { handlers.push({ opts, cb }); return ch; },
      subscribe() {
        handlers.forEach(async h => {
          if (!h.opts || h.opts.table !== "messages") return;
          const m = /recipient_id=eq\.(.+)/.exec(h.opts.filter || ""); if (!m) return;
          const rid = m[1];
          const last = await client.from("messages").select("id").eq("recipient_id", rid).order("id", { ascending: false }).limit(1);
          h.last = last.data && last.data[0] ? last.data[0].id : 0;
          h.rid = rid;
        });
        timer = setInterval(async () => {
          if (document.hidden) return;
          for (const h of handlers) {
            if (!h.rid) continue;
            const r = await client.from("messages").select("*").eq("recipient_id", h.rid).gt("id", h.last).order("id", { ascending: true });
            (r.data || []).forEach(row => { h.last = Math.max(h.last, row.id); h.cb({ eventType: "INSERT", new: row }); });
          }
        }, 3000);
        return ch;
      },
      unsubscribe() { clearInterval(timer); return ch; },
    };
    return ch;
  }

  /* ---- file storage on Cloudflare R2 ---- */
  const publicBase = () => ((window.WT_CONFIG || {}).R2_PUBLIC_URL || "").replace(/\/$/, "");
  const storage = {
    from(bucket) {
      return {
        async upload(path, body, opts = {}) {
          const t = await token(); if (!t) return { data: null, error: { message: "Sign in required" } };
          const contentType = opts.contentType || body.type || "application/octet-stream";
          const pre = await post("/api/storage/presign", { bucket, path, contentType }, t);
          if (!pre.ok) return { data: null, error: errOf(pre) };
          const up = await fetch(pre.json.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body });
          return up.ok ? { data: { path }, error: null } : { data: null, error: { message: "Upload failed (" + up.status + ")" } };
        },
        getPublicUrl(path) { return { data: { publicUrl: `${publicBase()}/${bucket}/${path}` } }; },
        async remove(paths) {
          const r = await post("/api/storage/remove", { bucket, paths }, await token());
          return r.ok ? { data: paths, error: null } : { data: null, error: errOf(r) };
        },
      };
    },
  };

  const client = {
    auth, storage,
    from: t => new Query(t),
    async rpc(fn, args) {
      const r = await post("/api/rpc/" + fn, args || {}, await token());
      return r.ok ? { data: r.json.data, error: null } : { data: null, error: errOf(r) };
    },
    channel, removeChannel(ch) { if (ch && ch.unsubscribe) ch.unsubscribe(); },
  };
  
  /* ---- Global Incoming Call Banner, Ringtone & Background WS ---- */
  (function () {
    let ringTimer = null, ringCtx = null, activeRingId = null;

    function playRingPulse() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!ringCtx) ringCtx = new Ctx();
        if (ringCtx.state === "suspended") ringCtx.resume().catch(() => {});
        const now = ringCtx.currentTime;
        [0, 0.28].forEach(offset => {
          const o1 = ringCtx.createOscillator(), o2 = ringCtx.createOscillator(), g = ringCtx.createGain();
          o1.type = "sine"; o2.type = "sine";
          o1.frequency.setValueAtTime(440, now + offset);
          o2.frequency.setValueAtTime(554.37, now + offset);
          g.gain.setValueAtTime(0.001, now + offset);
          g.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22);
          o1.connect(g); o2.connect(g); g.connect(ringCtx.destination);
          o1.start(now + offset); o2.start(now + offset);
          o1.stop(now + offset + 0.24); o2.stop(now + offset + 0.24);
        });
      } catch {}
    }

    function stopRing() {
      if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
    }

    function startRing() {
      stopRing();
      try { const t = JSON.parse(localStorage.getItem("wt_theme") || "{}"); if (t.callRingtone === false) return; } catch {}
      playRingPulse();
      ringTimer = setInterval(playRingPulse, 2400);
    }

    function ensureCallBannerStyles() {
      if (document.getElementById("wt-call-banner-css")) return;
      const st = document.createElement("style");
      st.id = "wt-call-banner-css";
      st.textContent = `
        #wt-call-banner{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:999px;background:var(--card,#1e1e24);color:var(--text,#fff);box-shadow:0 10px 32px rgba(0,0,0,.38);border:1px solid var(--surface,#333);max-width:calc(100vw - 24px);animation:wtCallPop .22s cubic-bezier(.2,.9,.3,1.1)}
        @keyframes wtCallPop{from{opacity:0;transform:translate(-50%,-14px) scale(.96)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
        #wt-call-banner .wt-cb-ic{width:38px;height:38px;border-radius:50%;background:var(--primary,#6750a4);color:var(--on-primary,#fff);display:grid;place-items:center;flex-shrink:0;animation:wtCallPulse 1.2s infinite}
        @keyframes wtCallPulse{0%,100%{box-shadow:0 0 0 0 rgba(103,80,164,.5)}50%{box-shadow:0 0 0 8px rgba(103,80,164,0)}}
        #wt-call-banner .wt-cb-info{min-width:0;line-height:1.25}
        #wt-call-banner .wt-cb-info b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
        #wt-call-banner .wt-cb-info small{display:block;font-size:12px;color:var(--muted,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
        #wt-call-banner .wt-cb-btns{display:flex;align-items:center;gap:6px;flex-shrink:0}
        #wt-call-banner button{border:0;border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
        #wt-call-banner .wt-cb-ans{background:#2e7d32;color:#fff}
        #wt-call-banner .wt-cb-dec{background:#c62828;color:#fff}
      `;
      document.head.appendChild(st);
    }

    window.wtHideIncomingCall = function (gid) {
      if (gid && activeRingId && gid !== activeRingId) return;
      activeRingId = null;
      stopRing();
      const el = document.getElementById("wt-call-banner");
      if (el) el.remove();
    };

    window.wtShowIncomingCall = function (m, onAnswer, onDecline) {
      if (!m || !m.groupId) return;
      if (window.parent && window.parent !== window && typeof window.parent.wtShowIncomingCall === "function") {
        window.parent.wtShowIncomingCall(m, onAnswer, onDecline);
        return;
      }
      if (typeof window.wtInActiveCall === "function" && window.wtInActiveCall()) return;
      ensureCallBannerStyles();
      window.wtHideIncomingCall();
      activeRingId = m.groupId;

      const f = m.from || {};
      const caller = f.display_name || (f.username ? "@" + f.username : "Someone");
      const isGroup = m.type === "group-call-ring";
      const title = isGroup ? (m.groupName || "Group Call") : caller;
      const sub = isGroup ? `${caller} started a group voice call` : "Incoming voice call";

      const el = document.createElement("div");
      el.id = "wt-call-banner";
      const ic = document.createElement("div"); ic.className = "wt-cb-ic"; ic.innerHTML = '<span class="ms">call</span>';
      const info = document.createElement("div"); info.className = "wt-cb-info";
      const b = document.createElement("b"); b.textContent = title;
      const sm = document.createElement("small"); sm.textContent = sub;
      info.append(b, sm);

      const btns = document.createElement("div"); btns.className = "wt-cb-btns";
      const ans = document.createElement("button"); ans.className = "wt-cb-ans"; ans.type = "button"; ans.textContent = "Answer";
      const dec = document.createElement("button"); dec.className = "wt-cb-dec"; dec.type = "button"; dec.textContent = "Decline";
      btns.append(ans, dec);
      el.append(ic, info, btns);
      document.body.appendChild(el);
      startRing();

      const autoTimer = setTimeout(() => window.wtHideIncomingCall(m.groupId), 45000);
      ans.onclick = () => {
        clearTimeout(autoTimer);
        window.wtHideIncomingCall(m.groupId);
        if (typeof onAnswer === "function") onAnswer();
        else location.href = "/messages#call=" + encodeURIComponent(m.groupId);
      };
      dec.onclick = () => {
        clearTimeout(autoTimer);
        window.wtHideIncomingCall(m.groupId);
        if (typeof onDecline === "function") onDecline();
      };
    };

    if (window.self === window.top && !/^\/messages\b/.test(location.pathname)) {
      let bgWs = null, bgTimer = null;
      async function connectBgWs() {
        if (bgWs && (bgWs.readyState === 0 || bgWs.readyState === 1)) return;
        const t = await token();
        if (!t) return;
        try {
          const proto = location.protocol === "https:" ? "wss:" : "ws:";
          bgWs = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(t)}`);
          bgWs.onmessage = e => {
            try {
              const m = JSON.parse(e.data);
              if (m.type === "dm-call-ring" || m.type === "group-call-ring") {
                window.wtShowIncomingCall(m);
              } else if (m.type === "call-ended") {
                window.wtHideIncomingCall(m.groupId);
              }
            } catch {}
          };
          bgWs.onclose = () => {
            bgWs = null;
            clearTimeout(bgTimer);
            bgTimer = setTimeout(connectBgWs, 5000);
          };
        } catch {}
      }
      setTimeout(connectBgWs, 800);
      listeners.push(ev => {
        if (ev === "SIGNED_IN" || ev === "TOKEN_REFRESHED") connectBgWs();
        else if (ev === "SIGNED_OUT" && bgWs) { try { bgWs.close(); } catch {} bgWs = null; }
      });
    }
  })();

  window.supabase = { createClient: () => client };
})();
