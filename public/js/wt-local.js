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

  const auth = {
    async getSession() { return { data: { session: await fresh() }, error: null }; },
    async getUser() { const s = await fresh(); return { data: { user: s ? s.user : null }, error: null }; },
    async signInWithPassword({ email, password }) {
      const r = await post("/api/auth/login", { email, password });
      if (!r.ok) return { data: { user: null, session: null }, error: errOf(r) };
      save(r.json.data.session); emit("SIGNED_IN");
      return { data: { user: session.user, session }, error: null };
    },
    async signUp({ email, password, options = {} }) {
      const r = await post("/api/auth/signup", { email, password, data: options.data || {} });
      if (!r.ok) return { data: { user: null, session: null }, error: errOf(r) };
      save(r.json.data.session); emit("SIGNED_IN");
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
    async signOut() { save(null); emit("SIGNED_OUT"); return { error: null }; },
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
  window.supabase = { createClient: () => client };
})();
