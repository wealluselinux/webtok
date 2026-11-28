/* PC Look Mode (Windows 11 & Nocturnal Shell Hyprland + Quickshell) on /computer with Web Tok iframe app & Wallpaper Settings */
(function initPcLook() {
  const page = document.body.dataset.page || "";
  function loadCfg() {
    try {
      return {
        enabled: false,
        style: "nocturnal",
        light: false,
        glass: true,
        wpMode: "default", // "default" | "profile" | "custom"
        customWp: "",
        ...JSON.parse(localStorage.getItem("wt_pc_look") || "{}")
      };
    } catch {
      return { enabled: false, style: "nocturnal", light: false, glass: true, wpMode: "default", customWp: "" };
    }
  }
  function saveCfg(next) {
    localStorage.setItem("wt_pc_look", JSON.stringify(next));
  }

  let cfg = loadCfg();
  if (page === "landing") {
    if (cfg.enabled) location.replace("/computer");
    return;
  }
  if (page !== "computer") return;

  const APPS = [
    { id: "webtok", name: "Web Tok", sub: "Open Web Tok in a window", logo: "/images/logo.png", href: "/scroll#fyp", color: "#60a5fa" },
    { id: "wp_settings", name: "Wallpaper & OS", sub: "Change wallpaper or OS look", icon: "wallpaper", action: () => openDesktopSettings(), color: "#c084fc" },
    { id: "secret", name: "Secret Settings", sub: "Capri, Gravity & Exit PC Mode", icon: "tune", action: () => window.openSecretSettings?.(), color: "#fb7185" }
  ];

  const QUOTES = [
    { q: "The night is more alive and more richly colored than the day.", a: "Vincent van Gogh" },
    { q: "Simplicity is the ultimate sophistication.", a: "Leonardo da Vinci" },
    { q: "Talk is cheap. Show me the code.", a: "Linus Torvalds" },
    { q: "Make it work, make it right, make it fast.", a: "Kent Beck" }
  ];

  let quoteIdx = 0;
  let activeWs = 1;
  let curAppHref = "";
  let profileWallpaper = "";

  try {
    const t = JSON.parse(localStorage.getItem("wt_theme") || "{}");
    if (t.wallpaper) profileWallpaper = t.wallpaper;
  } catch {}

  const st = document.createElement("style");
  st.textContent = `
    body[data-page="computer"]{overflow:hidden!important;height:100dvh!important;margin:0;padding:0}
    #wt-pc{position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;font-family:"Segoe UI Variable","Segoe UI","Google Sans",system-ui,sans-serif;user-select:none;overflow:hidden;background-size:cover;background-position:center;background-repeat:no-repeat}
    #wt-pc.nocturnal{
      font-family:"JetBrains Mono","Fira Code","Google Sans",monospace;
      background-image:url("/images/wall0.png"), radial-gradient(circle at 22% 18%,#2a214a 0%,#12131a 55%,#090a10 100%);
      color:#e6e1ff;
    }
    #wt-pc.nocturnal.daylight{
      background-image:url("/images/wall0.png"), radial-gradient(circle at 22% 18%,#e3dbff 0%,#f3f1fa 55%,#e8e4f6 100%);
      color:#181924;
    }
    #wt-pc.win11{
      background-image:url("/images/win11.jpg"), url("/images/win11.png"), radial-gradient(circle at 50% 42%,#1d4ed8 0%,#0f172a 42%,#060913 100%);
      color:#f8fafc;
    }
    #wt-pc.win11.daylight{
      background-image:url("/images/win11.jpg"), url("/images/win11.png"), radial-gradient(circle at 50% 42%,#93c5fd 0%,#dbeafe 52%,#eff6ff 100%);
      color:#0f172a;
    }

    .pc-stage{position:relative;flex:1;min-height:0;padding:18px;display:flex;gap:16px;overflow:hidden}
    .pc-icons{display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;gap:10px;width:96px;flex:none;z-index:2}
    .pc-ico{width:84px;padding:8px 4px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;color:inherit;text-decoration:none;cursor:pointer;border:1px solid transparent;background:transparent;font:inherit;transition:background .15s,border-color .15s}
    .pc-ico:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.24)}
    .pc-ico-box{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:rgba(16,18,28,.55);backdrop-filter:blur(10px);box-shadow:0 4px 12px #0004;overflow:hidden}
    .pc-ico-box img{width:32px;height:32px;object-fit:contain;border-radius:7px}
    .pc-ico span.lbl{font-size:11px;line-height:1.2;font-weight:600;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.85)}

    /* Windows */
    .pc-win{flex:1;min-width:0;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;backdrop-filter:blur(22px);box-shadow:0 20px 56px rgba(0,0,0,.45);transition:opacity .18s,transform .18s}
    .pc-win.hidden-win{display:none!important}
    .pc-win.max-win{position:fixed;inset:8px 8px 56px 8px;z-index:28;border-radius:12px}
    #wt-pc.nocturnal .pc-win.max-win{inset:62px 12px 68px 12px}
    #wt-pc.win11 .pc-win{background:rgba(24,28,40,.8);border:1px solid rgba(255,255,255,.18);border-radius:12px}
    #wt-pc.win11.daylight .pc-win{background:rgba(255,255,255,.85);border:1px solid rgba(15,23,42,.12)}
    #wt-pc.nocturnal .pc-win{background:rgba(18,19,26,.8);border:2px solid #c9b8ff;border-radius:14px}
    #wt-pc.nocturnal.glass .pc-win{background:rgba(24,26,38,.52);backdrop-filter:blur(28px)}
    #wt-pc.nocturnal.daylight .pc-win{background:rgba(243,241,250,.86);border:2px solid #7c5dfa}

    .pc-titlebar{height:40px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.12);flex:none}
    .daylight .pc-titlebar{border-bottom-color:rgba(0,0,0,.08)}
    .pc-wtitle{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pc-wbtns{display:flex;gap:5px;align-items:center;flex:none}
    .pc-wbtn{width:28px;height:28px;border-radius:7px;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;font-size:16px;text-decoration:none}
    .pc-wbtn:hover{background:rgba(255,255,255,.14)}
    .pc-wbtn.close:hover{background:#e11d48;color:#fff}

    .pc-win-body{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:20px}
    .pc-iframe-wrap{flex:1;min-height:0;background:#0e0d14;display:flex}
    .pc-iframe{width:100%;height:100%;border:0;flex:1}

    .pc-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .pc-hero h1{font-size:clamp(24px,3.4vw,36px);margin:0 0 6px;line-height:1.1}
    .pc-hero p{margin:0;opacity:.82;font-size:13.5px;max-width:52ch}
    .pc-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .pc-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.1);color:inherit;text-decoration:none;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:transform .15s,background .15s}
    .pc-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.18)}
    .pc-btn.p{background:#c9b8ff;color:#12131a;border-color:transparent}
    #wt-pc.win11 .pc-btn.p{background:#3b82f6;color:#fff}

    .pc-stats{display:flex;gap:10px;flex-wrap:wrap}
    .pc-stat{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:700}
    .pc-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #22c55e33}

    .pc-app-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
    .pc-app-card{display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:inherit;text-decoration:none;cursor:pointer;text-align:left;font:inherit;transition:transform .15s,background .15s}
    .pc-app-card:hover{transform:translateY(-2px);background:rgba(255,255,255,.16)}
    .daylight .pc-app-card{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.09)}

    /* Nocturnal Top Bar & Widgets */
    .noc-bar{height:44px;margin:10px 14px 0;padding:0 12px;border-radius:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(18,19,26,.78);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.14);flex:none;z-index:30}
    #wt-pc.nocturnal.daylight .noc-bar{background:rgba(243,241,250,.84);border-color:rgba(0,0,0,.1)}
    .noc-grp{display:flex;align-items:center;gap:8px}
    .noc-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:10px;background:rgba(255,255,255,.08);font-size:12px;font-weight:700;cursor:pointer;border:0;color:inherit;font-family:inherit;text-decoration:none}
    .noc-pill:hover{background:rgba(201,184,255,.22)}
    .noc-ws{display:flex;gap:4px}
    .noc-ws button{width:26px;height:26px;border-radius:8px;border:0;background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
    .noc-ws button.on{background:#c9b8ff;color:#12131a;width:36px}

    .noc-widgets{width:268px;flex:none;display:flex;flex-direction:column;gap:12px}
    .noc-wcard{background:rgba(18,19,26,.72);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
    #wt-pc.nocturnal.daylight .noc-wcard{background:rgba(243,241,250,.84);border-color:rgba(0,0,0,.1)}
    .noc-qgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .noc-qbtn{padding:10px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:inherit;font:inherit;font-size:11px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px}
    .noc-qbtn.on{border-color:#c9b8ff;background:rgba(201,184,255,.22)}

    .noc-dock-wrap{display:flex;justify-content:center;padding:0 14px 12px;flex:none;z-index:30}
    .noc-dock{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:18px;background:rgba(18,19,26,.78);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.15)}
    #wt-pc.nocturnal.daylight .noc-dock{background:rgba(243,241,250,.86);border-color:rgba(0,0,0,.12)}
    .noc-dock button{width:42px;height:42px;border-radius:12px;border:0;background:rgba(255,255,255,.08);color:inherit;display:grid;place-items:center;cursor:pointer;transition:transform .15s,background .15s}
    .noc-dock button:hover{transform:translateY(-3px) scale(1.06);background:rgba(201,184,255,.28)}
    .noc-dock button img{width:26px;height:26px;object-fit:contain;border-radius:6px}

    /* Windows 11 Taskbar & Start Menu */
    .w11-bar{height:48px;padding:0 14px;background:rgba(20,24,34,.82);backdrop-filter:blur(26px);border-top:1px solid rgba(255,255,255,.12);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;flex:none;z-index:30}
    #wt-pc.win11.daylight .w11-bar{background:rgba(243,246,252,.85);border-top-color:rgba(15,23,42,.1)}
    .w11-center{display:flex;align-items:center;gap:6px}
    .w11-tbtn{width:38px;height:38px;border-radius:8px;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;position:relative}
    .w11-tbtn:hover,.w11-tbtn.active{background:rgba(255,255,255,.12)}
    .w11-tbtn.active::after{content:"";position:absolute;bottom:2px;width:14px;height:3px;border-radius:99px;background:#60a5fa}
    .w11-tray{justify-self:end;display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:600}
    .w11-start{position:fixed;bottom:58px;left:50%;transform:translateX(-50%);width:min(92vw,420px);background:rgba(26,30,42,.92);backdrop-filter:blur(30px);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.55);z-index:40;display:none;flex-direction:column;gap:14px}
    .w11-start.open{display:flex}
    #wt-pc.win11.daylight .w11-start{background:rgba(248,250,252,.95);border-color:rgba(15,23,42,.12)}
    .w11-sgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}

    /* Desktop Wallpaper & OS Settings Modal */
    #pcSetDlg{border:0;border-radius:20px;padding:22px;width:min(92vw,460px);background:#181a24;color:#f1f5f9;margin:auto;box-shadow:0 24px 64px rgba(0,0,0,.6);font-family:inherit;z-index:9999}
    #pcSetDlg::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(5px)}
    .pcs-sec{margin-top:14px;display:flex;flex-direction:column;gap:8px}
    .pcs-lbl{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#c9b8ff}
    .pcs-seg{display:flex;gap:6px;background:rgba(255,255,255,.07);padding:4px;border-radius:12px}
    .pcs-seg button{flex:1;border:0;background:transparent;color:#cbd5e1;font:inherit;font-size:12px;font-weight:700;padding:8px;border-radius:9px;cursor:pointer}
    .pcs-seg button.on{background:#c9b8ff;color:#12131a}
    .pcs-in{width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;font:inherit;font-size:12.5px;outline:0}

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

  function applyWallpaper() {
    root.style.backgroundImage = "";
    if (cfg.wpMode === "profile" && profileWallpaper) {
      const wp = profileWallpaper.trim();
      root.style.backgroundImage = (wp.startsWith("url(") || wp.includes("gradient")) ? wp : `url("${wp}")`;
    } else if (cfg.wpMode === "custom" && cfg.customWp) {
      const wp = cfg.customWp.trim();
      root.style.backgroundImage = (wp.startsWith("url(") || wp.includes("gradient")) ? wp : `url("${wp}")`;
    }
  }
  applyWallpaper();

  function iconMedia(a) {
    return a.logo
      ? `<img src="${a.logo}" alt="${a.name}">`
      : `<span class="ms fill">${a.icon}</span>`;
  }

  const iconsHtml = APPS.map(a =>
    `<button type="button" class="pc-ico" data-app="${a.id}"><div class="pc-ico-box" style="color:${a.color}">${iconMedia(a)}</div><span class="lbl">${a.name}</span></button>`
  ).join("");

  const appCardsHtml = APPS.map(a =>
    `<button type="button" class="pc-app-card" data-app="${a.id}"><div class="pc-ico-box" style="color:${a.color}">${iconMedia(a)}</div><div><b style="display:block;font-size:13.5px">${a.name}</b><small style="opacity:.75;font-size:11.5px">${a.sub}</small></div></button>`
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
            <h1>Web Tok Desktop</h1>
            <p>Running in ${isNoc ? "Nocturnal Shell (Hyprland + Quickshell)" : "Windows 11"} on /computer. Launch Web Tok inside a desktop window or customize your wallpaper.</p>
          </div>
          <div class="pc-actions">
            <button type="button" class="pc-btn p" data-app="webtok"><img src="/images/logo.png" alt="" width="18" height="18" style="border-radius:4px">Open Web Tok</button>
            <button type="button" class="pc-btn" data-app="wp_settings"><span class="ms" style="font-size:17px">wallpaper</span>Wallpaper</button>
          </div>
        </div>
        <div class="pc-stats">
          <div class="pc-stat"><span class="ms" style="font-size:16px">group</span><strong id="pcStTotal">—</strong> users</div>
          <div class="pc-stat"><span class="pc-dot"></span><strong id="pcStOnline">—</strong> online now</div>
        </div>
        <div class="pc-app-grid">${appCardsHtml}</div>
      </div>
    </div>
    <div class="pc-win hidden-win" id="pcAppWin">
      <div class="pc-titlebar">
        <div class="pc-wtitle">
          <img src="/images/logo.png" alt="" width="18" height="18" style="border-radius:4px">
          <span id="pcAppTitle">Web Tok</span>
        </div>
        <div class="pc-wbtns">
          <button type="button" class="pc-wbtn" id="pcAppReload" title="Reload"><span class="ms" style="font-size:16px">refresh</span></button>
          <a class="pc-wbtn" id="pcAppPop" href="/scroll#fyp" title="Open full page"><span class="ms" style="font-size:16px">open_in_new</span></a>
          <button type="button" class="pc-wbtn" id="pcAppMax" title="Maximize"><span class="ms" style="font-size:16px">fullscreen</span></button>
          <button type="button" class="pc-wbtn" id="pcAppMin" title="Minimize"><span class="ms" style="font-size:16px">minimize</span></button>
          <button type="button" class="pc-wbtn close" id="pcAppClose" title="Close"><span class="ms" style="font-size:16px">close</span></button>
        </div>
      </div>
      <div class="pc-iframe-wrap">
        <iframe class="pc-iframe" id="pcAppFrame" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe>
      </div>
    </div>`;

  if (isNoc) {
    root.innerHTML = `
      <header class="noc-bar">
        <div class="noc-grp">
          <button type="button" class="noc-pill" id="pcLogoEgg" title="Web Tok">
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
          <button type="button" class="noc-pill" data-app="wp_settings" title="Wallpaper & OS Settings"><span class="ms" style="font-size:16px">wallpaper</span>Wallpaper</button>
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
              <button type="button" class="noc-qbtn" data-app="wp_settings"><span class="ms" style="font-size:18px">wallpaper</span>Wallpaper</button>
              <button type="button" class="noc-qbtn" id="nocSwitchWin"><span class="ms" style="font-size:18px">window</span>Windows 11</button>
            </div>
          </div>
        </aside>
      </div>
      <div class="noc-dock-wrap">
        <nav class="noc-dock">
          <button type="button" data-app="webtok" title="Web Tok"><img src="/images/logo.png" alt="Web Tok"></button>
          <button type="button" id="nocDockWin" title="Desktop Hub"><span class="ms">home</span></button>
          <button type="button" data-app="wp_settings" title="Wallpaper & OS Settings" style="color:#c084fc"><span class="ms fill">wallpaper</span></button>
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
          <b style="font-size:14px">Web Tok</b>
          <button type="button" class="pc-btn" id="w11SwitchNoc" style="padding:5px 10px;font-size:11px">Nocturnal Shell</button>
        </div>
        <div class="w11-sgrid">
          ${APPS.map(a => `<button type="button" class="pc-ico" style="width:100%" data-app="${a.id}"><div class="pc-ico-box" style="color:${a.color}">${iconMedia(a)}</div><span class="lbl">${a.name}</span></button>`).join("")}
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
          <button type="button" class="w11-tbtn active" id="w11WinToggle" title="Desktop Hub"><span class="ms fill" style="font-size:20px">home</span></button>
          <button type="button" class="w11-tbtn" data-app="webtok" title="Web Tok"><img src="/images/logo.png" alt="Web Tok" width="24" height="24" style="border-radius:6px"></button>
          <button type="button" class="w11-tbtn" data-app="wp_settings" title="Wallpaper & OS Settings" style="color:#c084fc"><span class="ms fill" style="font-size:20px">wallpaper</span></button>
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

  function openDesktopSettings() {
    let dlg = document.getElementById("pcSetDlg");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "pcSetDlg";
      dlg.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b style="font-size:17px;display:flex;align-items:center;gap:8px"><span class="ms fill" style="color:#c9b8ff">wallpaper</span>Desktop &amp; Wallpaper Settings</b>
          <button type="button" class="pc-wbtn" id="pcsClose"><span class="ms">close</span></button>
        </div>
        <div class="pcs-sec">
          <div class="pcs-lbl">Wallpaper Source</div>
          <div class="pcs-seg" id="pcsWpSeg">
            <button type="button" data-wp="default">OS Default</button>
            <button type="button" data-wp="profile">Use Profile Wallpaper</button>
            <button type="button" data-wp="custom">Custom URL</button>
          </div>
          <div id="pcsProfNote" style="font-size:11.5px;opacity:.75"></div>
          <div id="pcsCustRow" style="display:none;gap:8px;align-items:center">
            <input type="text" class="pcs-in" id="pcsCustIn" placeholder="Paste image URL (https://…)">
            <button type="button" class="pc-btn p" id="pcsCustSave" style="padding:9px 14px">Apply</button>
          </div>
        </div>
        <div class="pcs-sec">
          <div class="pcs-lbl">Desktop Style</div>
          <div class="pcs-seg" id="pcsStyleSeg">
            <button type="button" data-st="win11">Windows 11</button>
            <button type="button" data-st="nocturnal">Nocturnal Shell</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:18px;flex-wrap:wrap">
          <button type="button" class="pc-btn" id="pcsSecBtn">Secret Settings</button>
          <button type="button" class="pc-btn" id="pcsExitBtn" style="color:#fb7185">Exit Computer Mode</button>
        </div>`;
      document.body.appendChild(dlg);

      dlg.querySelector("#pcsClose").onclick = () => dlg.close();
      dlg.querySelector("#pcsWpSeg").onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        cfg.wpMode = b.dataset.wp;
        saveCfg(cfg);
        applyWallpaper();
        paintDlg();
      };
      dlg.querySelector("#pcsCustSave").onclick = () => {
        cfg.wpMode = "custom";
        cfg.customWp = dlg.querySelector("#pcsCustIn").value.trim();
        saveCfg(cfg);
        applyWallpaper();
        paintDlg();
      };
      dlg.querySelector("#pcsStyleSeg").onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        cfg.style = b.dataset.st;
        saveCfg(cfg);
        location.reload();
      };
      dlg.querySelector("#pcsSecBtn").onclick = () => { dlg.close(); window.openSecretSettings?.(); };
      dlg.querySelector("#pcsExitBtn").onclick = () => { cfg.enabled = false; saveCfg(cfg); location.href = "/"; };
    }
    function paintDlg() {
      dlg.querySelectorAll("#pcsWpSeg button").forEach(b => b.classList.toggle("on", b.dataset.wp === (cfg.wpMode || "default")));
      dlg.querySelectorAll("#pcsStyleSeg button").forEach(b => b.classList.toggle("on", b.dataset.st === (cfg.style || "nocturnal")));
      dlg.querySelector("#pcsCustRow").style.display = cfg.wpMode === "custom" ? "flex" : "none";
      dlg.querySelector("#pcsCustIn").value = cfg.customWp || "";
      dlg.querySelector("#pcsProfNote").textContent = profileWallpaper
        ? "Profile wallpaper detected and ready."
        : "No profile wallpaper set yet (set one in My Profile → Theme & settings).";
    }
    paintDlg();
    dlg.showModal();
  }

  const mainWin = root.querySelector("#pcMainWin");
  const appWin = root.querySelector("#pcAppWin");
  const appFrame = root.querySelector("#pcAppFrame");
  const w11Start = root.querySelector("#w11Start");

  function openInWindow(app) {
    if (!app) return;
    if (app.action) { app.action(); return; }
    w11Start?.classList.remove("open");
    curAppHref = app.href;
    root.querySelector("#pcAppTitle").textContent = app.name;
    const pop = root.querySelector("#pcAppPop");
    if (pop) pop.href = app.href;
    if (appFrame && appFrame.getAttribute("src") !== app.href) appFrame.src = app.href;
    mainWin?.classList.add("hidden-win");
    appWin?.classList.remove("hidden-win");
  }

  function showHub() {
    appWin?.classList.add("hidden-win");
    appWin?.classList.remove("max-win");
    mainWin?.classList.remove("hidden-win");
  }

  root.querySelectorAll("[data-app]").forEach(el => {
    el.addEventListener("click", () => {
      const app = APPS.find(a => a.id === el.dataset.app);
      openInWindow(app);
    });
  });

  root.querySelectorAll("#pcOpenSec, #nocDockSec").forEach(el => {
    el.onclick = () => window.openSecretSettings?.();
  });

  root.querySelector("#pcWinMin")?.addEventListener("click", () => mainWin?.classList.add("hidden-win"));
  root.querySelector("#pcWinClose")?.addEventListener("click", () => mainWin?.classList.add("hidden-win"));
  root.querySelector("#nocDockWin")?.addEventListener("click", showHub);
  root.querySelector("#w11WinToggle")?.addEventListener("click", () => {
    if (appWin && !appWin.classList.contains("hidden-win")) showHub();
    else if (mainWin?.classList.contains("hidden-win") && curAppHref) appWin?.classList.remove("hidden-win");
    else mainWin?.classList.toggle("hidden-win");
  });

  root.querySelector("#pcAppReload")?.addEventListener("click", () => { if (appFrame && curAppHref) appFrame.src = curAppHref; });
  root.querySelector("#pcAppMax")?.addEventListener("click", () => appWin?.classList.toggle("max-win"));
  root.querySelector("#pcAppMin")?.addEventListener("click", () => { appWin?.classList.add("hidden-win"); });
  root.querySelector("#pcAppClose")?.addEventListener("click", () => {
    if (appFrame) appFrame.src = "about:blank";
    curAppHref = "";
    showHub();
  });

  root.querySelector("#w11StartBtn")?.addEventListener("click", e => { e.stopPropagation(); w11Start?.classList.toggle("open"); });
  document.addEventListener("click", e => { if (w11Start && !w11Start.contains(e.target) && e.target.id !== "w11StartBtn") w11Start.classList.remove("open"); });
  root.querySelector("#w11SwitchNoc")?.addEventListener("click", () => {
    cfg.style = "nocturnal"; saveCfg(cfg); location.reload();
  });

  root.querySelector("#nocWs")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    activeWs = Number(b.dataset.ws || 1);
    root.querySelectorAll("#nocWs button").forEach(x => x.classList.toggle("on", Number(x.dataset.ws) === activeWs));
    const wt = root.querySelector(".pc-wtitle span");
    if (wt) wt.textContent = `Web Tok Desktop · Hyprland Workspace ${activeWs}`;
  });
  root.querySelector("#nocDayBtn")?.addEventListener("click", () => {
    cfg.light = !cfg.light; saveCfg(cfg); location.reload();
  });
  root.querySelector("#nocGlassBtn")?.addEventListener("click", () => {
    cfg.glass = !(cfg.glass !== false); saveCfg(cfg);
    root.classList.toggle("glass", cfg.glass);
    root.querySelector("#nocGlassBtn")?.classList.toggle("on", cfg.glass);
  });
  root.querySelector("#nocSwitchWin")?.addEventListener("click", () => {
    cfg.style = "win11"; saveCfg(cfg); location.reload();
  });

  const renderQuote = () => {
    const q = QUOTES[quoteIdx];
    const qt = root.querySelector("#nocQuoteTxt"), qa = root.querySelector("#nocQuoteAuth");
    if (qt) qt.textContent = `"${q.q}"`;
    if (qa) qa.textContent = `— ${q.a}`;
  };
  renderQuote();
  root.querySelector("#nocNextQ")?.addEventListener("click", () => { quoteIdx = (quoteIdx + 1) % QUOTES.length; renderQuote(); });

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
        if (data?.session?.user?.id) {
          const { data: prof } = await sb.from("profiles").select("theme").eq("id", data.session.user.id).maybeSingle();
          let rt = prof?.theme;
          if (typeof rt === "string") { try { rt = JSON.parse(rt); } catch { rt = null; } }
          if (rt?.wallpaper) {
            profileWallpaper = rt.wallpaper;
            applyWallpaper();
          }
        }
      }
    } catch {}
  })();
})();
