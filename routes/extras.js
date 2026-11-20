/* Extra server features, mounted from server.js with one line:
     require("./routes/extras")({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso });
   1) Forgot password: emailed reset link (needs BREVO_API_KEY, MAIL_FROM, and SITE_URL or Render's RENDER_EXTERNAL_URL)
   2) Unread messages: powers the dot next to Messages and the browser notifications */
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");

module.exports = function mount({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso }) {
  const sha = s => crypto.createHash("sha256").update(s).digest("hex");
  let ready = null;
  const ensure = () => ready || (ready = (async () => {
    await db.execute("CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)");
    const cols = (await db.execute("PRAGMA table_info(messages)")).rows.map(r => r[1]);
    if (!cols.includes("read_at")) {
      await db.execute("ALTER TABLE messages ADD COLUMN read_at TEXT");
      await db.execute("UPDATE messages SET read_at = created_at WHERE read_at IS NULL");   // old messages count as read
    }
  })().catch(e => { ready = null; throw e; }));
  ensure().catch(e => console.warn("extras setup:", e.message));

  async function sendMail(to, subject, html) {
    const key = process.env.BREVO_API_KEY, from = process.env.MAIL_FROM;
    if (!key || !from) { console.warn("Email is not set up (BREVO_API_KEY / MAIL_FROM), so no reset email was sent."); return false; }
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: process.env.MAIL_FROM_NAME || "Web Tok", email: from }, to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!r.ok) { console.warn("Brevo error", r.status, (await r.text()).slice(0, 200)); return false; }
    return true;
  }

  const page = f => (_q, res) => res.sendFile(path.join(__dirname, "..", "public", "pages", f));
  app.get("/forgot", page("forgot.html"));
  app.get("/reset", page("reset.html"));

  app.post("/api/auth/forgot", limit(5, 600000), wrap(async req => {
    const generic = { data: true, error: null };              // same answer whether or not the email has an account
    const em = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 120) return generic;
    await ensure();
    const u = (await run("SELECT id, email FROM users WHERE email = ?", [em]))[0];
    const site = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
    if (!u) return generic;
    if (!site) { console.warn("Set SITE_URL so reset links know your website address."); return generic; }
    const token = crypto.randomBytes(32).toString("hex");
    await db.batch([
      { sql: "DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?", args: [u.id, nowIso()] },
      { sql: "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)", args: [sha(token), u.id, new Date(Date.now() + 30 * 60 * 1000).toISOString()] },
    ], "write");
    const link = `${site}/reset?token=${token}`;
    sendMail(u.email, "Reset your Web Tok password",
      `<p>Someone asked to reset the password for your Web Tok account.</p><p><a href="${link}">Choose a new password</a></p><p>This link works once and expires in 30 minutes. If you didn't ask for this, you can ignore this email.</p>`).catch(() => {});
    return generic;
  }));

  app.post("/api/auth/reset", limit(10, 600000), wrap(async req => {
    const { token, password } = req.body || {};
    const bad = "This reset link is invalid or has expired. Request a new one.";
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, bad);
    if (weakPassword(password)) throw new HttpError(400, "Password needs 10+ characters with upper and lower case, a number and a symbol.");
    await ensure();
    const row = (await run("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?", [sha(token), nowIso()]))[0];
    if (!row) throw new HttpError(400, bad);
    await db.batch([
      { sql: "UPDATE users SET encrypted_password = ? WHERE id = ?", args: [await bcrypt.hash(password, 10), row.user_id] },
      { sql: "DELETE FROM password_resets WHERE user_id = ?", args: [row.user_id] },
    ], "write");
    return { data: true, error: null };
  }));

  app.get("/api/messages/unread", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensure();
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
    await ensure();
    await db.execute({ sql: "UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL", args: [nowIso(), uid, from] });
    return { data: true, error: null };
  }));
};
