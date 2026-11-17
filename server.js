const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const VIDEO_DIR = path.join(__dirname, "videos");

// Supabase settings come from Render environment variables (anon key is public-safe)
app.get("/config.js", (_req, res) => {
  res.type("js").send(
    "window.WT_CONFIG=" + JSON.stringify({
      SUPABASE_URL: process.env.SUPABASE_URL || "",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ""
    }) + ";"
  );
});

// List every video in /videos (newest first)
app.get("/api/videos", (_req, res) => {
  fs.readdir(VIDEO_DIR, (err, files) => {
    if (err) return res.json([]);
    const vids = files
      .filter(f => /\.(mp4|webm|mov)$/i.test(f))
      .map(f => ({ file: f, t: fs.statSync(path.join(VIDEO_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .map(v => ({
        name: v.file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        src: "/videos/" + encodeURIComponent(v.file)
      }));
    res.json(vids);
  });
});

app.use("/videos", express.static(VIDEO_DIR, { maxAge: "1h" })); // supports range requests
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log("Web Tok running on port " + PORT));
