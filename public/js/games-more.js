/* Extra built-in mini games for /games: Memory Match, Color Memory, 2048, Meteor Dodge */
window.MORE_BUILTINS = [
  { id: "memory", title: "Memory Match", icon: "psychology", desc: "Flip cards, remember their spots, and match all 8 pairs in as few moves as possible.", dpad: false, start: startMemory },
  { id: "simon", title: "Color Memory", icon: "neurology", desc: "Watch the glowing color sequence and repeat it from memory as it grows!", dpad: false, start: startSimon },
  { id: "g2048", title: "2048", icon: "apps", desc: "Slide tiles with arrow keys or the D-pad to combine numbers up to 2048.", dpad: true, start: start2048 },
  { id: "dodge", title: "Meteor Dodge", icon: "rocket_launch", desc: "Move with mouse, touch, or arrow keys to dodge meteors and grab stars.", dpad: false, start: startDodge }
];

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