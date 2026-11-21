/* Web Tok Mini Games & /developer Studio API (Turso + NVIDIA NIM AI Game Builder) */
const crypto = require("crypto");

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
      ? "Write Python 3 code using the built-in `turtle` module (screen size ~400x400, `turtle.Turtle()`, `screen.listen()`, `screen.onkey(...)`, `screen.ontimer(...)`) so it runs in Skulpt in the browser. Do NOT import pygame or external packages."
      : lang === "scratch"
      ? "The user is using Scratch-style Blockly blocks that compile to HTML5 Canvas JavaScript. Give clear step-by-step block instructions, or provide clean HTML5 Canvas JavaScript if they want to switch to HTML/JS."
      : "Write a complete, self-contained HTML5 document (`<!DOCTYPE html>...`) with inline CSS and `<canvas>` JavaScript. Make it responsive to fit a 420x480 box, support arrow keys/WASD and touch/click, and look clean.";

    const sys = mode === "build"
      ? `You are Web Tok Developer AI. Build a fun, playable mini-game based on the user's request.\n${langGuide}\nPut the full runnable code inside a single fenced code block (\`\`\`${lang === "python" ? "python" : "html"}\n...\n\`\`\`). Keep explanation to 1-2 short sentences.`
      : `You are Web Tok Developer AI, a friendly coding assistant. Help the user debug, improve, or understand their ${lang} mini-game.\n${langGuide}\nIf you provide updated code, put the full runnable code in a single fenced code block.`;

    const userMsg = currentCode && mode === "help"
      ? `My current ${lang} code:\n\`\`\`\n${currentCode}\n\`\`\`\n\nQuestion: ${prompt}`
      : prompt;

    const reply = await callNim(key, CHAT_MODELS, [
      { role: "system", content: sys },
      { role: "user", content: userMsg }
    ], 1400);

    const codeMatch = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/.exec(reply);
    return {
      data: {
        reply,
        code: codeMatch ? codeMatch[1].trim() : null
      },
      error: null
    };
  }));
};