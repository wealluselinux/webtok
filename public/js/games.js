/* Web Tok Mini Games Arcade: Built-in Snake, Flappy Tok, Brick Breaker, Blockland + MORE_BUILTINS + Community Games */
let stopCurGame = null, currentStarter = null;

const BUILTINS = [
  { id: "snake", title: "Snake", icon: "pest_control", desc: "Eat the glowing berries, grow longer, and avoid the walls or yourself.", dpad: true, start: startSnake },
  { id: "flappy", title: "Flappy Tok", icon: "flutter_dash", desc: "Tap, click, or press Space to flap through the neon pipes.", dpad: false, start: startFlappy },
  { id: "breaker", title: "Brick Breaker", icon: "grid_view", desc: "Slide the paddle with mouse, touch, or arrow keys to smash all bricks.", dpad: false, start: startBreaker },
  { id: "blockland", title: "Blockland", icon: "view_in_ar", desc: "3D voxel sandbox! Break and place 64 block types, fly around, and explore.", dpad: false, url: "/games/Blockland.html" },
  ...(window.MORE_BUILTINS || [])
];

function bestScore(id, val) {
  const k = "wt_hi_" + id, prev = Number(localStorage.getItem(k) || 0);
  if (val != null && val > prev) { localStorage.setItem(k, String(val)); return val; }
  return prev;
}

function openBuiltin(g) {
  if (stopCurGame) { stopCurGame(); stopCurGame = null; }
  currentStarter = () => openBuiltin(g);
  $("playTitle").textContent = g.title;
  $("dpad").classList.toggle("hidden", !g.dpad);
  $("playDlg").classList.toggle("has-dpad", !!g.dpad);
  if (g.url) {
    $("playScore").textContent = "WASD move · Space jump · E inventory · F fly";
    const frame = document.createElement("iframe");
    frame.id = "gameFrame";
    frame.sandbox = "allow-scripts allow-pointer-lock";
    frame.src = g.url;
    $("playStage").innerHTML = "";
    $("playStage").appendChild(frame);
    $("playDlg").showModal();
    return;
  }
  $("playScore").textContent = `Score: 0 · Best: ${bestScore(g.id)}`;
  $("playStage").innerHTML = '<canvas id="gameCanvas" width="400" height="400"></canvas>';
  $("playDlg").showModal();
  stopCurGame = g.start($("gameCanvas"), sc => {
    const hi = bestScore(g.id, sc);
    $("playScore").textContent = `Score: ${sc} · Best: ${hi}`;
  });
}

function startSnake(canvas, onScore) {
  const ctx = canvas.getContext("2d"), N = 20, S = 20;
  let snake = [{ x: 10, y: 10 }], dir = { x: 1, y: 0 }, next = { x: 1, y: 0 }, food = { x: 15, y: 10 }, score = 0, over = false;
  const setDir = (x, y) => { if (dir.x !== -x && dir.y !== -y) next = { x, y }; };
  const onKey = e => {
    if (e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); setDir(0, -1); }
    if (e.key === "ArrowDown" || e.key === "s") { e.preventDefault(); setDir(0, 1); }
    if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); setDir(-1, 0); }
    if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); setDir(1, 0); }
  };
  addEventListener("keydown", onKey);
  $("dpad").querySelectorAll("button").forEach(b => b.onclick = () => {
    const d = b.dataset.dir;
    if (d === "up") setDir(0, -1); if (d === "down") setDir(0, 1);
    if (d === "left") setDir(-1, 0); if (d === "right") setDir(1, 0);
  });
  const tmr = setInterval(() => {
    if (over) return;
    dir = next;
    const h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || snake.some(p => p.x === h.x && p.y === h.y)) {
      over = true;
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Game Over!", 200, 195);
      return;
    }
    snake.unshift(h);
    if (h.x === food.x && h.y === food.y) {
      score += 10; onScore(score);
      food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    } else snake.pop();
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = "#ff7eb6"; ctx.beginPath(); ctx.arc(food.x * S + 10, food.y * S + 10, 8, 0, 7); ctx.fill();
    snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? "#d0bcff" : "#9a82db";
      ctx.beginPath(); ctx.roundRect(p.x * S + 2, p.y * S + 2, S - 4, S - 4, 6); ctx.fill();
    });
  }, 115);
  return () => { clearInterval(tmr); removeEventListener("keydown", onKey); };
}

function startFlappy(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  let y = 180, vy = 0, pipes = [{ x: 380, gap: 140 }], score = 0, over = false, raf = 0;
  const flap = () => { if (!over) vy = -5.8; };
  const onKey = e => { if (e.code === "Space" || e.key === "ArrowUp") { e.preventDefault(); flap(); } };
  canvas.onclick = flap; addEventListener("keydown", onKey);
  function loop() {
    if (!over) {
      vy += 0.28; y += vy;
      if (pipes[pipes.length - 1].x < 210) pipes.push({ x: 420, gap: 70 + Math.random() * 190 });
      pipes.forEach(p => {
        p.x -= 2.4;
        if (!p.passed && p.x < 70) { p.passed = true; score++; onScore(score); }
        if (p.x < 98 && p.x + 48 > 62 && (y - 12 < p.gap || y + 12 > p.gap + 110)) over = true;
      });
      pipes = pipes.filter(p => p.x > -60);
      if (y < 0 || y > 400) over = true;
    }
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = "#7c5cbf";
    pipes.forEach(p => { ctx.fillRect(p.x, 0, 48, p.gap); ctx.fillRect(p.x, p.gap + 110, 48, 400 - p.gap - 110); });
    ctx.fillStyle = "#ffd8e4"; ctx.beginPath(); ctx.arc(80, y, 13, 0, 7); ctx.fill();
    if (over) {
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Game Over!", 200, 200);
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); removeEventListener("keydown", onKey); };
}

function startBreaker(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  let px = 160, bx = 200, by = 280, vx = 3, vy = -3.4, score = 0, over = false, raf = 0;
  const bricks = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) bricks.push({ x: 16 + c * 54, y: 28 + r * 26, alive: true });
  const move = clientX => {
    const rect = canvas.getBoundingClientRect();
    px = Math.max(0, Math.min(320, ((clientX - rect.left) / rect.width) * 400 - 40));
  };
  canvas.onpointermove = e => move(e.clientX);
  const onKey = e => { if (e.key === "ArrowLeft") px = Math.max(0, px - 24); if (e.key === "ArrowRight") px = Math.min(320, px + 24); };
  addEventListener("keydown", onKey);
  function loop() {
    bx += vx; by += vy;
    if (bx < 8 || bx > 392) vx = -vx;
    if (by < 8) vy = -vy;
    if (by > 356 && by < 372 && bx > px && bx < px + 80) { vy = -Math.abs(vy); vx = ((bx - (px + 40)) / 40) * 4.2; }
    bricks.forEach(b => {
      if (b.alive && bx > b.x && bx < b.x + 48 && by > b.y && by < b.y + 18) {
        b.alive = false; vy = -vy; score += 10; onScore(score);
      }
    });
    if (by > 405 || bricks.every(b => !b.alive)) over = true;
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    bricks.forEach((b, i) => {
      if (!b.alive) return;
      ctx.fillStyle = ["#d0bcff", "#f2b8b5", "#a8dab5", "#ffd8e4"][Math.floor(i / 7) % 4];
      ctx.beginPath(); ctx.roundRect(b.x, b.y, 48, 18, 6); ctx.fill();
    });
    ctx.fillStyle = "#d0bcff"; ctx.beginPath(); ctx.roundRect(px, 362, 80, 12, 6); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.fill();
    if (over) {
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(bricks.every(b => !b.alive) ? "You Win!" : "Game Over!", 200, 200);
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); removeEventListener("keydown", onKey); };
}

function openCommunityGame(g) {
  if (stopCurGame) { stopCurGame(); stopCurGame = null; }
  currentStarter = () => openCommunityGame(g);
  $("playTitle").textContent = g.title;
  $("playScore").textContent = `by @${g.username || "creator"} · ${g.lang.toUpperCase()}`;
  $("dpad").classList.add("hidden");
  $("playDlg").classList.remove("has-dpad");
  const frame = document.createElement("iframe");
  frame.id = "gameFrame";
  frame.sandbox = "allow-scripts allow-pointer-lock";
  if (g.lang === "python") {
    frame.srcdoc = buildPythonRunnerHtml(g.code);
  } else if (g.lang === "scratch") {
    frame.srcdoc = buildCanvasJsRunnerHtml(g.code);
  } else {
    frame.srcdoc = g.code;
  }
  $("playStage").innerHTML = "";
  $("playStage").appendChild(frame);
  $("playDlg").showModal();
}

function buildCanvasJsRunnerHtml(jsCode) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#16121e;display:grid;place-items:center;height:100vh;overflow:hidden">
    <canvas id="c" width="400" height="400" style="background:#1d192b;border-radius:16px;width:min(96vw,96vh,1000px);height:auto;aspect-ratio:1"></canvas>
    <script>const canvas=document.getElementById("c"),ctx=canvas.getContext("2d"),keys={};
    let score=0;const player={x:200,y:340,vx:0,vy:0,onGround:true};
    addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();keys[e.key]=true;});
    addEventListener("keyup",e=>{keys[e.key]=false});
    try{${jsCode}}catch(e){ctx.fillStyle="#ff8a80";ctx.font="14px monospace";ctx.fillText(e.message,12,24)}<\/script></body></html>`;
}

function buildPythonRunnerHtml(pyCode) {
  const safe = JSON.stringify(pyCode);
  return `<!DOCTYPE html><html><body style="margin:0;background:#16121e;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh">
    <div id="mycanvas" style="width:min(94vw,86vh,960px);height:min(82vh,880px);background:#1d192b;border-radius:16px"></div>
    <pre id="out" style="margin:6px 0 0;font-size:12px;color:#d0bcff;max-height:48px;overflow:auto"></pre>
    <script src="https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js"><\/script>
    <script>
      Sk.configure({output:t=>document.getElementById("out").textContent+=t,read:x=>{if(!Sk.builtinFiles?.files[x])throw "File not found: "+x;return Sk.builtinFiles.files[x]}});
      (Sk.TurtleGraphics||(Sk.TurtleGraphics={})).target="mycanvas";
      Sk.misceval.asyncToPromise(()=>Sk.importMainWithBody("<stdin>",false,${safe},true)).catch(e=>{document.getElementById("out").textContent=String(e)});
    <\/script></body></html>`;
}

$("playClose").onclick = () => { if (stopCurGame) { stopCurGame(); stopCurGame = null; } $("playStage").innerHTML = ""; $("playDlg").close(); };
$("playRestart").onclick = () => { if (currentStarter) currentStarter(); };
$("playDlg").addEventListener("close", () => { if (stopCurGame) { stopCurGame(); stopCurGame = null; } });

const bg = $("builtinGrid");
BUILTINS.forEach(g => {
  const card = document.createElement("div"); card.className = "g-card";
  card.innerHTML = `<div class="g-top"><div class="g-ic"><span class="ms">${g.icon}</span></div><div class="g-meta"><b>${g.title}</b><small>${g.url ? "3D Sandbox" : `Best: ${bestScore(g.id)}`}</small></div></div>
    <div class="g-desc">${g.desc}</div>
    <div class="g-foot"><span class="g-badge">Built-in</span><button type="button" class="btn primary sm">Play</button></div>`;
  card.querySelector("button").onclick = () => openBuiltin(g);
  bg.appendChild(card);
});

(async () => {
  const cg = $("commGrid");
  try {
    const r = await fetch("/api/games");
    const j = await r.json();
    const rows = j.data || [];
    if (!rows.length) {
      cg.innerHTML = '<div class="g-card" style="grid-column:1/-1;text-align:center;color:var(--muted)">No community games published yet. Head to <a href="/developer" style="color:var(--primary);font-weight:700">/developer</a> to build the first one!</div>';
      return;
    }
    cg.innerHTML = "";
    rows.forEach(g => {
      const card = document.createElement("div"); card.className = "g-card";
      card.innerHTML = `<div class="g-top"><div class="g-ic"><span class="ms">deployed_code</span></div><div class="g-meta"><b>${escapeHtml(g.title)}</b><small>@${escapeHtml(g.username || "creator")}</small></div></div>
        <div class="g-desc">${escapeHtml(g.description || "Custom Web Tok mini game")}</div>
        <div class="g-foot"><span class="g-badge">${escapeHtml(g.lang.toUpperCase())}</span><button type="button" class="btn primary sm">Play</button></div>`;
      card.querySelector("button").onclick = () => openCommunityGame(g);
      cg.appendChild(card);
    });
  } catch { cg.innerHTML = '<div class="g-card">Could not load community games.</div>'; }
})();
