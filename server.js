const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase settings come from Render environment variables (anon key is public-safe)
app.get("/config.js", (_req, res) => {
  res.set("Cache-Control", "no-store").type("js").send(
    "window.WT_CONFIG=" + JSON.stringify({
      SUPABASE_URL: (process.env.SUPABASE_URL || "https://nehxkdjufmqgdmtgmszu.supabase.co").trim(),
      SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || "sb_publishable_q2WRP4Rwbj_CwalJHJCWBw_btCZdw-5").trim()
    }) + ";"
  );
});

app.get(["/login", "/sign-in", "/signin"], (_q, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get(["/profile", "/account"], (_q, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));

app.get(["/scroll", "/feed"], (_q, res) => res.sendFile(path.join(__dirname, "public", "scroll.html")));
app.get("/messages", (_q, res) => res.sendFile(path.join(__dirname, "public", "messages.html")));

// Lists every sticker image in public/stickers (add files there to add stickers)
app.get("/api/stickers", (_q, res) => {
  fs.readdir(path.join(__dirname, "public", "stickers"), (err, files) => {
    res.set("Cache-Control", "no-store").json(err ? [] : files.filter(f => /\.(png|gif|webp|jpe?g|svg)$/i.test(f)).sort());
  });
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.listen(PORT, () => console.log("Web Tok running on port " + PORT));
