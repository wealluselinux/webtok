const express = require("express");
const path = require("path");

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
app.get("/messages", (_q, res) => res.sendFile(path.join(__dirname, "public", "messages.html")));
app.get(["/login", "/sign-in", "/signin"], (_q, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get(["/profile", "/account"], (_q, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log("Web Tok running on port " + PORT));
