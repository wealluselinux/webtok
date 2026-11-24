/* Web Tok AI (@webtok_ai via NVIDIA NIM), Content Safety Checker, Admin Application AI Evaluator, & Mailer */
const path = require("path");
const crypto = require("crypto");
const tls = require("tls");
const bcrypt = require("bcryptjs");

const AI_ID = "00000000-0000-0000-0000-000000000002";
const NOTIF_ID = "00000000-0000-0000-0000-000000000001";
const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const CHAT_MODELS = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3.5-bolt-e4b",
  "meta/llama-3.1-8b-instruct",
  "qwen/qwen2.5-coder-32b-instruct",
  "nvidia/llama-3.1-nemotron-51b-instruct"
];
const VISION_MODELS = ["meta/llama-3.2-11b-vision-instruct", "nvidia/nemotron-3.5-super-vl-120b-a12b"];

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmailHtml({ title, bannerBg = "#d0bcff", bannerFg = "#1d192b", greeting = "Hi there!", intro = "", pillText = "", details = [], noteText = "", ctaLabel = "", ctaUrl = "" }) {
  const baseUrl = (process.env.RENDER_EXTERNAL_URL || "https://webtok.onrender.com").replace(/\/+$/, "");
  const logoUrl = `${baseUrl}/images/logo.png`;
  const supportUrl = `${baseUrl}/support`;
  const detailRows = (details || []).filter(Boolean).map(([k, v]) =>
    `<tr><td style="padding:6px 0;color:#625b71;font-size:13px;width:90px;vertical-align:top;"><strong>${escHtml(k)}</strong></td><td style="padding:6px 0;color:#1d192b;font-size:13px;word-break:break-word;">${escHtml(v)}</td></tr>`
  ).join("");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f0f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d192b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0f8;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
        <tr><td align="center" style="padding:0 0 18px;">
          <a href="${baseUrl}" style="text-decoration:none;display:inline-flex;align-items:center;gap:10px;color:#1d192b;">
            <img src="${logoUrl}" alt="Web Tok" width="32" height="32" style="display:inline-block;vertical-align:middle;border-radius:10px;border:0;">
            <span style="font-size:22px;font-weight:800;letter-spacing:-0.4px;vertical-align:middle;color:#6750a4;">Web Tok</span>
          </a>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 6px 24px rgba(29,25,43,0.08);">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td align="center" style="background:${bannerBg};padding:34px 24px;">
              <h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:${bannerFg};letter-spacing:-0.5px;">${escHtml(title)}</h1>
            </td></tr>
            <tr><td style="padding:32px 32px 28px;">
              <p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#1d192b;">${escHtml(greeting)}</p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#3b3548;">${escHtml(intro)}</p>
              ${pillText ? `<div style="text-align:center;margin:24px 0;">
                <span style="display:inline-block;background:${bannerBg};color:${bannerFg};font-size:24px;font-weight:800;letter-spacing:4px;padding:13px 32px;border-radius:999px;">${escHtml(pillText)}</span>
              </div>` : ""}
              ${detailRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1fc;border-radius:16px;padding:14px 18px;margin:0 0 20px;">${detailRows}</table>` : ""}
              ${ctaLabel && ctaUrl ? `<div style="text-align:center;margin:22px 0;">
                <a href="${escHtml(ctaUrl)}" style="display:inline-block;background:#6750a4;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:999px;">${escHtml(ctaLabel)}</a>
              </div>` : ""}
              <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#625b71;font-style:italic;">
                ${escHtml(noteText || "If you didn't request this or have any questions, please")} <a href="${supportUrl}" style="color:#6750a4;text-decoration:underline;">contact support</a>.
              </p>
              <p style="margin:26px 0 0;text-align:center;font-size:15px;font-weight:700;color:#6750a4;">The Web Tok Team</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:18px 12px 0;font-size:12px;color:#625b71;">
          <a href="${baseUrl}" style="color:#625b71;text-decoration:none;margin:0 8px;">Web Tok</a> ·
          <a href="${supportUrl}" style="color:#625b71;text-decoration:none;margin:0 8px;">Support</a> ·
          <a href="${baseUrl}/terms" style="color:#625b71;text-decoration:none;margin:0 8px;">Terms</a> ·
          <a href="${baseUrl}/privacy" style="color:#625b71;text-decoration:none;margin:0 8px;">Privacy</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* Multi-provider mailer: Brevo HTTPS API -> Resend HTTPS API -> SMTP over TLS (Gmail / AOL / custom) */
async function sendMail({ to, subject, text, html }) {
  const safeTo = String(to || "").replace(/[\r\n<>]+/g, "").trim();
  if (!safeTo || !safeTo.includes("@") || safeTo.endsWith(".system")) {
    return { sent: false, skipped: true };
  }
  const safeSub = String(subject || "").replace(/[\r\n]+/g, " ").trim();
  const fromAddr = (process.env.MAIL_FROM || process.env.MAIL_USER || process.env.AOL_MAIL_USER || "").trim();

  const brevoKey = (process.env.BREVO_API_KEY || "").trim();
  if (brevoKey && fromAddr) {
    const payload = {
      sender: { name: "Web Tok", email: fromAddr },
      to: [{ email: safeTo }],
      subject: safeSub,
      textContent: String(text || "")
    };
    if (html) payload.htmlContent = String(html);
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": brevoKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    return { sent: true, provider: "brevo" };
  }

  const resendKey = (process.env.RESEND_API_KEY || "").trim();
  if (resendKey) {
    const payload = {
      from: fromAddr ? `Web Tok <${fromAddr}>` : "Web Tok <onboarding@resend.dev>",
      to: [safeTo],
      subject: safeSub,
      text: String(text || "")
    };
    if (html) payload.html = String(html);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return { sent: true, provider: "resend" };
  }

  const user = (process.env.MAIL_USER || process.env.AOL_MAIL_USER || "").trim();
  const pass = (process.env.MAIL_PASS || process.env.AOL_MAIL_PASS || "").trim();
  if (!user || !pass) return { sent: false, skipped: true };

  const host = (process.env.MAIL_HOST || (user.toLowerCase().endsWith("@gmail.com") ? "smtp.gmail.com" : "smtp.aol.com")).trim();
  const port = parseInt(process.env.MAIL_PORT || "465", 10) || 465;

  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host });
    sock.setTimeout(15000, () => { sock.destroy(); reject(new Error("SMTP timeout")); });
    let buf = "";
    let step = 0;
    const b64 = s => Buffer.from(s, "utf8").toString("base64");
    const bodyText = String(text || "").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const cmds = [
      () => `EHLO webtok.onrender.com\r\n`,
      () => `AUTH LOGIN\r\n`,
      () => `${b64(user)}\r\n`,
      () => `${b64(pass)}\r\n`,
      () => `MAIL FROM:<${user}>\r\n`,
      () => `RCPT TO:<${safeTo}>\r\n`,
      () => `DATA\r\n`,
      () => `From: "Web Tok Mailer" <${user}>\r\nTo: <${safeTo}>\r\nSubject: ${safeSub}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${bodyText}\r\n.\r\n`,
      () => `QUIT\r\n`
    ];
    sock.on("data", chunk => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line || /^\d{3}-/.test(line)) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (code >= 400) {
          sock.destroy();
          return reject(new Error(`SMTP ${line}`));
        }
        if (step < cmds.length) {
          sock.write(cmds[step++]());
        } else {
          sock.end();
          return resolve({ sent: true, provider: "smtp" });
        }
      }
    });
    sock.on("error", err => reject(err));
  });
}

module.exports = function mountAI({ app, db, run, wrap, uidFrom, HttpError, nowIso, removeFromR2 }) {
  const aiKey = () => (process.env.WEBYOK_AI || process.env.WEBTOK_AI || process.env.WEB_TALK_AI || process.env.NVIDIA_API_KEY || process.env.AI_ADMINFROM_CHECKER || "").trim();
  const checkerKey = () => (process.env.WEBTOK_CHECKER || process.env.WEB_TALK_CHECKER || "").trim();
  const adminFormKey = () => (process.env.AI_ADMINFROM_CHECKER || process.env.WEBYOK_AI || process.env.WEBTOK_AI || process.env.WEB_TALK_AI || "").trim();
  app.locals.sendMail = sendMail;
  app.locals.buildEmailHtml = buildEmailHtml;
  app.locals.isMailerConfigured = () => {
    const fromAddr = (process.env.MAIL_FROM || process.env.MAIL_USER || process.env.AOL_MAIL_USER || "").trim();
    if ((process.env.BREVO_API_KEY || "").trim() && fromAddr) return true;
    if ((process.env.RESEND_API_KEY || "").trim()) return true;
    return !!((process.env.MAIL_USER || process.env.AOL_MAIL_USER || "").trim() && (process.env.MAIL_PASS || process.env.AOL_MAIL_PASS || "").trim());
  };

  let appsTableReady = false;
  async function ensureAdminAppsTable() {
    if (appsTableReady) return;
    await db.batch([
      `CREATE TABLE IF NOT EXISTS admin_applications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        ai_verdict TEXT,
        ai_score INTEGER,
        ai_reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_admin_apps_user ON admin_applications(user_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_admin_apps_status ON admin_applications(status, created_at DESC)"
    ], "write");
    appsTableReady = true;
  }

  async function ensureAiAccount() {
    if ((await run("SELECT 1 FROM profiles WHERE id = ?", [AI_ID])).length) return;
    const ts = nowIso();
    const lockedHash = "$2a$10$" + crypto.randomBytes(24).toString("hex");
    await db.batch([
      {
        sql: "INSERT OR IGNORE INTO users (id, email, encrypted_password, raw_user_meta_data, role, created_at) VALUES (?,?,?,?,?,?)",
        args: [AI_ID, "ai@webtok.system", lockedHash, JSON.stringify({ username: "webtok_ai", display_name: "Web Tok AI" }), "system", ts]
      },
      {
        sql: "INSERT OR IGNORE INTO profiles (id, username, display_name, bio, avatar_url, theme, created_at) VALUES (?,?,?,?,NULL,'{}',?)",
        args: [AI_ID, "webtok_ai", "Web Tok AI", "Ask me anything or share a Web Tok video to see what it's about!", ts]
      }
    ], "write");
  }
  ensureAiAccount().catch(e => console.warn("AI account setup:", e.message));

  async function ensureNotifAccount() {
    const u = await run("SELECT 1 FROM users WHERE id = ?", [NOTIF_ID]);
    const p = await run("SELECT 1 FROM profiles WHERE id = ?", [NOTIF_ID]);
    if (u.length && p.length) return;
    const ts = nowIso();
    const lockedHash = "$2a$10$" + crypto.randomBytes(24).toString("hex");
    await db.batch([
      {
        sql: "INSERT OR IGNORE INTO users (id, email, encrypted_password, raw_user_meta_data, role, created_at) VALUES (?,?,?,?,?,?)",
        args: [NOTIF_ID, "notifications@webtok.system", lockedHash, JSON.stringify({ username: "notifications", display_name: "Notifications" }), "system", ts]
      },
      {
        sql: "INSERT OR IGNORE INTO profiles (id, username, display_name, bio, avatar_url, theme, created_at) VALUES (?,?,?,?,NULL,'{}',?)",
        args: [NOTIF_ID, "notifications", "Notifications", "Official Web Tok announcements", ts]
      }
    ], "write");
  }

  async function callNim(key, models, messages, maxTokens = 512) {
    let lastErr = null;
    for (const model of models) {
      try {
        const r = await fetch(NIM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.4, stream: false }),
          signal: AbortSignal.timeout(25000)
        });
        const raw = await r.text();
        let j = {};
        try { j = JSON.parse(raw); } catch {}
        if (!r.ok) {
          lastErr = new Error(`${model}: ${j?.error?.message || j?.detail || (raw ? raw.slice(0, 140) : `HTTP ${r.status}`)}`);
          continue;
        }
        const text = j?.choices?.[0]?.message?.content;
        if (text) return String(text).trim();
        lastErr = new Error(`${model}: Empty AI response`);
      } catch (e) { lastErr = new Error(`${model}: ${e?.message || "Request failed"}`); }
    }
    throw lastErr || new Error("AI service unavailable");
  }

  async function checkMediaSafety({ text = "", imageUrl = "", imageDataUrl = "" }) {
    const key = checkerKey();
    if (!key) return { safe: true };
    const sys = "You are a strict content safety classifier for a video social app. Reply ONLY with 'SAFE' or 'UNSAFE: <short reason>'. Mark UNSAFE if the text or image contains pornography, explicit nudity, sexual acts, CSAM/sexualized minors, or extreme gore.";
    const img = imageDataUrl || imageUrl;
    try {
      let reply = "";
      if (img) {
        const content = [
          { type: "text", text: `Check this uploaded media and caption/title for safety.\nText: ${String(text || "(none)").slice(0, 300)}` },
          { type: "image_url", image_url: { url: img } }
        ];
        reply = await callNim(key, VISION_MODELS, [{ role: "system", content: sys }, { role: "user", content }], 80);
      } else if (text.trim()) {
        reply = await callNim(key, CHAT_MODELS, [{ role: "system", content: sys }, { role: "user", content: `Text: ${text.slice(0, 400)}` }], 60);
      } else {
        return { safe: true };
      }
      if (/^\s*UNSAFE\b/i.test(reply)) {
        return { safe: false, reason: reply.replace(/^\s*UNSAFE\s*:?\s*/i, "").trim() || "Blocked by content safety policy." };
      }
      return { safe: true };
    } catch (e) {
      console.warn("Content safety check error:", e.message);
      return { safe: true };
    }
  }
  app.locals.checkMediaSafety = checkMediaSafety;

  app.post("/api/ai/check-media", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const title = String(req.body?.title || "").slice(0, 200);
    const hashtags = Array.isArray(req.body?.hashtags) ? req.body.hashtags.join(" ") : "";
    const imageDataUrl = typeof req.body?.frame === "string" && req.body.frame.startsWith("data:image/") ? req.body.frame.slice(0, 180000) : "";
    const res = await checkMediaSafety({ text: `${title} ${hashtags}`.trim(), imageDataUrl });
    if (!res.safe) {
      const sp = String(req.body?.storage_path || "").trim();
      if (sp && sp.startsWith(uid + "/") && removeFromR2) await removeFromR2([`videos/${sp}`]).catch(() => {});
      throw new HttpError(403, `Upload blocked by safety filter: ${res.reason}`);
    }
    return { data: { safe: true }, error: null };
  }));

  /* ---------- Admin Application Form + AI_ADMINFROM_CHECKER + Owner Yes/No ---------- */
  app.get("/api/admin-applications/mine", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureAdminAppsTable();
    const row = (await run("SELECT id, status, ai_verdict, ai_score, created_at, reviewed_at FROM admin_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", [uid]))[0];
    return { data: row || null, error: null };
  }));

  app.post("/api/admin-applications", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    if (["admin", "owner"].includes(req.wt?.role)) throw new HttpError(400, "You already have admin access.");
    await ensureAdminAppsTable();

    const pending = await run("SELECT 1 FROM admin_applications WHERE user_id = ? AND status = 'pending'", [uid]);
    if (pending.length) throw new HttpError(409, "You already have a pending admin application awaiting owner review.");

    const why = String(req.body?.why || "").trim().slice(0, 800);
    const moderation = String(req.body?.moderation || "").trim().slice(0, 800);
    const activity = String(req.body?.activity || "").trim().slice(0, 600);
    const extra = String(req.body?.extra || "").trim().slice(0, 600);
    if (why.length < 10 || moderation.length < 10 || activity.length < 5) {
      throw new HttpError(400, "Please answer all required questions in detail.");
    }

    const [profRow, vidRow, cmtRow, admins] = await Promise.all([
      run("SELECT u.created_at, u.restrictions, u.email, p.username, p.display_name FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?", [uid]),
      run("SELECT COUNT(*) n FROM videos WHERE user_id = ?", [uid]),
      run("SELECT COUNT(*) n FROM comments WHERE user_id = ?", [uid]),
      run("SELECT p.username, p.display_name, u.role, u.role_since FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.role IN ('owner','admin') ORDER BY u.role DESC, u.created_at ASC")
    ]);
    const prof = profRow[0] || {};
    const adminRoster = admins.map(a => `@${a.username || "unknown"} (${a.role})`).join(", ") || "Owner only";

    let aiVerdict = "PENDING_AI";
    let aiScore = null;
    let aiReason = "AI evaluation unavailable (AI_ADMINFROM_CHECKER key not configured).";
    const key = adminFormKey();
    if (key) {
      const prompt = [
        `Applicant: ${prof.display_name || ""} (@${prof.username || "user"}), joined ${prof.created_at || "unknown"}, videos posted: ${vidRow[0]?.n || 0}, comments: ${cmtRow[0]?.n || 0}, restrictions: ${prof.restrictions || "[]"}.`,
        `Current admin team (${admins.length}): ${adminRoster}.`,
        ``,
        `Q1 (Why do you want to be an admin?): ${why}`,
        `Q2 (How would you handle spam, rule-breaking videos, or disputes?): ${moderation}`,
        `Q3 (How active are you and what would you help improve?): ${activity}`,
        `Q4 (Anything else?): ${extra || "(none)"}`,
        ``,
        `Evaluate if this person should be made a Web Tok admin. Reply in JSON ONLY with keys: "recommend" ("APPROVE" or "DENY"), "score" (integer 1-10), and "reason" (2-3 concise sentences explaining why, considering their answers and the current admin team).`
      ].join("\n");
      try {
        const rawReply = await callNim(key, CHAT_MODELS, [
          { role: "system", content: "You are an admin-application evaluator for Web Tok. Output valid JSON only: {\"recommend\":\"APPROVE\"|\"DENY\",\"score\":1-10,\"reason\":\"...\"}." },
          { role: "user", content: prompt }
        ], 320);
        const jm = /\{[\s\S]*\}/.exec(rawReply);
        if (jm) {
          const parsed = JSON.parse(jm[0]);
          aiVerdict = String(parsed.recommend || "").toUpperCase() === "APPROVE" ? "APPROVE" : "DENY";
          aiScore = Math.min(10, Math.max(1, parseInt(parsed.score, 10) || 5));
          aiReason = String(parsed.reason || rawReply).trim().slice(0, 600);
        } else {
          aiVerdict = /APPROVE/i.test(rawReply) ? "APPROVE" : "DENY";
          aiReason = rawReply.slice(0, 600);
        }
      } catch (e) {
        aiVerdict = "ERROR";
        aiReason = `AI evaluation error: ${e?.message || "Failed"}`;
      }
    }

    const id = crypto.randomUUID(), ts = nowIso();
    const answers = { why, moderation, activity, extra };
    await db.execute({
      sql: "INSERT INTO admin_applications (id, user_id, answers_json, ai_verdict, ai_score, ai_reason, status, created_at) VALUES (?,?,?,?,?,?,'pending',?)",
      args: [id, uid, JSON.stringify(answers), aiVerdict, aiScore, aiReason, ts]
    });

    if (aiVerdict === "DENY") {
      await ensureAiAccount();
      await db.execute({
        sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)",
        args: [AI_ID, "ai_deny_admin_app", `@${prof.username || "user"} (${prof.email || uid}) — Score ${aiScore ?? "?"}/10: ${aiReason}`.slice(0, 500), ts]
      }).catch(() => {});
    }

    return { data: { id, status: "pending", ai_verdict: aiVerdict, ai_score: aiScore, created_at: ts }, error: null };
  }));

  app.get("/api/admin/applications", wrap(async req => {
    if (!req.wt) throw new HttpError(401, "Sign in required");
    if (!["admin", "owner"].includes(req.wt.role)) throw new HttpError(403, "Admins only");
    await ensureAdminAppsTable();
    const rows = await run(`
      SELECT a.*, p.username, p.display_name, u.email, u.created_at AS user_created_at, u.role AS current_role
      FROM admin_applications a
      LEFT JOIN profiles p ON p.id = a.user_id
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC LIMIT 80`);
    const out = rows.map(r => {
      let answers = {};
      try { answers = JSON.parse(r.answers_json || "{}"); } catch {}
      return { ...r, answers };
    });
    return { data: out, error: null };
  }));

  app.post("/api/admin/applications/:id/decide", wrap(async req => {
    if (!req.wt) throw new HttpError(401, "Sign in required");
    if (req.wt.role !== "owner") throw new HttpError(403, "Only the owner can approve or deny admin applications.");
    await ensureAdminAppsTable();
    const id = String(req.params.id || "").trim();
    const decision = req.body?.decision === "approved" ? "approved" : req.body?.decision === "denied" ? "denied" : null;
    if (!decision) throw new HttpError(400, "Decision must be 'approved' or 'denied'.");

    const appRow = (await run("SELECT * FROM admin_applications WHERE id = ?", [id]))[0];
    if (!appRow) throw new HttpError(404, "Application not found.");
    if (appRow.status !== "pending") throw new HttpError(400, "This application has already been reviewed.");

    const appUser = (await run("SELECT u.email, p.username FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?", [appRow.user_id]))[0] || {};
    const customReason = String(req.body?.reason || "").trim().slice(0, 600);
    const denyReason = customReason || String(appRow.ai_reason || "").trim() || "Your application did not meet the requirements at this time.";

    const ts = nowIso();
    await db.execute({
      sql: "UPDATE admin_applications SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      args: [decision, req.wt.uid, ts, id]
    });

    if (decision === "approved") {
      await db.execute({
        sql: "UPDATE users SET role = 'admin', role_since = COALESCE(role_since, ?) WHERE id = ? AND role = 'user'",
        args: [ts, appRow.user_id]
      });
      if (app.locals.forgetUser) app.locals.forgetUser(appRow.user_id);
    }

    await ensureNotifAccount();
    const msg = decision === "approved"
      ? "Congratulations! Your Web Tok Admin application was approved by the owner. You now have access to the Admin panel."
      : `Your Web Tok Admin application was reviewed by the owner and was not approved at this time.\n\nReason: ${denyReason}`;
    await db.execute({
      sql: "INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?,?,?,?)",
      args: [NOTIF_ID, appRow.user_id, msg.slice(0, 1000), ts]
    }).catch(() => {});

    if (appUser.email) {
      const baseUrl = (process.env.RENDER_EXTERNAL_URL || "https://webtok.onrender.com").replace(/\/+$/, "");
      const html = buildEmailHtml({
        title: decision === "approved" ? "Admin Application Approved" : "Admin Application Update",
        bannerBg: decision === "approved" ? "#c8f0d4" : "#ffd8d4",
        bannerFg: decision === "approved" ? "#103b20" : "#5c1410",
        greeting: `Hi @${appUser.username || "user"}!`,
        intro: decision === "approved"
          ? "Congratulations! Your Web Tok Admin application was approved by the owner. You now have access to the Admin panel."
          : "Your Web Tok Admin application was reviewed by the owner and was not approved at this time.",
        details: decision === "denied" ? [["Reason", denyReason]] : [["Role", "Admin"]],
        noteText: "Questions about this decision? You can reach out anytime and",
        ctaLabel: decision === "approved" ? "Open Admin Panel" : "Back to Web Tok",
        ctaUrl: decision === "approved" ? `${baseUrl}/admin` : `${baseUrl}/scroll`
      });
      sendMail({
        to: appUser.email,
        subject: decision === "approved" ? "Web Tok Admin Application Approved" : "Web Tok Admin Application Update",
        text: `Hi @${appUser.username || "user"},\n\n${msg}\n\n— Web Tok`,
        html
      }).catch(e => console.warn("Mailer error:", e.message));
    }

    const logDetail = decision === "approved"
      ? `@${appUser.username || appRow.user_id} approved as admin`
      : `@${appUser.username || appRow.user_id} denied — Reason: ${denyReason}`;
    await db.execute({
      sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)",
      args: [req.wt.uid, decision === "approved" ? "approve_admin_app" : "deny_admin_app", logDetail.slice(0, 500), ts]
    }).catch(() => {});

    return { data: { id, status: decision }, error: null };
  }));

  app.post("/api/admin/set-password", wrap(async req => {
    if (!req.wt) throw new HttpError(401, "Sign in required");
    if (!["admin", "owner"].includes(req.wt.role)) throw new HttpError(403, "Admins only");
    const t = (await run("SELECT u.id, u.email, u.role, p.username FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?", [String(req.body?.userId || "")]))[0];
    if (!t) throw new HttpError(404, "User not found");
    if (t.role === "owner" || t.role === "system" || t.id === req.wt.uid) throw new HttpError(403, "You can't change this account");
    if (req.wt.role !== "owner" && t.role !== "user") throw new HttpError(403, "Only the owner can change admins");
    const pw = String(req.body?.password || "");
    if (pw.length < 6 || pw.length > 128) throw new HttpError(400, "Password must be 6 to 128 characters.");
    await db.execute({ sql: "UPDATE users SET encrypted_password = ?, sessions_valid_after = ? WHERE id = ?", args: [await bcrypt.hash(pw, 10), nowIso(), t.id] });
    if (app.locals.forgetUser) app.locals.forgetUser(t.id);
    await db.execute({ sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)", args: [req.wt.uid, "reset_password", `@${t.username || "?"} (${t.email})`, nowIso()] }).catch(() => {});
    return { data: { username: t.username, email: t.email }, error: null };
  }));

  app.post("/api/admin/announce", wrap(async req => {
    if (!req.wt) throw new HttpError(401, "Sign in required");
    if (!["admin", "owner"].includes(req.wt.role)) throw new HttpError(403, "Admins only");
    const message = String(req.body?.message || "").trim();
    if (!message || message.length > 1000) throw new HttpError(400, "Announcement must be 1 to 1000 characters.");
    await ensureNotifAccount();
    const recipients = await run(
      "SELECT id FROM users WHERE id != ? AND COALESCE(banned, 0) = 0 AND COALESCE(role, 'user') != 'system'",
      [NOTIF_ID]
    );
    const ts = nowIso();
    const stmts = recipients.map(r => ({
      sql: "INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?,?,?,?)",
      args: [NOTIF_ID, r.id, message, ts]
    }));
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50), "write");
    }
    await db.execute({
      sql: "INSERT INTO admin_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)",
      args: [req.wt.uid, "announce", `Sent to ${recipients.length} user(s): ${message.slice(0, 80)}`, ts]
    }).catch(() => {});
    return { data: { sentCount: recipients.length }, error: null };
  }));

  app.post("/api/ai/chat", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureAiAccount();
    const body = String(req.body?.body || "").trim();
    if (!body || body.length > 1000) throw new HttpError(400, "Message must be 1 to 1000 characters.");

    const tsUser = nowIso();
    const uRs = await db.execute({
      sql: "INSERT INTO messages (sender_id, recipient_id, body, created_at, read_at) VALUES (?,?,?,?,?)",
      args: [uid, AI_ID, body, tsUser, tsUser]
    });
    const userMsg = (await run("SELECT * FROM messages WHERE id = ?", [Number(uRs.lastInsertRowid)]))[0];

    const key = aiKey();
    let replyText = "Web Tok AI error: Missing API key on the server (set WEBYOK_AI, WEBTOK_AI, or WEB_TALK_AI).";
    if (key) {
      const hist = await run(
        "SELECT sender_id, body FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?) ORDER BY id DESC LIMIT 12",
        [uid, AI_ID, AI_ID, uid]
      );
      const videoMatch = /\[video_share:([^|\]]+)\|([^\]]*)\]/.exec(body);
      let videoContext = "";
      if (videoMatch) {
        const vid = (await run("SELECT v.id, v.title, v.hashtags, v.created_at, p.username, p.display_name FROM videos v LEFT JOIN profiles p ON p.id = v.user_id WHERE v.id = ?", [videoMatch[1]]))[0];
        if (vid) {
          videoContext = `\nShared Web Tok video details:\n- Title: ${vid.title}\n- Creator: ${vid.display_name || ""} (@${vid.username || "user"})\n- Hashtags: ${vid.hashtags || "[]"}\n- Posted: ${vid.created_at}`;
        }
      }

      const msgs = [
        {
          role: "system",
          content: "You are Web Tok AI, a helpful, friendly assistant built into Web Tok's Messages. Keep replies concise and natural. When users share a Web Tok video with you, use the shared video details to explain what it's about or answer their questions." + videoContext
        },
        ...hist.reverse().map(m => ({
          role: m.sender_id === AI_ID ? "assistant" : "user",
          content: String(m.body || "").replace(/\[video_share:[^|\]]+\|([^\]]*)\]/g, "[Shared video: $1]")
        }))
      ];
      try {
        replyText = await callNim(key, CHAT_MODELS, msgs, 600);
      } catch (e) {
        replyText = `Web Tok AI error: ${e?.message || "Unknown error"}`;
        console.warn("Web Tok AI error:", e.message);
      }
    }

    const tsAi = nowIso();
    const aRs = await db.execute({
      sql: "INSERT INTO messages (sender_id, recipient_id, body, created_at, read_at) VALUES (?,?,?,?,?)",
      args: [AI_ID, uid, replyText.slice(0, 1000), tsAi, tsAi]
    });
    const aiMsg = (await run("SELECT * FROM messages WHERE id = ?", [Number(aRs.lastInsertRowid)]))[0];
    return { data: { userMsg, aiMsg }, error: null };
  }));

  app.get("/games", (_req, res) => res.sendFile(path.join(__dirname, "../public/pages/games.html")));
  app.get("/developer", (_req, res) => res.sendFile(path.join(__dirname, "../public/pages/developer.html")));
  app.get("/shop", (_req, res) => res.sendFile(path.join(__dirname, "../public/pages/shop.html")));
  require("./games")({ app, db, run, wrap, uidFrom, HttpError, nowIso, aiKey, callNim, CHAT_MODELS });
  require("./shop")({ app, db, run, wrap, uidFrom, HttpError, nowIso });
};
