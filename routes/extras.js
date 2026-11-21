/* Extra server features, mounted from server.js (right after the `wrap` helper, before the first app.get):
     require("./routes/extras")({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso, removeFromR2 });
   1) Unread messages (dot next to Messages + browser notifications)
   2) Roles (owner / admin / user), bans, per-user restrictions (post / comment / message), forced sign-out
   3) Admin panel API (/api/admin/*) and the pages /admin, /terms, /privacy
   4) Sign-up must include accepted_terms = true
   5) Group chats with friend invites & acceptance */
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
    await db.batch([
      "CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS group_chats (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, invited_by TEXT, created_at TEXT NOT NULL, last_read_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (group_id, user_id))",
      "CREATE TABLE IF NOT EXISTS group_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, sender_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(user_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_gmsg_group ON group_messages(group_id, id)",
    ], "write");
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

  /* ---------- group chats & friend invites ---------- */
  async function areFriends(a, b) {
    if (!a || !b || a === b) return false;
    const r = await run(`SELECT COUNT(*) n FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)`, [a, b, b, a]);
    return r[0].n >= 2;
  }
  async function requireMember(groupId, uid) {
    const m = (await run(`SELECT status, last_read_id FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, uid]))[0];
    if (!m || m.status !== "accepted") throw new HttpError(403, "You are not a member of this group");
    return m;
  }

  app.get("/api/groups", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const groups = await run(`
      SELECT g.id, g.name, g.created_by, g.created_at, gm.last_read_id,
        (SELECT COUNT(*) FROM group_members m2 WHERE m2.group_id = g.id AND m2.status = 'accepted') AS member_count,
        (SELECT COUNT(*) FROM group_messages msg WHERE msg.group_id = g.id AND msg.id > gm.last_read_id AND msg.sender_id != ?) AS unread_count
      FROM group_members gm
      JOIN group_chats g ON g.id = gm.group_id
      WHERE gm.user_id = ? AND gm.status = 'accepted'
      ORDER BY g.created_at DESC LIMIT 100`, [uid, uid]);

    for (const g of groups) {
      g.members = await run(`
        SELECT p.id, p.username, p.display_name, p.avatar_url
        FROM group_members m JOIN profiles p ON p.id = m.user_id
        WHERE m.group_id = ? AND m.status = 'accepted'
        ORDER BY m.created_at ASC LIMIT 25`, [g.id]);
    }

    const invites = await run(`
      SELECT g.id AS group_id, g.name, gm.invited_by, gm.created_at,
        p.username AS inviter_username, p.display_name AS inviter_display_name, p.avatar_url AS inviter_avatar_url,
        (SELECT COUNT(*) FROM group_members m2 WHERE m2.group_id = g.id AND m2.status = 'accepted') AS member_count
      FROM group_members gm
      JOIN group_chats g ON g.id = gm.group_id
      LEFT JOIN profiles p ON p.id = gm.invited_by
      WHERE gm.user_id = ? AND gm.status = 'pending'
      ORDER BY gm.created_at DESC LIMIT 50`, [uid]);

    return { data: { groups, invites }, error: null };
  }));

  app.post("/api/groups", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    if (req.wt?.restrictions?.includes("message")) throw new HttpError(403, "You aren't allowed to send messages right now.");
    const name = String(req.body?.name || "").trim();
    if (name.length < 1 || name.length > 40) throw new HttpError(400, "Group name must be 1 to 40 characters.");
    const rawIds = Array.isArray(req.body?.memberIds) ? [...new Set(req.body.memberIds.map(x => String(x || "").trim()).filter(Boolean))] : [];
    const friendIds = rawIds.filter(id => id !== uid).slice(0, 30);
    if (!friendIds.length) throw new HttpError(400, "Pick at least one friend to invite.");
    for (const fid of friendIds) {
      if (!(await areFriends(uid, fid))) throw new HttpError(403, "You can only invite mutual friends to a group.");
    }
    const gid = crypto.randomUUID(), ts = nowIso();
    const stmts = [
      { sql: "INSERT INTO group_chats (id, name, created_by, created_at) VALUES (?,?,?,?)", args: [gid, name, uid, ts] },
      { sql: "INSERT INTO group_members (group_id, user_id, status, invited_by, created_at, last_read_id) VALUES (?,?,?,?,?,0)", args: [gid, uid, "accepted", uid, ts] }
    ];
    for (const fid of friendIds) {
      stmts.push({ sql: "INSERT INTO group_members (group_id, user_id, status, invited_by, created_at, last_read_id) VALUES (?,?,?,?,?,0)", args: [gid, fid, "pending", uid, ts] });
    }
    await db.batch(stmts, "write");
    return { data: { id: gid, name, created_by: uid, created_at: ts, invitedCount: friendIds.length }, error: null };
  }));

  app.post("/api/groups/:id/respond", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    const inv = (await run("SELECT status FROM group_members WHERE group_id = ? AND user_id = ?", [gid, uid]))[0];
    if (!inv || inv.status !== "pending") throw new HttpError(404, "Invite not found");
    const accept = req.body?.accept === true;
    if (accept) {
      await db.execute({ sql: "UPDATE group_members SET status = 'accepted' WHERE group_id = ? AND user_id = ?", args: [gid, uid] });
    } else {
      await db.execute({ sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ?", args: [gid, uid] });
    }
    return { data: { accepted: accept, group_id: gid }, error: null };
  }));

  app.post("/api/groups/:id/invite", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    if (req.wt?.restrictions?.includes("message")) throw new HttpError(403, "You aren't allowed to send messages right now.");
    const gid = String(req.params.id || "");
    await requireMember(gid, uid);
    const rawIds = Array.isArray(req.body?.memberIds) ? [...new Set(req.body.memberIds.map(x => String(x || "").trim()).filter(Boolean))] : [];
    const friendIds = rawIds.filter(id => id !== uid).slice(0, 20);
    if (!friendIds.length) throw new HttpError(400, "Pick at least one friend to invite.");
    let added = 0;
    const ts = nowIso();
    for (const fid of friendIds) {
      if (!(await areFriends(uid, fid))) throw new HttpError(403, "You can only invite mutual friends.");
      const ex = (await run("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?", [gid, fid]))[0];
      if (!ex) {
        await db.execute({ sql: "INSERT INTO group_members (group_id, user_id, status, invited_by, created_at, last_read_id) VALUES (?,?,?,?,?,0)", args: [gid, fid, "pending", uid, ts] });
        added++;
      }
    }
    return { data: { added }, error: null };
  }));

  app.post("/api/groups/:id/leave", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    await db.execute({ sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ?", args: [gid, uid] });
    return { data: true, error: null };
  }));

  app.get("/api/groups/:id/messages", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    await requireMember(gid, uid);
    const after = parseInt(req.query.after, 10) || 0;
    const rows = await run(`
      SELECT m.id, m.group_id, m.sender_id, m.body, m.created_at,
        p.username, p.display_name, p.avatar_url
      FROM group_messages m
      LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE m.group_id = ? ${after > 0 ? "AND m.id > ?" : ""}
      ORDER BY m.id ASC LIMIT 300`, after > 0 ? [gid, after] : [gid]);
    if (rows.length) {
      const maxId = rows[rows.length - 1].id;
      await db.execute({ sql: "UPDATE group_members SET last_read_id = MAX(last_read_id, ?) WHERE group_id = ? AND user_id = ?", args: [maxId, gid, uid] });
    }
    return { data: rows, error: null };
  }));

  app.post("/api/groups/:id/messages", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    if (req.wt?.restrictions?.includes("message")) throw new HttpError(403, "You aren't allowed to send messages right now.");
    const gid = String(req.params.id || "");
    await requireMember(gid, uid);
    const body = String(req.body?.body || "").trim();
    if (!body || body.length > 1000) throw new HttpError(400, "Message must be 1 to 1000 characters.");
    const ts = nowIso();
    const rs = await db.execute({ sql: "INSERT INTO group_messages (group_id, sender_id, body, created_at) VALUES (?,?,?,?)", args: [gid, uid, body, ts] });
    const msgId = Number(rs.lastInsertRowid);
    await db.execute({ sql: "UPDATE group_members SET last_read_id = MAX(last_read_id, ?) WHERE group_id = ? AND user_id = ?", args: [msgId, gid, uid] });
    const row = (await run(`
      SELECT m.id, m.group_id, m.sender_id, m.body, m.created_at,
        p.username, p.display_name, p.avatar_url
      FROM group_messages m LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE m.id = ?`, [msgId]))[0];
    return { data: row, error: null };
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
