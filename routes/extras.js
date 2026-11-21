/* Extra server features, mounted from server.js (right after the `wrap` helper, before the first app.get):
     require("./routes/extras")({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso, removeFromR2 });
   1) Unread messages (dot next to Messages + browser notifications)
   2) Roles (owner / admin / user), bans, per-user restrictions (post / comment / message), forced sign-out
   3) Admin panel API (/api/admin/*) and the pages /admin, /terms, /privacy
   4) Sign-up must include accepted_terms = true */
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

module.exports = function mount({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso, removeFromR2 }) {
  const SECRET = process.env.JWT_SECRET;
  const TOS_VERSION = "2026-11-20";
  const RESTRICTIONS = ["post", "comment", "message"];
  const safeArr = s => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };

  /* ---------- database setup (safe to run every start) ---------- */
  let ready = null;
  const ensure = () => ready || (ready = (async () => {
    const mcols = (await db.execute("PRAGMA table_info(messages)")).rows.map(r => r[1]);
    if (!mcols.includes("read_at")) {
      await db.execute("ALTER TABLE messages ADD COLUMN read_at TEXT");
      await db.execute("UPDATE messages SET read_at = created_at WHERE read_at IS NULL");   // old messages count as read
    }
    const ucols = (await db.execute("PRAGMA table_info(users)")).rows.map(r => r[1]);
    for (const [n, d] of [["role", "TEXT NOT NULL DEFAULT 'user'"], ["restrictions", "TEXT NOT NULL DEFAULT '[]'"], ["banned", "INTEGER NOT NULL DEFAULT 0"],
      ["ban_reason", "TEXT"], ["sessions_valid_after", "TEXT"], ["tos_accepted_at", "TEXT"], ["tos_version", "TEXT"]]) {
      if (!ucols.includes(n)) await db.execute(`ALTER TABLE users ADD COLUMN ${n} ${d}`);
    }
    await db.execute("CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)");
    // The owner is the account whose email is OWNER_EMAIL. Only assigned while nobody is owner yet, and only to an account that already exists.
    const ownerEmail = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    if (ownerEmail && !(await run("SELECT 1 FROM users WHERE role = 'owner'")).length) {
      const r = await db.execute({ sql: "UPDATE users SET role = 'owner' WHERE email = ?", args: [ownerEmail] });
      console.log(r.rowsAffected ? "Owner account set." : "OWNER_EMAIL doesn't match an existing account yet.");
    }
  })().catch(e => { ready = null; throw e; }));
  ensure().catch(e => console.warn("extras setup:", e.message));

  /* ---------- who is this person right now? (cached for 20 seconds) ---------- */
  const cache = new Map();
  async function stateOf(uid) {
    const c = cache.get(uid);
    if (c && c.t > Date.now()) return c.s;
    const u = (await run("SELECT role, banned, ban_reason, restrictions, sessions_valid_after FROM users WHERE id = ?", [uid]))[0];
    const s = u ? { role: u.role, banned: !!u.banned, reason: u.ban_reason, restrictions: safeArr(u.restrictions), after: u.sessions_valid_after ? Date.parse(u.sessions_valid_after) : 0 } : null;
    cache.set(uid, { s, t: Date.now() + 20000 });
    return s;
  }
  const forget = uid => cache.delete(uid);
  const deny = (res, code, message) => res.status(code).json({ data: null, error: { message } });

  /* ---------- checks that run before every /api request ---------- */
  app.use("/api", async (req, res, next) => {
    try {
      await ensure();
      let tok = null;
      const h = req.headers.authorization || "";
      if (h.startsWith("Bearer ")) { try { tok = jwt.verify(h.slice(7), SECRET); } catch { tok = null; } }
      if (!tok && req.path === "/auth/refresh" && req.body && req.body.refresh_token) { try { tok = jwt.verify(String(req.body.refresh_token), SECRET); } catch { tok = null; } }
      if (!tok || !tok.sub) return next();
      const st = await stateOf(tok.sub);
      if (!st) return next();
      if (st.banned) return deny(res, 403, "This account has been suspended." + (st.reason ? " Reason: " + st.reason : ""));
      if (tok.iat < Math.floor(st.after / 1000)) return deny(res, 401, "Session expired. Please sign in again.");
      req.wt = { uid: tok.sub, ...st };
      const body = req.body || {};
      let need = null;
      if (req.method === "POST" && req.path === "/db" && (body.op === "insert" || body.op === "upsert")) need = { comments: "comment", messages: "message", videos: "post" }[body.table] || null;
      if (req.method === "POST" && req.path === "/storage/presign" && body.bucket === "videos") need = "post";
      if (need && st.restrictions.includes(need)) return deny(res, 403, `You aren't allowed to ${need === "post" ? "post videos" : need === "comment" ? "comment" : "send messages"} right now.`);
      next();
    } catch (e) { next(e); }
  });
  app.use("/api/auth/login", async (req, res, next) => {          // banned people can't sign in at all
    try {
      if (req.method !== "POST") return next();
      await ensure();
      const u = (await run("SELECT banned, ban_reason FROM users WHERE email = ?", [String(req.body?.email || "").trim().toLowerCase()]))[0];
      if (u && u.banned) return deny(res, 403, "This account has been suspended." + (u.ban_reason ? " Reason: " + u.ban_reason : ""));
      next();
    } catch (e) { next(e); }
  });
  app.use("/api/auth/signup", (req, res, next) => {               // must accept the Terms and Privacy Policy
    if (req.method !== "POST") return next();
    if (!(req.body && req.body.data && req.body.data.accepted_terms === true)) return deny(res, 400, "You must accept the Terms of Service and Privacy Policy.");
    const email = String(req.body.email || "").trim().toLowerCase();
    res.on("finish", () => {
      if (res.statusCode === 200) db.execute({ sql: "UPDATE users SET tos_accepted_at = ?, tos_version = ? WHERE email = ?", args: [nowIso(), TOS_VERSION, email] }).catch(() => {});
    });
    next();
  });

  /* ---------- pages ---------- */
  const page = f => (_q, res) => res.sendFile(path.join(__dirname, "..", "public", "pages", f));
  app.get("/admin", page("admin.html"));
  app.get("/terms", page("terms.html"));
  app.get("/privacy", page("privacy.html"));

  /* ---------- unread messages ---------- */
  app.get("/api/messages/unread", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const rows = await run(`SELECT m.id, m.sender_id, m.body, m.created_at, p.username, p.display_name
      FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE m.recipient_id = ? AND m.read_at IS NULL ORDER BY m.id DESC LIMIT 100`, [uid]);
    const bySender = {};
    rows.forEach(r => { bySender[r.sender_id] = (bySender[r.sender_id] || 0) + 1; });
    return { data: { count: rows.length, maxId: rows.length ? rows[0].id : 0, bySender, latest: rows.slice(0, 5) }, error: null };
  }));
  app.post("/api/messages/read", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const from = String(req.body?.from || "");
    if (!from) throw new HttpError(400, "Missing sender");
    await db.execute({ sql: "UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL", args: [nowIso(), uid, from] });
    return { data: true, error: null };
  }));

  /* ---------- admin API ---------- */
  const needAdmin = req => {
    if (!req.wt) throw new HttpError(401, "Sign in required");
    if (!["admin", "owner"].includes(req.wt.role)) throw new HttpError(403, "Admins only");
    return req.wt;
  };
  const log = (me, action, detail) => db.execute({ sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)", args: [me.uid, action, String(detail || "").slice(0, 300), nowIso()] });
  async function targetOf(id) {
    const t = (await run("SELECT u.id, u.email, u.role, u.banned, p.username FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?", [String(id || "")]))[0];
    if (!t) throw new HttpError(404, "User not found");
    return t;
  }
  // Owners can act on admins and users; admins only on regular users; nobody acts on the owner or on themselves
  const mayAct = (me, t) => { if (t.role === "owner" || t.id === me.uid) throw new HttpError(403, "You can't change this account"); if (me.role !== "owner" && t.role !== "user") throw new HttpError(403, "Only the owner can change admins"); };
  const label = t => `@${t.username || "?"} (${t.email})`;
  const makePassword = () => {
    const pick = s => s[crypto.randomInt(s.length)];
    const sets = ["abcdefghjkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?"], all = sets.join("");
    const c = [...sets.map(pick), ...Array.from({ length: 10 }, () => pick(all))];
    for (let i = c.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
    return c.join("");
  };

  app.get("/api/admin/me", wrap(async req => {
    if (!req.wt) throw new HttpError(401, "Sign in required");
    return { data: { role: req.wt.role }, error: null };
  }));
  app.get("/api/admin/users", wrap(async req => {
    needAdmin(req);
    const q = String(req.query.q || "").trim().slice(0, 60), like = `%${q}%`;
    const rows = await run(`SELECT u.id, u.email, u.role, u.banned, u.ban_reason, u.restrictions, u.created_at, u.tos_accepted_at, p.username, p.display_name
      FROM users u LEFT JOIN profiles p ON p.id = u.id
      ${q ? "WHERE u.email LIKE ? OR p.username LIKE ? OR p.display_name LIKE ?" : ""} ORDER BY u.created_at DESC LIMIT 60`, q ? [like, like, like] : []);
    return { data: rows.map(r => ({ ...r, banned: !!r.banned, restrictions: safeArr(r.restrictions) })), error: null };
  }));
  app.post("/api/admin/reset-password", limit(30, 600000), wrap(async req => {
    const me = needAdmin(req), t = await targetOf(req.body?.userId); mayAct(me, t);
    const pw = makePassword();
    await db.execute({ sql: "UPDATE users SET encrypted_password = ?, sessions_valid_after = ? WHERE id = ?", args: [await bcrypt.hash(pw, 10), nowIso(), t.id] });
    forget(t.id); await log(me, "reset_password", label(t));
    return { data: { password: pw, username: t.username, email: t.email }, error: null };
  }));
  app.post("/api/admin/set-role", wrap(async req => {
    const me = needAdmin(req); if (me.role !== "owner") throw new HttpError(403, "Only the owner can make or remove admins");
    const t = await targetOf(req.body?.userId); mayAct(me, t);
    const role = req.body?.role === "admin" ? "admin" : "user";
    await db.execute({ sql: "UPDATE users SET role = ? WHERE id = ?", args: [role, t.id] });
    forget(t.id); await log(me, role === "admin" ? "make_admin" : "remove_admin", label(t));
    return { data: true, error: null };
  }));
  app.post("/api/admin/restrict", wrap(async req => {
    const me = needAdmin(req), t = await targetOf(req.body?.userId); mayAct(me, t);
    const list = [...new Set((Array.isArray(req.body?.restrictions) ? req.body.restrictions : []).filter(x => RESTRICTIONS.includes(x)))];
    await db.execute({ sql: "UPDATE users SET restrictions = ? WHERE id = ?", args: [JSON.stringify(list), t.id] });
    forget(t.id); await log(me, "restrict", `${label(t)}: ${list.join(", ") || "none"}`);
    return { data: true, error: null };
  }));
  app.post("/api/admin/ban", wrap(async req => {
    const me = needAdmin(req), t = await targetOf(req.body?.userId); mayAct(me, t);
    const banned = req.body?.banned === true, reason = String(req.body?.reason || "").slice(0, 200);
    await db.execute({ sql: "UPDATE users SET banned = ?, ban_reason = ?, sessions_valid_after = ? WHERE id = ?", args: [banned ? 1 : 0, banned ? reason : null, nowIso(), t.id] });
    forget(t.id); await log(me, banned ? "ban" : "unban", `${label(t)}${banned && reason ? ": " + reason : ""}`);
    return { data: true, error: null };
  }));
  app.get("/api/admin/content", wrap(async req => {
    needAdmin(req);
    const videos = await run(`SELECT v.id, v.title, v.video_url, v.created_at, p.username FROM videos v LEFT JOIN profiles p ON p.id = v.user_id ORDER BY v.created_at DESC LIMIT 40`);
    const comments = await run(`SELECT c.id, c.text, c.created_at, c.video_id, p.username FROM comments c LEFT JOIN profiles p ON p.id = c.user_id ORDER BY c.created_at DESC LIMIT 40`);
    return { data: { videos, comments }, error: null };
  }));
  app.post("/api/admin/delete-video", wrap(async req => {
    const me = needAdmin(req);
    const v = (await run("SELECT id, title, storage_path FROM videos WHERE id = ?", [String(req.body?.videoId || "")]))[0];
    if (!v) throw new HttpError(404, "Video not found");
    await db.batch([{ sql: "DELETE FROM likes WHERE video_id = ?", args: [v.id] }, { sql: "DELETE FROM comments WHERE video_id = ?", args: [v.id] },
      { sql: "DELETE FROM video_views WHERE video_id = ?", args: [v.id] }, { sql: "DELETE FROM videos WHERE id = ?", args: [v.id] }], "write");
    if (v.storage_path && removeFromR2) await removeFromR2([`videos/${v.storage_path}`]);
    await log(me, "delete_video", `"${v.title}"`);
    return { data: true, error: null };
  }));
  app.post("/api/admin/delete-comment", wrap(async req => {
    const me = needAdmin(req);
    const c = (await run("SELECT id, text FROM comments WHERE id = ?", [String(req.body?.commentId || "")]))[0];
    if (!c) throw new HttpError(404, "Comment not found");
    await db.execute({ sql: "DELETE FROM comments WHERE id = ?", args: [c.id] });
    await log(me, "delete_comment", String(c.text).slice(0, 80));
    return { data: true, error: null };
  }));
  app.get("/api/admin/log", wrap(async req => {
    const me = needAdmin(req); if (me.role !== "owner") throw new HttpError(403, "Only the owner can see the log");
    return { data: await run(`SELECT l.action, l.detail, l.created_at, p.username AS admin FROM admin_log l LEFT JOIN profiles p ON p.id = l.admin_id ORDER BY l.id DESC LIMIT 100`), error: null };
  }));
};
