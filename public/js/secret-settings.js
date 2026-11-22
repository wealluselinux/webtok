/* Material You Secret Settings Modal (unlocked by 10 clicks on WebTok homepage logo) */
(function () {
  function getCfg() {
    try { return { enabled: false, size: "md", cursor: false, gravityBtn: false, gravityCollide: true, prompt: "", ...JSON.parse(localStorage.getItem("wt_capri_cfg") || "{}") }; }
    catch { return { enabled: false, size: "md", cursor: false, gravityBtn: false, gravityCollide: true, prompt: "" }; }
  }
  function saveCfg(c) {
    c._ts = Date.now();
    localStorage.setItem("wt_capri_cfg", JSON.stringify(c));
    if (window.wtCapri?.save) window.wtCapri.save(c);
    else window.wtCapri?.sync();
    window.wtGravity?.sync();
  }

  window.openSecretSettings = function () {
    let dlg = document.getElementById("wt-secret-dlg");
    if (!dlg) {
      const st = document.createElement("style");
      st.textContent = `
        #wt-secret-dlg{border:0;border-radius:32px;padding:24px;width:min(94vw,470px);background:var(--bg,#f6f1fc);color:var(--text,#1d192b);margin:auto;box-shadow:0 24px 64px #0006;font-family:inherit}
        #wt-secret-dlg::backdrop{background:#0007;backdrop-filter:blur(6px)}
        .ss-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}
        .ss-title{display:flex;align-items:center;gap:12px}
        .ss-ic{width:46px;height:46px;clip-path:var(--m3-cookie-4,circle(50%));background:var(--primary);color:var(--on-primary);display:grid;place-items:center;flex:none}
        .ss-card{background:var(--card,#e2d4f4);border-radius:28px;padding:18px;display:flex;flex-direction:column;gap:14px}
        .ss-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .ss-prev{width:64px;height:64px;border-radius:20px;background:var(--surface);display:grid;place-items:center;overflow:hidden;flex:none}
        .ss-prev img{height:58px;width:auto;object-fit:contain}
        .ss-switch{width:52px;height:32px;border-radius:999px;background:var(--surface);position:relative;cursor:pointer;border:2px solid var(--muted);transition:background .2s,border-color .2s;flex:none}
        .ss-switch::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--muted);transition:transform .2s var(--spring,ease),background .2s}
        .ss-switch.on{background:var(--primary);border-color:var(--primary)}
        .ss-switch.on::after{transform:translateX(20px);background:var(--on-primary)}
        .ss-seg{display:flex;gap:4px;background:var(--surface);padding:4px;border-radius:999px}
        .ss-seg button{flex:1;border:0;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:700;padding:8px 10px;border-radius:999px;cursor:pointer}
        .ss-seg button.on{background:var(--primary);color:var(--on-primary)}
        .ss-chips{display:flex;gap:6px;flex-wrap:wrap}
        .ss-chip{border:0;background:var(--surface);color:var(--text);padding:7px 12px;border-radius:999px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
        .ss-chip:hover{background:var(--primary);color:var(--on-primary)}
        .ss-ta{width:100%;min-height:68px;border:0;border-radius:18px;padding:10px 12px;background:var(--surface);color:var(--text);font:inherit;font-size:12px;resize:vertical;outline:0}
      `;
      document.head.appendChild(st);

      dlg = document.createElement("dialog");
      dlg.id = "wt-secret-dlg";
      dlg.innerHTML = `
        <div class="ss-head">
          <div class="ss-title">
            <div class="ss-ic"><span class="ms fill">auto_awesome</span></div>
            <div><h2 style="font-size:20px;font-weight:700;margin:0">Secret Settings</h2><small style="color:var(--muted)">Material You · Saved to your account</small></div>
          </div>
          <button type="button" class="btn icon" id="ssClose" aria-label="Close"><span class="ms">close</span></button>
        </div>
        <div class="ss-card">
          <div class="ss-row">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="ss-prev"><img src="/images/capri_assets/idle.webp" alt="Capri"></div>
              <div><b style="font-size:16px">Mini Desktop Capri Pet</b><div style="font-size:12px;color:var(--muted)">Click her to chat via Web Tok AI!</div></div>
            </div>
            <button type="button" class="ss-switch" id="ssCapriTog" aria-label="Toggle Capri Pet"></button>
          </div>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">Pet Size</div>
            <div class="ss-seg" id="ssSizeSeg">
              <button type="button" data-sz="sm">Medium (200px)</button>
              <button type="button" data-sz="md">Normal (280px)</button>
              <button type="button" data-sz="lg">Large (360px)</button>
            </div>
          </div>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">Mood &amp; Actions</div>
            <div class="ss-chips" id="ssMoods">
              <button type="button" class="ss-chip" data-st="walk">Walk</button>
              <button type="button" class="ss-chip" data-st="sleep">Sleep</button>
              <button type="button" class="ss-chip" data-st="music">Music Vibe</button>
              <button type="button" class="ss-chip" data-st="glitch">Glitch</button>
              <button type="button" class="ss-chip" data-st="center">Center Pet</button>
            </div>
          </div>
          <div class="ss-row">
            <div><b style="font-size:14px">Capri Custom Cursor</b><div style="font-size:12px;color:var(--muted)">Use Capri's custom pointer</div></div>
            <button type="button" class="ss-switch" id="ssCurTog" aria-label="Toggle Capri Cursor"></button>
          </div>
          <div class="ss-row">
            <div><b style="font-size:14px">Gravity</b><div style="font-size:12px;color:var(--muted)">Show Activate Gravity button at bottom of screen</div></div>
            <button type="button" class="ss-switch" id="ssGravTog" aria-label="Toggle Gravity Button"></button>
          </div>
          <div class="ss-row">
            <div><b style="font-size:14px">Gravity Collision</b><div style="font-size:12px;color:var(--muted)">Elements &amp; Capri collide and stack</div></div>
            <button type="button" class="ss-switch" id="ssColTog" aria-label="Toggle Gravity Collision"></button>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:12px;font-weight:700;color:var(--muted)">Capri AI Prompt (optional)</span>
              <button type="button" class="ss-chip" id="ssSavePrompt" style="padding:4px 10px">Save Prompt</button>
            </div>
            <textarea class="ss-ta" id="ssPrompt" maxlength="600" placeholder="Leave blank for default Capri personality, or enter a custom Web Tok AI prompt…"></textarea>
          </div>
        </div>
        <div style="margin-top:12px;font-size:11px;color:var(--muted);text-align:center">Capri assets © 2026 Lachy (capri-desktop) · PolyForm Noncommercial 1.0.0</div>`;
      document.body.appendChild(dlg);

      const paint = () => {
        const c = getCfg();
        dlg.querySelector("#ssCapriTog").classList.toggle("on", !!c.enabled);
        dlg.querySelector("#ssCurTog").classList.toggle("on", !!c.cursor);
        dlg.querySelector("#ssGravTog").classList.toggle("on", !!c.gravityBtn);
        dlg.querySelector("#ssColTog").classList.toggle("on", c.gravityCollide !== false);
        dlg.querySelector("#ssPrompt").value = c.prompt || "";
        dlg.querySelectorAll("#ssSizeSeg button").forEach(b => b.classList.toggle("on", b.dataset.sz === c.size));
      };
      dlg.querySelector("#ssClose").onclick = () => dlg.close();
      dlg.querySelector("#ssCapriTog").onclick = () => { const c = getCfg(); c.enabled = !c.enabled; saveCfg(c); paint(); };
      dlg.querySelector("#ssCurTog").onclick = () => { const c = getCfg(); c.cursor = !c.cursor; saveCfg(c); paint(); };
      dlg.querySelector("#ssGravTog").onclick = () => { const c = getCfg(); c.gravityBtn = !c.gravityBtn; saveCfg(c); paint(); };
      dlg.querySelector("#ssColTog").onclick = () => { const c = getCfg(); c.gravityCollide = !(c.gravityCollide !== false); saveCfg(c); paint(); };
      dlg.querySelector("#ssSavePrompt").onclick = () => {
        const c = getCfg(); c.prompt = dlg.querySelector("#ssPrompt").value.trim(); saveCfg(c);
        const btn = dlg.querySelector("#ssSavePrompt"); btn.textContent = "Saved!"; setTimeout(() => btn.textContent = "Save Prompt", 1400);
      };
      dlg.querySelector("#ssSizeSeg").onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        const c = getCfg(); c.size = b.dataset.sz; saveCfg(c); paint();
      };
      dlg.querySelector("#ssMoods").onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        const c = getCfg();
        if (!c.enabled) { c.enabled = true; saveCfg(c); paint(); }
        if (b.dataset.st === "center") window.wtCapri?.center();
        else window.wtCapri?.setState(b.dataset.st);
      };
      dlg._paint = paint;
    }
    dlg._paint();
    dlg.showModal();
  };
})();