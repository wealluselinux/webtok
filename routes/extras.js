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
    const vcols = (await db.execute("PRAGMA table_info(videos)")).rows.map(r => r[1]);
    if (!vcols.includes("description")) await db.execute("ALTER TABLE videos ADD COLUMN description TEXT");
    if (!vcols.includes("captions")) await db.execute("ALTER TABLE videos ADD COLUMN captions TEXT");
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
      "CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', contact_email TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS support_replies (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, user_id TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS email_verifications (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS system_announcements (id TEXT PRIMARY KEY, sent_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS mcp_oauth_clients (client_id TEXT PRIMARY KEY, client_secret TEXT, client_name TEXT, redirect_uris TEXT NOT NULL, token_endpoint_auth_method TEXT, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS mcp_oauth_codes (code TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT, code_challenge_method TEXT, scope TEXT, expires_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS mcp_api_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT)",
      "CREATE TABLE IF NOT EXISTS webify_playlists (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, is_public INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS webify_playlist_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id TEXT NOT NULL, source TEXT NOT NULL, sound_id TEXT, title TEXT NOT NULL, artist TEXT NOT NULL, audio_url TEXT NOT NULL, cover_url TEXT, created_at TEXT NOT NULL)",
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

  /* ---------- Bot Protection & CAPTCHA Verification ---------- */
  const botTracker = new Map();
  function botIp(req) {
    return String(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim().slice(0, 64);
  }
  function hasValidBotPass(req) {
    const pass = String(req.headers["x-wt-bot-pass"] || "").trim();
    if (!pass) return false;
    try {
      const tok = jwt.verify(pass, SECRET);
      return !!(tok && tok.t === "bot_pass");
    } catch { return false; }
  }
  function botGuardAuth(req, res, next) {
    if (req.method !== "POST") return next();
    const ip = botIp(req);
    const now = Date.now();
    if (botTracker.size > 2000) {
      for (const [k, v] of botTracker) {
        if (v.flaggedUntil < now && (!v.hits.length || v.hits[v.hits.length - 1] < now - 180000)) botTracker.delete(k);
      }
    }
    let rec = botTracker.get(ip);
    if (!rec) { rec = { hits: [], flaggedUntil: 0 }; botTracker.set(ip, rec); }
    rec.hits = rec.hits.filter(t => now - t < 120000);
    if (rec.flaggedUntil > now && !hasValidBotPass(req)) {
      return res.status(429).json({
        data: null,
        error: { message: "Bot verification required. Please complete the CAPTCHA.", code: "bot_check_required" },
        bot_check_required: true
      });
    }
    rec.hits.push(now);
    if (rec.hits.length >= 5 && !hasValidBotPass(req)) {
      rec.flaggedUntil = now + 15 * 60 * 1000;
      return res.status(429).json({
        data: null,
        error: { message: "Too many sign-in/sign-up attempts. Please complete the CAPTCHA.", code: "bot_check_required" },
        bot_check_required: true
      });
    }
    next();
  }

  app.get("/api/bot/challenge", limit(40, 600000), (_req, res) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) code += chars[crypto.randomInt(chars.length)];
    const salt = crypto.randomBytes(8).toString("hex");
    const hash = crypto.createHash("sha256").update(`${code}:${salt}`).digest("hex");
    const challengeToken = jwt.sign({ t: "bot_chal", salt, hash }, SECRET, { expiresIn: "5m" });

    const colors = ["#d0bcff", "#f2b8b5", "#a8c7fa", "#c4eed0", "#fde293"];
    let glyphs = "";
    for (let i = 0; i < code.length; i++) {
      const x = 26 + i * 38 + crypto.randomInt(-3, 4);
      const y = 46 + crypto.randomInt(-6, 7);
      const rot = crypto.randomInt(-22, 23);
      const col = colors[crypto.randomInt(colors.length)];
      glyphs += `<text x="${x}" y="${y}" fill="${col}" font-size="30" font-weight="800" font-family="monospace,sans-serif" transform="rotate(${rot} ${x} ${y})">${code[i]}</text>`;
    }
    let noise = "";
    for (let i = 0; i < 6; i++) {
      const x1 = crypto.randomInt(0, 50), y1 = crypto.randomInt(8, 66);
      const cx = crypto.randomInt(60, 160), cy = crypto.randomInt(5, 70);
      const x2 = crypto.randomInt(170, 220), y2 = crypto.randomInt(8, 66);
      noise += `<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" fill="none"/>`;
    }
    for (let i = 0; i < 24; i++) {
      noise += `<circle cx="${crypto.randomInt(4, 216)}" cy="${crypto.randomInt(4, 70)}" r="${(crypto.randomInt(8, 18) / 10).toFixed(1)}" fill="rgba(255,255,255,0.22)"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="74" viewBox="0 0 220 74" style="border-radius:14px;background:#141218;display:block">${noise}${glyphs}</svg>`;
    res.json({ data: { challengeToken, svg }, error: null });
  });

  app.post("/api/bot/verify", limit(40, 600000), wrap(async req => {
    const challengeToken = String(req.body?.challengeToken || "");
    const answer = String(req.body?.answer || "").trim().toUpperCase();
    if (!challengeToken || !answer) throw new HttpError(400, "Enter the verification code.");
    let tok = null;
    try { tok = jwt.verify(challengeToken, SECRET); } catch {}
    if (!tok || tok.t !== "bot_chal" || !tok.salt || !tok.hash) {
      throw new HttpError(400, "Challenge expired. Refresh and try again.");
    }
    const expected = crypto.createHash("sha256").update(`${answer}:${tok.salt}`).digest("hex");
    if (expected !== tok.hash) {
      throw new HttpError(400, "Incorrect code. Please try again.");
    }
    botTracker.delete(botIp(req));
    const passToken = jwt.sign({ t: "bot_pass" }, SECRET, { expiresIn: "30m" });
    return { data: { passToken, expiresIn: 1800 }, error: null };
  }));

  app.use(["/api/auth/login", "/api/auth/signup", "/api/auth/forgot/send-code"], botGuardAuth);

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
      if (req.method === "POST" && req.path === "/db" && body.table === "comments" && body.op === "insert" && body.data?.text && app.locals.checkTextSafety) {
        const chk = await app.locals.checkTextSafety(body.data.text, "Comment");
        if (!chk.safe) return deny(res, 403, `Comment blocked by safety filter: ${chk.reason}`);
      }
      if (req.method === "POST" && req.path === "/db" && body.table === "messages" && body.op === "insert" && body.data?.body && app.locals.checkTextSafety) {
        const chk = await app.locals.checkTextSafety(body.data.body, "Message");
        if (!chk.safe) return deny(res, 403, `Message blocked by safety filter: ${chk.reason}`);
      }
      if (req.method === "POST" && req.path === "/db" && body.table === "messages" && body.op === "insert" && body.data?.recipient_id && body.data?.body) {
        const senderUid = tok.sub;
        const recUid = String(body.data.recipient_id);
        const msgBody = String(body.data.body);
        res.on("finish", () => {
          if (res.statusCode === 200) {
            notifyNewMessageAndMentions({ senderId: senderUid, recipientId: recUid, body: msgBody }).catch(() => {});
          }
        });
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
  app.post("/api/ai/hashtags", limit(30, 600000), wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const title = String(req.body?.title || "").trim().slice(0, 120);
    const desc = String(req.body?.description || "").trim().slice(0, 300);
    const stop = new Set(["the","and","for","with","this","that","from","your","you","are","was","were","have","has","had","not","but","out","all","just","like","into","about","video","clip","mp4","mov","webm","new","my","our"]);
    const fallbackTags = () => {
      const words = `${title} ${desc}`.toLowerCase().match(/[a-z0-9_]{3,20}/g) || [];
      const uniq = [...new Set(words.filter(w => !stop.has(w) && !/^\d+$/.test(w)))].slice(0, 4);
      if (!uniq.length) uniq.push("webtok", "fyp");
      else if (uniq.length < 2) uniq.push("webtok");
      return uniq.slice(0, 5);
    };
    const key = process.env.NVIDIA_API_KEY || process.env.AI_ADMINFROM_CHECKER || "";
    if (key && title) {
      try {
        const ac = new AbortController();
        const tm = setTimeout(() => ac.abort(), 5000);
        const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          signal: ac.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "meta/llama-3.1-8b-instruct",
            max_tokens: 60,
            temperature: 0.3,
            messages: [
              { role: "system", content: "Generate 3 to 4 short lowercase single-word hashtags (no #, comma-separated) for a short video based on its title and description. Output only the comma-separated words." },
              { role: "user", content: `Title: ${title}${desc ? "\nDescription: " + desc : ""}` }
            ]
          })
        });
        clearTimeout(tm);
        if (r.ok) {
          const j = await r.json();
          const raw = String(j?.choices?.[0]?.message?.content || "");
          const tags = [...new Set(raw.toLowerCase().match(/[a-z0-9_]{2,24}/g) || [])].slice(0, 5);
          if (tags.length) return { data: { hashtags: tags, source: "ai" }, error: null };
        }
      } catch {}
    }
    return { data: { hashtags: fallbackTags(), source: "keywords" }, error: null };
  }));

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
  app.post("/api/security/login-check", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const alerts = await run("SELECT id, user_agent, created_at FROM login_alerts WHERE user_id = ? AND seen = 0 ORDER BY created_at DESC LIMIT 10", [uid]);
    return { data: { ok: true, alerts }, error: null };
  }));
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
  app.get("/webify", page("webify.html"));
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

  /* ---------- Webify (Spotify-style music & playlist player: Web Tok Sounds + External Discover) ---------- */
  let spTokenCache = { token: "", exp: 0 };
  async function getSpotifyToken() {
    const cid = (process.env.SPOTIFY_CLIENT_ID || "").trim();
    const sec = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
    if (!cid || !sec) return "";
    if (spTokenCache.token && spTokenCache.exp > Date.now() + 15000) return spTokenCache.token;
    try {
      const r = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${cid}:${sec}`).toString("base64")
        },
        body: "grant_type=client_credentials"
      });
      if (!r.ok) return "";
      const j = await r.json();
      if (j.access_token) {
        spTokenCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
        return spTokenCache.token;
      }
    } catch {}
    return "";
  }

  app.get("/api/webify/discover", limit(60, 600000), wrap(async req => {
    const q = String(req.query.q || "").trim().slice(0, 80) || "top hits";
    const fetchJson = async (url, opts = {}) => {
      const ac = new AbortController();
      const tm = setTimeout(() => ac.abort(), 5000);
      try {
        const r = await fetch(url, { ...opts, signal: ac.signal });
        clearTimeout(tm);
        return r.ok ? await r.json() : null;
      } catch {
        clearTimeout(tm);
        return null;
      }
    };

    const spTok = await getSpotifyToken();
    const [itJson, dzJson, spJson] = await Promise.all([
      fetchJson(`https://itunes.apple.com/search?media=music&entity=song&limit=40&term=${encodeURIComponent(q)}`),
      fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=35`),
      spTok ? fetchJson(`https://api.spotify.com/v1/search?type=track&limit=25&q=${encodeURIComponent(q)}`, {
        headers: { Authorization: "Bearer " + spTok }
      }) : Promise.resolve(null)
    ]);

    const seen = new Set();
    const out = [];
    const pushTrack = t => {
      if (!t || !t.audio_url) return;
      const key = `${t.title.toLowerCase().trim()}|${t.artist.toLowerCase().trim()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(t);
    };

    (Array.isArray(spJson?.tracks?.items) ? spJson.tracks.items : []).forEach(x => {
      if (!x.preview_url) return;
      pushTrack({
        id: "sp_" + String(x.id || crypto.randomUUID()),
        source: "discover",
        provider: "Spotify",
        sound_id: null,
        title: String(x.name || "Untitled").slice(0, 80),
        artist: String((x.artists || []).map(a => a.name).join(", ") || "Unknown Artist").slice(0, 60),
        album: String(x.album?.name || "").slice(0, 80),
        audio_url: x.preview_url,
        cover_url: x.album?.images?.[0]?.url || null
      });
    });

    (Array.isArray(dzJson?.data) ? dzJson.data : []).forEach(x => {
      if (!x.preview) return;
      pushTrack({
        id: "dz_" + String(x.id || crypto.randomUUID()),
        source: "discover",
        provider: "Deezer",
        sound_id: null,
        title: String(x.title || "Untitled").slice(0, 80),
        artist: String(x.artist?.name || "Unknown Artist").slice(0, 60),
        album: String(x.album?.title || "").slice(0, 80),
        audio_url: x.preview,
        cover_url: x.album?.cover_medium || x.album?.cover || null
      });
    });

    (Array.isArray(itJson?.results) ? itJson.results : []).forEach(x => {
      if (!x.previewUrl) return;
      pushTrack({
        id: "it_" + String(x.trackId || crypto.randomUUID()),
        source: "discover",
        provider: "iTunes",
        sound_id: null,
        title: String(x.trackName || "Untitled").slice(0, 80),
        artist: String(x.artistName || "Unknown Artist").slice(0, 60),
        album: String(x.collectionName || "").slice(0, 80),
        audio_url: x.previewUrl,
        cover_url: String(x.artworkUrl100 || "").replace("100x100", "300x300") || null
      });
    });

    return { data: out, error: null };
  }));

  app.get("/api/webify/playlists", wrap(async req => {
    await ensure();
    const uid = uidFrom(req);
    const rows = await run(`
      SELECT pl.id, pl.user_id, pl.name, pl.description, pl.is_public, pl.created_at, pl.updated_at,
        p.username, p.display_name
      FROM webify_playlists pl
      LEFT JOIN profiles p ON p.id = pl.user_id
      WHERE pl.is_public = 1 ${uid ? "OR pl.user_id = ?" : ""}
      ORDER BY CASE WHEN pl.user_id = ? THEN 0 ELSE 1 END, pl.updated_at DESC LIMIT 60`,
      uid ? [uid, uid] : [""]
    );
    for (const pl of rows) {
      pl.tracks = await run(
        "SELECT id, playlist_id, source, sound_id, title, artist, audio_url, cover_url, created_at FROM webify_playlist_tracks WHERE playlist_id = ? ORDER BY id ASC LIMIT 200",
        [pl.id]
      );
    }
    return { data: rows, error: null };
  }));

  app.post("/api/webify/playlists", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const name = String(req.body?.name || "").trim().slice(0, 60);
    const description = String(req.body?.description || "").trim().slice(0, 200);
    const is_public = req.body?.is_public === false ? 0 : 1;
    if (name.length < 1) throw new HttpError(400, "Enter a playlist name.");
    const id = crypto.randomUUID(), ts = nowIso();
    await db.execute({
      sql: "INSERT INTO webify_playlists (id, user_id, name, description, is_public, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      args: [id, uid, name, description || null, is_public, ts, ts]
    });
    return { data: { id, user_id: uid, name, description: description || null, is_public, created_at: ts, updated_at: ts, tracks: [] }, error: null };
  }));

  app.delete("/api/webify/playlists/:id", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const pid = String(req.params.id || "");
    const pl = (await run("SELECT user_id FROM webify_playlists WHERE id = ?", [pid]))[0];
    if (!pl) throw new HttpError(404, "Playlist not found");
    if (pl.user_id !== uid) throw new HttpError(403, "You can only delete your own playlists.");
    await db.batch([
      { sql: "DELETE FROM webify_playlist_tracks WHERE playlist_id = ?", args: [pid] },
      { sql: "DELETE FROM webify_playlists WHERE id = ? AND user_id = ?", args: [pid, uid] }
    ], "write");
    return { data: true, error: null };
  }));

  app.post("/api/webify/playlists/:id/tracks", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const pid = String(req.params.id || "");
    const pl = (await run("SELECT user_id FROM webify_playlists WHERE id = ?", [pid]))[0];
    if (!pl) throw new HttpError(404, "Playlist not found");
    if (pl.user_id !== uid) throw new HttpError(403, "You can only edit your own playlists.");
    const source = req.body?.source === "discover" ? "discover" : "webtok";
    const sound_id = req.body?.sound_id ? String(req.body.sound_id).trim().slice(0, 80) : null;
    const title = String(req.body?.title || "").trim().slice(0, 80);
    const artist = String(req.body?.artist || "Unknown").trim().slice(0, 60);
    const audio_url = String(req.body?.audio_url || "").trim();
    const cover_url = req.body?.cover_url ? String(req.body.cover_url).trim().slice(0, 400) : null;
    if (!title || !/^https?:\/\//i.test(audio_url)) throw new HttpError(400, "Invalid track data.");
    const ts = nowIso();
    const rs = await db.execute({
      sql: "INSERT INTO webify_playlist_tracks (playlist_id, source, sound_id, title, artist, audio_url, cover_url, created_at) VALUES (?,?,?,?,?,?,?,?)",
      args: [pid, source, sound_id, title, artist, audio_url, cover_url, ts]
    });
    await db.execute({ sql: "UPDATE webify_playlists SET updated_at = ? WHERE id = ?", args: [ts, pid] });
    return { data: { id: Number(rs.lastInsertRowid), playlist_id: pid, source, sound_id, title, artist, audio_url, cover_url, created_at: ts }, error: null };
  }));

  app.delete("/api/webify/playlists/:id/tracks/:trackId", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const pid = String(req.params.id || "");
    const tid = parseInt(req.params.trackId, 10) || 0;
    const pl = (await run("SELECT user_id FROM webify_playlists WHERE id = ?", [pid]))[0];
    if (!pl) throw new HttpError(404, "Playlist not found");
    if (pl.user_id !== uid) throw new HttpError(403, "You can only edit your own playlists.");
    await db.execute({ sql: "DELETE FROM webify_playlist_tracks WHERE id = ? AND playlist_id = ?", args: [tid, pid] });
    await db.execute({ sql: "UPDATE webify_playlists SET updated_at = ? WHERE id = ?", args: [nowIso(), pid] });
    return { data: true, error: null };
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
  async function notifyNewMessageAndMentions({ senderId, recipientId = null, groupId = null, body = "" }) {
    try {
      if (!senderId || senderId === NOTIF_ID || senderId === AI_ID) return;
      const sender = (await run("SELECT id, username, display_name FROM profiles WHERE id = ?", [senderId]))[0];
      if (!sender) return;
      const from = { id: sender.id, username: sender.username, display_name: sender.display_name };
      const preview = String(body || "").trim().slice(0, 140);
      let groupName = null;
      const targetIds = [];
      if (groupId) {
        const grp = (await run("SELECT name FROM group_chats WHERE id = ?", [groupId]))[0];
        groupName = grp?.name || "Group";
        const mems = await run("SELECT user_id FROM group_members WHERE group_id = ? AND status = 'accepted' AND user_id != ?", [groupId, senderId]);
        mems.forEach(m => targetIds.push(m.user_id));
      } else if (recipientId && recipientId !== senderId && recipientId !== NOTIF_ID && recipientId !== AI_ID) {
        targetIds.push(recipientId);
      }

      const chatUrl = groupId ? "/messages" : `/messages#${encodeURIComponent(senderId)}`;
      for (const tid of targetIds) {
        const socks = userSockets.get(tid);
        if (socks) {
          for (const sws of socks) {
            sendWs(sws, { type: "new-message", from, preview, groupId, groupName, chatUrl });
          }
        }
      }

      const mentionedNames = [...new Set((String(body || "").match(/@([a-z0-9_.]{3,20})/gi) || []).map(s => s.slice(1).toLowerCase()))];
      for (const uname of mentionedNames.slice(0, 5)) {
        const mu = (await run("SELECT id, username FROM profiles WHERE lower(username) = ?", [uname]))[0];
        if (!mu || mu.id === senderId || mu.id === NOTIF_ID || mu.id === AI_ID) continue;
        const socks = userSockets.get(mu.id);
        let online = false;
        if (socks && socks.size > 0) {
          online = true;
          for (const sws of socks) {
            sendWs(sws, { type: "mention-alert", from, preview, groupId, groupName, chatUrl });
          }
        }
        if (!online) {
          const where = groupName ? `in ${groupName}` : "in a message";
          const note = `@${sender.username} mentioned you ${where}: "${preview}"`;
          await db.execute({
            sql: "INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?,?,?,?)",
            args: [NOTIF_ID, mu.id, note, nowIso()]
          }).catch(() => {});
        }
      }
    } catch {}
  }

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
    const participants = [...r.peers.values()].map(p => ({ uid: p.uid, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, muted: !!p.muted, camOn: !!p.camOn, screenOn: !!p.screenOn }));
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

      const profPromise = run("SELECT id, username, display_name, avatar_url FROM profiles WHERE id = ?", [uid])
        .then(rows => rows[0] || { id: uid, username: "user", display_name: "User", avatar_url: null })
        .catch(() => ({ id: uid, username: "user", display_name: "User", avatar_url: null }));
      let msgChain = Promise.resolve();

      ws.on("message", raw => {
        msgChain = msgChain.then(async () => {
          const prof = await profPromise;
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
        } else if (type === "video-state") {
          const p = r.peers.get(uid);
          if (p) {
            if (msg.camOn !== undefined) p.camOn = !!msg.camOn;
            if (msg.screenOn !== undefined) p.screenOn = !!msg.screenOn;
          }
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
        }).catch(() => {});
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
    if (app.locals.checkTextSafety) {
      const chk = await app.locals.checkTextSafety(body, "Message");
      if (!chk.safe) throw new HttpError(403, `Message blocked by safety filter: ${chk.reason}`);
    }
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
    notifyNewMessageAndMentions({ senderId: uid, groupId: gid, body }).catch(() => {});
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

  /* ---------- Homemade MCP & Auto-Update Announcements ---------- */
  const MCP_FOOTER = "\n\n--this was provided by the gemini webtok MCP";
  function withMcpFooter(text, maxLen = 2000) {
    const clean = String(text || "").trim();
    if (!clean) return "";
    if (clean.endsWith("--this was provided by the gemini webtok MCP")) return clean.slice(0, maxLen);
    const keep = Math.max(1, maxLen - MCP_FOOTER.length);
    return `${clean.slice(0, keep)}${MCP_FOOTER}`;
  }

  async function sendSystemAnnouncement(message, title = "", actorUid = NOTIF_ID, appendMcpFooter = false) {
    const cleanMsg = String(message || "").trim().slice(0, 1000);
    if (!cleanMsg) throw new HttpError(400, "Announcement message is required.");
    const titlePart = title ? `${String(title).trim().slice(0, 80)}\n\n` : "";
    const baseBody = `${titlePart}${cleanMsg}`;
    const fullBody = appendMcpFooter ? withMcpFooter(baseBody, 1000) : baseBody.slice(0, 1000);
    const recipients = await run(
      "SELECT id FROM users WHERE id != ? AND COALESCE(banned, 0) = 0 AND COALESCE(role, 'user') != 'system'",
      [NOTIF_ID]
    );
    const ts = nowIso();
    const stmts = recipients.map(r => ({
      sql: "INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?,?,?,?)",
      args: [NOTIF_ID, r.id, fullBody, ts]
    }));
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50), "write");
    }
    await db.execute({
      sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)",
      args: [actorUid, "mcp_announce", `Sent to ${recipients.length} user(s): ${fullBody.slice(0, 80)}`, ts]
    }).catch(() => {});
    return { sentCount: recipients.length, body: fullBody, sentAt: ts };
  }

  async function runAutoUpdateAnnouncements() {
    try {
      await ensure();
      const annFile = path.join(__dirname, "..", "announcements.json");
      if (!fs.existsSync(annFile)) return;
      const list = JSON.parse(fs.readFileSync(annFile, "utf8"));
      if (!Array.isArray(list)) return;
      for (const item of list) {
        const id = String(item?.id || "").trim().slice(0, 80);
        const msg = String(item?.message || "").trim();
        if (!id || !msg) continue;
        const already = (await run("SELECT 1 FROM system_announcements WHERE id = ?", [id]))[0];
        if (already) continue;
        await sendSystemAnnouncement(msg, item?.title || "", NOTIF_ID);
        await db.execute({ sql: "INSERT OR IGNORE INTO system_announcements (id, sent_at) VALUES (?,?)", args: [id, nowIso()] });
      }
    } catch (e) { console.warn("auto-announce:", e.message); }
  }
  setTimeout(runAutoUpdateAnnouncements, 2500);

  const mcpBaseUrl = req => {
    const envUrl = (process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
    if (envUrl) return envUrl;
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "webtok.onrender.com").split(",")[0].trim();
    return `${proto}://${host}`;
  };

  /* ---------- Standard OAuth 2.1 + PKCE + Dynamic Client Registration for Gemini MCP ---------- */
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"], (req, res) => {
    const base = mcpBaseUrl(req);
    res.json({
      resource: `${base}/api/mcp`,
      authorization_servers: [base],
      scopes_supported: ["mcp:tools"],
      bearer_methods_supported: ["header"]
    });
  });

  app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], (req, res) => {
    const base = mcpBaseUrl(req);
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      scopes_supported: ["mcp:tools"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      code_challenge_methods_supported: ["S256", "plain"]
    });
  });

  app.post("/oauth/register", wrap(async (req, res) => {
    await ensure();
    const b = req.body || {};
    const redirectUris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(u => String(u || "").trim()).filter(Boolean) : [];
    if (!redirectUris.length) throw new HttpError(400, "redirect_uris is required");
    const authMethod = ["none", "client_secret_post", "client_secret_basic"].includes(b.token_endpoint_auth_method) ? b.token_endpoint_auth_method : "none";
    const clientId = "wt_mcp_" + crypto.randomBytes(12).toString("hex");
    const clientSecret = authMethod === "none" ? null : crypto.randomBytes(24).toString("hex");
    const clientName = String(b.client_name || "Gemini MCP Client").slice(0, 80);
    await db.execute({
      sql: "INSERT INTO mcp_oauth_clients (client_id, client_secret, client_name, redirect_uris, token_endpoint_auth_method, created_at) VALUES (?,?,?,?,?,?)",
      args: [clientId, clientSecret, clientName, JSON.stringify(redirectUris), authMethod, nowIso()]
    });
    const out = {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: authMethod
    };
    if (clientSecret) out.client_secret = clientSecret;
    res.status(201).json(out);
    return undefined;
  }));

  app.get("/oauth/authorize", async (req, res) => {
    await ensure();
    const clientId = String(req.query.client_id || "");
    const redirectUri = String(req.query.redirect_uri || "");
    const state = String(req.query.state || "");
    const codeChallenge = String(req.query.code_challenge || "");
    const codeChallengeMethod = String(req.query.code_challenge_method || "S256");
    const scope = String(req.query.scope || "mcp:tools");

    const client = (await run("SELECT client_name, redirect_uris FROM mcp_oauth_clients WHERE client_id = ?", [clientId]))[0];
    const allowed = client ? safeArr(client.redirect_uris) : [];
    if (!client || !redirectUri || !allowed.includes(redirectUri)) {
      return res.status(400).send("Invalid OAuth client_id or redirect_uri.");
    }
    const escH = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    res.type("html").send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ${escH(client.client_name)} — Web Tok</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#141218;color:#e6e0e9;font-family:system-ui,-apple-system,sans-serif;padding:18px}
  .card{width:min(100%,420px);background:#211f26;border-radius:28px;padding:28px;box-shadow:0 16px 48px rgba(0,0,0,.45)}
  h1{margin:0 0 8px;font-size:22px} p{margin:0 0 18px;font-size:14px;color:#cac4d0;line-height:1.45}
  label{display:block;font-size:12px;font-weight:700;color:#cac4d0;margin:12px 0 6px}
  input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1px solid #49454f;background:#141218;color:#e6e0e9;font:inherit}
  .btn{width:100%;margin-top:18px;padding:13px;border-radius:999px;border:0;background:#d0bcff;color:#381e72;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
  .btn:disabled{opacity:.6;cursor:default}
  .err{color:#f2b8b5;font-size:13px;margin-top:12px;min-height:18px}
  .scope{background:#2b2930;border-radius:14px;padding:12px 14px;font-size:13px;margin-bottom:14px}
</style></head><body>
  <div class="card">
    <h1>Connect ${escH(client.client_name)}</h1>
    <p>Sign in with your Web Tok <strong>Admin</strong> or <strong>Owner</strong> account to allow Gemini to send announcements and view site stats.</p>
    <div class="scope"><strong>Permissions requested:</strong><br>• Send @notifications announcements<br>• View recent announcements &amp; site stats</div>
    <form id="authForm">
      <label>Admin / Owner Email</label><input type="email" id="em" required autocomplete="email">
      <label>Password</label><input type="password" id="pw" required autocomplete="current-password">
      <button class="btn" id="sub" type="submit">Authorize &amp; Connect</button>
      <div class="err" id="err"></div>
    </form>
  </div>
  <script>
    document.getElementById("authForm").onsubmit = async e => {
      e.preventDefault();
      const btn = document.getElementById("sub"), err = document.getElementById("err");
      btn.disabled = true; err.textContent = "";
      try {
        const r = await fetch("/oauth/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: document.getElementById("em").value.trim(),
            password: document.getElementById("pw").value,
            client_id: ${JSON.stringify(clientId)},
            redirect_uri: ${JSON.stringify(redirectUri)},
            state: ${JSON.stringify(state)},
            code_challenge: ${JSON.stringify(codeChallenge)},
            code_challenge_method: ${JSON.stringify(codeChallengeMethod)},
            scope: ${JSON.stringify(scope)}
          })
        });
        const j = await r.json();
        if (!r.ok || !j.redirectTo) throw new Error(j.error || "Authorization failed");
        location.href = j.redirectTo;
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    };
  </script>
</body></html>`);
  });

  app.post("/oauth/authorize", limit(20, 600000), async (req, res) => {
    try {
      await ensure();
      const b = req.body || {};
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      const clientId = String(b.client_id || "");
      const redirectUri = String(b.redirect_uri || "");
      const state = String(b.state || "");
      const codeChallenge = String(b.code_challenge || "");
      const codeChallengeMethod = String(b.code_challenge_method || "S256");
      const scope = String(b.scope || "mcp:tools");

      const client = (await run("SELECT redirect_uris FROM mcp_oauth_clients WHERE client_id = ?", [clientId]))[0];
      if (!client || !safeArr(client.redirect_uris).includes(redirectUri)) {
        return res.status(400).json({ error: "Invalid OAuth client or redirect_uri." });
      }
      const u = (await run("SELECT id, encrypted_password, role, banned FROM users WHERE email = ?", [email]))[0];
      if (!u || !(await bcrypt.compare(password, u.encrypted_password))) {
        return res.status(401).json({ error: "Incorrect email or password." });
      }
      if (u.banned) return res.status(403).json({ error: "Account suspended." });
      if (!["admin", "owner"].includes(u.role)) {
        return res.status(403).json({ error: "Only Web Tok Admins or the Owner can authorize MCP access." });
      }
      const code = crypto.randomBytes(24).toString("hex");
      const exp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await db.execute({
        sql: "INSERT INTO mcp_oauth_codes (code, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at) VALUES (?,?,?,?,?,?,?,?)",
        args: [code, clientId, u.id, redirectUri, codeChallenge || null, codeChallengeMethod, scope, exp]
      });
      const dest = new URL(redirectUri);
      dest.searchParams.set("code", code);
      if (state) dest.searchParams.set("state", state);
      return res.json({ redirectTo: dest.toString() });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.post("/oauth/token", require("express").urlencoded({ extended: false }), async (req, res) => {
    try {
      await ensure();
      const b = req.body || {};
      const grantType = String(b.grant_type || "");

      if (grantType === "authorization_code") {
        const code = String(b.code || "");
        const redirectUri = String(b.redirect_uri || "");
        const codeVerifier = String(b.code_verifier || "");
        const row = (await run("SELECT * FROM mcp_oauth_codes WHERE code = ?", [code]))[0];
        if (!row) return res.status(400).json({ error: "invalid_grant", error_description: "Invalid authorization code" });
        await db.execute({ sql: "DELETE FROM mcp_oauth_codes WHERE code = ?", args: [code] });
        if (Date.parse(row.expires_at) < Date.now()) {
          return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired" });
        }
        if (redirectUri && row.redirect_uri !== redirectUri) {
          return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
        }
        if (row.code_challenge) {
          if (!codeVerifier) return res.status(400).json({ error: "invalid_grant", error_description: "code_verifier required" });
          const computed = row.code_challenge_method === "plain"
            ? codeVerifier
            : crypto.createHash("sha256").update(codeVerifier).digest("base64url");
          if (computed !== row.code_challenge) {
            return res.status(400).json({ error: "invalid_grant", error_description: "Invalid PKCE code_verifier" });
          }
        }
        const accessToken = jwt.sign({ sub: row.user_id, t: "mcp", scope: row.scope || "mcp:tools" }, SECRET, { expiresIn: "30d" });
        const refreshToken = jwt.sign({ sub: row.user_id, t: "mcp_r", scope: row.scope || "mcp:tools" }, SECRET, { expiresIn: "90d" });
        return res.json({ access_token: accessToken, token_type: "Bearer", expires_in: 30 * 86400, refresh_token: refreshToken, scope: row.scope || "mcp:tools" });
      }

      if (grantType === "refresh_token") {
        const rt = String(b.refresh_token || "");
        let tok = null;
        try { tok = jwt.verify(rt, SECRET); } catch {}
        if (!tok || tok.t !== "mcp_r" || !tok.sub) {
          return res.status(400).json({ error: "invalid_grant", error_description: "Invalid refresh token" });
        }
        const st = await stateOf(tok.sub);
        if (!st || st.banned || !["admin", "owner"].includes(st.role)) {
          return res.status(403).json({ error: "access_denied" });
        }
        const accessToken = jwt.sign({ sub: tok.sub, t: "mcp", scope: tok.scope || "mcp:tools" }, SECRET, { expiresIn: "30d" });
        return res.json({ access_token: accessToken, token_type: "Bearer", expires_in: 30 * 86400, refresh_token: rt, scope: tok.scope || "mcp:tools" });
      }

      return res.status(400).json({ error: "unsupported_grant_type" });
    } catch (e) {
      return res.status(500).json({ error: "server_error", error_description: e.message });
    }
  });

  async function isMcpAuthorized(req) {
    const auth = String(req.headers.authorization || "");
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-mcp-key"] || "").trim();
    const mcpKey = (process.env.MCP_API_KEY || "").trim();
    if (mcpKey && bearer && bearer.length === mcpKey.length && crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(mcpKey))) {
      return { ok: true, uid: NOTIF_ID };
    }
    if (bearer) {
      try {
        const tok = jwt.verify(bearer, SECRET);
        if (tok && tok.sub && (tok.t === "mcp" || tok.t === "a")) {
          const st = await stateOf(tok.sub);
          if (st && !st.banned && ["admin", "owner"].includes(st.role)) {
            return { ok: true, uid: tok.sub };
          }
        }
      } catch {}
    }
    if (bearer && bearer.startsWith("wt_mcp_")) {
      try {
        const kh = crypto.createHash("sha256").update(bearer).digest("hex");
        const krow = (await run("SELECT id, user_id FROM mcp_api_keys WHERE key_hash = ?", [kh]))[0];
        if (krow) {
          const st = await stateOf(krow.user_id);
          if (st && !st.banned && ["admin", "owner"].includes(st.role)) {
            db.execute({ sql: "UPDATE mcp_api_keys SET last_used_at = ? WHERE id = ?", args: [nowIso(), krow.id] }).catch(() => {});
            return { ok: true, uid: krow.user_id };
          }
        }
      } catch {}
    }
    if (req.wt && ["admin", "owner"].includes(req.wt.role)) {
      return { ok: true, uid: req.wt.uid };
    }
    return { ok: false };
  }


  app.get("/api/mcp/keys", wrap(async req => {
    const me = needAdmin(req);
    const rows = await run("SELECT id, name, prefix, created_at, last_used_at FROM mcp_api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [me.uid]);
    return { data: rows, error: null };
  }));

  app.post("/api/mcp/keys", limit(15, 600000), wrap(async req => {
    const me = needAdmin(req);
    const name = String(req.body?.name || "My MCP Key").trim().slice(0, 50) || "My MCP Key";
    const existing = await run("SELECT COUNT(*) n FROM mcp_api_keys WHERE user_id = ?", [me.uid]);
    if (Number(existing[0]?.n || 0) >= 10) throw new HttpError(400, "Maximum of 10 MCP API keys reached. Delete an old key first.");
    const rawKey = "wt_mcp_" + crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const prefix = rawKey.slice(0, 14) + "…";
    const id = crypto.randomUUID(), ts = nowIso();
    await db.execute({
      sql: "INSERT INTO mcp_api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES (?,?,?,?,?,?)",
      args: [id, me.uid, name, keyHash, prefix, ts]
    });
    return { data: { id, name, prefix, apiKey: rawKey, created_at: ts }, error: null };
  }));

  app.delete("/api/mcp/keys/:id", wrap(async req => {
    const me = needAdmin(req);
    const id = String(req.params.id || "");
    await db.execute({ sql: "DELETE FROM mcp_api_keys WHERE id = ? AND user_id = ?", args: [id, me.uid] });
    return { data: true, error: null };
  }));

  app.get("/api/mcp", async (req, res) => {
    const base = mcpBaseUrl(req);
    const auth = await isMcpAuthorized(req);
    if (!auth.ok) {
      res.set("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({
        error: "unauthorized",
        oauth_protected_resource: `${base}/.well-known/oauth-protected-resource`
      });
    }
    res.json({
      name: "webtok-homemade-mcp",
      version: "1.0.0",
      protocol: "2024-11-05",
      endpoint: `${base}/api/mcp`,
      tools: ["send_announcement", "list_announcements", "get_site_stats", "list_support_tickets", "reply_support_ticket", "update_support_ticket_status"]
    });
  });

  app.post("/api/mcp", async (req, res) => {
    const base = mcpBaseUrl(req);
    const rpc = req.body || {};
    const id = rpc.id !== undefined ? rpc.id : null;
    const reply = (result) => res.json({ jsonrpc: "2.0", id, result });
    const fail = (code, message) => {
      if (code === -32001) {
        res.set("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
        return res.status(401).json({ jsonrpc: "2.0", id, error: { code, message } });
      }
      return res.json({ jsonrpc: "2.0", id, error: { code, message } });
    };

    try {
      await ensure();
      const auth = await isMcpAuthorized(req);
      if (!auth.ok) return fail(-32001, "Unauthorized: OAuth Bearer token required.");

      const method = String(rpc.method || "");
      if (method === "initialize") {
        return reply({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "webtok-homemade-mcp", version: "1.0.0" }
        });
      }
      if (method === "notifications/initialized") {
        return res.status(202).end();
      }
      if (method === "tools/list") {
        return reply({
          tools: [
            {
              name: "send_announcement",
              description: "Send an official @notifications announcement to all active Web Tok users.",
              inputSchema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Optional short title for the announcement" },
                  message: { type: "string", description: "Announcement message (1-1000 chars)" }
                },
                required: ["message"]
              }
            },
            {
              name: "list_announcements",
              description: "List recent official announcements sent via @notifications or auto-update.",
              inputSchema: {
                type: "object",
                properties: { limit: { type: "number", description: "Max items to return (default 10)" } }
              }
            },
            {
              name: "get_site_stats",
              description: "Get Web Tok user count, online users, total videos, and open support tickets.",
              inputSchema: { type: "object", properties: {} }
            },
            {
              name: "list_support_tickets",
              description: "List Web Tok support tickets and their replies.",
              inputSchema: {
                type: "object",
                properties: {
                  status: { type: "string", description: "Filter by status: open, resolved, closed, or all (default: open)" },
                  limit: { type: "number", description: "Max tickets to return (default 20)" }
                }
              }
            },
            {
              name: "reply_support_ticket",
              description: "Reply to a Web Tok support ticket and update its status (also emails guest tickets if configured).",
              inputSchema: {
                type: "object",
                properties: {
                  ticketId: { type: "string", description: "The support ticket ID" },
                  message: { type: "string", description: "Reply text (1-2000 chars)" },
                  status: { type: "string", description: "New status: resolved, open, or closed (default: resolved)" }
                },
                required: ["ticketId", "message"]
              }
            },
            {
              name: "update_support_ticket_status",
              description: "Update the status of a support ticket (open, resolved, or closed).",
              inputSchema: {
                type: "object",
                properties: {
                  ticketId: { type: "string", description: "The support ticket ID" },
                  status: { type: "string", description: "New status: open, resolved, or closed" }
                },
                required: ["ticketId", "status"]
              }
            }
          ]
        });
      }
      if (method === "tools/call") {
        const name = String(rpc.params?.name || "");
        const args = rpc.params?.arguments || {};
        if (name === "send_announcement") {
          const out = await sendSystemAnnouncement(args.message, args.title || "", auth.uid, true);
          return reply({ content: [{ type: "text", text: `Announcement sent to ${out.sentCount} user(s) at ${out.sentAt}.` }] });
        }
        if (name === "list_announcements") {
          const lim = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 30);
          const logs = await run("SELECT action, detail, created_at FROM admin_log WHERE action IN ('announce','mcp_announce') ORDER BY id DESC LIMIT ?", [lim]);
          const auto = await run("SELECT id, sent_at FROM system_announcements ORDER BY sent_at DESC LIMIT ?", [lim]);
          return reply({ content: [{ type: "text", text: JSON.stringify({ manual: logs, autoUpdates: auto }, null, 2) }] });
        }
        if (name === "get_site_stats") {
          const users = (await run("SELECT COUNT(*) n FROM users WHERE role != 'system'"))[0]?.n || 0;
          const videos = (await run("SELECT COUNT(*) n FROM videos"))[0]?.n || 0;
          const tickets = (await run("SELECT COUNT(*) n FROM support_tickets WHERE status = 'open'"))[0]?.n || 0;
          return reply({ content: [{ type: "text", text: JSON.stringify({ totalUsers: Number(users), totalVideos: Number(videos), openSupportTickets: Number(tickets) }, null, 2) }] });
        }
        if (name === "list_support_tickets") {
          const st = ["open", "resolved", "closed", "all"].includes(String(args.status || "open")) ? String(args.status || "open") : "open";
          const lim = Math.min(Math.max(parseInt(args.limit, 10) || 20, 1), 50);
          const tickets = await run(`
            SELECT t.id, t.user_id, t.subject, t.message, t.status, t.contact_email, t.created_at, t.updated_at,
              COALESCE(p.username, 'guest') AS username, COALESCE(p.display_name, 'Guest') AS display_name, COALESCE(u.email, t.contact_email) AS email
            FROM support_tickets t
            LEFT JOIN profiles p ON p.id = t.user_id
            LEFT JOIN users u ON u.id = t.user_id
            ${st !== "all" ? "WHERE t.status = ?" : ""}
            ORDER BY CASE WHEN t.status = 'open' THEN 0 ELSE 1 END, t.updated_at DESC LIMIT ?`,
            st !== "all" ? [st, lim] : [lim]
          );
          for (const t of tickets) {
            t.replies = await run(`
              SELECT r.id, r.is_admin, r.body, r.created_at, p.username
              FROM support_replies r LEFT JOIN profiles p ON p.id = r.user_id
              WHERE r.ticket_id = ? ORDER BY r.id ASC LIMIT 50`, [t.id]);
          }
          return reply({ content: [{ type: "text", text: JSON.stringify(tickets, null, 2) }] });
        }
        if (name === "reply_support_ticket") {
          const tid = String(args.ticketId || "").trim();
          const body = withMcpFooter(args.message, 2000);
          if (!tid || !body) return fail(-32602, "ticketId and message are required.");
          const t = (await run("SELECT id, user_id, subject, contact_email FROM support_tickets WHERE id = ?", [tid]))[0];
          if (!t) return fail(-32602, `Support ticket not found: ${tid}`);
          const status = ["open", "resolved", "closed"].includes(String(args.status || "resolved")) ? String(args.status || "resolved") : "resolved";
          const ts = nowIso();
          await db.batch([
            { sql: "INSERT INTO support_replies (ticket_id, user_id, is_admin, body, created_at) VALUES (?,?,1,?,?)", args: [tid, auth.uid, body, ts] },
            { sql: "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", args: [status, ts, tid] }
          ], "write");
          let emailed = false;
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
            await app.locals.sendMail({
              to: t.contact_email,
              subject: `Re: ${t.subject} — Web Tok Support`,
              text: `Web Tok Support replied to your ticket "${t.subject}":

${body}

Status: ${status}

— The Web Tok Team`,
              html
            }).then(() => { emailed = true; }).catch(e => console.warn("MCP ticket email error:", e.message));
          }
          await db.execute({ sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)", args: [auth.uid, "mcp_support_reply", `${t.subject.slice(0, 60)} (${status})`, ts] }).catch(() => {});
          return reply({ content: [{ type: "text", text: `Replied to ticket "${t.subject}" (${tid}), status set to "${status}"${emailed ? ", and emailed guest" : ""}.` }] });
        }
        if (name === "update_support_ticket_status") {
          const tid = String(args.ticketId || "").trim();
          const status = ["open", "resolved", "closed"].includes(String(args.status || "")) ? String(args.status) : null;
          if (!tid || !status) return fail(-32602, "Valid ticketId and status (open, resolved, closed) are required.");
          await db.execute({ sql: "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", args: [status, nowIso(), tid] });
          await db.execute({ sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)", args: [auth.uid, "mcp_support_status", `${tid}: ${status}`, nowIso()] }).catch(() => {});
          return reply({ content: [{ type: "text", text: `Ticket ${tid} status updated to "${status}".` }] });
        }
        return fail(-32601, `Unknown tool: ${name}`);
      }
      return fail(-32601, `Unknown MCP method: ${method}`);
    } catch (e) {
      return fail(-32603, e?.message || "Internal MCP error");
    }
  });

  const TT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  function extractCookieHeader(res) {
    try {
      const list = typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
      return list.map(c => String(c).split(";")[0].trim()).filter(Boolean).join("; ");
    } catch { return ""; }
  }
  async function fetchTikTokViaDirect(targetUrl) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(targetUrl, {
        signal: ac.signal,
        redirect: "follow",
        headers: {
          "User-Agent": TT_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      if (!r.ok) return null;
      const cookie = extractCookieHeader(r);
      const html = await r.text();
      const m = /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
      if (!m) return null;
      const parsedJson = JSON.parse(m[1]);
      const item = parsedJson?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (!item || !item.video) return null;
      const playUrl = String(
        item.video.playAddr
        || item.video.downloadAddr
        || item.video.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[0]
        || ""
      ).trim();
      if (!/^https?:\/\//i.test(playUrl)) return null;
      return {
        playUrl,
        rawCaption: String(item.desc || "").trim(),
        authorName: String(item.author?.nickname || "").trim(),
        authorId: String(item.author?.uniqueId || "").trim(),
        headers: {
          "User-Agent": TT_UA,
          "Referer": "https://www.tiktok.com/",
          ...(cookie ? { "Cookie": cookie } : {})
        }
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  async function fetchTikTokViaTikwm(targetUrl, usePost) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    try {
      const opts = usePost
        ? {
            method: "POST",
            signal: ac.signal,
            headers: {
              "User-Agent": TT_UA,
              "Content-Type": "application/x-www-form-urlencoded",
              "Referer": "https://www.tikwm.com/",
              "Origin": "https://www.tikwm.com"
            },
            body: `url=${encodeURIComponent(targetUrl)}&hd=1`
          }
        : {
            signal: ac.signal,
            headers: { "User-Agent": TT_UA, "Referer": "https://www.tikwm.com/" }
          };
      const endpoint = usePost ? "https://www.tikwm.com/api/" : `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`;
      const r = await fetch(endpoint, opts);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.code !== 0 || !j.data) return null;
      let playUrl = String(j.data.hdplay || j.data.play || j.data.wmplay || "").trim();
      if (playUrl.startsWith("/")) playUrl = `https://www.tikwm.com${playUrl}`;
      if (!/^https?:\/\//i.test(playUrl)) return null;
      return {
        playUrl,
        rawCaption: String(j.data.title || "").trim(),
        authorName: String(j.data.author?.nickname || "").trim(),
        authorId: String(j.data.author?.unique_id || "").trim(),
        headers: { "User-Agent": TT_UA, "Referer": "https://www.tikwm.com/" }
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  async function fetchTikTokViaTiklydown(targetUrl) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(targetUrl)}`, {
        signal: ac.signal,
        headers: { "User-Agent": TT_UA }
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.video) return null;
      const playUrl = String(j.video.noWatermark || j.video.watermark || "").trim();
      if (!/^https?:\/\//i.test(playUrl)) return null;
      return {
        playUrl,
        rawCaption: String(j.title || "").trim(),
        authorName: String(j.author?.name || "").trim(),
        authorId: String(j.author?.unique_id || "").trim(),
        headers: { "User-Agent": TT_UA }
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const tiktokImportCache = new Map();
  app.post("/api/videos/import-tiktok", limit(20, 600000), wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const rawUrl = String(req.body?.url || "").trim();
    let parsed;
    try { parsed = new URL(rawUrl); } catch { throw new HttpError(400, "Enter a valid TikTok video URL."); }
    if (!["http:", "https:"].includes(parsed.protocol) || !/(^|\.)tiktok\.com$/i.test(parsed.hostname)) {
      throw new HttpError(400, "Please enter a valid tiktok.com link.");
    }
    const cleanUrl = `${parsed.origin}${parsed.pathname}`;
    const result = (await fetchTikTokViaDirect(cleanUrl))
      || (await fetchTikTokViaTikwm(cleanUrl, true))
      || (await fetchTikTokViaTikwm(cleanUrl, false))
      || (await fetchTikTokViaTiklydown(cleanUrl));

    if (!result || !result.playUrl) {
      throw new HttpError(400, "Could not fetch that TikTok video. It may be private, region-locked, or temporarily blocked.");
    }
    const rawCaption = result.rawCaption || "";
    const hashtags = [...new Set((rawCaption.match(/#[a-zA-Z0-9_]{1,30}/g) || []).map(t => t.toLowerCase()))].slice(0, 5);
    const cleanTitle = rawCaption.replace(/#[a-zA-Z0-9_]+/g, "").replace(/\s+/g, " ").trim().slice(0, 100)
      || (result.authorName ? `${result.authorName} TikTok` : "TikTok Video");
    const description = rawCaption.slice(0, 300);
    const now = Date.now();
    for (const [k, v] of tiktokImportCache.entries()) {
      if (v.expiresAt <= now) tiktokImportCache.delete(k);
    }
    const importId = crypto.randomUUID();
    tiktokImportCache.set(importId, {
      playUrl: result.playUrl,
      headers: result.headers || { "User-Agent": TT_UA },
      uid,
      expiresAt: now + 5 * 60 * 1000
    });
    return {
      data: { importId, title: cleanTitle, description, hashtags, author: result.authorId || "" },
      error: null
    };
  }));

  app.get("/api/videos/import-tiktok/:id/file", async (req, res) => {
    try {
      const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
      const entry = tiktokImportCache.get(String(req.params.id || ""));
      if (!entry || entry.uid !== uid || entry.expiresAt <= Date.now()) {
        return res.status(404).json({ error: { message: "Import expired. Paste the TikTok link again." } });
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 60000);
      try {
        const vr = await fetch(entry.playUrl, {
          signal: ac.signal,
          redirect: "follow",
          headers: entry.headers || { "User-Agent": TT_UA }
        });
        if (!vr.ok) return res.status(502).json({ error: { message: `Could not download TikTok video (${vr.status}).` } });
        const len = Number(vr.headers.get("content-length") || 0);
        if (len > 100 * 1024 * 1024) return res.status(413).json({ error: { message: "TikTok video exceeds 100 MB limit." } });
        const buf = Buffer.from(await vr.arrayBuffer());
        if (buf.length > 100 * 1024 * 1024) return res.status(413).json({ error: { message: "TikTok video exceeds 100 MB limit." } });
        tiktokImportCache.delete(req.params.id);
        res.setHeader("Content-Type", vr.headers.get("content-type") || "video/mp4");
        res.setHeader("Cache-Control", "no-store");
        res.send(buf);
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      res.status(e instanceof HttpError ? e.status : 500).json({ error: { message: e?.message || "Import failed." } });
    }
  });

  app.get("/api/admin/log", wrap(async req => {
    const me = needAdmin(req); if (me.role !== "owner") throw new HttpError(403, "Only the owner can see the log");
    return { data: await run(`SELECT l.action, l.detail, l.created_at, p.username AS admin FROM admin_log l LEFT JOIN profiles p ON p.id = l.admin_id ORDER BY l.id DESC LIMIT 100`), error: null };
  }));
};
