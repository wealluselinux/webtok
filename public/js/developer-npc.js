/* In-studio 16x16 Pixel Art NPC / Enemy Sprite Drawer for Scratch Blocks */
window.wtNpcs = window.wtNpcs || {};

function openNpcDrawer() {
  let dlg = document.getElementById("npcDrawDlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "npcDrawDlg";
    dlg.style.cssText = "border:0;border-radius:32px;padding:22px;width:min(94vw,430px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 20px 56px #0006";
    dlg.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <b style="font-size:18px;display:flex;align-items:center;gap:8px"><span class="ms" style="color:var(--primary)">brush</span>Draw NPC / Enemy</b>
        <button type="button" class="btn icon" id="npcClose" aria-label="Close"><span class="ms">close</span></button>
      </div>
      <input id="npcName" maxlength="24" value="enemy" placeholder="NPC name (e.g. enemy, slime)" style="width:100%;padding:10px 14px;border-radius:999px;border:0;background:var(--surface);color:var(--text);font:inherit;margin-bottom:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center" id="npcCols"></div>
      <canvas id="npcCan" width="256" height="256" style="display:block;margin:0 auto;background:#16121e;border-radius:16px;cursor:crosshair;touch-action:none;image-rendering:pixelated"></canvas>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button type="button" class="btn sm" id="npcClear">Clear</button>
        <button type="button" class="btn primary sm" id="npcSave">Save NPC</button>
      </div>`;
    document.body.appendChild(dlg);

    const PAL = ["#ff7eb6", "#d0bcff", "#a8dab5", "#ffd58a", "#f28b82", "#8ab4f8", "#ffffff", "erase"];
    let curCol = "#ff7eb6", drawing = false;
    const grid = Array.from({ length: 16 }, () => Array(16).fill(""));
    const c = dlg.querySelector("#npcCan"), ctx = c.getContext("2d");

    function renderGrid() {
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = "#16121e"; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = "#ffffff12";
      for (let i = 1; i < 16; i++) {
        ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16, 256); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 16); ctx.lineTo(256, i * 16); ctx.stroke();
      }
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (grid[y][x]) { ctx.fillStyle = grid[y][x]; ctx.fillRect(x * 16, y * 16, 16, 16); }
      }
    }
    const paintAt = e => {
      const r = c.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * 16);
      const y = Math.floor(((e.clientY - r.top) / r.height) * 16);
      if (x >= 0 && x < 16 && y >= 0 && y < 16) { grid[y][x] = curCol === "erase" ? "" : curCol; renderGrid(); }
    };
    c.onpointerdown = e => { drawing = true; c.setPointerCapture(e.pointerId); paintAt(e); };
    c.onpointermove = e => { if (drawing) paintAt(e); };
    c.onpointerup = () => { drawing = false; };

    const cols = dlg.querySelector("#npcCols");
    PAL.forEach(p => {
      const b = document.createElement("button"); b.type = "button";
      b.style.cssText = p === "erase"
        ? "padding:5px 10px;border-radius:999px;background:var(--surface);font-size:12px;font-weight:700"
        : `width:26px;height:26px;border-radius:50%;background:${p};border:2px solid transparent`;
      if (p === "erase") b.textContent = "Eraser";
      b.onclick = () => {
        curCol = p;
        cols.querySelectorAll("button").forEach(x => x.style.outline = x === b ? "2px solid var(--primary)" : "none");
      };
      cols.appendChild(b);
    });

    dlg.querySelector("#npcClose").onclick = () => dlg.close();
    dlg.querySelector("#npcClear").onclick = () => { for (let y = 0; y < 16; y++) grid[y].fill(""); renderGrid(); };
    dlg.querySelector("#npcSave").onclick = () => {
      const name = (dlg.querySelector("#npcName").value || "enemy").trim();
      const out = document.createElement("canvas"); out.width = out.height = 64;
      const octx = out.getContext("2d");
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (grid[y][x]) { octx.fillStyle = grid[y][x]; octx.fillRect(x * 4, y * 4, 4, 4); }
      }
      window.wtNpcs[name] = out.toDataURL("image/png");
      dlg.close();
      if (typeof runPreview === "function") runPreview();
      if (window.wtAlert) wtAlert({ title: "NPC Saved!", message: `Saved "${name}". Use "spawn NPC ${name}" in Scratch Blocks!` });
    };
    renderGrid();
  }
  dlg.showModal();
}