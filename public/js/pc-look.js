/* PC Look Mode (Windows 11 & Nocturnal Shell Hyprland + Quickshell) for Web Tok Homepage */
(function initPcLook() {
  if ((document.body.dataset.page || "") !== "landing") return;
  let cfg;
  try { cfg = { enabled: false, style: "nocturnal", light: false, glass: true, ...JSON.parse(localStorage.getItem("wt_pc_look") || "{}") }; }
  catch { cfg = { enabled: false, style: "nocturnal", light: false, glass: true }; }
  if (!cfg.enabled) return;

  const landing = document.getElementById("landing");
  if (landing) landing.classList.add("hidden");

  const APPS = [
    { id: "feed", name: "Web Tok Feed", sub: "For You & Following", icon: "smart_display", href: "/scroll#fyp", color: "#60a5fa" },
    { id: "games", name: "Mini Games", sub: "3D Blockland & Arcade", icon: "sports_esports", href: "/games", color: "#c084fc" },
    { id: "dev", name: "Dev Studio", sub: "Python, Scratch & AI", icon: "code", href: "/developer", color: "#34d399" },
    { id: "shop", name: "Tok Shop", sub: "Bundles & Frames", icon: "storefront", href: "/shop", color: "#fbbf24" },
    { id: "dms", name: "Messages", sub: "DMs, Calls & Web Tok AI", icon: "forum", href: "/messages", color: "#f472b6" },
    { id: "sounds", name: "Sounds", sub: "Audio & Tracks", icon: "music_note", href: "/sounds", color: "#38bdf8" },
    { id: "profile", name: "My Profile", sub: "Themes & Wallpapers", icon: "account_circle", href: "/profile", color: "#a78bfa" },
    { id: "secret", name: "Secret Settings", sub: "Switch OS or Exit", icon: "tune", action: () => window.openSecretSettings?.(), color: "#fb7185" }
  ];

  const QUOTES = [
    { q: "The night is more alive and more richly colored than the day.", a: "Vincent van Gogh" },
    { q: "Simplicity is the ultimate sophistication.", a: "Leonardo da Vinci" },
    { q: "Talk is cheap. Show me the code.", a: "Linus Torvalds" },
    { q: "Make it work, make it right, make it fast.", a: "Kent Beck" }
  ];

  let quoteIdx = 0;
  let activeWs = 1;
  let signedIn = false;

  const st = document.createElement("style");
  st.textContent = `
    body[data-page="landing"]{overflow:hidden!important;height:100dvh!important;margin:0;padding:0}
    #wt-pc{position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;font-family:"Segoe UI Variable","Segoe UI","Google Sans",system-ui,sans-serif;user-select:none;overflow:hidden}
    #wt-pc.nocturnal{font-family:"JetBrains Mono","Fira Code","Google Sans",monospace;background:radial-gradient(circle at 22% 18%,#2a214a 0%,#12131a 55%,#090a10 100%);color:#e6e1ff}
    #wt-pc.nocturnal.daylight{background:radial-gradient(circle at 22% 18%,#e3dbff 0%,#f3f1fa 55%,#e8e4f6 100%);color:#181924}
    #wt-pc.win11{background:radial-gradient(circle at 50% 42%,#1d4ed8 0%,#0f172a 42%,#060913 100%);color:#f8fafc}
    #wt-pc.win11.daylight{background:radial-gradient(circle at 50% 42%,#93c5fd 0%,#dbeafe 52%,#eff6ff 100%);color:#0f172a}

    .pc-stage{position:relative;flex:1;min-height:0;padding:18px;display:flex;gap:16px;overflow:hidden}
    .pc-icons{display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;gap:10px;width:96px;flex:none;z-index:2}
    .pc-ico{width:84px;padding:8px 4px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;color:inherit;text-decoration:none;cursor:pointer;border:1px solid transparent;background:transparent;font:inherit;transition:background .15s,border-color .15s}
    .pc-ico:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18)}
    .pc-ico-box{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.12);backdrop-filter:blur(8px);box-shadow:0 4px 12px #0003}
    .pc-ico span.lbl{font-size:11px;line-height:1.2;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,.6)}
    .daylight .pc-ico span.lbl{text-shadow:0 1px 3px rgba(255,255,255,.8)}

    /* Main Window */
    .pc-win{flex:1;min-width:0;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;backdrop-filter:blur(22px);box-shadow:0 20px 56px rgba(0,0,0,.45);transition:opacity .18s,transform .18s}
    .pc-win.hidden-win{opacity:0;pointer-events:none;transform:scale(.96)}
    #wt-pc.win11 .pc-win{background:rgba(28,32,44,.76);border:1px solid rgba(255,255,255,.16);border-radius:12px}
    #wt-pc.win11.daylight .pc-win{background:rgba(255,255,255,.78);border:1px solid rgba(15,23,42,.12)}
    #wt-pc.nocturnal .pc-win{background:rgba(18,19,26,.78);border:2px solid #c9b8ff;border-radius:14px}
    #wt-pc.nocturnal.glass .pc-win{background:rgba(24,26,38,.44);backdrop-filter:blur(28px)}
    #wt-pc.nocturnal.daylight .pc-win{background:rgba(243,241,250,.78);border:2px solid #7c5dfa}

    .pc-titlebar{height:40px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.1);flex:none}
    .daylight .pc-titlebar{border-bottom-color:rgba(0,0,0,.08)}
    .pc-wtitle{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700}
    .pc-wbtns{display:flex;gap:6px;align-items:center}
    .pc-wbtn{width:28px;height:28px;border-radius:7px;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;font-size:16px}
    .pc-wbtn:hover{background:rgba(255,255,255,.14)}
    .pc-wbtn.close:hover{background:#e11d48;color:#fff}

    .pc-win-body{flex:1;overflow-y:auto;padding:22px;display:flex;flex-direction:column;gap:18px}
    .pc-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .pc-hero h1{font-size:clamp(24px,3.4vw,36px);margin:0 0 6px;line-height:1.1}
    .pc-hero p{margin:0;opacity:.8;font-size:13.5px;max-width:52ch}
    .pc-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .pc-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.1);color:inherit;text-decoration:none;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:transform .15s,background .15s}
    .pc-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.18)}
    .pc-btn.p{background:#c9b8ff;color:#12131a;border-color:transparent}
    #wt-pc.win11 .pc-btn.p{background:#3b82f6;color:#fff}

    .pc-stats{display:flex;gap:10px;flex-wrap:wrap}
    .pc-stat{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:700}
    .pc-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #22c55e33}

    .pc-app-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:12px}
    .pc-app-card{display:flex;align-items:center;gap:12px;padding:13px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:inherit;text-decoration:none;cursor:pointer;text-align:left;font:inherit;transition:transform .15s,background .15s}
    .pc-app-card:hover{transform:translateY(-2px);background:rgba(255,255,255,.14)}
    .daylight .pc-app-card{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.08)}

    /* Nocturnal Top Bar & Widgets */
    .noc-bar{height:44px;margin:10px 14px 0;padding:0 12px;border-radius:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(18,19,26,.78);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.14);flex:none;z-index:30}
    #wt-pc.nocturnal.daylight .noc-bar{background:rgba(243,241,250,.82);border-color:rgba(0,0,0,.1)}
    .noc-grp{display:flex;align-items:center;gap:8px}
    .noc-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:10px;background:rgba(255,255,255,.08);font-size:12px;font-weight:700;cursor:pointer;border:0;color:inherit;font-family:inherit;text-decoration:none}
    .noc-pill:hover{background:rgba(201,184,255,.22)}
    .noc-ws{display:flex;gap:4px}
    .noc-ws button{width:26px;height:26px;border-radius:8px;border:0;background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
    .noc-ws button.on{background:#c9b8ff;color:#12131a;width:36px}

    .noc-widgets{width:268px;flex:none;display:flex;flex-direction:column;gap:12px}
    .noc-wcard{background:rgba(18,19,26,.72);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
    #wt-pc.nocturnal.daylight .noc-wcard{background:rgba(243,241,250,.8);border-color:rgba(0,0,0,.1)}
    .noc-qgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .noc-qbtn{padding:10px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:inherit;font:inherit;font-size:11px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px}
    .noc-qbtn.on{border-color:#c9b8ff;background:rgba(201,184,255,.22)}

    .noc-dock-wrap{display:flex;justify-content:center;padding:0 14px 12px;flex:none;z-index:30}
    .noc-dock{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:18px;background:rgba(18,19,26,.78);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.15)}
    #wt-pc.nocturnal.daylight .noc-dock{background:rgba(243,241,250,.84);border-color:rgba(0,0,0,.12)}
    .noc-dock a,.noc-dock button{width:42px;height:42px;border-radius:12px;border:0;background:rgba(255,255,255,.08);color:inherit;display:grid;place-items:center;text-decoration:none;cursor:pointer;transition:transform .15s,background .15s}
    .noc-dock a:hover,.noc-dock button:hover{transform:translateY(-3px) scale(1.06);background:rgba(201,184,255,.28)}

    /* Windows 11 Taskbar & Start Menu */
    .w11-bar{height:48px;padding:0 14px;background:rgba(20,24,34,.82);backdrop-filter:blur(26px);border-top:1px solid rgba(255,255,255,.12);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;flex:none;z-index:30}
    #wt-pc.win11.daylight .w11-bar{background:rgba(243,246,252,.85);border-top-color:rgba(15,23,42,.1)}
    .w11-center{display:flex;align-items:center;gap:6px}
    .w11-tbtn{width:38px;height:38px;border-radius:8px;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;text-decoration:none;position:relative}
    .w11-tbtn:hover,.w11-tbtn.active{background:rgba(255,255,255,.12)}
    .w11-tbtn.active::after{content:"";position:absolute;bottom:2px;width:14px;height:3px;border-radius:99px;background:#60a5fa}
    .w11-tray{justify-self:end;display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:600}
    .w11-start{position:fixed;bottom:58px;left:50%;transform:translateX(-50%);width:min(92vw,520px);background:rgba(26,30,42,.9);backdrop-filter:blur(30px);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.55);z-index:40;display:none;flex-direction:column;gap:14px}
    .w11-start.open{display:flex}
    #wt-pc.win11.daylight .w11-start{background:rgba(248,250,252,.94);border-color:rgba(15,23,42,.12)}
    .w11-sgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}

    @media(max-width:900px){
      .noc-widgets,.pc-icons{display:none}
      .w11-sgrid{grid-template-columns:repeat(2,1fr)}
    }
  `;
  document.head.appendChild(st);

  const root = document.createElement("div");
  root.id = "wt-pc";
  const isNoc = (cfg.style || "nocturnal") === "nocturnal";
  root.className = (isNoc ? "nocturnal" : "win11") + (cfg.light ? " daylight" : "") + (cfg.glass !== false ? " glass" : "");

  const iconsHtml = APPS.map(a => a.href
    ? `<a class="pc-ico" href="${a.href}"><div class="pc-ico-box" style="color:${a.color}"><span class="ms fill">${a.icon}</span></div><span class="lbl">${a.name}</span></a>`
    : `<button type="button" class="pc-ico" data-app="${a.id}"><div class="pc-ico-box" style="color:${a.color}"><span class="ms fill">${a.icon}</span></div><span class="lbl">${a.name}</span></button>`
  ).join("");

  const appCardsHtml = APPS.map(a => a.href
    ? `<a class="pc-app-card" href="${a.href}"><div class="pc-ico-box" style="color:${a.color}"><span class="ms fill">${a.icon}</span></div><div><b style="display:block;font-size:13.5px">${a.name}</b><small style="opacity:.75;font-size:11.5px">${a.sub}</small></div></a>`
    : `<button type="button" class="pc-app-card" data-app="${a.id}"><div class="pc-ico-box" style="color:${a.color}"><span class="ms fill">${a.icon}</span></div><div><b style="display:block;font-size:13.5px">${a.name}</b><small style="opacity:.75;font-size:11.5px">${a.sub}</small></div></button>`
  ).join("");

  const mainWinHtml = `
    <div class="pc-win" id="pcMainWin">
      <div class="pc-titlebar">
        <div class="pc-wtitle">
          <img src="/images/logo.png" alt="" width="18" height="18" style="border-radius:4px">
          <span>Web Tok Desktop${isNoc ? " · Hyprland Workspace 1" : " · Windows 11"}</span>
        </div>
        <div class="pc-wbtns">
          <button type="button" class="pc-wbtn" id="pcWinMin" title="Minimize"><span class="ms" style="font-size:16px">minimize</span></button>
          <button type="button" class="pc-wbtn close" id="pcWinClose" title="Close"><span class="ms" style="font-size:16px">close</span></button>
        </div>
      </div>
      <div class="pc-win-body">
        <div class="pc-hero">
          <div>
            <h1>Short videos. Big vibes.</h1>
            <p>Web Tok is running in ${isNoc ? "Nocturnal Shell (Hyprland + Quickshell)" : "Windows 11"} PC Look Mode. Launch any corner of Web Tok below.</p>
          </div>
          <div class="pc-actions">
            <a class="pc-btn p" href="/scroll#fyp"><span class="ms">play_arrow</span>Start scrolling</a>
            <a class="pc-btn" id="pcSigninBtn" href="/login">Sign in</a>
          </div>
        </div>
        <div class="pc-stats">
          <div class="pc-stat"><span class="ms" style="font-size:16px">group</span><strong id="pcStTotal">—</strong> users</div>
          <div class="pc-stat"><span class="pc-dot"></span><strong id="pcStOnline">—</strong> online now</div>
        </div>
        <div class="pc-app-grid">${appCardsHtml}</div>
      </div>
    </div>`;

  if (isNoc) {
    root.innerHTML = `
      <header class="noc-bar">
        <div class="noc-grp">
          <button type="button" class="noc-pill" id="pcLogoEgg" title="Web Tok (tap 10x for Secret Settings)">
            <img src="/images/logo.png" alt="" width="18" height="18" style="border-radius:4px">
            <span>Nebula</span>
          </button>
          <div class="noc-ws" id="nocWs">
            ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-ws="${n}" class="${n === 1 ? "on" : ""}">${n}</button>`).join("")}
          </div>
        </div>
        <div class="noc-pill" id="pcClock">--:--</div>
        <div class="noc-grp">
          <span class="noc-pill"><span class="ms" style="font-size:15px">wifi</span>Online</span>
          <a class="noc-pill" id="pcBarAuth" href="/login">Sign in</a>
          <button type="button" class="noc-pill" id="pcOpenSec" title="Secret Settings"><span class="ms" style="font-size:16px">settings</span></button>
        </div>
      </header>
      <div class="pc-stage">
        <div class="pc-icons">${iconsHtml}</div>
        ${mainWinHtml}
        <aside class="noc-widgets">
          <div class="noc-wcard">
            <div style="font-size:28px;font-weight:700;color:#c9b8ff" id="nocBigTime">--:--</div>
            <div style="font-size:12px;opacity:.75" id="nocBigDate">Loading date…</div>
          </div>
          <div class="noc-wcard">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:#c9b8ff">
              <span>DAILY QUOTE</span>
              <button type="button" id="nocNextQ" style="border:0;background:none;color:inherit;cursor:pointer"><span class="ms" style="font-size:15px">refresh</span></button>
            </div>
            <div id="nocQuoteTxt" style="font-size:12px;line-height:1.4"></div>
            <div id="nocQuoteAuth" style="font-size:11px;opacity:.7;text-align:right"></div>
          </div>
          <div class="noc-wcard">
            <div style="font-size:11px;font-weight:700;color:#c9b8ff">QUICK TOGGLES</div>
            <div class="noc-qgrid">
              <button type="button" class="noc-qbtn ${cfg.light ? "on" : ""}" id="nocDayBtn"><span class="ms" style="font-size:18px">${cfg.light ? "light_mode" : "dark_mode"}</span>${cfg.light ? "Daylight" : "Nocturnal"}</button>
              <button type="button" class="noc-qbtn ${cfg.glass !== false ? "on" : ""}" id="nocGlassBtn"><span class="ms" style="font-size:18px">blur_on</span>Liquid Glass</button>
              <button type="button" class="noc-qbtn" id="nocSwitchWin"><span class="ms" style="font-size:18px">window</span>Windows 11</button>
              <button type="button" class="noc-qbtn" id="nocSecBtn"><span class="ms" style="font-size:18px">tune</span>Secret Settings</button>
            </div>
          </div>
        </aside>
      </div>
      <div class="noc-dock-wrap">
        <nav class="noc-dock">
          ${APPS.slice(0, 7).map(a => `<a href="${a.href}" title="${a.name}" style="color:${a.color}"><span class="ms fill">${a.icon}</span></a>`).join("")}
          <button type="button" id="nocDockWin" title="Toggle Web Tok Window"><span class="ms">web_asset</span></button>
          <button type="button" id="nocDockSec" title="Secret Settings" style="color:#fb7185"><span class="ms fill">tune</span></button>
        </nav>
      </div>`;
  } else {
    root.innerHTML = `
      <div class="pc-stage">
        <div class="pc-icons">${iconsHtml}</div>
        ${mainWinHtml}
      </div>
      <div class="w11-start" id="w11Start">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b style="font-size:14px">Pinned Web Tok Apps</b>
          <button type="button" class="pc-btn" id="w11SwitchNoc" style="padding:5px 10px;font-size:11px">Switch to Nocturnal Shell</button>
        </div>
        <div class="w11-sgrid">
          ${APPS.map(a => a.href
            ? `<a class="pc-ico" style="width:100%" href="${a.href}"><div class="pc-ico-box" style="color:${a.color}"><span class="ms fill">${a.icon}</span></div><span class="lbl">${a.name}</span></a>`
            : `<button type="button" class="pc-ico" style="width:100%" data-app="${a.id}"><div class="pc-ico-box" style="color:${a.color}"><span class="ms fill">${a.icon}</span></div><span class="lbl">${a.name}</span></button>`
          ).join("")}
        </div>
      </div>
      <footer class="w11-bar">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600">
          <span class="pc-dot"></span><span id="w11OnlineBar">Web Tok Online</span>
        </div>
        <div class="w11-center">
          <button type="button" class="w11-tbtn" id="w11StartBtn" title="Start">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6"><rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/><rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/></svg>
          </button>
          <button type="button" class="w11-tbtn active" id="w11WinToggle" title="Web Tok Hub"><img src="/images/logo.png" alt="" width="22" height="22" style="border-radius:5px"></button>
          ${APPS.slice(0, 5).map(a => `<a class="w11-tbtn" href="${a.href}" title="${a.name}" style="color:${a.color}"><span class="ms fill" style="font-size:20px">${a.icon}</span></a>`).join("")}
          <button type="button" class="w11-tbtn" id="pcOpenSec" title="Secret Settings" style="color:#fb7185"><span class="ms fill" style="font-size:20px">tune</span></button>
        </div>
        <div class="w11-tray">
          <span class="ms" style="font-size:17px">wifi</span>
          <span class="ms" style="font-size:17px">volume_up</span>
          <span id="pcClock" style="text-align:right;line-height:1.15">--:--</span>
        </div>
      </footer>`;
  }

  document.body.appendChild(root);

  // Wire Secret Settings buttons & 10-click logo
  root.querySelectorAll('[data-app="secret"], #pcOpenSec, #nocSecBtn, #nocDockSec').forEach(el => {
    el.onclick = () => window.openSecretSettings?.();
  });

  const mainWin = root.querySelector("#pcMainWin");
  const toggleWin = show => { if (mainWin) mainWin.classList.toggle("hidden-win", show === undefined ? !mainWin.classList.contains("hidden-win") : !show); };
  root.querySelector("#pcWinMin")?.addEventListener("click", () => toggleWin(false));
  root.querySelector("#pcWinClose")?.addEventListener("click", () => toggleWin(false));
  root.querySelector("#nocDockWin")?.addEventListener("click", () => toggleWin());
  root.querySelector("#w11WinToggle")?.addEventListener("click", () => toggleWin());

  // Windows 11 Start Menu
  const w11Start = root.querySelector("#w11Start");
  root.querySelector("#w11StartBtn")?.addEventListener("click", e => { e.stopPropagation(); w11Start?.classList.toggle("open"); });
  document.addEventListener("click", e => { if (w11Start && !w11Start.contains(e.target) && e.target.id !== "w11StartBtn") w11Start.classList.remove("open"); });
  root.querySelector("#w11SwitchNoc")?.addEventListener("click", () => {
    cfg.style = "nocturnal"; localStorage.setItem("wt_pc_look", JSON.stringify(cfg)); location.reload();
  });

  // Nocturnal Shell interactive controls
  root.querySelector("#nocWs")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    activeWs = Number(b.dataset.ws || 1);
    root.querySelectorAll("#nocWs button").forEach(x => x.classList.toggle("on", Number(x.dataset.ws) === activeWs));
    const wt = root.querySelector(".pc-wtitle span");
    if (wt) wt.textContent = `Web Tok Desktop · Hyprland Workspace ${activeWs}`;
  });
  root.querySelector("#nocDayBtn")?.addEventListener("click", () => {
    cfg.light = !cfg.light; localStorage.setItem("wt_pc_look", JSON.stringify(cfg)); location.reload();
  });
  root.querySelector("#nocGlassBtn")?.addEventListener("click", () => {
    cfg.glass = !(cfg.glass !== false); localStorage.setItem("wt_pc_look", JSON.stringify(cfg));
    root.classList.toggle("glass", cfg.glass);
    root.querySelector("#nocGlassBtn")?.classList.toggle("on", cfg.glass);
  });
  root.querySelector("#nocSwitchWin")?.addEventListener("click", () => {
    cfg.style = "win11"; localStorage.setItem("wt_pc_look", JSON.stringify(cfg)); location.reload();
  });

  const renderQuote = () => {
    const q = QUOTES[quoteIdx];
    const qt = root.querySelector("#nocQuoteTxt"), qa = root.querySelector("#nocQuoteAuth");
    if (qt) qt.textContent = `"${q.q}"`;
    if (qa) qa.textContent = `— ${q.a}`;
  };
  renderQuote();
  root.querySelector("#nocNextQ")?.addEventListener("click", () => { quoteIdx = (quoteIdx + 1) % QUOTES.length; renderQuote(); });

  // Live clock
  function tickClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const clk = root.querySelector("#pcClock");
    if (clk) clk.innerHTML = isNoc ? `${dateStr} · ${timeStr}` : `${timeStr}<br><span style="opacity:.7;font-size:10px">${dateStr}</span>`;
    const bt = root.querySelector("#nocBigTime"), bd = root.querySelector("#nocBigDate");
    if (bt) bt.textContent = timeStr;
    if (bd) bd.textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  }
  tickClock();
  setInterval(tickClock, 15000);

  // Sync live stats + auth state
  (async () => {
    try {
      const r = await fetch("/api/stats/users");
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.data) {
        const t = root.querySelector("#pcStTotal"), o = root.querySelector("#pcStOnline"), wb = root.querySelector("#w11OnlineBar");
        if (t) t.textContent = Number(j.data.totalUsers || 0).toLocaleString();
        if (o) o.textContent = Number(j.data.onlineUsers || 0).toLocaleString();
        if (wb) wb.textContent = `${Number(j.data.onlineUsers || 0).toLocaleString()} online now`;
      }
    } catch {}
    try {
      if (window.sb?.auth?.getSession) {
        const { data } = await sb.auth.getSession();
        if (data?.session) {
          signedIn = true;
          [root.querySelector("#pcSigninBtn"), root.querySelector("#pcBarAuth")].forEach(el => {
            if (el) { el.textContent = "Go to Web Tok"; el.href = "/scroll"; }
          });
        }
      }
    } catch {}
  })();
})();
