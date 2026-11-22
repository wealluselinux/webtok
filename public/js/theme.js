/* Material You theme + wallpaper + security alerts + Capri Pet & Spin Shapes loader (loads m3-dialogs & feed-extras) */
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
function applyTheme(t) {
  if (!t) { try { t = JSON.parse(localStorage.getItem("wt_theme") || "{}"); } catch { t = {}; } }
  const root = document.documentElement;
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = t.mode === "dark" ? true : t.mode === "light" ? false : sysDark;
  if (t.color || t.mode) {
    const [h, s] = hexToHsl(t.color || "#6750a4");
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
  }
  const wp = document.getElementById("wp-layer");
  if (wp) {
    if (t.wallpaper) {
      document.body.classList.add("has-wp");
      wp.style.backgroundImage = t.wallpaper.startsWith("url(") || t.wallpaper.includes("gradient") ? t.wallpaper : `url(${t.wallpaper})`;
    } else {
      document.body.classList.remove("has-wp");
      wp.style.backgroundImage = "";
    }
  }
  if (window.wtApplySpinShapes) window.wtApplySpinShapes(!!t.spinShapes);
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
applyTheme();

function loadSubScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement("script");
  s.src = src;
  document.head.appendChild(s);
}
if (!window.wtConfirm) loadSubScript("/js/m3-dialogs.js");
if (["scroll", "home"].includes(document.body.dataset.page || "")) loadSubScript("/js/feed-extras.js");
loadSubScript("/js/capri-pet.js");
loadSubScript("/js/spin-shapes.js");
if ((document.body.dataset.page || "") === "landing") loadSubScript("/js/secret-settings.js");

/* ---------- Theme sync + New-device Security Alert ---------- */
(async () => {
  try {
    if (typeof sb === "undefined" || !sb) return;
    const { data } = await sb.auth.getSession();
    const sess = data?.session;
    if (!sess) return;
    const { data: row } = await sb.from("profiles").select("theme").eq("id", sess.user.id).maybeSingle();
    if (row?.theme && Object.keys(row.theme).length) {
      try { localStorage.setItem("wt_theme", JSON.stringify(row.theme)); } catch {}
      applyTheme(row.theme);
    }
    fetch("/api/security/login-check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token },
      body: JSON.stringify({ ua: navigator.userAgent.slice(0, 120) })
    }).then(r => r.json()).then(j => {
      if (j?.data?.isNewDevice && window.wtAlert) {
        wtAlert({ title: "New login detected", message: "Your account was just signed in from a new device or browser. If this wasn't you, change your password in Theme & settings.", icon: "security" });
      }
    }).catch(() => {});
  } catch {}
})();