/* Extra built-in mini games for /games: Target Range, Whack-a-Bot, Pong Solo, Memory Match, Color Memory, 2048, Meteor Dodge */
window.MORE_BUILTINS = [
  { id: "shooter", title: "Target Range", icon: "gps_fixed", desc: "Shooting practice! Click or tap targets before they vanish. Hit the bullseye for bonus points.", dpad: false, start: startTargetRange },
  { id: "whack", title: "Whack-a-Bot", icon: "smart_toy", desc: "Tap the Material bots as they pop up, but don't hit the red bombs!", dpad: false, start: startWhackBot },
  { id: "pong", title: "Pong Solo", icon: "sports_tennis", desc: "Rally against the AI paddle using your mouse, touch, or arrow keys.", dpad: false, start: startPong },
  { id: "memory", title: "Memory Match", icon: "psychology", desc: "Flip cards, remember their spots, and match all 8 pairs in as few moves as possible.", dpad: false, start: startMemory },
  { id: "simon", title: "Color Memory", icon: "neurology", desc: "Watch the glowing color sequence and repeat it from memory as it grows!", dpad: false, start: startSimon },
  { id: "g2048", title: "2048", icon: "apps", desc: "Slide tiles with arrow keys or the D-pad to combine numbers up to 2048.", dpad: true, start: start2048 },
  { id: "dodge", title: "Meteor Dodge", icon: "rocket_launch", desc: "Move with mouse, touch, or arrow keys to dodge meteors and grab stars.", dpad: false, start: startDodge }
];

function startTargetRange(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  canvas.style.cursor = "crosshair";
  let score = 0, shots = 0, hits = 0, combo = 0, timeLeft = 30, over = false, raf = 0, last = performance.now();
  let aim = { x: 200, y: 200 };
  const targets = [], pops = [];

  function spawn() {
    const gold = Math.random() < 0.2;
    const r = gold ? 18 : 22 + Math.random() * 10;
    const moving = gold || Math.random() < 0.35;
    targets.push({
      x: r + 16 + Math.random() * (400 - (r + 16) * 2),
      y: 44 + r + Math.random() * (400 - 60 - r * 2),
      r, gold, ttl: gold ? 1.8 : 2.5, maxTtl: gold ? 1.8 : 2.5,
      vx: moving ? (Math.random() < 0.5 ? -1 : 1) * (65 + Math.random() * 55) : 0
    });
  }
  spawn(); spawn();

  function toCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 400, y: ((e.clientY - rect.top) / rect.height) * 400 };
  }
  canvas.onpointermove = e => { aim = toCanvas(e); };
  canvas.onpointerdown = e => {
    if (over) return;
    const p = toCanvas(e);
    aim = p;
    shots++;
    pops.push({ x: p.x, y: p.y, txt: "", col: "#ffffff", life: 0.25, ring: true });
    let hitIdx = -1;
    for (let i = targets.length - 1; i >= 0; i--) {
      if (Math.hypot(p.x - targets[i].x, p.y - targets[i].y) <= targets[i].r) { hitIdx = i; break; }
    }
    if (hitIdx >= 0) {
      const t = targets.splice(hitIdx, 1)[0];
      const dist = Math.hypot(p.x - t.x, p.y - t.y);
      const bullseye = dist <= t.r * 0.38;
      hits++; combo++;
      const pts = (t.gold ? 30 : bullseye ? 20 : 10) + Math.min(combo - 1, 5) * 2;
      score += pts;
      onScore(score);
      pops.push({ x: t.x, y: t.y - 8, txt: bullseye ? `BULLSEYE +${pts}` : `+${pts}`, col: t.gold ? "#ffd58a" : "#a8dab5", life: 0.7 });
      spawn();
    } else {
      combo = 0;
      pops.push({ x: p.x, y: p.y - 6, txt: "MISS", col: "#f28b82", life: 0.45 });
    }
  };

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!over) {
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft <= 0) over = true;
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        t.ttl -= dt; t.x += t.vx * dt;
        if (t.x < t.r + 10 || t.x > 390 - t.r) t.vx = -t.vx;
        if (t.ttl <= 0) { targets.splice(i, 1); combo = 0; spawn(); }
      }
      while (targets.length < 3) spawn();
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].life -= dt;
        if (!pops[i].ring) pops[i].y -= 28 * dt;
        if (pops[i].life <= 0) pops.splice(i, 1);
      }
    }

    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    ctx.strokeStyle = "#221c2e"; ctx.lineWidth = 1;
    for (let g = 40; g < 400; g += 40) {
      ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, 400); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(400, g); ctx.stroke();
    }

    targets.forEach(t => {
      const pct = Math.max(0, t.ttl / t.maxTtl);
      ctx.strokeStyle = t.gold ? "#ffd58a" : "#d0bcff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
      ctx.fillStyle = t.gold ? "#ffb74d" : "#f28b82";
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.65, 0, 7); ctx.fill();
      ctx.fillStyle = t.gold ? "#ff8f00" : "#e53935";
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.34, 0, 7); ctx.fill();
    });

    pops.forEach(p => {
      if (p.ring) {
        ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, (0.28 - p.life) * 70, 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = p.col; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(p.txt, p.x, p.y);
      }
    });

    ctx.strokeStyle = "#d0bcff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, 12, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(aim.x - 16, aim.y); ctx.lineTo(aim.x + 16, aim.y);
    ctx.moveTo(aim.x, aim.y - 16); ctx.lineTo(aim.x, aim.y + 16); ctx.stroke();

    const acc = shots ? Math.round((hits / shots) * 100) : 100;
    ctx.fillStyle = "rgba(22,18,30,.8)"; ctx.fillRect(0, 0, 400, 34);
    ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`Time: ${Math.ceil(timeLeft)}s`, 12, 22);
    ctx.textAlign = "center"; ctx.fillText(`Combo: x${Math.max(1, combo)}`, 200, 22);
    ctx.textAlign = "right"; ctx.fillText(`Acc: ${acc}%`, 388, 22);

    if (over) {
      ctx.fillStyle = "rgba(0,0,0,.68)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`Score: ${score}`, 200, 185);
      ctx.fillStyle = "#d0bcff"; ctx.font = "bold 16px sans-serif";
      ctx.fillText(`Accuracy: ${acc}% (${hits}/${shots})`, 200, 218);
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); canvas.onpointerdown = null; canvas.onpointermove = null; canvas.style.cursor = ""; };
}

function startWhackBot(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  let score = 0, timeLeft = 30, over = false, active = -1, isBomb = false, nextAt = 0, last = performance.now(), raf = 0;
  function pick() { active = Math.floor(Math.random() * 9); isBomb = Math.random() < 0.22; nextAt = performance.now() + 850; }
  pick();
  canvas.onpointerdown = e => {
    if (over || active < 0) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 400, y = ((e.clientY - r.top) / r.height) * 400;
    const c = Math.floor((x - 28) / 118), row = Math.floor((y - 44) / 114);
    if (c < 0 || c > 2 || row < 0 || row > 2) return;
    if (row * 3 + c === active) {
      score = Math.max(0, score + (isBomb ? -20 : 15));
      onScore(score);
      active = -1;
      nextAt = performance.now() + 260;
    }
  };
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!over) {
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft <= 0) over = true;
      else if (now >= nextAt) pick();
    }
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`Time: ${Math.ceil(timeLeft)}s`, 20, 26);
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3), x = 28 + col * 118, y = 44 + row * 114;
      ctx.fillStyle = "#221c2e"; ctx.beginPath(); ctx.roundRect(x, y, 108, 104, 22); ctx.fill();
      if (i === active) {
        ctx.fillStyle = isBomb ? "#f28b82" : "#d0bcff";
        ctx.beginPath(); ctx.arc(x + 54, y + 52, 30, 0, 7); ctx.fill();
        ctx.fillStyle = "#16121e"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(isBomb ? "BOMB" : "BOT", x + 54, y + 52);
        ctx.textBaseline = "alphabetic";
      }
    }
    if (over) {
      ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`Final Score: ${score}`, 200, 200);
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); canvas.onpointerdown = null; };
}

function startPong(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  let px = 160, ax = 160, bx = 200, by = 200, vx = 3.1, vy = 3.4, score = 0, over = false, raf = 0;
  canvas.onpointermove = e => {
    const r = canvas.getBoundingClientRect();
    px = Math.max(0, Math.min(320, ((e.clientX - r.left) / r.width) * 400 - 40));
  };
  const onKey = e => { if (e.key === "ArrowLeft") px = Math.max(0, px - 24); if (e.key === "ArrowRight") px = Math.min(320, px + 24); };
  addEventListener("keydown", onKey);
  function loop() {
    if (!over) {
      bx += vx; by += vy;
      if (bx < 8 || bx > 392) vx = -vx;
      ax += Math.max(-3.6, Math.min(3.6, (bx - 40 - ax) * 0.14));
      ax = Math.max(0, Math.min(320, ax));
      if (by <= 32 && by >= 18 && bx >= ax && bx <= ax + 80) { vy = Math.abs(vy); }
      if (by >= 362 && by <= 376 && bx >= px && bx <= px + 80) {
        vy = -Math.abs(vy) * 1.03; vx = ((bx - (px + 40)) / 40) * 4.5;
        score += 10; onScore(score);
      }
      if (by < -10) { score += 50; onScore(score); bx = 200; by = 200; vy = 3.4; }
      if (by > 410) over = true;
    }
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    ctx.strokeStyle = "#312842"; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(0, 200); ctx.lineTo(400, 200); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#f2b8b5"; ctx.beginPath(); ctx.roundRect(ax, 18, 80, 12, 6); ctx.fill();
    ctx.fillStyle = "#d0bcff"; ctx.beginPath(); ctx.roundRect(px, 368, 80, 12, 6); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.fill();
    if (over) {
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Game Over!", 200, 200);
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); canvas.onpointermove = null; removeEventListener("keydown", onKey); };
}

function startMemory(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  const SYMS = ["★", "♥", "♦", "♣", "▲", "●", "☀", "♫"];
  const COLS = ["#d0bcff", "#ff7eb6", "#a8dab5", "#ffd58a", "#8ab4f8", "#f28b82", "#81c995", "#fdd663"];
  const deck = [...SYMS, ...SYMS].map((s, i) => ({ s, c: COLS[i % 8], open: false, done: false }))
    .sort(() => Math.random() - 0.5);
  let pick = [], lock = false, moves = 0, matched = 0;

  function draw() {
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    deck.forEach((card, i) => {
      const r = Math.floor(i / 4), c = i % 4, x = 16 + c * 94, y = 16 + r * 94;
      ctx.fillStyle = card.done ? "#263a2e" : card.open ? "#312842" : "#221c2e";
      ctx.beginPath(); ctx.roundRect(x, y, 86, 86, 16); ctx.fill();
      if (card.open || card.done) {
        ctx.fillStyle = card.c; ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(card.s, x + 43, y + 45);
      } else {
        ctx.fillStyle = "#6750a4"; ctx.beginPath(); ctx.arc(x + 43, y + 43, 10, 0, 7); ctx.fill();
      }
    });
    if (matched === 8) {
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(`Cleared in ${moves} moves!`, 200, 200);
    }
  }
  canvas.onclick = e => {
    if (lock || matched === 8) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 400, y = ((e.clientY - rect.top) / rect.height) * 400;
    const c = Math.floor((x - 16) / 94), r = Math.floor((y - 16) / 94);
    if (c < 0 || c > 3 || r < 0 || r > 3) return;
    const idx = r * 4 + c, card = deck[idx];
    if (card.open || card.done) return;
    card.open = true; pick.push(idx); draw();
    if (pick.length === 2) {
      moves++; lock = true;
      const [a, b] = [deck[pick[0]], deck[pick[1]]];
      if (a.s === b.s) {
        a.done = b.done = true; matched++; pick = []; lock = false;
        onScore(matched === 8 ? Math.max(100, 1000 - moves * 20) : matched * 50);
        draw();
      } else {
        setTimeout(() => { a.open = b.open = false; pick = []; lock = false; draw(); }, 650);
      }
    }
  };
  draw();
  return () => { canvas.onclick = null; };
}

function startSimon(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  const PADS = [
    { x: 20, y: 20, c: "#9a82db", hi: "#d0bcff" },
    { x: 208, y: 20, c: "#c2598b", hi: "#ff9ed2" },
    { x: 20, y: 208, c: "#3b875e", hi: "#8ce0b3" },
    { x: 208, y: 208, c: "#b58435", hi: "#ffd58a" }
  ];
  let seq = [], step = 0, lit = -1, busy = true, over = false, dead = false, tmr = null;

  function draw() {
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    PADS.forEach((p, i) => {
      ctx.fillStyle = lit === i ? p.hi : p.c;
      ctx.beginPath(); ctx.roundRect(p.x, p.y, 172, 172, 28); ctx.fill();
    });
    ctx.fillStyle = "#16121e"; ctx.beginPath(); ctx.arc(200, 200, 46, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(over ? "Oops!" : busy ? "Watch" : "Your turn", 200, 200);
  }
  function nextRound() {
    seq.push(Math.floor(Math.random() * 4)); step = 0; busy = true; draw();
    let i = 0;
    const play = () => {
      if (dead) return;
      if (i >= seq.length) { busy = false; lit = -1; draw(); return; }
      lit = seq[i++]; draw();
      tmr = setTimeout(() => { lit = -1; draw(); tmr = setTimeout(play, 180); }, 420);
    };
    tmr = setTimeout(play, 450);
  }
  canvas.onclick = e => {
    if (busy || over) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 400, y = ((e.clientY - rect.top) / rect.height) * 400;
    const idx = PADS.findIndex(p => x >= p.x && x <= p.x + 172 && y >= p.y && y <= p.y + 172);
    if (idx < 0) return;
    lit = idx; draw();
    setTimeout(() => { if (!dead) { lit = -1; draw(); } }, 180);
    if (idx !== seq[step]) { over = true; draw(); return; }
    step++;
    if (step === seq.length) { onScore(seq.length * 10); nextRound(); }
  };
  nextRound();
  return () => { dead = true; clearTimeout(tmr); canvas.onclick = null; };
}

function start2048(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  let grid = Array.from({ length: 4 }, () => [0, 0, 0, 0]), score = 0;
  const COLORS = { 0: "#221c2e", 2: "#312842", 4: "#42355c", 8: "#6750a4", 16: "#7e57c2", 32: "#ab47bc", 64: "#ec407a", 128: "#ffa726", 256: "#66bb6a", 512: "#26a69a", 1024: "#42a5f5", 2048: "#d0bcff" };

  function spawn() {
    const empty = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!grid[r][c]) empty.push([r, c]);
    if (empty.length) { const [r, c] = empty[Math.floor(Math.random() * empty.length)]; grid[r][c] = Math.random() < .9 ? 2 : 4; }
  }
  function slide(row) {
    const a = row.filter(Boolean);
    for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); }
    while (a.length < 4) a.push(0);
    return a;
  }
  function move(dir) {
    const prev = JSON.stringify(grid);
    if (dir === "left") grid = grid.map(slide);
    if (dir === "right") grid = grid.map(r => slide([...r].reverse()).reverse());
    if (dir === "up" || dir === "down") {
      for (let c = 0; c < 4; c++) {
        let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
        col = dir === "up" ? slide(col) : slide(col.reverse()).reverse();
        for (let r = 0; r < 4; r++) grid[r][c] = col[r];
      }
    }
    if (JSON.stringify(grid) !== prev) { spawn(); onScore(score); draw(); }
  }
  function draw() {
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const v = grid[r][c], x = 16 + c * 94, y = 16 + r * 94;
      ctx.fillStyle = COLORS[v] || "#d0bcff";
      ctx.beginPath(); ctx.roundRect(x, y, 86, 86, 16); ctx.fill();
      if (v) {
        ctx.fillStyle = v >= 2048 ? "#16121e" : "#fff";
        ctx.font = `bold ${v >= 1000 ? 22 : 28}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(v), x + 43, y + 45);
      }
    }
  }
  const onKey = e => {
    if (e.key === "ArrowLeft") { e.preventDefault(); move("left"); }
    if (e.key === "ArrowRight") { e.preventDefault(); move("right"); }
    if (e.key === "ArrowUp") { e.preventDefault(); move("up"); }
    if (e.key === "ArrowDown") { e.preventDefault(); move("down"); }
  };
  addEventListener("keydown", onKey);
  $("dpad").querySelectorAll("button").forEach(b => b.onclick = () => move(b.dataset.dir));
  spawn(); spawn(); draw();
  return () => removeEventListener("keydown", onKey);
}

function startDodge(canvas, onScore) {
  const ctx = canvas.getContext("2d");
  let px = 200, score = 0, over = false, raf = 0;
  const items = [];
  canvas.onpointermove = e => {
    const r = canvas.getBoundingClientRect();
    px = Math.max(20, Math.min(380, ((e.clientX - r.left) / r.width) * 400));
  };
  const onKey = e => { if (e.key === "ArrowLeft") px = Math.max(20, px - 22); if (e.key === "ArrowRight") px = Math.min(380, px + 22); };
  addEventListener("keydown", onKey);
  function loop() {
    if (Math.random() < .06) items.push({ x: 20 + Math.random() * 360, y: -12, vy: 2.6 + Math.random() * 2.2, star: Math.random() < .3 });
    ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 400, 400);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.y += it.vy;
      ctx.fillStyle = it.star ? "#ffd58a" : "#f28b82";
      ctx.beginPath(); ctx.arc(it.x, it.y, it.star ? 8 : 11, 0, 7); ctx.fill();
      if (Math.hypot(it.x - px, it.y - 360) < 22) {
        items.splice(i, 1);
        if (it.star) { score += 25; onScore(score); } else over = true;
      } else if (it.y > 415) {
        items.splice(i, 1);
        if (!it.star) { score += 2; onScore(score); }
      }
    }
    ctx.fillStyle = "#d0bcff"; ctx.beginPath(); ctx.roundRect(px - 18, 348, 36, 22, 8); ctx.fill();
    if (over) {
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "#fff"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Game Over!", 200, 200);
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); removeEventListener("keydown", onKey); };
}
