const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const VIDEO_DIR = path.join(__dirname, "videos");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);
    return {
      videos: db.videos || {},
      likes: db.likes || {},
      comments: db.comments || {}
    };
  } catch {
    return { videos: {}, likes: {}, comments: {} };
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getAllVideos(userId) {
  const db = readDb();
  let files = [];
  try {
    files = fs.readdirSync(VIDEO_DIR);
  } catch {
    return [];
  }
  return files
    .filter(f => /\.(mp4|webm|mov)$/i.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(VIDEO_DIR, f));
      const meta = db.videos[f] || {};
      const likes = db.likes[f] || [];
      const comments = db.comments[f] || [];
      return {
        id: f,
        name: meta.title || f.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        src: "/videos/" + encodeURIComponent(f),
        userId: meta.userId || null,
        username: meta.username || null,
        displayName: meta.displayName || null,
        avatarUrl: meta.avatarUrl || null,
        createdAt: meta.createdAt || stat.mtimeMs,
        likesCount: likes.length,
        commentsCount: comments.length,
        likedByMe: userId ? likes.includes(userId) : false
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Supabase settings come from Render environment variables (anon key is public-safe)
app.get("/config.js", (_req, res) => {
  res.set("Cache-Control", "no-store").type("js").send(
    "window.WT_CONFIG=" + JSON.stringify({
      SUPABASE_URL: (process.env.SUPABASE_URL || "https://nehxkdjufmqgdmtgmszu.supabase.co").trim(),
      SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || "sb_publishable_q2WRP4Rwbj_CwalJHJCWBw_btCZdw-5").trim()
    }) + ";"
  );
});

// List every video in /videos (newest first) with likes & comments metadata
app.get("/api/videos", (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : "";
  res.json(getAllVideos(userId));
});

// Upload a video file (raw binary body + metadata headers, no extra dependencies needed)
app.post("/api/videos/upload", express.raw({ type: "*/*", limit: "150mb" }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: "No video data received." });
  }
  const rawName = decodeURIComponent(req.get("x-filename") || "video.mp4");
  const extMatch = rawName.match(/\.(mp4|webm|mov)$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".mp4";
  const base = rawName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "video";
  const fileName = `${Date.now()}-${base}${ext}`;
  const filePath = path.join(VIDEO_DIR, fileName);

  fs.writeFile(filePath, req.body, err => {
    if (err) return res.status(500).json({ error: "Failed to save video." });
    const db = readDb();
    const title = decodeURIComponent(req.get("x-title") || "").trim() || base.replace(/[-_]+/g, " ");
    db.videos[fileName] = {
      title,
      userId: req.get("x-user-id") || null,
      username: decodeURIComponent(req.get("x-username") || "") || null,
      displayName: decodeURIComponent(req.get("x-display-name") || "") || null,
      avatarUrl: decodeURIComponent(req.get("x-avatar-url") || "") || null,
      createdAt: Date.now()
    };
    writeDb(db);
    res.json({ ok: true, id: fileName, src: "/videos/" + encodeURIComponent(fileName), name: title });
  });
});

// Toggle like on a video
app.post("/api/videos/:id/like", express.json(), (req, res) => {
  const id = req.params.id;
  const userId = req.body?.userId;
  if (!userId) return res.status(400).json({ error: "Sign in required." });

  const db = readDb();
  const list = db.likes[id] || [];
  const idx = list.indexOf(userId);
  let liked = false;
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(userId);
    liked = true;
  }
  db.likes[id] = list;
  writeDb(db);
  res.json({ liked, likesCount: list.length });
});

// Get comments for a video
app.get("/api/videos/:id/comments", (req, res) => {
  const db = readDb();
  res.json(db.comments[req.params.id] || []);
});

// Add a comment to a video
app.post("/api/videos/:id/comments", express.json(), (req, res) => {
  const id = req.params.id;
  const { userId, username, displayName, avatarUrl, text } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Sign in required." });
  const clean = typeof text === "string" ? text.trim().slice(0, 500) : "";
  if (!clean) return res.status(400).json({ error: "Comment cannot be empty." });

  const db = readDb();
  const list = db.comments[id] || [];
  const comment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    videoId: id,
    userId,
    username: username || "user",
    displayName: displayName || username || "User",
    avatarUrl: avatarUrl || null,
    text: clean,
    createdAt: Date.now()
  };
  list.push(comment);
  db.comments[id] = list;
  writeDb(db);
  res.json({ comment, commentsCount: list.length });
});

// Account summary: posted videos, liked videos, user comments, and stats
app.get("/api/account/:userId", (req, res) => {
  const userId = req.params.userId;
  const db = readDb();
  const all = getAllVideos(userId);
  const posted = all.filter(v => v.userId === userId);
  const liked = all.filter(v => v.likedByMe);
  const likesReceived = posted.reduce((sum, v) => sum + v.likesCount, 0);

  const userComments = [];
  for (const [videoId, list] of Object.entries(db.comments)) {
    const vid = all.find(v => v.id === videoId);
    for (const c of list) {
      if (c.userId === userId) {
        userComments.push({
          ...c,
          videoId,
          videoName: vid ? vid.name : videoId
        });
      }
    }
  }
  userComments.sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    posted,
    liked,
    comments: userComments,
    stats: {
      followers: 0,
      following: 0,
      likesReceived,
      commentsCount: userComments.length
    }
  });
});

app.get(["/login", "/sign-in", "/signin"], (_q, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

app.use("/videos", express.static(VIDEO_DIR, { maxAge: "1h" })); // supports range requests
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log("Web Tok running on port " + PORT));
