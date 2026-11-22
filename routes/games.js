/* Web Tok Mini Games & /developer Studio API (Turso + NVIDIA NIM AI Game Builder) + Secret Settings */
const crypto = require("crypto");

const GAME_MODELS = [
  "qwen/qwen2.5-coder-32b-instruct",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "meta/llama-3.1-8b-instruct"
];

const HTML_GRAPHICS_KIT = `Use or adapt these graphics & game-loop helpers so the game looks sharp and plays smoothly:
\`\`\`js
const c=document.getElementById("c"),ctx=c.getContext("2d");
const keys={}, ptr={x:200,y:200,down:false};
addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();keys[e.key]=true;});
addEventListener("keyup",e=>{keys[e.key]=false;});
c.addEventListener("pointermove",e=>{const r=c.getBoundingClientRect();ptr.x=(e.clientX-r.left)/r.width*c.width;ptr.y=(e.clientY-r.top)/r.height*c.height;});
c.addEventListener("pointerdown",e=>{ptr.down=true;const r=c.getBoundingClientRect();ptr.x=(e.clientX-r.left)/r.width*c.width;ptr.y=(e.clientY-r.top)/r.height*c.height;});
addEventListener("pointerup",()=>{ptr.down=false;});

// Graphics helpers: glowing circles, rounded cards, particle bursts, starfield
const particles=[];
function burst(x,y,col,n=14){for(let i=0;i<n;i++){const a=Math.random()*6.28,sp=50+Math.random()*140;particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.5+Math.random()*0.4,max:0.9,col,r:2+Math.random()*3});}}
function drawParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fill();}ctx.globalAlpha=1;}
function glowCircle(x,y,r,col){ctx.save();ctx.shadowBlur=16;ctx.shadowColor=col;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,6.28);ctx.fill();ctx.restore();}
function roundBox(x,y,w,h,r,col){ctx.fillStyle=col;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
\`\`\``;

const PY_GRAPHICS_KIT = `Use this verified Skulpt-safe Python turtle pattern (draw rich backgrounds/borders with a static pen, use tracer(0)+update() for smooth motion):
\`\`\`python
import turtle, random
screen = turtle.Screen()
screen.setup(width=400, height=360)
screen.bgcolor("#16121e")
screen.tracer(0)
# Static background/stars drawn once with bg_pen = turtle.Turtle(); bg_pen.hideturtle()
# Scoreboard at y=145 using "Score: " + str(score) (NEVER f-strings)
# Update loop via screen.ontimer(game_loop, 30) and screen.update()
\`\`\``;

module.exports = function mountGames({ app, db, run, wrap, uidFrom, HttpError, nowIso, aiKey, callNim, CHAT_MODELS }) {
  let ready = false, secretReady = false;
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

  async function ensureSecretTable() {
    if (secretReady) return;
    await db.execute(`CREATE TABLE IF NOT EXISTS user_secret_settings (
      user_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    secretReady = true;
  }

  app.get("/api/secret-settings", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureSecretTable();
    const row = (await run("SELECT settings_json FROM user_secret_settings WHERE user_id = ?", [uid]))[0];
    let parsed = null;
    try { if (row?.settings_json) parsed = JSON.parse(row.settings_json); } catch {}
    return { data: parsed, error: null };
  }));

  app.post("/api/secret-settings", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureSecretTable();
    const b = req.body || {};
    const cfg = {
      enabled: !!b.enabled,
      size: ["sm", "md", "lg"].includes(b.size) ? b.size : "md",
      cursor: !!b.cursor
    };
    await db.execute({
      sql: `INSERT INTO user_secret_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at`,
      args: [uid, JSON.stringify(cfg), nowIso()]
    });
    return { data: cfg, error: null };
  }));

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
          "Target runtime: Skulpt (browser Python) using ONLY `turtle` and `random`.",
          "CRITICAL Skulpt rules (never violate):",
          "- NEVER use f-strings (`f\"...\"`); use `\"Score: \" + str(score)`.",
          "- NEVER call `.shapesize()`, `screen.title()`, `screen.mainloop()`, or import `pygame`/`time`.",
          "- Declare `global` variables at the top of any function that modifies them.",
          PY_GRAPHICS_KIT
        ].join("\n")
      : [
          "Target runtime: self-contained HTML5 document (`<!DOCTYPE html>...`) with inline CSS and `<canvas id=\"c\" width=\"400\" height=\"400\">`.",
          "Visual & gameplay standards:",
          "- Rich dark-mode visuals (#16121e bg, gradients, glowing neon shapes/sprites, particle bursts, animated background, clean HUD pill for Score/Best, and a Game Over overlay with Space/click to restart).",
          "- Frame-rate independent `dt` loop (`requestAnimationFrame`), zero scrollbars (`margin:0;overflow:hidden;display:grid;place-items:center;height:100vh`), and zero external assets.",
          HTML_GRAPHICS_KIT
        ].join("\n");

    const fence = lang === "python" ? "python" : "html";
    const sys = mode === "build"
      ? `You are a senior indie game developer building a polished, super-fun mini-game for Web Tok.\n${langGuide}\nPut the ENTIRE complete, runnable code inside a single fenced code block (\`\`\`${fence}\n...\n\`\`\`). Keep explanation to 1-2 short sentences.`
      : `You are a senior indie game developer helping polish or fix a Web Tok ${lang} mini-game.\n${langGuide}\nAlways output the ENTIRE updated, runnable game code inside a single fenced code block (\`\`\`${fence}\n...\n\`\`\`) so it can be automatically applied, plus 1-2 short sentences explaining the change.`;

    const userMsg = currentCode && mode === "help"
      ? `My current ${lang} code:\n\`\`\`\n${currentCode}\n\`\`\`\n\nRequest: ${prompt}`
      : prompt;

    const reply = await callNim(key, [...GAME_MODELS, ...CHAT_MODELS], [
      { role: "system", content: sys },
      { role: "user", content: userMsg }
    ], 2800);

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