/* Extra server features, mounted from server.js:
   1) Unread messages
   2) Roles, bans, per-user restrictions, forced sign-out, role_since tenure
   3) Admin panel API (/api/admin/*) + /api/admin/announce + Video Generator 3000
   4) Sign-up accepted_terms
   5) Group chats with friend invites & acceptance
   6) Custom user stickers & comment replies
   7) Group Voice Calls, Group Watch, Shared Whiteboard
   8) Security hardening: 20-minute post-login posting cooldown & new-device login alerts */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { WebSocketServer } = require("ws");

const NOTIF_ID = "00000000-0000-0000-0000-000000000001";

module.exports = function mount({ app, server, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso, removeFromR2 }) {
  const SECRET = process.env.JWT_SECRET;
  const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  const TOS_VERSION = "2026-11-20";
  const RESTRICTIONS = ["post", "comment", "message"];
  const POST_COOLDOWN_MS = 20 * 60 * 1000;
  const safeArr = s => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };

  /* ---------- database setup (safe to run every start) ---------- */
  let ready = null;
  const ensure = () => ready || (ready = (async () => {
    const mcols = (await db.execute("PRAGMA table_info(messages)")).rows.map(r => r[1]);
    if (!mcols.includes("read_at")) {
      await db.execute("ALTER TABLE messages ADD COLUMN read_at TEXT");
      await db.execute("UPDATE messages SET read_at = created_at WHERE read_at IS NULL");
    }
    const ccols = (await db.execute("PRAGMA table_info(comments)")).rows.map(r => r[1]);
    if (!ccols.includes("parent_id")) {
      await db.execute("ALTER TABLE comments ADD COLUMN parent_id TEXT");
    }
    const ucols = (await db.execute("PRAGMA table_info(users)")).rows.map(r => r[1]);
    for (const [n, d] of [["role", "TEXT NOT NULL DEFAULT 'user'"], ["restrictions", "TEXT NOT NULL DEFAULT '[]'"], ["banned", "INTEGER NOT NULL DEFAULT 0"],
      ["ban_reason", "TEXT"], ["sessions_valid_after", "TEXT"], ["tos_accepted_at", "TEXT"], ["tos_version", "TEXT"], ["last_login_at", "TEXT"], ["role_since", "TEXT"]]) {
      if (!ucols.includes(n)) await db.execute(`ALTER TABLE users ADD COLUMN ${n} ${d}`);
    }
    await db.batch([
      "CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS group_chats (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, invited_by TEXT, created_at TEXT NOT NULL, last_read_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (group_id, user_id))",
      "CREATE TABLE IF NOT EXISTS group_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, sender_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS user_stickers (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS known_devices (user_id TEXT NOT NULL, device_id TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY (user_id, device_id))",
      "CREATE TABLE IF NOT EXISTS login_alerts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, user_agent TEXT NOT NULL, ip TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(user_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_gmsg_group ON group_messages(group_id, id)",
      "CREATE INDEX IF NOT EXISTS idx_ustk_created ON user_stickers(created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_alerts_user ON login_alerts(user_id, seen, created_at DESC)",
    ], "write");

    const ownerEmail = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    if (ownerEmail && !(await run("SELECT 1 FROM users WHERE role = 'owner'")).length) {
      await db.execute({ sql: "UPDATE users SET role = 'owner', role_since = COALESCE(role_since, created_at) WHERE email = ?", args: [ownerEmail] });
    }
    await db.execute("UPDATE users SET role_since = COALESCE(role_since, created_at) WHERE role IN ('owner','admin') AND role_since IS NULL");

    if (!(await run("SELECT 1 FROM profiles WHERE id = ?", [NOTIF_ID])).length) {
      const ts = nowIso();
      const lockedHash = "$2a$10$" + crypto.randomBytes(24).toString("hex");
      await db.batch([
        { sql: "INSERT OR IGNORE INTO users (id, email, encrypted_password, raw_user_meta_data, role, created_at) VALUES (?,?,?,?,?,?)", args: [NOTIF_ID, "notifications@webtok.system", lockedHash, JSON.stringify({ username: "notifications", display_name: "Notifications" }), "system", ts] },
        { sql: "INSERT OR IGNORE INTO profiles (id, username, display_name, bio, avatar_url, theme, created_at) VALUES (?,?,?,?,NULL,'{}',?)", args: [NOTIF_ID, "notifications", "Notifications", "Official Web Tok announcements", ts] }
      ], "write");
    }
  })().catch(e => { ready = null; throw e; }));
  ensure().catch(e => console.warn("extras setup:", e.message));

  /* ---------- who is this person right now? (cached for 20 seconds) ---------- */
  const cache = new Map();
  async function stateOf(uid) {
    const c = cache.get(uid);
    if (c && c.t > Date.now()) return c.s;
    const u = (await run("SELECT role, banned, ban_reason, restrictions, sessions_valid_after, last_login_at FROM users WHERE id = ?", [uid]))[0];
    const s = u ? {
      role: u.role, banned: !!u.banned, reason: u.ban_reason, restrictions: safeArr(u.restrictions),
      after: u.sessions_valid_after ? Date.parse(u.sessions_valid_after) : 0,
      lastLoginAt: u.last_login_at ? Date.parse(u.last_login_at) : 0
    } : null;
    cache.set(uid, { s, t: Date.now() + 20000 });
    return s;
  }
  const forget = uid => cache.delete(uid);
  app.locals.forgetUser = forget;

  function deviceFingerprint(req) {
    const ua = String(req.headers["user-agent"] || "Unknown device").slice(0, 180);
    const explicit = String(req.headers["x-wt-device"] || req.body?.deviceId || "").trim().slice(0, 64);
    const id = explicit || crypto.createHash("sha256").update(ua + "|" + String(req.ip || "")).digest("hex").slice(0, 24);
    return { id, ua, ip: String(req.ip || "").slice(0, 64) };
  }

  app.locals.recordLoginDevice = async (uid, req, isSignup = false) => {
    try {
      await ensure();
      const { id, ua, ip } = deviceFingerprint(req);
      const ts = nowIso();
      const existing = (await run("SELECT 1 FROM known_devices WHERE user_id = ? AND device_id = ?", [uid, id]))[0];
      if (existing) {
        await db.execute({ sql: "UPDATE known_devices SET last_seen = ? WHERE user_id = ? AND device_id = ?", args: [ts, uid, id] });
        return;
      }
      const prevCount = (await run("SELECT COUNT(*) n FROM known_devices WHERE user_id = ?", [uid]))[0].n;
      await db.execute({ sql: "INSERT INTO known_devices (user_id, device_id, first_seen, last_seen) VALUES (?,?,?,?)", args: [uid, id, ts, ts] });
      if (!isSignup && prevCount > 0) {
        await db.execute({ sql: "INSERT INTO login_alerts (id, user_id, device_id, user_agent, ip, seen, created_at) VALUES (?,?,?,?,?,0,?)", args: [crypto.randomUUID(), uid, id, ua, ip, ts] });
      }
    } catch (e) { console.warn("recordLoginDevice:", e.message); }
  };

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
      if (need === "post" && st.lastLoginAt) {
        const elapsed = Date.now() - st.lastLoginAt;
        if (elapsed >= 0 && elapsed < POST_COOLDOWN_MS) {
          const mins = Math.ceil((POST_COOLDOWN_MS - elapsed) / 60000);
          return deny(res, 403, `Security cooldown: you can post videos in ${mins} minute${mins === 1 ? "" : "s"} after signing in.`);
        }
      }
      next();
    } catch (e) { next(e); }
  });
  app.use("/api/auth/login", async (req, res, next) => {
    try {
      if (req.method !== "POST") return next();
      await ensure();
      const u = (await run("SELECT banned, ban_reason FROM users WHERE email = ?", [String(req.body?.email || "").trim().toLowerCase()]))[0];
      if (u && u.banned) return deny(res, 403, "This account has been suspended." + (u.ban_reason ? " Reason: " + u.ban_reason : ""));
      next();
    } catch (e) { next(e); }
  });
  app.use("/api/auth/signup", (req, res, next) => {
    if (req.method !== "POST") return next();
    if (!(req.body && req.body.data && req.body.data.accepted_terms === true)) return deny(res, 400, "You must accept the Terms of Service and Privacy Policy.");
    const email = String(req.body.email || "").trim().toLowerCase();
    res.on("finish", () => {
      if (res.statusCode === 200) db.execute({ sql: "UPDATE users SET tos_accepted_at = ?, tos_version = ? WHERE email = ?", args: [nowIso(), TOS_VERSION, email] }).catch(() => {});
    });
    next();
  });

  /* ---------- public profile role badge ---------- */
  app.get("/api/profiles/:id/badge", wrap(async req => {
    const id = String(req.params.id || "");
    const u = (await run("SELECT role, role_since, created_at FROM users WHERE id = ?", [id]))[0];
    if (!u || !["owner", "admin"].includes(u.role)) return { data: { role: "user", role_since: null }, error: null };
    return { data: { role: u.role, role_since: u.role_since || u.created_at || null }, error: null };
  }));

  /* ---------- security alerts API ---------- */
  app.get("/api/security/alerts", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const alerts = await run("SELECT id, user_agent, created_at FROM login_alerts WHERE user_id = ? AND seen = 0 ORDER BY created_at DESC LIMIT 10", [uid]);
    return { data: alerts, error: null };
  }));
  app.post("/api/security/alerts/ack", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await db.execute({ sql: "UPDATE login_alerts SET seen = 1 WHERE user_id = ? AND seen = 0", args: [uid] });
    return { data: true, error: null };
  }));
  app.post("/api/security/logout-all", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await db.execute({ sql: "UPDATE users SET sessions_valid_after = ? WHERE id = ?", args: [nowIso(), uid] });
    await db.execute({ sql: "UPDATE login_alerts SET seen = 1 WHERE user_id = ?", args: [uid] });
    forget(uid);
    return { data: true, error: null };
  }));

  /* ---------- pages ---------- */
  const page = f => (_q, res) => res.sendFile(path.join(__dirname, "..", "public", "pages", f));
  app.get("/admin", page("admin.html"));
  app.get("/terms", page("terms.html"));
  app.get("/privacy", page("privacy.html"));

  /* ---------- custom + built-in stickers ---------- */
  app.get("/api/stickers", async (_req, res) => {
    try {
      await ensure();
      const builtIn = await new Promise(resolve => {
        fs.readdir(path.join(__dirname, "..", "public", "stickers"), (err, files) => {
          resolve(err ? [] : files.filter(f => /\.(png|gif|webp|jpe?g|svg|json)$/i.test(f)).sort());
        });
      });
      const custom = await run("SELECT id, user_id, name, url, created_at FROM user_stickers ORDER BY created_at DESC LIMIT 100");
      res.set("Cache-Control", "no-store").json([
        ...custom.map(c => ({ id: c.id, user_id: c.user_id, name: c.name, url: c.url, custom: true })),
        ...builtIn
      ]);
    } catch {
      res.set("Cache-Control", "no-store").json([]);
    }
  });
  app.post("/api/stickers", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const name = String(req.body?.name || "Sticker").trim().slice(0, 30) || "Sticker";
    const url = String(req.body?.url || "").trim();
    if (!url || (R2_PUBLIC_URL && !url.startsWith(R2_PUBLIC_URL + "/avatars/")) || (!R2_PUBLIC_URL && !/^https?:\/\//i.test(url))) {
      throw new HttpError(400, "Invalid sticker URL.");
    }
    const id = crypto.randomUUID(), ts = nowIso();
    await db.execute({ sql: "INSERT INTO user_stickers (id, user_id, name, url, created_at) VALUES (?,?,?,?,?)", args: [id, uid, name, url, ts] });
    return { data: { id, user_id: uid, name, url, custom: true, created_at: ts }, error: null };
  }));
  app.delete("/api/stickers/:id", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const id = String(req.params.id || "");
    await db.execute({ sql: "DELETE FROM user_stickers WHERE id = ? AND user_id = ?", args: [id, uid] });
    return { data: true, error: null };
  }));

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

  /* ---------- Group Call / Watch / Whiteboard rooms (WebSocket) ---------- */
  const rooms = new Map();
  function getRoom(gid) {
    let r = rooms.get(gid);
    if (!r) {
      r = { peers: new Map(), activity: "none", watch: { video: null, playing: false, time: 0, updatedAt: Date.now() }, strokes: [] };
      rooms.set(gid, r);
    }
    return r;
  }
  function sendWs(ws, obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }
  function broadcastRoom(gid, obj, exceptUid = null) {
    const r = rooms.get(gid); if (!r) return;
    for (const [puid, p] of r.peers) {
      if (puid !== exceptUid) sendWs(p.ws, obj);
    }
  }
  function roomSnapshot(gid) {
    const r = rooms.get(gid);
    if (!r) return { participants: [], activity: "none", watch: { video: null, playing: false, time: 0 } };
    const participants = [...r.peers.values()].map(p => ({ uid: p.uid, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, muted: !!p.muted }));
    return { participants, activity: r.activity, watch: r.watch };
  }

  if (server) {
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", async (ws, req) => {
      let uid = null, currentGroup = null;
      try {
        const u = new URL(req.url, "http://localhost");
        const tok = jwt.verify(u.searchParams.get("token") || "", SECRET);
        if (!tok || tok.t !== "a") { ws.close(); return; }
        const st = await stateOf(tok.sub);
        if (!st || st.banned || tok.iat < Math.floor(st.after / 1000)) { ws.close(); return; }
        uid = tok.sub;
      } catch { ws.close(); return; }

      const prof = (await run("SELECT id, username, display_name, avatar_url FROM profiles WHERE id = ?", [uid]))[0] || { id: uid, username: "user", display_name: "User", avatar_url: null };

      ws.on("message", async raw => {
        let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
        const type = msg.type;
        if (type === "join-call") {
          const gid = String(msg.groupId || "");
          try { await requireMember(gid, uid); } catch { sendWs(ws, { type: "error", message: "Not a member" }); return; }
          if (currentGroup && currentGroup !== gid) {
            const oldR = rooms.get(currentGroup);
            if (oldR) { oldR.peers.delete(uid); broadcastRoom(currentGroup, { type: "call-state", ...roomSnapshot(currentGroup) }); if (!oldR.peers.size) rooms.delete(currentGroup); }
          }
          currentGroup = gid;
          const r = getRoom(gid);
          const existing = [...r.peers.keys()].filter(k => k !== uid);
          r.peers.set(uid, { ws, uid, username: prof.username, display_name: prof.display_name, avatar_url: prof.avatar_url, muted: false });
          sendWs(ws, { type: "joined", groupId: gid, existingPeers: existing, ...roomSnapshot(gid), strokes: r.strokes });
          broadcastRoom(gid, { type: "call-state", ...roomSnapshot(gid) });
          return;
        }
        if (!currentGroup) return;
        const r = rooms.get(currentGroup); if (!r || !r.peers.has(uid)) return;

        if (type === "leave-call") {
          r.peers.delete(uid);
          broadcastRoom(currentGroup, { type: "call-state", ...roomSnapshot(currentGroup) });
          if (!r.peers.size) rooms.delete(currentGroup);
          currentGroup = null;
        } else if (type === "mute") {
          const p = r.peers.get(uid); if (p) p.muted = !!msg.muted;
          broadcastRoom(currentGroup, { type: "call-state", ...roomSnapshot(currentGroup) });
        } else if (type === "rtc-offer" || type === "rtc-answer" || type === "rtc-ice") {
          const target = r.peers.get(String(msg.to || ""));
          if (target) sendWs(target.ws, { ...msg, from: uid });
        } else if (type === "set-activity") {
          r.activity = ["none", "watch", "whiteboard"].includes(msg.activity) ? msg.activity : "none";
          broadcastRoom(currentGroup, { type: "activity", activity: r.activity, by: prof.username });
        } else if (type === "watch-sync") {
          r.activity = "watch";
          r.watch = { video: msg.video || r.watch.video, playing: !!msg.playing, time: Number(msg.time) || 0, updatedAt: Date.now() };
          broadcastRoom(currentGroup, { type: "watch-sync", ...r.watch, by: prof.username }, uid);
        } else if (type === "watch-react") {
          broadcastRoom(currentGroup, { type: "watch-react", icon: String(msg.icon || ""), stickerUrl: msg.stickerUrl || null, by: prof.display_name || prof.username });
        } else if (type === "wb-stroke") {
          r.activity = "whiteboard";
          const st = { x0: Number(msg.x0), y0: Number(msg.y0), x1: Number(msg.x1), y1: Number(msg.y1), color: String(msg.color || "#6750a4").slice(0, 20), size: Math.min(Math.max(Number(msg.size) || 4, 1), 32) };
          r.strokes.push(st);
          if (r.strokes.length > 800) r.strokes.shift();
          broadcastRoom(currentGroup, { type: "wb-stroke", ...st }, uid);
        } else if (type === "wb-clear") {
          r.strokes = [];
          broadcastRoom(currentGroup, { type: "wb-clear" });
        }
      });

      ws.on("close", () => {
        if (currentGroup) {
          const r = rooms.get(currentGroup);
          if (r) {
            r.peers.delete(uid);
            broadcastRoom(currentGroup, { type: "call-state", ...roomSnapshot(currentGroup) });
            if (!r.peers.size) rooms.delete(currentGroup);
          }
        }
      });
    });
  }

  app.get("/api/groups/:id/call", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    await requireMember(gid, uid);
    return { data: roomSnapshot(gid), error: null };
  }));

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
      g.call_count = rooms.get(g.id)?.peers.size || 0;
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

  /* ---------- Video Generator 3000 (admin-controlled Python worker) ---------- */
  let vgProc = null;
  let vgLogs = [];
  let vgMax = 0;
  let vgStartedAt = null;
  const pushVgLog = line => {
    const s = String(line || "").trim();
    if (!s) return;
    vgLogs.push(s);
    if (vgLogs.length > 80) vgLogs.shift();
  };

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
  const mayAct = (me, t) => { if (t.role === "owner" || t.role === "system" || t.id === me.uid) throw new HttpError(403, "You can't change this account"); if (me.role !== "owner" && t.role !== "user") throw new HttpError(403, "Only the owner can change admins"); };
  const label = t => `@${t.username || "?"} (${t.email})`;
  const makePassword = () => {
    const pick = s => s[crypto.randomInt(s.length)];
    const sets = ["abcdefghjkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?"], all = sets.join("");
    const c = [...sets.map(pick), ...Array.from({ length: 10 }, () => pick(all))];
    for (let i = c.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
    return c.join("");
  };

  app.get("/api/admin/vg3000", wrap(async req => {
    needAdmin(req);
    const usersPath = path.join(__dirname, "..", "tools", "users.txt");
    let usersText = "";
    try { usersText = fs.readFileSync(usersPath, "utf8"); } catch {}
    return { data: { running: !!vgProc, maxVideos: vgMax, startedAt: vgStartedAt, logs: vgLogs.slice(-30), usersText }, error: null };
  }));
  app.post("/api/admin/vg3000/start", wrap(async req => {
    const me = needAdmin(req);
    if (vgProc) return { data: { running: true, logs: vgLogs.slice(-30) }, error: null };
    const maxVideos = Math.max(0, Math.min(parseInt(req.body?.maxVideos, 10) || 0, 500));
    if (typeof req.body?.usersText === "string" && req.body.usersText.trim()) {
      fs.writeFileSync(path.join(__dirname, "..", "tools", "users.txt"), req.body.usersText.slice(0, 20000), "utf8");
    }
    const bot = (await run("SELECT id, email FROM users WHERE email = 'python@code.com' LIMIT 1"))[0]
      || (await run("SELECT u.id, u.email FROM users u JOIN profiles p ON p.id = u.id WHERE p.username = 'pythonuploader' LIMIT 1"))[0]
      || (await run("SELECT id, email FROM users WHERE id = ?", [me.uid]))[0];
    const botToken = jwt.sign({ sub: bot.id, email: bot.email, t: "a" }, SECRET, { expiresIn: "12h" });
    const port = process.env.PORT || 3000;

    vgLogs = [];
    vgMax = maxVideos;
    vgStartedAt = nowIso();
    const py = spawn("python3", [path.join(__dirname, "..", "tools", "video_generator.py")], {
      env: { ...process.env, WT_URL: `http://127.0.0.1:${port}`, WT_BOT_TOKEN: botToken, WT_BOT_UID: bot.id, WT_MAX_VIDEOS: String(maxVideos) }
    });
    vgProc = py;
    py.stdout.on("data", d => String(d).split(/\r?\n/).forEach(pushVgLog));
    py.stderr.on("data", d => String(d).split(/\r?\n/).forEach(pushVgLog));
    py.on("close", code => { pushVgLog(`[vg3000] Exited with code ${code}`); vgProc = null; });
    await log(me, "vg3000_start", `max=${maxVideos}`);
    return { data: { running: true }, error: null };
  }));
  app.post("/api/admin/vg3000/stop", wrap(async req => {
    const me = needAdmin(req);
    if (vgProc) { vgProc.kill("SIGTERM"); pushVgLog("[vg3000] Stop requested by admin."); }
    await log(me, "vg3000_stop", "");
    return { data: { running: !!vgProc }, error: null };
  }));

  app.post("/api/admin/announce", wrap(async req => {
    const me = needAdmin(req);
    const message = String(req.body?.message || "").trim();
    if (!message || message.length > 1000) throw new HttpError(400, "Announcement must be 1 to 1000 characters.");
    const recipients = await run("SELECT id FROM users WHERE id != ? AND banned = 0 AND role != 'system'", [NOTIF_ID]);
    const ts = nowIso();
    const stmts = recipients.map(r => ({
      sql: "INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?,?,?,?)",
      args: [NOTIF_ID, r.id, message, ts]
    }));
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50), "write");
    }
    await log(me, "announce", `Sent to ${recipients.length} user(s): ${message.slice(0, 80)}`);
    return { data: { sentCount: recipients.length }, error: null };
  }));

  app.get("/api/admin/me", wrap(async req => {
    if (!req.wt) throw new HttpError(401, "Sign in required");
    return { data: { role: req.wt.role }, error: null };
  }));
  app.get("/api/admin/users", wrap(async req => {
    needAdmin(req);
    const q = String(req.query.q || "").trim().slice(0, 60), like = `%${q}%`;
    const rows = await run(`SELECT u.id, u.email, u.role, u.banned, u.ban_reason, u.restrictions, u.created_at, u.tos_accepted_at, p.username, p.display_name
      FROM users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.role != 'system' ${q ? "AND (u.email LIKE ? OR p.username LIKE ? OR p.display_name LIKE ?)" : ""} ORDER BY u.created_at DESC LIMIT 60`, q ? [like, like, like] : []);
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
    await db.execute({ sql: "UPDATE users SET role = ?, role_since = ? WHERE id = ?", args: [role, role === "admin" ? nowIso() : null, t.id] });
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
