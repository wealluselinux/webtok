/* Material You theme + wallpaper + security alerts + quick user search + Stories & Sounds bar */
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
  const wp = document.getElementById("wp-layer");
  if (!t.color && !t.mode && !t.wallpaper) {
    if (wp) { document.body.classList.remove("has-wp"); wp.style.backgroundImage = ""; }
    return;
  }
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = t.mode === "dark" ? true : t.mode === "light" ? false : sysDark;
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
  if (wp) {
    if (t.wallpaper) {
      document.body.classList.add("has-wp");
      wp.style.backgroundImage = t.wallpaper.startsWith("url(") || t.wallpaper.includes("gradient") ? t.wallpaper : `url("${t.wallpaper}")`;
    } else {
      document.body.classList.remove("has-wp");
      wp.style.backgroundImage = "";
    }
  }
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
applyTheme();

/* ---------- Global User Search + Sounds Link + 24h Stories Strip on Feed ---------- */
(function initExtrasBar() {
  const page = document.body.dataset.page || "";
  if (page !== "scroll" && page !== "home") return;

  const style = document.createElement("style");
  style.textContent = `
    #wt-top-tools{position:fixed;top:14px;right:14px;z-index:25;display:flex;gap:8px;align-items:center}
    .wt-pill{padding:9px 15px;border-radius:999px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;box-shadow:0 4px 16px #0002;transition:transform .15s}
    .wt-pill:hover{transform:translateY(-1px)}
    #wt-stories-bar{position:fixed;top:60px;left:calc(var(--sbw, 0px) + 14px);right:14px;z-index:18;display:flex;gap:10px;overflow-x:auto;padding:4px 2px;scrollbar-width:none;pointer-events:none}
    #wt-stories-bar>*{pointer-events:auto}
    #wt-stories-bar::-webkit-scrollbar{display:none}
    .st-pill{display:flex;flex-direction:column;align-items:center;gap:4px;background:none;border:0;color:var(--text);cursor:pointer;flex:none;width:58px}
    .st-ring{width:48px;height:48px;border-radius:38% 62% 55% 45%;padding:2px;background:linear-gradient(135deg,var(--primary),var(--accent));display:grid;place-items:center;box-shadow:0 4px 12px #0003}
    .st-ring.add{background:var(--card)}
    .st-in{width:100%;height:100%;border-radius:inherit;background:var(--surface) center/cover;display:grid;place-items:center;font-weight:700;font-size:16px;color:var(--primary)}
    .st-lbl{font-size:11px;font-weight:600;max-width:58px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px var(--bg)}
    #wt-search-dlg,#wt-story-dlg{border:0;border-radius:32px;padding:22px;width:min(94vw,420px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 16px 48px #0005}
    #wt-search-dlg::backdrop,#wt-story-dlg::backdrop{background:#0007;backdrop-filter:blur(4px)}
    .wt-sres{max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:10px}
    .wt-srow{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:18px;background:var(--surface);text-decoration:none;color:inherit}
    .wt-srow:hover{background:var(--card)}
  `;
  document.head.appendChild(style);

  const tools = document.createElement("div");
  tools.id = "wt-top-tools";
  tools.innerHTML = `<button type="button" class="wt-pill" id="wtSearchBtn"><span class="ms" style="font-size:18px">search</span>Users</button>
    <a class="wt-pill" href="/sounds"><span class="ms" style="font-size:18px">music_note</span>Sounds</a>`;
  document.body.appendChild(tools);

  const sBar = document.createElement("div");
  sBar.id = "wt-stories-bar";
  document.body.appendChild(sBar);

  const sDlg = document.createElement("dialog");
  sDlg.id = "wt-search-dlg";
  sDlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Find Users</h3><button type="button" class="wt-pill" onclick="this.closest('dialog').close()"><span class="ms" style="font-size:18px">close</span></button></div>
    <input id="wtSearchIn" type="text" placeholder="Search @username or name…" style="width:100%;padding:12px 16px;border-radius:999px;border:0;background:var(--surface);color:var(--text);font:inherit;outline:0">
    <div class="wt-sres" id="wtSearchRes"></div>`;
  document.body.appendChild(sDlg);

  const vDlg = document.createElement("dialog");
  vDlg.id = "wt-story-dlg";
  vDlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b id="stViewerUser">Story</b><button type="button" class="wt-pill" onclick="this.closest('dialog').close()"><span class="ms" style="font-size:18px">close</span></button></div>
    <div id="stViewerBody" style="border-radius:24px;overflow:hidden;background:#000;max-height:60dvh;display:grid;place-items:center"></div>
    <div id="stViewerCap" style="margin-top:10px;font-size:13px;color:var(--muted)"></div>`;
  document.body.appendChild(vDlg);

  document.getElementById("wtSearchBtn").onclick = () => {
    sDlg.showModal();
    document.getElementById("wtSearchIn").focus();
  };
  let tmr = null;
  document.getElementById("wtSearchIn").oninput = e => {
    clearTimeout(tmr);
    const q = e.target.value.trim().replace(/[%_]/g, "");
    const resEl = document.getElementById("wtSearchRes");
    if (!q) { resEl.innerHTML = ""; return; }
    tmr = setTimeout(async () => {
      if (typeof sb === "undefined") return;
      const { data } = await sb.from("profiles").select("id,username,display_name,avatar_url").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(15);
      resEl.innerHTML = (data && data.length) ? "" : '<div style="color:var(--muted);padding:10px;font-size:13px">No users found.</div>';
      (data || []).forEach(u => {
        const a = document.createElement("a");
        a.className = "wt-srow";
        a.href = "/profile?u=" + encodeURIComponent(u.username);
        const av = u.avatar_url ? `style="background-image:url(${u.avatar_url})"` : "";
        const init = (u.display_name || u.username || "U")[0].toUpperCase();
        a.innerHTML = `<div class="st-in" style="width:36px;height:36px;border-radius:38% 62% 55% 45%;flex:none;${u.avatar_url ? `background-image:url(${u.avatar_url})` : ""}">${u.avatar_url ? "" : init}</div>
          <div><div style="font-weight:700;font-size:14px">${(u.display_name || u.username).replace(/</g,"&lt;")}</div><div style="font-size:12px;color:var(--muted)">@${u.username.replace(/</g,"&lt;")}</div></div>`;
        resEl.appendChild(a);
      });
    }, 220);
  };

  async function loadStories() {
    try {
      const r = await fetch("/api/stories");
      const j = await r.json();
      const rows = j.data || [];
      sBar.innerHTML = "";

      const addBtn = document.createElement("button");
      addBtn.type = "button"; addBtn.className = "st-pill";
      addBtn.innerHTML = `<div class="st-ring add"><div class="st-in"><span class="ms">add</span></div></div><span class="st-lbl">Your story</span>`;
      const fin = document.createElement("input");
      fin.type = "file"; fin.accept = "image/*,video/mp4,video/webm,video/quicktime"; fin.hidden = true;
      addBtn.onclick = () => fin.click();
      fin.onchange = async e => {
        const f = e.target.files?.[0]; if (!f) return;
        const { data } = await sb.auth.getSession();
        const sess = data?.session;
        if (!sess) { location.href = "/login"; return; }
        const isVid = f.type.startsWith("video/");
        const bucket = isVid ? "videos" : "avatars";
        const ext = isVid ? "mp4" : "jpg";
        const path = `${sess.user.id}/story-${Date.now()}.${ext}`;
        const up = await sb.storage.from(bucket).upload(path, f, { upsert: true, contentType: f.type });
        if (up?.error) { alert(up.error.message || "Could not upload story"); return; }
        const url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        const caption = prompt("Story caption (optional):") || "";
        await fetch("/api/stories", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token },
          body: JSON.stringify({ media_url: url, media_type: isVid ? "video" : "image", caption })
        });
        loadStories();
      };
      sBar.appendChild(addBtn); sBar.appendChild(fin);

      rows.forEach(st => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "st-pill";
        const init = (st.display_name || st.username || "U")[0].toUpperCase();
        b.innerHTML = `<div class="st-ring"><div class="st-in" style="${st.avatar_url ? `background-image:url(${st.avatar_url})` : ""}">${st.avatar_url ? "" : init}</div></div><span class="st-lbl">@${(st.username || "user").replace(/</g,"&lt;")}</span>`;
        b.onclick = () => {
          document.getElementById("stViewerUser").textContent = "@" + (st.username || "user");
          document.getElementById("stViewerCap").textContent = st.caption || "";
          document.getElementById("stViewerBody").innerHTML = st.media_type === "video"
            ? `<video src="${st.media_url}" controls autoplay playsinline style="max-height:58dvh;max-width:100%"></video>`
            : `<img src="${st.media_url}" style="max-height:58dvh;max-width:100%;object-fit:contain">`;
          vDlg.showModal();
        };
        sBar.appendChild(b);
      });
    } catch {}
  }
  loadStories();
})();

/* ---------- Theme sync + New-device Security Alert ---------- */
(async () => {
  try {
    if (typeof sb === "undefined" || !sb?.auth?.getSession) return;
    const { data } = await sb.auth.getSession();
    const sess = data?.session;
    const uid = sess?.user?.id;
    if (!uid) return;

    const { data: prof } = await sb.from("profiles").select("theme").eq("id", uid).maybeSingle();
    let rowTheme = prof?.theme;
    if (typeof rowTheme === "string") { try { rowTheme = JSON.parse(rowTheme); } catch { rowTheme = null; } }
    if (rowTheme && (rowTheme.color || rowTheme.mode || rowTheme.wallpaper)) {
      try { localStorage.setItem("wt_theme", JSON.stringify(rowTheme)); } catch {}
      applyTheme(rowTheme);
    }

    const ar = await fetch("/api/security/alerts", { headers: { Authorization: "Bearer " + sess.access_token } });
    const aj = await ar.json().catch(() => ({}));
    const alerts = aj?.data || [];
    if (alerts.length) {
      const a = alerts[0];
      if (window.Notification && Notification.permission === "granted") {
        try { new Notification("Web Tok Security Alert", { body: "New login detected on your account." }); } catch {}
      }
      const banner = document.createElement("div");
      banner.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99;max-width:min(92vw,520px);background:var(--card);color:var(--text);padding:14px 18px;border-radius:24px;box-shadow:0 12px 36px #0005;display:flex;flex-direction:column;gap:8px;border:2px solid var(--primary);font-size:13px";
      banner.innerHTML = `<div style="font-weight:700">New device login detected</div>
        <div style="color:var(--muted);word-break:break-word">${String(a.user_agent || "Unknown device").replace(/</g, "&lt;")}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" id="wtAckAlert" style="padding:7px 14px;border-radius:999px;border:0;background:var(--surface);color:var(--text);font-weight:700;cursor:pointer">This was me</button>
          <button type="button" id="wtKickAll" style="padding:7px 14px;border-radius:999px;border:0;background:var(--bad,#b3261e);color:#fff;font-weight:700;cursor:pointer">Sign out all devices</button>
        </div>`;
      document.body.appendChild(banner);
      banner.querySelector("#wtAckAlert").onclick = async () => {
        await fetch("/api/security/alerts/ack", { method: "POST", headers: { Authorization: "Bearer " + sess.access_token } });
        banner.remove();
      };
      banner.querySelector("#wtKickAll").onclick = async () => {
        await fetch("/api/security/logout-all", { method: "POST", headers: { Authorization: "Bearer " + sess.access_token } });
        try { await sb.auth.signOut(); localStorage.removeItem("wt_accounts"); } catch {}
        location.href = "/login";
      };
    }
  } catch {}
})();
