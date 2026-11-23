/* Web Tok AI (@webtok_ai via NVIDIA NIM) & AI Content Safety Checker (videos + stickers) */
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const AI_ID = "00000000-0000-0000-0000-000000000002";
const NOTIF_ID = "00000000-0000-0000-0000-000000000001";
const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const CHAT_MODELS = ["meta/llama-3.3-70b-instruct", "google/gemma-4-31b-it"];
const VISION_MODELS = ["meta/llama-3.2-11b-vision-instruct", "nvidia/nemotron-3.5-super-vl-120b-a12b"];

module.exports = function mountAI({ app, db, run, wrap, uidFrom, HttpError, nowIso, removeFromR2 }) {
  const aiKey = () => (process.env.WEBYOK_AI || process.env.WEBTOK_AI || process.env.WEB_TALK_AI || "").trim();
  const checkerKey = () => (process.env.WEBTOK_CHECKER || process.env.WEB_TALK_CHECKER || "").trim();

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
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { lastErr = new Error(j?.error?.message || j?.detail || `NIM HTTP ${r.status}`); continue; }
        const text = j?.choices?.[0]?.message?.content;
        if (text) return String(text).trim();
      } catch (e) { lastErr = e; }
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
    let replyText = "Web Tok AI isn't configured yet (missing API key on the server).";
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
        replyText = "Sorry, I had trouble reaching Web Tok AI right now. Try again in a moment!";
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
