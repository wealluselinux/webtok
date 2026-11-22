/* Custom Material You Dialogs (replaces browser alert / confirm / prompt) + global Capri & Spin Shapes loader */
(function initM3Dialogs() {
  if (!document.querySelector('script[src="/js/capri-pet.js"]')) {
    const cs = document.createElement("script"); cs.src = "/js/capri-pet.js"; document.head.appendChild(cs);
  }
  if (!document.querySelector('script[src="/js/spin-shapes.js"]')) {
    const ss = document.createElement("script"); ss.src = "/js/spin-shapes.js"; document.head.appendChild(ss);
  }
  if (window.wtConfirm) return;
  const M3_COOKIE_4 = "polygon(99.5% 50.0%,98.8% 54.8%,96.8% 59.3%,93.8% 63.3%,90.2% 66.6%,86.3% 69.4%,82.6% 71.8%,79.3% 74.1%,76.5% 76.5%,74.1% 79.3%,71.8% 82.6%,69.4% 86.3%,66.6% 90.2%,63.3% 93.8%,59.3% 96.8%,54.8% 98.8%,50.0% 99.5%,45.2% 98.8%,40.7% 96.8%,36.7% 93.8%,33.4% 90.2%,30.6% 86.3%,28.2% 82.6%,25.9% 79.3%,23.5% 76.5%,20.7% 74.1%,17.4% 71.8%,13.7% 69.4%,9.8% 66.6%,6.2% 63.3%,3.2% 59.3%,1.2% 54.8%,0.5% 50.0%,1.2% 45.2%,3.2% 40.7%,6.2% 36.7%,9.8% 33.4%,13.7% 30.6%,17.4% 28.2%,20.7% 25.9%,23.5% 23.5%,25.9% 20.7%,28.2% 17.4%,30.6% 13.7%,33.4% 9.8%,36.7% 6.2%,40.7% 3.2%,45.2% 1.2%,50.0% 0.5%,54.8% 1.2%,59.3% 3.2%,63.3% 6.2%,66.6% 9.8%,69.4% 13.7%,71.8% 17.4%,74.1% 20.7%,76.5% 23.5%,79.3% 25.9%,82.6% 28.2%,86.3% 30.6%,90.2% 33.4%,93.8% 36.7%,96.8% 40.7%,98.8% 45.2%)";

  const st = document.createElement("style");
  st.textContent = `
    #wt-m3-dlg{border:0;border-radius:32px;padding:24px;width:min(92vw,410px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 20px 56px #0006;font-family:inherit;animation:wtDlgIn .18s cubic-bezier(.2,.9,.3,1.1)}
    #wt-m3-dlg::backdrop{background:#0007;backdrop-filter:blur(5px)}
    @keyframes wtDlgIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
    .wt-m3-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
    .wt-m3-ic{width:44px;height:44px;clip-path:${M3_COOKIE_4};background:var(--card);color:var(--primary);display:grid;place-items:center;flex:none}
    .wt-m3-ic.danger{background:color-mix(in srgb,var(--bad,#b3261e) 18%,transparent);color:var(--bad,#b3261e)}
    .wt-m3-title{font-size:19px;font-weight:700;letter-spacing:-.2px;margin:0}
    .wt-m3-msg{font-size:14px;line-height:1.5;color:var(--muted);margin:0 0 16px;word-break:break-word}
    .wt-m3-in{width:100%;padding:13px 16px;border-radius:20px;border:2px solid transparent;background:var(--surface);color:var(--text);font:inherit;outline:0;margin-bottom:16px}
    .wt-m3-in:focus{border-color:var(--primary)}
    .wt-m3-acts{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
    .wt-m3-btn{padding:10px 20px;border-radius:999px;border:0;font:inherit;font-size:14px;font-weight:700;cursor:pointer;background:var(--surface);color:var(--text);transition:transform .15s}
    .wt-m3-btn:active{transform:scale(.96)}
    .wt-m3-btn.p{background:var(--primary);color:var(--on-primary)}
    .wt-m3-btn.danger{background:var(--bad,#b3261e);color:#fff}
  `;
  document.head.appendChild(st);

  function showM3Modal({ title = "Web Tok", message = "", icon = "info", danger = false, mode = "alert", placeholder = "", defaultValue = "", confirmText = "OK", cancelText = "Cancel" }) {
    return new Promise(resolve => {
      let dlg = document.getElementById("wt-m3-dlg");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "wt-m3-dlg";
        document.body.appendChild(dlg);
      }
      dlg.innerHTML = "";

      const head = document.createElement("div");
      head.className = "wt-m3-head";
      const ic = document.createElement("div");
      ic.className = "wt-m3-ic" + (danger ? " danger" : "");
      ic.innerHTML = `<span class="ms" style="font-size:22px">${icon}</span>`;
      const h3 = document.createElement("h3");
      h3.className = "wt-m3-title";
      h3.textContent = title;
      head.append(ic, h3);
      dlg.appendChild(head);

      if (message) {
        const p = document.createElement("p");
        p.className = "wt-m3-msg";
        p.textContent = message;
        dlg.appendChild(p);
      }

      let inp = null;
      if (mode === "prompt") {
        inp = document.createElement("input");
        inp.type = "text";
        inp.className = "wt-m3-in";
        inp.placeholder = placeholder;
        inp.value = defaultValue;
        dlg.appendChild(inp);
      }

      const acts = document.createElement("div");
      acts.className = "wt-m3-acts";
      let settled = false;
      const done = val => {
        if (settled) return;
        settled = true;
        dlg.close();
        resolve(val);
      };

      if (mode !== "alert") {
        const cBtn = document.createElement("button");
        cBtn.type = "button";
        cBtn.className = "wt-m3-btn";
        cBtn.textContent = cancelText;
        cBtn.onclick = () => done(mode === "prompt" ? null : false);
        acts.appendChild(cBtn);
      }

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "wt-m3-btn " + (danger ? "danger" : "p");
      okBtn.textContent = confirmText;
      okBtn.onclick = () => done(mode === "prompt" ? inp.value : mode === "confirm" ? true : undefined);
      acts.appendChild(okBtn);
      dlg.appendChild(acts);

      dlg.oncancel = e => {
        e.preventDefault();
        done(mode === "prompt" ? null : mode === "confirm" ? false : undefined);
      };
      if (inp) {
        inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); okBtn.click(); } };
      }

      dlg.showModal();
      if (inp) { inp.focus(); inp.select(); } else okBtn.focus();
    });
  }

  window.wtConfirm = opts => typeof opts === "string"
    ? showM3Modal({ title: "Confirm", message: opts, icon: "help", mode: "confirm", confirmText: "Confirm" })
    : showM3Modal({ icon: opts?.danger ? "warning" : "help", confirmText: "Confirm", ...opts, mode: "confirm" });
  window.wtPrompt = opts => typeof opts === "string"
    ? showM3Modal({ title: opts, icon: "edit", mode: "prompt", confirmText: "Save" })
    : showM3Modal({ icon: "edit", confirmText: "Save", ...opts, mode: "prompt" });
  window.wtAlert = opts => typeof opts === "string"
    ? showM3Modal({ title: "Notice", message: opts, icon: "info", mode: "alert", confirmText: "OK" })
    : showM3Modal({ icon: "info", confirmText: "OK", ...opts, mode: "alert" });
})();