/* Profile page: Material You theme engine + M3 Expressive dialogs */
const PRESETS = [
  { name: "Berry", hex: "#7b3f8c" },
  { name: "Sage", hex: "#386a4b" },
  { name: "Ocean", hex: "#25638f" },
  { name: "Terracotta", hex: "#9b4534" },
  { name: "Lavender", hex: "#5b5399" }
];
const WP_PRESETS = [
  { id: "none", label: "None", css: "" },
  { id: "rose", label: "Rose Aura", css: "radial-gradient(circle at 20% 20%, #ffd58a99, transparent 50%), radial-gradient(circle at 80% 80%, #e7b6f299, transparent 55%), linear-gradient(135deg, #fff0ee, #fbd5de)" },
  { id: "mint", label: "Mint Mist", css: "radial-gradient(circle at 80% 20%, #cfe8d5, transparent 55%), linear-gradient(135deg, #eefaf2, #d3ecdc)" },
  { id: "dusk", label: "Dusk", css: "radial-gradient(circle at 30% 20%, #7b3f8c88, transparent 55%), linear-gradient(135deg, #22141b, #47303c)" },
  { id: "sky", label: "Sky", css: "radial-gradient(circle at 75% 25%, #bae6fd, transparent 50%), linear-gradient(135deg, #f0f9ff, #dbeafe)" }
];
let activeProfileTheme = null;
window.lastThemeError = "";

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min, l = (max+min)/2;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [Math.round(h*360), Math.round(s*100)];
}
function getTheme() { try { return JSON.parse(localStorage.getItem("wt_theme") || "{}"); } catch { return {}; } }
async function saveTheme(patch) {
  const next = { ...getTheme(), ...patch };
  try { localStorage.setItem("wt_theme", JSON.stringify(next)); } catch {}
  activeProfileTheme = null;
  applyTheme(next);
  window.lastThemeError = "";
  if (sb && user && isMe) {
    try {
      const res = await sb.from("profiles").update({ theme: next }).eq("id", user.id);
      if (res?.error) {
        window.lastThemeError = res.error.message || "Could not save theme.";
        console.warn("Theme save error:", res.error);
      }
    } catch (e) {
      window.lastThemeError = e?.message || "Could not save theme.";
      console.warn("Theme save exception:", e);
    }
  }
  return next;
}
function applyTheme(t = activeProfileTheme || getTheme()) {
  const root = document.documentElement;
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = t.mode === "dark" ? true : t.mode === "light" ? false : sysDark;
  const [h, s] = hexToHsl(t.color || "#7b3f8c");
  const sat = Math.min(Math.max(s, 22), 58);
  if (isDark) {
    root.style.setProperty("--bg", `hsl(${h}, ${Math.round(sat*0.45)}%, 10%)`);
    root.style.setProperty("--surface", `hsl(${h}, ${Math.round(sat*0.45)}%, 16%)`);
    root.style.setProperty("--card", `hsl(${h}, ${Math.round(sat*0.42)}%, 23%)`);
    root.style.setProperty("--primary", `hsl(${h}, ${Math.min(sat+18,80)}%, 80%)`);
    root.style.setProperty("--on-primary", `hsl(${h}, ${sat}%, 18%)`);
    root.style.setProperty("--text", `hsl(${h}, 30%, 92%)`);
    root.style.setProperty("--muted", `hsl(${h}, 20%, 72%)`);
    root.style.setProperty("--accent", `hsl(${(h+45)%360}, 40%, 28%)`);
  } else {
    root.style.setProperty("--bg", `hsl(${h}, ${Math.round(sat*0.6)}%, 96%)`);
    root.style.setProperty("--surface", `hsl(${h}, ${Math.round(sat*0.6)}%, 91%)`);
    root.style.setProperty("--card", `hsl(${h}, ${Math.round(sat*0.58)}%, 88%)`);
    root.style.setProperty("--primary", `hsl(${h}, ${sat}%, 38%)`);
    root.style.setProperty("--on-primary", "#ffffff");
    root.style.setProperty("--text", `hsl(${h}, 35%, 16%)`);
    root.style.setProperty("--muted", `hsl(${h}, 18%, 42%)`);
    root.style.setProperty("--accent", `hsl(${(h+45)%360}, 85%, 78%)`);
  }
  const wp = $("wp-layer");
  if (t.wallpaper) {
    document.body.classList.add("has-wp");
    wp.style.backgroundImage = t.wallpaper.startsWith("url(") || t.wallpaper.includes("gradient") ? t.wallpaper : `url("${t.wallpaper}")`;
  } else {
    document.body.classList.remove("has-wp");
    wp.style.backgroundImage = "";
  }
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
applyTheme();

/* ---------- Custom Material You Dialogs (replaces browser alert / confirm / prompt) ---------- */
(function initM3Dialogs() {
  if (window.wtConfirm) return;
  const st = document.createElement("style");
  st.textContent = `
    #wt-m3-dlg{border:0;border-radius:32px;padding:24px;width:min(92vw,410px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 20px 56px #0006;font-family:inherit;animation:wtDlgIn .18s cubic-bezier(.2,.9,.3,1.1)}
    #wt-m3-dlg::backdrop{background:#0007;backdrop-filter:blur(5px)}
    @keyframes wtDlgIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
    .wt-m3-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
    .wt-m3-ic{width:44px;height:44px;clip-path:var(--m3-cookie-4);background:var(--card);color:var(--primary);display:grid;place-items:center;flex:none}
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
