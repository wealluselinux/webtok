/* Extra server features, mounted from server.js:
   1) Unread messages
   2) Roles, bans, per-user restrictions, forced sign-out, role_since tenure
   3) Admin panel API (/api/admin/*) + /api/admin/announce + owner-only account deletion
   4) Sign-up accepted_terms
   5) Group chats with friend invites, acceptance, owner kick & delete
   6) Custom user stickers & comment replies
   7) Group & DM Voice Calls (WebRTC signaling), Group Watch, Shared Whiteboard
   8) Security hardening: new-device login alerts
   9) 24-hour Stories (/api/stories) & User-uploaded Sounds (/api/sounds, /sounds)
   10) Account credentials update & Web Tok AI / Content Safety Checker (routes/ai.js)
   11) Support Ticket System (/support, /api/support/*, /api/admin/support/*) */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { WebSocketServer } = require("ws");

const NOTIF_ID = "00000000-0000-0000-0000-000000000001";
const AI_ID = "00000000-0000-0000-0000-000000000002";

module.exports = function mount({ app, server, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso, removeFromR2 }) {
  const SECRET = process.env.JWT_SECRET;
  const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  const TOS_VERSION = "2026-11-20";
  const RESTRICTIONS = ["post", "comment", "message"];
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
    const tcols = (await db.execute("PRAGMA table_info(support_tickets)")).rows.map(r => r[1]);
    if (tcols.length && !tcols.includes("contact_email")) {
      await db.execute("ALTER TABLE support_tickets ADD COLUMN contact_email TEXT");
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
      "CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, media_url TEXT NOT NULL, media_type TEXT NOT NULL, caption TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS sounds (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, audio_url TEXT NOT NULL, storage_path TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS video_sounds (video_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sound_id TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS support_replies (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, user_id TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS email_verifications (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(user_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_gmsg_group ON group_messages(group_id, id)",
      "CREATE INDEX IF NOT EXISTS idx_ustk_created ON user_stickers(created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_alerts_user ON login_alerts(user_id, seen, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_stories_exp ON stories(expires_at, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_sounds_created ON sounds(created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_vsnd_user ON video_sounds(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id, updated_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_ticket_replies ON support_replies(ticket_id, id)",
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
    const u = (await run("SELECT role, banned, ban_reason, restrictions, sessions_valid_after FROM users WHERE id = ?", [uid]))[0];
    const s = u ? {
      role: u.role, banned: !!u.banned, reason: u.ban_reason, restrictions: safeArr(u.restrictions),
      after: u.sessions_valid_after ? Date.parse(u.sessions_valid_after) : 0
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
      let isNewDevice = false;
      if (existing) {
        await db.execute({ sql: "UPDATE known_devices SET last_seen = ? WHERE user_id = ? AND device_id = ?", args: [ts, uid, id] });
      } else {
        const prevCount = (await run("SELECT COUNT(*) n FROM known_devices WHERE user_id = ?", [uid]))[0].n;
        await db.execute({ sql: "INSERT INTO known_devices (user_id, device_id, first_seen, last_seen) VALUES (?,?,?,?)", args: [uid, id, ts, ts] });
        if (!isSignup && prevCount > 0) {
          isNewDevice = true;
          await db.execute({ sql: "INSERT INTO login_alerts (id, user_id, device_id, user_agent, ip, seen, created_at) VALUES (?,?,?,?,?,0,?)", args: [crypto.randomUUID(), uid, id, ua, ip, ts] });
        }
      }
      if (!isSignup && app.locals.sendMail) {
        const uRow = (await run("SELECT u.email, p.username FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?", [uid]))[0];
        if (uRow?.email) {
          const baseUrl = (process.env.RENDER_EXTERNAL_URL || "https://webtok.onrender.com").replace(/\/+$/, "");
          const html = app.locals.buildEmailHtml ? app.locals.buildEmailHtml({
            title: isNewDevice ? "New Device Sign-In" : "New Sign-In",
            bannerBg: "#d0bcff",
            bannerFg: "#1d192b",
            greeting: `Hi @${uRow.username || "user"}!`,
            intro: "Someone just signed into your Web Tok account. Here are the sign-in details:",
            details: [
              ["Time", new Date(ts).toUTCString()],
              ["Device", ua],
              ["IP", ip || "Unknown"]
            ],
            noteText: "If this was you, you can safely ignore this email. If you didn't sign in, sign out all devices and",
            ctaLabel: "Open Web Tok",
            ctaUrl: `${baseUrl}/profile`
          }) : undefined;
          app.locals.sendMail({
            to: uRow.email,
            subject: isNewDevice ? "New device sign-in to your Web Tok account" : "New sign-in to your Web Tok account",
            text: [
              `Hi @${uRow.username || "user"},`,
              ``,
              `Someone just signed into your Web Tok account.`,
              `Time: ${new Date(ts).toUTCString()}`,
              `Device: ${ua}`,
              `IP: ${ip || "Unknown"}`,
              ``,
              `If this was you, you can ignore this email. If not, open Web Tok and sign out all devices or change your password right away.`,
              ``,
              `— Web Tok Security`
            ].join("\n"),
            html
          }).catch(e => console.warn("Login alert email error:", e.message));
        }
      }
    } catch (e) { console.warn("recordLoginDevice:", e.message); }
  };

  /* ---------- Email verification codes (Password Reset & Sensitive Account Changes) ---------- */
  const verifHash = (key, code) => crypto.createHash("sha256").update(`${key}:${code}`).digest("hex");

  async function issueCode(key, toEmail, { title, intro, subjectPrefix }) {
    if (!app.locals.isMailerConfigured || !app.locals.isMailerConfigured() || !app.locals.sendMail) {
      throw new HttpError(503, "Email service is not configured right now. Please submit a support ticket instead.");
    }
    const code = String(crypto.randomInt(100000, 1000000));
    const ts = nowIso();
    const exp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await db.execute({
      sql: `INSERT INTO email_verifications (email, code_hash, expires_at, attempts, created_at) VALUES (?,?,?,0,?)
            ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, created_at=excluded.created_at`,
      args: [key, verifHash(key, code), exp, ts]
    });
    const html = app.locals.buildEmailHtml ? app.locals.buildEmailHtml({
      title,
      bannerBg: "#d0bcff",
      bannerFg: "#1d192b",
      greeting: "Hi there!",
      intro,
      pillText: code,
      noteText: "For your protection, never share this code with anyone. It expires in 15 minutes. If you didn't request this code, please"
    }) : undefined;
    await app.locals.sendMail({
      to: toEmail,
      subject: `${subjectPrefix} ${code}`,
      text: `${subjectPrefix} ${code}\n\nThis code expires in 15 minutes. For your protection, never share this code with anyone.\n\n— The Web Tok Team`,
      html
    });
  }

  async function verifyCode(key, code) {
    if (!/^\d{6}$/.test(String(code || "").trim())) throw new HttpError(400, "Enter the 6-digit verification code.");
    const row = (await run("SELECT * FROM email_verifications WHERE email = ?", [key]))[0];
    if (!row) throw new HttpError(400, "Please request a verification code first.");
    if (Date.parse(row.expires_at) < Date.now()) {
      await db.execute({ sql: "DELETE FROM email_verifications WHERE email = ?", args: [key] });
      throw new HttpError(400, "Verification code expired. Request a new code.");
    }
    if (row.attempts >= 5) throw new HttpError(429, "Too many wrong codes. Request a new verification code.");
    if (row.code_hash !== verifHash(key, String(code).trim())) {
      await db.execute({ sql: "UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?", args: [key] });
      throw new HttpError(400, "Incorrect verification code.");
    }
    await db.execute({ sql: "DELETE FROM email_verifications WHERE email = ?", args: [key] });
  }

  app.post("/api/auth/forgot/send-code", limit(6, 600000), wrap(async req => {
    await ensure();
    const em = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 120) throw new HttpError(400, "Enter a valid email.");
    const u = (await run("SELECT id, banned, role FROM users WHERE email = ?", [em]))[0];
    if (!u || u.role === "system") throw new HttpError(404, "No account found with that email. Need help? Submit a support ticket.");
    if (u.banned) throw new HttpError(403, "This account has been suspended.");
    await issueCode(`reset:${em}`, em, {
      title: "Password Reset Code",
      intro: "To reset your Web Tok password, enter the following verification code:",
      subjectPrefix: "Your Web Tok password reset code is"
    });
    return { data: { sent: true }, error: null };
  }));

  app.post("/api/auth/forgot/reset", limit(10, 600000), wrap(async req => {
    await ensure();
    const em = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const newPw = String(req.body?.new_password || "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new HttpError(400, "Enter a valid email.");
    if (weakPassword(newPw)) throw new HttpError(400, "Password needs 10+ characters with upper and lower case, a number and a symbol.");
    const u = (await run("SELECT id, banned, role FROM users WHERE email = ?", [em]))[0];
    if (!u || u.role === "system") throw new HttpError(404, "No account found with that email.");
    if (u.banned) throw new HttpError(403, "This account has been suspended.");
    await verifyCode(`reset:${em}`, code);
    await db.execute({ sql: "UPDATE users SET encrypted_password = ?, sessions_valid_after = ? WHERE id = ?", args: [await bcrypt.hash(newPw, 10), nowIso(), u.id] });
    forget(u.id);
    return { data: true, error: null };
  }));

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
      if (req.path !== "/presence/offline") touchPresence(tok.sub);
      const body = req.body || {};
      let need = null;
      if (req.method === "POST" && req.path === "/db" && (body.op === "insert" || body.op === "upsert")) need = { comments: "comment", messages: "message", videos: "post" }[body.table] || null;
      if (req.method === "POST" && req.path === "/storage/presign" && body.bucket === "videos") need = "post";
      if (need && st.restrictions.includes(need)) return deny(res, 403, `You aren't allowed to ${need === "post" ? "post videos" : need === "comment" ? "comment" : "send messages"} right now.`);
      if (req.method === "POST" && req.path === "/db" && body.table === "videos" && body.op === "insert" && app.locals.checkMediaSafety) {
        const text = `${body.data?.title || ""} ${(Array.isArray(body.data?.hashtags) ? body.data.hashtags.join(" ") : "")}`.trim();
        const chk = await app.locals.checkMediaSafety({ text });
        if (!chk.safe) return deny(res, 403, `Upload blocked by safety filter: ${chk.reason}`);
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

  require("./ai")({ app, db, run, wrap, uidFrom, HttpError, nowIso, removeFromR2 });

  /* ---------- public profile role badge (no sensitive fields) ---------- */
  app.get("/api/profiles/:id/badge", wrap(async req => {
    const id = String(req.params.id || "");
    const u = (await run("SELECT role, role_since, created_at FROM users WHERE id = ?", [id]))[0];
    if (!u || !["owner", "admin"].includes(u.role)) return { data: { role: "user", role_since: null }, error: null };
    return { data: { role: u.role, role_since: u.role_since || u.created_at || null }, error: null };
  }));

  /* ---------- account credentials & verification ---------- */
  app.get("/api/account/theme", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const row = (await run("SELECT theme FROM profiles WHERE id = ?", [uid]))[0];
    let theme = {};
    try { theme = JSON.parse(row?.theme || "{}"); } catch {}
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) theme = {};
    return { data: theme, error: null };
  }));

  app.post("/api/account/theme", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const row = (await run("SELECT theme FROM profiles WHERE id = ?", [uid]))[0];
    if (!row) throw new HttpError(404, "Profile not found");
    let cur = {};
    try { cur = JSON.parse(row.theme || "{}"); } catch {}
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) cur = {};
    const patch = (req.body && typeof req.body === "object" && !Array.isArray(req.body)) ? req.body : {};
    const merged = { ...cur, ...patch };
    const serialized = JSON.stringify(merged);
    if (serialized.length > 32000) throw new HttpError(400, "Theme settings payload too large.");
    await db.execute({ sql: "UPDATE profiles SET theme = ? WHERE id = ?", args: [serialized, uid] });
    return { data: merged, error: null };
  }));

  app.get("/api/account/me", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const u = (await run("SELECT u.id, u.email, p.username, p.display_name FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?", [uid]))[0];
    if (!u) throw new HttpError(404, "Account not found");
    return { data: { id: u.id, email: u.email, username: u.username || "", display_name: u.display_name || "" }, error: null };
  }));

  app.post("/api/account/send-verification", limit(6, 600000), wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const u = (await run("SELECT id, email FROM users WHERE id = ?", [uid]))[0];
    if (!u || !u.email) throw new HttpError(404, "Account email not found");
    await issueCode(`acct:${uid}:${u.email}`, u.email, {
      title: "Security Verification Code",
      intro: "To verify changes to your Web Tok account settings, enter the following verification code:",
      subjectPrefix: "Your Web Tok security code is"
    });
    return { data: { sent: true }, error: null };
  }));

  app.post("/api/account/credentials", limit(15, 600000), wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const u = (await run("SELECT id, email, encrypted_password, raw_user_meta_data FROM users WHERE id = ?", [uid]))[0];
    const p = (await run("SELECT username, display_name FROM profiles WHERE id = ?", [uid]))[0];
    if (!u) throw new HttpError(404, "Account not found");

    const nextDisplay = req.body?.display_name !== undefined ? String(req.body.display_name).trim().slice(0, 40) : (p?.display_name || "");
    const nextUser = req.body?.username !== undefined ? String(req.body.username).trim().toLowerCase() : (p?.username || "");
    const nextEmail = req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : u.email;
    const newPw = req.body?.new_password ? String(req.body.new_password) : "";
    const curPw = req.body?.current_password ? String(req.body.current_password) : "";
    const vCode = req.body?.verification_code ? String(req.body.verification_code).trim() : "";

    if (!/^[a-z0-9_.]{3,20}$/.test(nextUser)) throw new HttpError(400, "Username must be 3 to 20 characters (letters, numbers, _ or .).");
    if (nextUser !== (p?.username || "").toLowerCase()) {
      const taken = await run("SELECT 1 FROM profiles WHERE lower(username) = ? AND id != ?", [nextUser, uid]);
      if (taken.length) throw new HttpError(409, "That username is already taken.");
    }

    const emailChanged = nextEmail !== u.email;
    const pwChanged = newPw.length > 0;
    if (emailChanged || pwChanged) {
      if (curPw) {
        const ok = await bcrypt.compare(curPw, u.encrypted_password);
        if (!ok) throw new HttpError(403, "Current password is incorrect.");
      } else if (vCode) {
        await verifyCode(`acct:${uid}:${u.email}`, vCode);
      } else {
        throw new HttpError(403, "Enter your current password or a 6-digit verification code sent to your email.");
      }
    }

    if (emailChanged) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail) || nextEmail.length > 120) throw new HttpError(400, "Enter a valid email.");
      const emailTaken = await run("SELECT 1 FROM users WHERE email = ? AND id != ?", [nextEmail, uid]);
      if (emailTaken.length) throw new HttpError(409, "That email is already registered.");
    }
    if (pwChanged && weakPassword(newPw)) {
      throw new HttpError(400, "Password needs 10+ characters with upper and lower case, a number and a symbol.");
    }

    let meta = {};
    try { meta = JSON.parse(u.raw_user_meta_data || "{}"); } catch {}
    meta.username = nextUser;
    meta.display_name = nextDisplay;

    const stmts = [
      { sql: "UPDATE profiles SET username = ?, display_name = ? WHERE id = ?", args: [nextUser, nextDisplay || null, uid] }
    ];
    if (pwChanged) {
      stmts.push({
        sql: "UPDATE users SET email = ?, encrypted_password = ?, raw_user_meta_data = ? WHERE id = ?",
        args: [nextEmail, await bcrypt.hash(newPw, 10), JSON.stringify(meta), uid]
      });
    } else {
      stmts.push({
        sql: "UPDATE users SET email = ?, raw_user_meta_data = ? WHERE id = ?",
        args: [nextEmail, JSON.stringify(meta), uid]
      });
    }
    await db.batch(stmts, "write");
    forget(uid);
    return { data: { email: nextEmail, username: nextUser, display_name: nextDisplay }, error: null };
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
  app.get("/sounds", page("sounds.html"));
  app.get("/support", page("support.html"));
  app.get("/forgot", page("forgot.html"));

  /* ---------- 24-hour Stories ---------- */
  app.get("/api/stories", wrap(async () => {
    const now = nowIso();
    const rows = await run(`
      SELECT s.id, s.user_id, s.media_url, s.media_type, s.caption, s.created_at, s.expires_at,
        p.username, p.display_name, p.avatar_url
      FROM stories s LEFT JOIN profiles p ON p.id = s.user_id
      WHERE s.expires_at > ? ORDER BY s.created_at DESC LIMIT 100`, [now]);
    return { data: rows, error: null };
  }));
  app.post("/api/stories", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    if (req.wt?.restrictions?.includes("post")) throw new HttpError(403, "You aren't allowed to post right now.");
    const media_url = String(req.body?.media_url || "").trim();
    const media_type = req.body?.media_type === "video" ? "video" : "image";
    const caption = String(req.body?.caption || "").trim().slice(0, 140);
    if (!media_url || (R2_PUBLIC_URL && !media_url.startsWith(R2_PUBLIC_URL + "/"))) throw new HttpError(400, "Invalid story media URL");
    const id = crypto.randomUUID(), ts = nowIso(), exp = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await db.execute({ sql: "INSERT INTO stories (id, user_id, media_url, media_type, caption, created_at, expires_at) VALUES (?,?,?,?,?,?,?)", args: [id, uid, media_url, media_type, caption, ts, exp] });
    return { data: { id, user_id: uid, media_url, media_type, caption, created_at: ts, expires_at: exp }, error: null };
  }));
  app.delete("/api/stories/:id", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await db.execute({ sql: "DELETE FROM stories WHERE id = ? AND user_id = ?", args: [String(req.params.id || ""), uid] });
    return { data: true, error: null };
  }));

  /* ---------- Sounds (upload & browse) ---------- */
  app.get("/api/sounds", wrap(async () => {
    const rows = await run(`
      SELECT s.id, s.user_id, s.title, s.artist, s.audio_url, s.created_at,
        p.username, p.display_name
      FROM sounds s LEFT JOIN profiles p ON p.id = s.user_id
      ORDER BY s.created_at DESC LIMIT 100`);
    return { data: rows, error: null };
  }));
  app.post("/api/sounds", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const title = String(req.body?.title || "").trim().slice(0, 60);
    const artist = String(req.body?.artist || "").trim().slice(0, 40) || "Original sound";
    const storage_path = String(req.body?.storage_path || "").trim();
    if (!title) throw new HttpError(400, "Enter a sound title.");
    if (!storage_path.startsWith(uid + "/") || /\.\./.test(storage_path)) throw new HttpError(400, "Invalid storage path.");
    const audio_url = `${R2_PUBLIC_URL}/sounds/${storage_path}`;
    const id = crypto.randomUUID(), ts = nowIso();
    await db.execute({ sql: "INSERT INTO sounds (id, user_id, title, artist, audio_url, storage_path, created_at) VALUES (?,?,?,?,?,?,?)", args: [id, uid, title, artist, audio_url, storage_path, ts] });
    return { data: { id, user_id: uid, title, artist, audio_url, created_at: ts }, error: null };
  }));
  app.delete("/api/sounds/:id", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const sid = String(req.params.id || "");
    const s = (await run("SELECT storage_path FROM sounds WHERE id = ? AND user_id = ?", [sid, uid]))[0];
    if (s) {
      await db.batch([
        { sql: "DELETE FROM video_sounds WHERE sound_id = ?", args: [sid] },
        { sql: "DELETE FROM sounds WHERE id = ? AND user_id = ?", args: [sid, uid] }
      ], "write");
      if (s.storage_path && removeFromR2) await removeFromR2([`sounds/${s.storage_path}`]);
    }
    return { data: true, error: null };
  }));

  app.get("/api/video-sounds", wrap(async req => {
    const ids = String(req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);
    if (!ids.length) return { data: {}, error: null };
    const ph = ids.map(() => "?").join(",");
    const rows = await run(`
      SELECT vs.video_id, s.id, s.title, s.artist, s.audio_url, p.username, p.display_name
      FROM video_sounds vs
      JOIN sounds s ON s.id = vs.sound_id
      LEFT JOIN profiles p ON p.id = s.user_id
      WHERE vs.video_id IN (${ph})`, ids);
    const out = {};
    rows.forEach(r => {
      out[r.video_id] = { id: r.id, title: r.title, artist: r.artist, audio_url: r.audio_url, username: r.username || null, display_name: r.display_name || null };
    });
    return { data: out, error: null };
  }));

  app.post("/api/video-sounds", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const videoId = String(req.body?.videoId || "").trim();
    const soundId = req.body?.soundId ? String(req.body.soundId).trim() : null;
    if (!videoId) throw new HttpError(400, "Missing video.");
    const v = (await run("SELECT 1 FROM videos WHERE id = ? AND user_id = ?", [videoId, uid]))[0];
    if (!v) throw new HttpError(403, "You can only attach sounds to your own videos.");
    if (!soundId) {
      await db.execute({ sql: "DELETE FROM video_sounds WHERE video_id = ? AND user_id = ?", args: [videoId, uid] });
      return { data: { videoId, soundId: null }, error: null };
    }
    const s = (await run("SELECT id, title, artist, audio_url FROM sounds WHERE id = ?", [soundId]))[0];
    if (!s) throw new HttpError(404, "Selected sound not found.");
    await db.execute({
      sql: "INSERT INTO video_sounds (video_id, user_id, sound_id, created_at) VALUES (?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET sound_id=excluded.sound_id, created_at=excluded.created_at",
      args: [videoId, uid, soundId, nowIso()]
    });
    return { data: { videoId, soundId, sound: s }, error: null };
  }));

  /* ---------- custom + built-in stickers (with AI safety check) ---------- */
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
    if (app.locals.checkMediaSafety) {
      const chk = await app.locals.checkMediaSafety({ text: name, imageUrl: url });
      if (!chk.safe) {
        if (R2_PUBLIC_URL && removeFromR2) {
          const k = url.replace(R2_PUBLIC_URL + "/", "").split("?")[0];
          if (k.startsWith(`avatars/${uid}/`)) await removeFromR2([k]).catch(() => {});
        }
        throw new HttpError(403, `Sticker blocked by safety filter: ${chk.reason}`);
      }
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

  /* ---------- unread messages & clear chat ---------- */
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
    const rs = await db.execute({ sql: "UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL", args: [nowIso(), uid, from] });
    if (rs.rowsAffected > 0) {
      const row = (await run("SELECT MAX(id) AS last_read_id FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NOT NULL", [from, uid]))[0];
      const lastReadId = Number(row?.last_read_id || 0);
      const socks = userSockets.get(from);
      if (socks) {
        for (const sws of socks) sendWs(sws, { type: "dm-read", by: uid, lastReadId });
      }
    }
    return { data: true, error: null };
  }));
  app.get("/api/messages/read-status", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const other = String(req.query.with || "").trim();
    if (!other) throw new HttpError(400, "Missing user");
    const row = (await run("SELECT MAX(id) AS last_read_id FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NOT NULL", [uid, other]))[0];
    return { data: { lastReadId: Number(row?.last_read_id || 0) }, error: null };
  }));
  app.post("/api/presence/ping", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    touchPresence(uid);
    return { data: { ok: true }, error: null };
  }));
  app.post("/api/presence/offline", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    lastSeenByUid.delete(uid);
    return { data: { ok: true }, error: null };
  }));
  app.get("/api/presence", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const ids = String(req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 100);
    const online = {};
    ids.forEach(id => { online[id] = isUserOnline(id); });
    return { data: { online }, error: null };
  }));
  app.get("/api/stats/users", wrap(async () => {
    const row = (await run("SELECT COUNT(*) n FROM users WHERE role != 'system'"))[0];
    const onlineSet = new Set();
    const now = Date.now();
    for (const [id, socks] of userSockets) {
      if (socks && socks.size > 0 && id !== NOTIF_ID && id !== AI_ID) onlineSet.add(id);
    }
    for (const [id, ts] of lastSeenByUid) {
      if ((now - ts) < PRESENCE_TTL_MS && id !== NOTIF_ID && id !== AI_ID) onlineSet.add(id);
    }
    return { data: { totalUsers: Number(row?.n || 0), onlineUsers: onlineSet.size }, error: null };
  }));
  app.delete("/api/messages/with/:id", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const other = String(req.params.id || "");
    if (!other) throw new HttpError(400, "Missing user");
    await db.execute({ sql: "DELETE FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)", args: [uid, other, other, uid] });
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
  async function requireCallRoomAccess(roomId, uid) {
    if (roomId.startsWith("dm:")) {
      const parts = roomId.slice(3).split(":");
      if (parts.length !== 2 || !parts.includes(uid)) throw new HttpError(403, "Not part of this DM call");
      const other = parts[0] === uid ? parts[1] : parts[0];
      if (!(await areFriends(uid, other))) throw new HttpError(403, "You can only call mutual friends");
      return true;
    }
    await requireMember(roomId, uid);
    return true;
  }

  /* ---------- Group & DM Call / Watch / Whiteboard rooms (WebSocket) ---------- */
  const rooms = new Map();
  const userSockets = new Map();
  const lastSeenByUid = new Map();
  const PRESENCE_TTL_MS = 90000;
  function touchPresence(uid) {
    if (uid && uid !== NOTIF_ID && uid !== AI_ID) lastSeenByUid.set(uid, Date.now());
  }
  function isUserOnline(uid) {
    if (!uid || uid === NOTIF_ID || uid === AI_ID) return false;
    const socks = userSockets.get(uid);
    if (socks && socks.size > 0) return true;
    const t = lastSeenByUid.get(uid) || 0;
    return (Date.now() - t) < PRESENCE_TTL_MS;
  }
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
  async function notifyCallEnded(gid, exceptUid) {
    try {
      if (gid.startsWith("dm:")) {
        const parts = gid.slice(3).split(":");
        const other = parts[0] === exceptUid ? parts[1] : parts[0];
        const socks = userSockets.get(other);
        if (socks) for (const sws of socks) sendWs(sws, { type: "call-ended", groupId: gid });
      } else {
        const members = await run("SELECT user_id FROM group_members WHERE group_id = ? AND status = 'accepted' AND user_id != ?", [gid, exceptUid]);
        for (const m of members) {
          const socks = userSockets.get(m.user_id);
          if (socks) for (const sws of socks) sendWs(sws, { type: "call-ended", groupId: gid });
        }
      }
    } catch {}
  }
  function removeUserFromRoom(gid, uid, extraMsg = null) {
    const r = rooms.get(gid);
    if (!r) return;
    const p = r.peers.get(uid);
    if (p && extraMsg) sendWs(p.ws, extraMsg);
    r.peers.delete(uid);
    broadcastRoom(gid, { type: "call-state", ...roomSnapshot(gid) });
    if (!r.peers.size) {
      rooms.delete(gid);
      notifyCallEnded(gid, uid);
    }
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

      if (!userSockets.has(uid)) userSockets.set(uid, new Set());
      userSockets.get(uid).add(ws);
      touchPresence(uid);

      const prof = (await run("SELECT id, username, display_name, avatar_url FROM profiles WHERE id = ?", [uid]))[0] || { id: uid, username: "user", display_name: "User", avatar_url: null };

      ws.on("message", async raw => {
        touchPresence(uid);
        let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
        const type = msg.type;
        if (type === "join-call") {
          const gid = String(msg.groupId || "");
          try { await requireCallRoomAccess(gid, uid); } catch (e) { sendWs(ws, { type: "error", message: e.message || "Access denied" }); return; }
          if (currentGroup && currentGroup !== gid) {
            removeUserFromRoom(currentGroup, uid);
          }
          currentGroup = gid;
          const r = getRoom(gid);
          // Replace any stale socket for same user
          if (r.peers.has(uid)) r.peers.delete(uid);
          const existing = [...r.peers.keys()].filter(k => k !== uid);
          r.peers.set(uid, { ws, uid, username: prof.username, display_name: prof.display_name, avatar_url: prof.avatar_url, muted: false });
          sendWs(ws, { type: "joined", groupId: gid, existingPeers: existing, ...roomSnapshot(gid), strokes: r.strokes });
          broadcastRoom(gid, { type: "call-state", ...roomSnapshot(gid) });
          // Ring the other DM friend or all online group members when starting a call
          if (existing.length === 0) {
            const caller = { id: uid, username: prof.username, display_name: prof.display_name, avatar_url: prof.avatar_url };
            if (gid.startsWith("dm:")) {
              const parts = gid.slice(3).split(":");
              const other = parts[0] === uid ? parts[1] : parts[0];
              const socks = userSockets.get(other);
              if (socks) {
                for (const sws of socks) sendWs(sws, { type: "dm-call-ring", groupId: gid, from: caller });
              }
            } else {
              const grp = (await run("SELECT name FROM group_chats WHERE id = ?", [gid]))[0];
              const members = await run("SELECT user_id FROM group_members WHERE group_id = ? AND status = 'accepted' AND user_id != ?", [gid, uid]);
              for (const m of members) {
                const socks = userSockets.get(m.user_id);
                if (socks) {
                  for (const sws of socks) sendWs(sws, { type: "group-call-ring", groupId: gid, groupName: grp?.name || "Group", from: caller });
                }
              }
            }
          }
          return;
        }
        if (!currentGroup) return;
        const r = rooms.get(currentGroup); if (!r || !r.peers.has(uid)) return;

        if (type === "leave-call") {
          removeUserFromRoom(currentGroup, uid);
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
        const socks = userSockets.get(uid);
        if (socks) {
          socks.delete(ws);
          if (!socks.size) userSockets.delete(uid);
        }
        if (currentGroup) {
          const r = rooms.get(currentGroup);
          if (r && r.peers.get(uid)?.ws === ws) {
            removeUserFromRoom(currentGroup, uid);
          }
        }
      });
    });
  }

  app.get("/api/groups/:id/call", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    await requireCallRoomAccess(gid, uid);
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
    removeUserFromRoom(gid, uid);
    await db.execute({ sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ?", args: [gid, uid] });
    return { data: true, error: null };
  }));

  app.post("/api/groups/:id/kick", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    const targetId = String(req.body?.userId || "").trim();
    if (!targetId) throw new HttpError(400, "Missing user to kick");
    const grp = (await run("SELECT id, created_by FROM group_chats WHERE id = ?", [gid]))[0];
    if (!grp) throw new HttpError(404, "Group not found");
    if (grp.created_by !== uid) throw new HttpError(403, "Only the group owner can kick members.");
    if (targetId === uid) throw new HttpError(400, "You can't kick yourself. Use Leave or Delete instead.");
    await db.execute({ sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ?", args: [gid, targetId] });
    removeUserFromRoom(gid, targetId, { type: "kicked", groupId: gid });
    return { data: { kicked: targetId }, error: null };
  }));

  app.delete("/api/groups/:id", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    const grp = (await run("SELECT id, created_by FROM group_chats WHERE id = ?", [gid]))[0];
    if (!grp) throw new HttpError(404, "Group not found");
    if (grp.created_by !== uid) throw new HttpError(403, "Only the group owner can delete this group.");
    broadcastRoom(gid, { type: "group-deleted", groupId: gid });
    rooms.delete(gid);
    await db.batch([
      { sql: "DELETE FROM group_messages WHERE group_id = ?", args: [gid] },
      { sql: "DELETE FROM group_members WHERE group_id = ?", args: [gid] },
      { sql: "DELETE FROM group_chats WHERE id = ?", args: [gid] }
    ], "write");
    return { data: { deleted: gid }, error: null };
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
    const memberReads = await run("SELECT user_id, last_read_id FROM group_members WHERE group_id = ? AND status = 'accepted'", [gid]);
    for (const r of rows) {
      r.read_count = memberReads.filter(m => m.user_id !== r.sender_id && Number(m.last_read_id || 0) >= Number(r.id)).length;
    }
    return { data: rows, error: null };
  }));

  app.get("/api/groups/:id/reads", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const gid = String(req.params.id || "");
    await requireMember(gid, uid);
    const memberReads = await run("SELECT user_id, last_read_id FROM group_members WHERE group_id = ? AND status = 'accepted'", [gid]);
    return { data: { memberReads }, error: null };
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
    const memberReads = await run("SELECT user_id, last_read_id FROM group_members WHERE group_id = ? AND status = 'accepted'", [gid]);
    row.read_count = memberReads.filter(m => m.user_id !== row.sender_id && Number(m.last_read_id || 0) >= Number(row.id)).length;
    return { data: row, error: null };
  }));

  /* ---------- Support Tickets (user) ---------- */
  app.get("/api/support/tickets", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const tickets = await run(
      "SELECT id, user_id, subject, message, status, created_at, updated_at FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50",
      [uid]
    );
    for (const t of tickets) {
      t.replies = await run(`
        SELECT r.id, r.ticket_id, r.user_id, r.is_admin, r.body, r.created_at, p.username, p.display_name
        FROM support_replies r LEFT JOIN profiles p ON p.id = r.user_id
        WHERE r.ticket_id = ? ORDER BY r.id ASC LIMIT 100`, [t.id]);
    }
    return { data: tickets, error: null };
  }));

  app.post("/api/support/tickets", limit(10, 600000), wrap(async req => {
    await ensure();
    const uid = uidFrom(req);
    const contactEmail = String(req.body?.contact_email || "").trim().toLowerCase().slice(0, 120);
    if (!uid && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail))) {
      throw new HttpError(400, "Enter a valid contact email so we can reply to you.");
    }
    const subject = String(req.body?.subject || "").trim().slice(0, 120);
    const message = String(req.body?.message || "").trim().slice(0, 2000);
    if (subject.length < 3) throw new HttpError(400, "Subject must be at least 3 characters.");
    if (message.length < 5) throw new HttpError(400, "Message must be at least 5 characters.");
    const id = crypto.randomUUID(), ts = nowIso();
    const ticketUid = uid || "guest";
    await db.execute({
      sql: "INSERT INTO support_tickets (id, user_id, subject, message, status, contact_email, created_at, updated_at) VALUES (?,?,?,?, 'open', ?,?,?)",
      args: [id, ticketUid, subject, message, uid ? null : contactEmail, ts, ts]
    });
    return { data: { id, user_id: ticketUid, subject, message, status: "open", contact_email: uid ? null : contactEmail, created_at: ts, updated_at: ts, replies: [] }, error: null };
  }));

  app.post("/api/support/tickets/:id/reply", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const tid = String(req.params.id || "");
    const t = (await run("SELECT id, user_id, status FROM support_tickets WHERE id = ?", [tid]))[0];
    if (!t) throw new HttpError(404, "Ticket not found");
    if (t.user_id !== uid) throw new HttpError(403, "You can only reply to your own tickets.");
    const body = String(req.body?.body || "").trim().slice(0, 2000);
    if (!body) throw new HttpError(400, "Write a reply first.");
    const ts = nowIso();
    await db.batch([
      { sql: "INSERT INTO support_replies (ticket_id, user_id, is_admin, body, created_at) VALUES (?,?,0,?,?)", args: [tid, uid, body, ts] },
      { sql: "UPDATE support_tickets SET status = 'open', updated_at = ? WHERE id = ?", args: [ts, tid] }
    ], "write");
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
  const mayAct = (me, t) => { if (t.role === "owner" || t.role === "system" || t.id === me.uid) throw new HttpError(403, "You can't change this account"); if (me.role !== "owner" && t.role !== "user") throw new HttpError(403, "Only the owner can change admins"); };
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

  /* ---------- Owner-only account deletion ---------- */
  app.post("/api/admin/delete-user", wrap(async req => {
    const me = needAdmin(req);
    if (me.role !== "owner") throw new HttpError(403, "Only the owner can delete user accounts.");
    const t = await targetOf(req.body?.userId);
    mayAct(me, t);
    const uid = t.id;
    const vids = await run("SELECT id, storage_path FROM videos WHERE user_id = ?", [uid]);
    const snds = await run("SELECT storage_path FROM sounds WHERE user_id = ?", [uid]);
    const r2Keys = [
      ...vids.filter(v => v.storage_path).map(v => `videos/${v.storage_path}`),
      ...snds.filter(s => s.storage_path).map(s => `sounds/${s.storage_path}`)
    ];
    for (const v of vids) {
      await db.batch([
        { sql: "DELETE FROM likes WHERE video_id = ?", args: [v.id] },
        { sql: "DELETE FROM comments WHERE video_id = ?", args: [v.id] },
        { sql: "DELETE FROM video_views WHERE video_id = ?", args: [v.id] },
        { sql: "DELETE FROM video_sounds WHERE video_id = ?", args: [v.id] }
      ], "write");
    }
    const userTickets = await run("SELECT id FROM support_tickets WHERE user_id = ?", [uid]);
    for (const tk of userTickets) {
      await db.execute({ sql: "DELETE FROM support_replies WHERE ticket_id = ?", args: [tk.id] });
    }
    await db.batch([
      { sql: "DELETE FROM likes WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM comments WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM video_views WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM videos WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM follows WHERE follower_id = ? OR following_id = ?", args: [uid, uid] },
      { sql: "DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?", args: [uid, uid] },
      { sql: "DELETE FROM group_members WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM group_messages WHERE sender_id = ?", args: [uid] },
      { sql: "DELETE FROM user_stickers WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM known_devices WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM login_alerts WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM stories WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM sounds WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM video_sounds WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM support_replies WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM support_tickets WHERE user_id = ?", args: [uid] },
      { sql: "DELETE FROM profiles WHERE id = ?", args: [uid] },
      { sql: "DELETE FROM users WHERE id = ?", args: [uid] }
    ], "write");
    if (r2Keys.length && removeFromR2) await removeFromR2(r2Keys).catch(() => {});
    forget(uid);
    await log(me, "delete_user", label(t));
    return { data: { username: t.username, email: t.email }, error: null };
  }));

  /* ---------- Admin Support Tickets ---------- */
  app.get("/api/admin/support", wrap(async req => {
    needAdmin(req);
    const tickets = await run(`
      SELECT t.id, t.user_id, t.subject, t.message, t.status, t.contact_email, t.created_at, t.updated_at,
        COALESCE(p.username, 'guest') AS username, COALESCE(p.display_name, 'Guest') AS display_name, COALESCE(u.email, t.contact_email) AS email
      FROM support_tickets t
      LEFT JOIN profiles p ON p.id = t.user_id
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY CASE WHEN t.status = 'open' THEN 0 ELSE 1 END, t.updated_at DESC LIMIT 100`);
    for (const t of tickets) {
      t.replies = await run(`
        SELECT r.id, r.ticket_id, r.user_id, r.is_admin, r.body, r.created_at, p.username, p.display_name
        FROM support_replies r LEFT JOIN profiles p ON p.id = r.user_id
        WHERE r.ticket_id = ? ORDER BY r.id ASC LIMIT 100`, [t.id]);
    }
    return { data: tickets, error: null };
  }));

  app.post("/api/admin/support/:id/reply", wrap(async req => {
    const me = needAdmin(req);
    const tid = String(req.params.id || "");
    const t = (await run("SELECT id, user_id, subject, contact_email FROM support_tickets WHERE id = ?", [tid]))[0];
    if (!t) throw new HttpError(404, "Ticket not found");
    const body = String(req.body?.body || "").trim().slice(0, 2000);
    if (!body) throw new HttpError(400, "Write a reply first.");
    const status = ["open", "resolved", "closed"].includes(req.body?.status) ? req.body.status : "resolved";
    const ts = nowIso();
    await db.batch([
      { sql: "INSERT INTO support_replies (ticket_id, user_id, is_admin, body, created_at) VALUES (?,?,1,?,?)", args: [tid, me.uid, body, ts] },
      { sql: "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", args: [status, ts, tid] }
    ], "write");
    if (t.contact_email && app.locals.sendMail) {
      const baseUrl = (process.env.RENDER_EXTERNAL_URL || "https://webtok.onrender.com").replace(/\/+$/, "");
      const html = app.locals.buildEmailHtml ? app.locals.buildEmailHtml({
        title: "Support Ticket Reply",
        bannerBg: "#d0bcff",
        bannerFg: "#1d192b",
        greeting: "Hi there!",
        intro: `Web Tok Support replied to your ticket "${t.subject}":`,
        details: [["Reply", body], ["Status", status]],
        ctaLabel: "Open Web Tok",
        ctaUrl: `${baseUrl}/support`
      }) : undefined;
      app.locals.sendMail({
        to: t.contact_email,
        subject: `Re: ${t.subject} — Web Tok Support`,
        text: `Web Tok Support replied to your ticket "${t.subject}":\n\n${body}\n\nStatus: ${status}\n\n— The Web Tok Team`,
        html
      }).catch(e => console.warn("Guest ticket email error:", e.message));
    }
    await log(me, "support_reply", `${t.subject.slice(0, 60)} (${status})`);
    return { data: { status }, error: null };
  }));

  app.post("/api/admin/support/:id/status", wrap(async req => {
    const me = needAdmin(req);
    const tid = String(req.params.id || "");
    const status = ["open", "resolved", "closed"].includes(req.body?.status) ? req.body.status : null;
    if (!status) throw new HttpError(400, "Invalid status");
    await db.execute({ sql: "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", args: [status, nowIso(), tid] });
    await log(me, "support_status", `${tid}: ${status}`);
    return { data: { status }, error: null };
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
      { sql: "DELETE FROM video_views WHERE video_id = ?", args: [v.id] }, { sql: "DELETE FROM video_sounds WHERE video_id = ?", args: [v.id] }, { sql: "DELETE FROM videos WHERE id = ?", args: [v.id] }], "write");
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
