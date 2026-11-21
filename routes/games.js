/* Web Tok Mini Games & /developer Studio API (Turso + NVIDIA NIM AI Game Builder) */
const crypto = require("crypto");

const GAME_MODELS = [
  "qwen/qwen2.5-coder-32b-instruct",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "meta/llama-3.3-70b-instruct"
];

module.exports = function mountGames({ app, db, run, wrap, uidFrom, HttpError, nowIso, aiKey, callNim, CHAT_MODELS }) {
  let ready = false;
  async function ensureGamesTable() {
    if (ready) return;
    await db.execute(`CREATE TABLE IF NOT EXISTS user_games (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      lang TEXT NOT NULL,
      code TEXT NOT NULL,
      workspace_xml TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await db.execute("CREATE INDEX IF NOT EXISTS idx_ugames_pub ON user_games(published, updated_at DESC)");
    ready = true;
  }

  app.get("/api/games", wrap(async () => {
    await ensureGamesTable();
    const rows = await run(`
      SELECT g.id, g.user_id, g.title, g.description, g.lang, g.code, g.created_at, g.updated_at,
        p.username, p.display_name
      FROM user_games g LEFT JOIN profiles p ON p.id = g.user_id
      WHERE g.published = 1 ORDER BY g.updated_at DESC LIMIT 60
    `);
    return { data: rows, error: null };
  }));

  app.get("/api/games/mine", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureGamesTable();
    const rows = await run("SELECT * FROM user_games WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50", [uid]);
    return { data: rows, error: null };
  }));

  app.post("/api/games", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureGamesTable();
    const id = String(req.body?.id || "").trim() || crypto.randomUUID();
    const title = String(req.body?.title || "").trim().slice(0, 60);
    const description = String(req.body?.description || "").trim().slice(0, 200);
    const lang = ["python", "scratch", "html"].includes(req.body?.lang) ? req.body.lang : "html";
    const code = String(req.body?.code || "").slice(0, 60000);
    const workspace_xml = String(req.body?.workspace_xml || "").slice(0, 60000);
    const published = req.body?.published === false ? 0 : 1;
    if (!title) throw new HttpError(400, "Enter a game title.");
    if (!code.trim()) throw new HttpError(400, "Game code cannot be empty.");
    const ts = nowIso();
    const existing = (await run("SELECT user_id FROM user_games WHERE id = ?", [id]))[0];
    if (existing) {
      if (existing.user_id !== uid) throw new HttpError(403, "Not your game");
      await db.execute({
        sql: "UPDATE user_games SET title=?, description=?, lang=?, code=?, workspace_xml=?, published=?, updated_at=? WHERE id=? AND user_id=?",
        args: [title, description, lang, code, workspace_xml, published, ts, id, uid]
      });
    } else {
      await db.execute({
        sql: "INSERT INTO user_games (id, user_id, title, description, lang, code, workspace_xml, published, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        args: [id, uid, title, description, lang, code, workspace_xml, published, ts, ts]
      });
    }
    return { data: { id, title, description, lang, published, updated_at: ts }, error: null };
  }));

  app.delete("/api/games/:id", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureGamesTable();
    await db.execute({ sql: "DELETE FROM user_games WHERE id = ? AND user_id = ?", args: [String(req.params.id || ""), uid] });
    return { data: true, error: null };
  }));

  app.post("/api/games/ai", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const key = aiKey();
    if (!key) throw new HttpError(503, "AI service not configured on server.");
    const mode = req.body?.mode === "build" ? "build" : "help";
    const lang = ["python", "scratch", "html"].includes(req.body?.lang) ? req.body.lang : "html";
    const prompt = String(req.body?.prompt || "").trim().slice(0, 800);
    const currentCode = String(req.body?.currentCode || "").slice(0, 8000);
    if (!prompt) throw new HttpError(400, "Enter a prompt for the AI.");

    const langGuide = lang === "python"
      ? [
          "Target runtime: Skulpt (browser Python) using ONLY the built-in `turtle` and `random` modules.",
          "CRITICAL Skulpt rules (never violate these):",
          "- NEVER use f-strings (`f\"...\"`); use `\"Score: \" + str(score)`.",
          "- NEVER call `.shapesize()`, `screen.title()`, `screen.mainloop()`, or import `pygame`/`time`.",
          "- Use `screen.setup(width=400, height=360)`, `screen.bgcolor(\"#16121e\")`, `screen.tracer(0)`.",
          "- Keep scoreboard text at `y=145` (font size 16-18), clamp player within `-175..175`, declare `global` vars at the top of functions, and drive the loop with `screen.ontimer(game_loop, 30)` + `screen.update()`."
        ].join("\n")
      : [
          "Target runtime: self-contained HTML5 document (`<!DOCTYPE html>...`) with inline CSS and `<canvas width=\"400\" height=\"400\">` JavaScript.",
          "Design & gameplay requirements:",
          "- Dark Material 3 palette (`#16121e` background, `#d0bcff` primary, `#ff7eb6` accent, `#a8dab5` mint).",
          "- Smooth `requestAnimationFrame` loop, clear HUD (score + best score), polished Game Over screen with click/Space/Enter to restart.",
          "- Support BOTH keyboard (Arrow keys / WASD / Space) AND mouse/touch controls, and fit cleanly in a 400x400+ iframe with zero scrollbars."
        ].join("\n");

    const fence = lang === "python" ? "python" : "html";
    const sys = mode === "build"
      ? `You are an expert Web Tok game developer. Build a fun, complete, bug-free playable mini-game.\n${langGuide}\nPut the ENTIRE complete, runnable code inside a single fenced code block (\`\`\`${fence}\n...\n\`\`\`). Keep explanation to 1-2 short sentences.`
      : `You are an expert Web Tok game developer. Fix bugs, polish gameplay, or add requested features to the user's ${lang} mini-game.\n${langGuide}\nAlways output the ENTIRE updated, runnable game code inside a single fenced code block (\`\`\`${fence}\n...\n\`\`\`) so it can be automatically applied, plus 1-2 short sentences explaining the change.`;

    const userMsg = currentCode && mode === "help"
      ? `My current ${lang} code:\n\`\`\`\n${currentCode}\n\`\`\`\n\nRequest: ${prompt}`
      : prompt;

    const reply = await callNim(key, [...GAME_MODELS, ...CHAT_MODELS], [
      { role: "system", content: sys },
      { role: "user", content: userMsg }
    ], 2400);

    const codeMatch = /```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)```/.exec(reply);
    return {
      data: {
        reply,
        code: codeMatch ? codeMatch[1].trim() : null
      },
      error: null
    };
  }));
};