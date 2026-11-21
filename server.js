/* Web Tok server: static site + JSON API on Turso (libSQL) with our own login, and Cloudflare R2 for video/avatar files.
   Environment (set in Render): TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET, R2_ACCOUNT_ID, R2_BUCKET,
   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL */
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@libsql/client");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 24) { console.error("Set JWT_SECRET (24+ characters) in the environment."); process.exit(1); }
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
const db = createClient({ url: process.env.TURSO_DATABASE_URL || "file:local.db", authToken: process.env.TURSO_AUTH_TOKEN });

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const nowIso = () => new Date().toISOString();
const rowsOf = rs => rs.rows.map(r => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
const run = async (sql, args = []) => rowsOf(await db.execute({ sql, args }));

/* ---------------- tables, and who may do what (replaces Supabase row-level security) ---------------- */
const TABLES = {
  profiles:    { cols: ["id", "username", "display_name", "bio", "avatar_url", "theme", "created_at"], pk: ["id"], json: ["theme"] },
  videos:      { cols: ["id", "user_id", "title", "video_url", "storage_path", "orientation", "created_at", "hashtags"], pk: ["id"], json: ["hashtags"] },
  likes:       { cols: ["video_id", "user_id", "created_at"], pk: ["video_id", "user_id"] },
  comments:    { cols: ["id", "video_id", "user_id", "text", "created_at"], pk: ["id"] },
  follows:     { cols: ["follower_id", "following_id", "created_at"], pk: ["follower_id", "following_id"] },
  messages:    { cols: ["id", "sender_id", "recipient_id", "body", "created_at"], pk: ["id"] },
  video_views: { cols: ["user_id", "video_id", "liked", "created_at"], pk: ["user_id", "video_id"], bool: ["liked"] },
};
const POLICY = {
  profiles:    { read: "public", owner: "id", write: ["update", "upsert"], upd: ["username", "display_name", "bio", "avatar_url", "theme"] },
  videos:      { read: "public", owner: "user_id", write: ["insert", "delete"] },
  likes:       { read: "public", owner: "user_id", write: ["insert", "delete"] },
  comments:    { read: "public", owner: "user_id", write: ["insert", "delete"] },
  follows:     { read: "public", owner: "follower_id", write: ["insert", "delete"] },
  messages:    { read: "party", owner: "sender_id", write: ["insert"] },
  video_views: { read: "own", owner: "user_id", write: ["insert", "update", "upsert"], upd: ["liked"] },
};
const TEXT_ID = new Set(["videos", "comments"]);

async function migrate() {
  const cols = (await db.execute("PRAGMA table_info(videos)")).rows.map(r => r[1]);
  if (!cols.includes("hashtags")) await db.execute("ALTER TABLE videos ADD COLUMN hashtags TEXT NOT NULL DEFAULT '[]'");
  await db.batch([
    "CREATE TABLE IF NOT EXISTS video_views (user_id TEXT NOT NULL, video_id TEXT NOT NULL, liked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, PRIMARY KEY (user_id, video_id))",
    "CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_likes_video ON likes(video_id)",
    "CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)",
    "CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id)",
  ], "write");
}

/* ---------------- login (our own, replaces Supabase Auth) ---------------- */
const publicUser = u => ({ id: u.id, email: u.email, user_metadata: safeJson(u.raw_user_meta_data, {}) });
function safeJson(s, d) { try { return typeof s === "string" ? JSON.parse(s) : (s ?? d); } catch { return d; } }
function makeSession(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: jwt.sign({ sub: u.id, email: u.email, t: "a" }, JWT_SECRET, { expiresIn: "1h" }),
    refresh_token: jwt.sign({ sub: u.id, t: "r" }, JWT_SECRET, { expiresIn: "60d" }),
    token_type: "bearer", expires_in: 3600, expires_at: exp, user: publicUser(u),
  };
}
function uidFrom(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  try { const p = jwt.verify(h.slice(7), JWT_SECRET); return p.t === "a" ? p.sub : null; } catch { return null; }
}
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = req.ip + req.path, n = Date.now(), h = hits.get(k);
    if (!h || h.reset < n) { hits.set(k, { c: 1, reset: n + windowMs }); return next(); }
    if (++h.c > max) return res.status(429).json({ error: { message: "Too many attempts. Try again in a few minutes." } });
    next();
  };
}
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, 600000).unref();
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const weakPassword = p => typeof p !== "string" || p.length < 10 || p.length > 128 || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p);

/* ---------------- query engine ---------------- */
const norm = v => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : (v !== null && typeof v === "object") ? JSON.stringify(v) : v);
function cond(t, f, args) {
  if (!f || !TABLES[t].cols.includes(f.c)) throw new HttpError(400, "Unknown column");
  const c = `"${f.c}"`;
  switch (f.o) {
    case "eq": args.push(norm(f.v)); return `${c} = ?`;
    case "neq": args.push(norm(f.v)); return `${c} IS NOT ?`;
    case "gt": args.push(norm(f.v)); return `${c} > ?`;
    case "gte": args.push(norm(f.v)); return `${c} >= ?`;
    case "lt": args.push(norm(f.v)); return `${c} < ?`;
    case "lte": args.push(norm(f.v)); return `${c} <= ?`;
    case "like": case "ilike": args.push(String(f.v).slice(0, 100)); return `${c} LIKE ?`;
    case "is": return (f.v === null || f.v === "null") ? `${c} IS NULL` : `${c} = ${(f.v === true || f.v === "true") ? 1 : 0}`;
    case "in": {
      if (!Array.isArray(f.v) || f.v.length > 500) throw new HttpError(400, "Bad filter");
      if (!f.v.length) return "0";
      f.v.forEach(x => args.push(norm(x))); return `${c} IN (${f.v.map(() => "?").join(",")})`;
    }
    default: throw new HttpError(400, "Unknown filter");
  }
}
function where(t, p, scopeCol, uid, party) {
  const parts = [], args = [];
  (p.filters || []).slice(0, 20).forEach(f => parts.push(cond(t, f, args)));
  (p.ors || []).slice(0, 3).forEach(groups => {
    if (!Array.isArray(groups) || groups.length > 10) throw new HttpError(400, "Bad filter");
    parts.push("(" + groups.map(g => "(" + g.slice(0, 10).map(f => cond(t, f, args)).join(" AND ") + ")").join(" OR ") + ")");
  });
  if (scopeCol) { parts.push(`"${scopeCol}" = ?`); args.push(uid); }
  if (party) { parts.push(`("sender_id" = ? OR "recipient_id" = ?)`); args.push(uid, uid); }
  return { sql: parts.length ? " WHERE " + parts.join(" AND ") : "", args };
}
function outRow(t, r) {
  const T = TABLES[t];
  (T.json || []).forEach(c => { if (c in r) r[c] = safeJson(r[c], c === "hashtags" ? [] : {}); });
  (T.bool || []).forEach(c => { if (c in r) r[c] = !!r[c]; });
  return r;
}
const TAG = /^[a-z0-9_]{1,30}$/;
function cleanTags(v) {
  const a = Array.isArray(v) ? [...new Set(v.map(x => String(x).toLowerCase().replace(/^#/, "")))] : [];
  if (a.length < 1 || a.length > 5 || !a.every(x => TAG.test(x))) throw new HttpError(400, "Add 1 to 5 hashtags (letters, numbers, _).");
  return a;
}
const str = (v, min, max, what) => { if (typeof v !== "string" || v.trim().length < min || v.length > max) throw new HttpError(400, `Invalid ${what}`); return v; };

async function prepareRow(t, raw, uid, op) {
  const T = TABLES[t], P = POLICY[t], row = {};
  for (const c of T.cols) if (raw && raw[c] !== undefined) row[c] = raw[c];
  row[P.owner] = uid;                                              // you can only write as yourself
  if (TEXT_ID.has(t)) row.id = crypto.randomUUID();
  if (T.cols.includes("created_at")) row.created_at = nowIso();
  if (t === "videos") {
    str(row.title, 1, 100, "title");
    if (typeof row.storage_path !== "string" || !row.storage_path.startsWith(uid + "/") || /\.\./.test(row.storage_path)) throw new HttpError(400, "Invalid file path");
    row.video_url = `${R2_PUBLIC_URL}/videos/${row.storage_path}`;
    row.orientation = ["portrait", "landscape", "square"].includes(row.orientation) ? row.orientation : "portrait";
    row.hashtags = cleanTags(row.hashtags);
  }
  if (t === "comments") {
    str(row.text, 1, 500, "comment");
    if (!(await run("SELECT 1 FROM videos WHERE id = ?", [row.video_id])).length) throw new HttpError(404, "Video not found");
  }
  if (t === "likes" && !(await run("SELECT 1 FROM videos WHERE id = ?", [row.video_id])).length) throw new HttpError(404, "Video not found");
  if (t === "follows") {
    if (row.following_id === uid) throw new HttpError(400, "You can't follow yourself");
    if (!(await run("SELECT 1 FROM profiles WHERE id = ?", [row.following_id])).length) throw new HttpError(404, "User not found");
  }
  if (t === "messages") {
    str(row.body, 1, 1000, "message");
    const f = await run(`SELECT COUNT(*) n FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)`, [uid, row.recipient_id, row.recipient_id, uid]);
    if (f[0].n < 2) throw new HttpError(403, "You can only message friends");
  }
  if (t === "profiles") {
    if (row.username !== undefined && !/^[a-z0-9_.]{3,20}$/.test(row.username = String(row.username).toLowerCase())) throw new HttpError(400, "Invalid username");
    if (row.display_name != null && String(row.display_name).length > 40) throw new HttpError(400, "Display name too long");
    if (row.bio != null && String(row.bio).length > 160) throw new HttpError(400, "Bio too long");
    if (row.avatar_url && !String(row.avatar_url).startsWith(R2_PUBLIC_URL + "/avatars/")) throw new HttpError(400, "Invalid avatar");
    if (row.theme !== undefined && JSON.stringify(row.theme).length > 4000) throw new HttpError(400, "Theme too large");
  }
  if (t === "video_views") { row.liked = !!row.liked; }
  for (const c of (T.json || [])) if (row[c] !== undefined) row[c] = JSON.stringify(row[c]);
  for (const c of Object.keys(row)) row[c] = norm(row[c]);
  return row;
}

async function runQuery(p, uid) {
  const t = p.table, T = TABLES[t], P = POLICY[t];
  if (!T) throw new HttpError(400, "Unknown table");
  const op = p.op;
  if (op === "select") {
    if (P.read !== "public" && !uid) throw new HttpError(401, "Sign in required");
    const cols = (p.columns || "*") === "*" ? T.cols : String(p.columns).split(",").map(s => s.trim()).filter(Boolean);
    if (!cols.length || !cols.every(c => T.cols.includes(c))) throw new HttpError(400, "Unknown column");
    const w = where(t, p, P.read === "own" ? P.owner : null, uid, P.read === "party");
    let count = null;
    if (p.count || p.head) count = (await run(`SELECT COUNT(*) n FROM ${t}${w.sql}`, w.args))[0].n;
    if (p.head) return { data: null, count };
    const order = (p.order || []).slice(0, 3).map(o => { if (!T.cols.includes(o.c)) throw new HttpError(400, "Unknown column"); return `"${o.c}" ${o.asc === false ? "DESC" : "ASC"}`; });
    const lim = Math.min(Math.max(parseInt(p.limit) || 1000, 1), 1000);
    let rows = (await run(`SELECT ${cols.map(c => `"${c}"`).join(",")} FROM ${t}${w.sql}${order.length ? " ORDER BY " + order.join(",") : ""} LIMIT ${lim}`, w.args)).map(r => outRow(t, r));
    if (p.single) {
      if (rows.length > 1 || (!rows.length && p.single === "one")) throw new HttpError(406, "Expected one row");
      return { data: rows[0] || null, count };
    }
    return { data: rows, count };
  }
  if (!uid) throw new HttpError(401, "Sign in required");
  if (!P.write.includes(op)) throw new HttpError(403, "Not allowed");
  const ret = async rows => {
    if (!p.returning) return { data: null };
    const out = [];
    for (const r of rows) {
      const w = r.__rowid ? ["id = ?", [r.__rowid]] : [T.pk.map(k => `"${k}" = ?`).join(" AND "), T.pk.map(k => r[k])];
      out.push(...(await run(`SELECT ${T.cols.map(c => `"${c}"`).join(",")} FROM ${t} WHERE ${w[0]}`, w[1])).map(x => outRow(t, x)));
    }
    return { data: p.single ? (out[0] || null) : out };
  };
  if (op === "insert" || op === "upsert") {
    const list = (Array.isArray(p.data) ? p.data : [p.data]).slice(0, 50);
    const done = [];
    for (const raw of list) {
      const row = await prepareRow(t, raw, uid, op);
      const names = Object.keys(row);
      let sql = `INSERT INTO ${t} (${names.map(c => `"${c}"`).join(",")}) VALUES (${names.map(() => "?").join(",")})`;
      if (op === "upsert") {
        const target = (p.onConflict ? String(p.onConflict).split(",").map(s => s.trim()) : T.pk).filter(c => T.cols.includes(c));
        const upd = names.filter(c => (P.upd || []).includes(c) && !target.includes(c));
        sql += p.ignoreDuplicates || !upd.length ? ` ON CONFLICT(${target.map(c => `"${c}"`).join(",")}) DO NOTHING`
          : ` ON CONFLICT(${target.map(c => `"${c}"`).join(",")}) DO UPDATE SET ${upd.map(c => `"${c}" = excluded."${c}"`).join(",")}`;
      }
      const rs = await db.execute({ sql, args: names.map(c => row[c]) });
      done.push(t === "messages" ? { ...row, __rowid: Number(rs.lastInsertRowid) } : row);
    }
    return ret(done);
  }
  if (op === "update") {
    const sets = Object.keys(p.data || {}).filter(c => (P.upd || []).includes(c));
    if (!sets.length) throw new HttpError(400, "Nothing to update");
    const probe = await prepareRow(t, { ...p.data }, uid, "update");
    const w = where(t, p, P.owner, uid, false);
    await db.execute({ sql: `UPDATE ${t} SET ${sets.map(c => `"${c}" = ?`).join(",")}${w.sql}`, args: [...sets.map(c => probe[c]), ...w.args] });
    if (!p.returning) return { data: null };
    const w2 = where(t, p, P.owner, uid, false);
    return { data: (await run(`SELECT ${T.cols.map(c => `"${c}"`).join(",")} FROM ${t}${w2.sql}`, w2.args)).map(r => outRow(t, r)) };
  }
  if (op === "delete") {
    if (!(p.filters || []).length && !(p.ors || []).length) throw new HttpError(400, "Delete needs a filter");
    const w = where(t, p, P.owner, uid, false);
    if (t === "videos") {   // remove everything that belongs to the videos being deleted
      const ids = (await run(`SELECT id FROM videos${w.sql}`, w.args)).map(r => r.id);
      for (const id of ids) await db.batch([{ sql: "DELETE FROM likes WHERE video_id = ?", args: [id] }, { sql: "DELETE FROM comments WHERE video_id = ?", args: [id] }, { sql: "DELETE FROM video_views WHERE video_id = ?", args: [id] }], "write");
    }
    await db.execute({ sql: `DELETE FROM ${t}${w.sql}`, args: w.args });
    return { data: null };
  }
  throw new HttpError(400, "Unknown operation");
}

/* ---------------- Cloudflare R2 (lazy-loaded so the server starts without it) ---------------- */
let s3 = null, S3 = null;
function r2() {
  if (!s3) {
    S3 = require("@aws-sdk/client-s3");
    s3 = new S3.S3Client({ region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  }
  return { s3, S3 };
}
const BUCKETS = { videos: /^video\/(mp4|webm|quicktime|x-m4v)$/, avatars: /^image\/(jpeg|png|webp)$/ };
const SAFE_PATH = /^[A-Za-z0-9-]{8,64}\/[A-Za-z0-9._-]{1,120}$/;
async function removeFromR2(keys) {
  if (!keys.length || !process.env.R2_ACCESS_KEY_ID) return;
  try { const { s3, S3 } = r2(); await s3.send(new S3.DeleteObjectsCommand({ Bucket: process.env.R2_BUCKET, Delete: { Objects: keys.map(Key => ({ Key })) } })); }
  catch (e) { console.warn("R2 delete failed:", e.message); }
}

/* ---------------- routes ---------------- */
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));
app.use((_q, res, next) => { res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }); next(); });
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ data: null, error: { message: e.message, code: e.code } });
    if (/UNIQUE|constraint/i.test(String(e.message))) return res.status(409).json({ data: null, error: { message: /username/i.test(e.message) ? "That username is already taken" : "Already exists", code: "23505" } });
    console.error(e); res.status(500).json({ data: null, error: { message: "Server error" } });
  }
};

require("./routes/extras")({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso, removeFromR2 });

app.get("/config.js", (_q, res) => res.set("Cache-Control", "no-store").type("js")
  .send("window.WT_CONFIG=" + JSON.stringify({ SUPABASE_URL: "local", SUPABASE_ANON_KEY: "local", R2_PUBLIC_URL }) + ";"));
app.get("/health", (_q, res) => res.json({ ok: true }));

app.post("/api/auth/signup", limit(8, 600000), wrap(async req => {
  const { email, password, data = {} } = req.body || {};
  const em = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 120) throw new HttpError(400, "Enter a valid email.");
  if (weakPassword(password)) throw new HttpError(400, "Password needs 10+ characters with upper and lower case, a number and a symbol.");
  const username = String(data.username || "").toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new HttpError(400, "Invalid username");
  if ((await run("SELECT 1 FROM users WHERE email = ?", [em])).length) throw new HttpError(422, "User already registered");
  if ((await run("SELECT 1 FROM profiles WHERE lower(username) = ?", [username])).length) throw new HttpError(422, "That username is already taken");
  const id = crypto.randomUUID(), ts = nowIso();
  const meta = { username, display_name: String(data.display_name || "").slice(0, 40), bio: String(data.bio || "").slice(0, 160) };
  await db.batch([
    { sql: "INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at) VALUES (?,?,?,?,?)", args: [id, em, await bcrypt.hash(password, 10), JSON.stringify(meta), ts] },
    { sql: "INSERT INTO profiles (id, username, display_name, bio, avatar_url, theme, created_at) VALUES (?,?,?,?,NULL,'{}',?)", args: [id, username, meta.display_name || null, meta.bio, ts] },
  ], "write");
  const u = { id, email: em, raw_user_meta_data: JSON.stringify(meta) };
  const session = makeSession(u);
  return { data: { user: session.user, session }, error: null };
}));
app.post("/api/auth/login", limit(20, 600000), wrap(async req => {
  const em = String(req.body?.email || "").trim().toLowerCase(), pw = String(req.body?.password || "");
  const u = (await run("SELECT * FROM users WHERE email = ?", [em]))[0];
  const ok = await bcrypt.compare(pw, u ? u.encrypted_password : DUMMY_HASH);
  if (!u || !ok) throw new HttpError(400, "Invalid login credentials");
  const session = makeSession(u);
  return { data: { user: session.user, session }, error: null };
}));
app.post("/api/auth/refresh", limit(60, 600000), wrap(async req => {
  let p; try { p = jwt.verify(String(req.body?.refresh_token || ""), JWT_SECRET); } catch { throw new HttpError(401, "Session expired. Please sign in again."); }
  if (p.t !== "r") throw new HttpError(401, "Session expired. Please sign in again.");
  const u = (await run("SELECT * FROM users WHERE id = ?", [p.sub]))[0];
  if (!u) throw new HttpError(401, "Session expired. Please sign in again.");
  const session = makeSession(u);
  return { data: { user: session.user, session }, error: null, session };
}));

app.post("/api/db", wrap(async req => { const r = await runQuery(req.body || {}, uidFrom(req)); return { error: null, count: null, ...r }; }));

app.post("/api/rpc/:fn", wrap(async req => {
  const uid = uidFrom(req);
  if (req.params.fn === "username_available") {
    const n = String(req.body?.name || "").toLowerCase();
    return { data: /^[a-z0-9_.]{3,20}$/.test(n) && !(await run("SELECT 1 FROM profiles WHERE lower(username) = ?", [n])).length, error: null };
  }
  if (req.params.fn === "delete_my_account") {
    if (!uid) throw new HttpError(401, "Sign in required");
    const vids = await run("SELECT id, storage_path FROM videos WHERE user_id = ?", [uid]);
    const prof = (await run("SELECT avatar_url FROM profiles WHERE id = ?", [uid]))[0];
    const keys = vids.filter(v => v.storage_path).map(v => `videos/${v.storage_path}`);
    if (prof?.avatar_url && R2_PUBLIC_URL) keys.push(String(prof.avatar_url).replace(R2_PUBLIC_URL + "/", "").split("?")[0]);
    const stmts = [];
    for (const v of vids) stmts.push({ sql: "DELETE FROM likes WHERE video_id = ?", args: [v.id] }, { sql: "DELETE FROM comments WHERE video_id = ?", args: [v.id] }, { sql: "DELETE FROM video_views WHERE video_id = ?", args: [v.id] });
    stmts.push(...[["likes", "user_id"], ["comments", "user_id"], ["video_views", "user_id"], ["videos", "user_id"], ["follows", "follower_id"], ["follows", "following_id"], ["messages", "sender_id"], ["messages", "recipient_id"], ["profiles", "id"], ["users", "id"]]
      .map(([t, c]) => ({ sql: `DELETE FROM ${t} WHERE ${c} = ?`, args: [uid] })));
    await db.batch(stmts, "write");
    await removeFromR2(keys);
    return { data: true, error: null };
  }
  throw new HttpError(404, "Unknown function");
}));

app.post("/api/storage/presign", wrap(async req => {
  const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
  const { bucket, path: p, contentType } = req.body || {};
  if (!BUCKETS[bucket] || !BUCKETS[bucket].test(String(contentType))) throw new HttpError(400, "File type not allowed");
  if (!SAFE_PATH.test(String(p)) || !p.startsWith(uid + "/")) throw new HttpError(400, "Invalid path");
  const { s3, S3 } = r2();
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const uploadUrl = await getSignedUrl(s3, new S3.PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: `${bucket}/${p}`, ContentType: contentType }), { expiresIn: 900 });
  return { uploadUrl, publicUrl: `${R2_PUBLIC_URL}/${bucket}/${p}`, error: null };
}));
app.post("/api/storage/remove", wrap(async req => {
  const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
  const { bucket, paths } = req.body || {};
  if (!BUCKETS[bucket] || !Array.isArray(paths)) throw new HttpError(400, "Bad request");
  await removeFromR2(paths.filter(x => SAFE_PATH.test(String(x)) && x.startsWith(uid + "/")).slice(0, 50).map(x => `${bucket}/${x}`));
  return { data: true, error: null };
}));

app.get("/api/stickers", (_q, res) => {
  fs.readdir(path.join(__dirname, "public", "stickers"), (err, files) => {
    res.set("Cache-Control", "no-store").json(err ? [] : files.filter(f => /\.(png|gif|webp|jpe?g|svg|json)$/i.test(f)).sort());
  });
});

const page = f => (_q, res) => res.sendFile(path.join(__dirname, "public", "pages", f));
app.get(["/scroll", "/feed"], page("scroll.html"));
app.get("/messages", page("messages.html"));
app.get("/activity", page("activity.html"));
app.get(["/login", "/sign-in", "/signin"], page("login.html"));
app.get(["/profile", "/account"], page("profile.html"));
app.use(express.static(path.join(__dirname, "public")));

if (require.main === module) {
  migrate().then(() => app.listen(PORT, () => {
    console.log("Web Tok running on port " + PORT);
    const self = process.env.RENDER_EXTERNAL_URL;     // keeps the free Render instance awake
    if (self) setInterval(() => fetch(self + "/health").catch(() => {}), 10 * 60 * 1000).unref();
  })).catch(e => { console.error("Startup failed:", e); process.exit(1); });
}
module.exports = { app, migrate, db };
