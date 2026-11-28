/* PC Look Mode (Windows 11 Dark Mode & Nocturnal Shell Hyprland + Quickshell) on /computer */
(function initPcLook() {
  const page = document.body.dataset.page || "";
  function loadCfg() {
    try {
      return {
        enabled: false,
        style: "nocturnal",
        light: false,
        glass: true,
        wpMode: "default",
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
    { id: "webtok", name: "Web Tok", sub: "For You & Feed", logo: "/images/logo.png", href: "/scroll#fyp", color: "#60cdff" },
    { id: "wp_settings", name: "Settings", sub: "Wallpaper & OS", icon: "settings", action: () => openDesktopSettings(), color: "#60cdff" },
    { id: "secret", name: "Secret Settings", sub: "Capri & Exit PC", icon: "tune", action: () => window.openSecretSettings?.(), color: "#f472b6" }
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

  const isNoc = (cfg.style || "nocturnal") === "nocturnal";

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
    /* Windows 11 Dark Mode */
    #wt-pc.win11{
      background-image:url("/images/win11.jpg"), url("/images/win11.png"), radial-gradient(circle at 54% 48%,#1d4ed8 0%,#0b1938 42%,#040711 100%);
      color:#f3f3f3;
    }

    .pc-stage{position:relative;flex:1;min-height:0;padding:16px;display:flex;gap:16px;overflow:hidden}
    .pc-icons{display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;gap:6px;width:92px;flex:none;z-index:2}
    .pc-ico{width:80px;padding:8px 4px;border-radius:6px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;color:inherit;text-decoration:none;cursor:pointer;border:1px solid transparent;background:transparent;font:inherit;transition:background .12s,border-color .12s}
    .pc-ico:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.14)}
    .pc-ico-box{width:44px;height:44px;border-radius:10px;display:grid;place-items:center;background:rgba(24,24,28,.55);backdrop-filter:blur(10px);box-shadow:0 4px 12px #0005;overflow:hidden}
    #wt-pc.win11 .pc-ico-box{background:transparent;backdrop-filter:none;box-shadow:none}
    .pc-ico-box img{width:34px;height:34px;object-fit:contain;border-radius:7px}
    .pc-ico span.lbl{font-size:11.5px;line-height:1.2;font-weight:500;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.9)}

    /* Windows */
    .pc-win{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(24px);box-shadow:0 22px 60px rgba(0,0,0,.58);transition:opacity .18s,transform .18s}
    .pc-win.hidden-win{display:none!important}
    .pc-win.max-win{position:fixed;inset:0 0 48px 0;z-index:28;border-radius:0!important}
    #wt-pc.nocturnal .pc-win.max-win{inset:62px 12px 68px 12px;border-radius:14px!important}
    #wt-pc.win11 .pc-win{background:rgba(32,32,32,.88);border:1px solid rgba(255,255,255,.09);border-radius:8px}
    #wt-pc.nocturnal .pc-win{background:rgba(18,19,26,.8);border:2px solid #c9b8ff;border-radius:14px}
    #wt-pc.nocturnal.glass .pc-win{background:rgba(24,26,38,.52);backdrop-filter:blur(28px)}
    #wt-pc.nocturnal.daylight .pc-win{background:rgba(243,241,250,.86);border:2px solid #7c5dfa}

    .pc-titlebar{height:34px;padding:0 0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.07);flex:none;background:rgba(24,24,24,.65)}
    #wt-pc.nocturnal .pc-titlebar{height:40px;padding:0 14px;background:transparent}
    .pc-wtitle{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pc-wbtns{display:flex;align-items:stretch;flex:none;height:100%}
    .pc-wbtn{width:44px;height:100%;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;font-size:15px;text-decoration:none;transition:background .12s}
    #wt-pc.nocturnal .pc-wbtn{width:28px;height:28px;border-radius:7px;align-self:center;margin-left:4px}
    .pc-wbtn:hover{background:rgba(255,255,255,.1)}
    .pc-wbtn.close:hover{background:#c42b1c;color:#fff}

    .pc-win-body{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:20px}
    .pc-iframe-wrap{flex:1;min-height:0;background:#0e0d14;display:flex}
    .pc-iframe{width:100%;height:100%;border:0;flex:1}

    .pc-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.07);color:inherit;text-decoration:none;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .12s}
    .pc-btn:hover{background:rgba(255,255,255,.13)}
    .pc-btn.p{background:#60cdff;color:#000;border-color:transparent}
    #wt-pc.nocturnal .pc-btn.p{background:#c9b8ff;color:#12131a;border-radius:10px}

    .pc-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #22c55e33}

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

    /* Windows 11 Dark Taskbar, Start Menu & Calendar/Notifications Flyout */
    .w11-bar{height:48px;padding:0 12px;background:rgba(28,28,28,.82);backdrop-filter:blur(32px) saturate(140%);border-top:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;flex:none;z-index:30}
    .w11-center{display:flex;align-items:center;gap:4px}
    .w11-tbtn{width:40px;height:40px;border-radius:6px;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;position:relative;transition:background .12s}
    .w11-tbtn:hover,.w11-tbtn.active{background:rgba(255,255,255,.09)}
    .w11-tbtn.active::after{content:"";position:absolute;bottom:2px;width:16px;height:3px;border-radius:99px;background:#60cdff}
    .w11-tray{justify-self:end;display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:400}
    .w11-tray-btn{padding:6px 10px;border-radius:6px;border:0;background:transparent;color:inherit;display:flex;align-items:center;gap:8px;cursor:pointer;font:inherit}
    .w11-tray-btn:hover{background:rgba(255,255,255,.09)}

    .w11-start{position:fixed;bottom:58px;left:50%;transform:translateX(-50%);width:min(94vw,540px);background:rgba(32,32,32,.9);backdrop-filter:blur(40px) saturate(150%);border:1px solid rgba(255,255,255,.1);border-radius:8px;box-shadow:0 24px 64px rgba(0,0,0,.65);z-index:40;display:none;flex-direction:column;overflow:hidden}
    .w11-start.open{display:flex}
    .w11-start-in{padding:24px 26px 18px;display:flex;flex-direction:column;gap:18px}
    .w11-search{width:100%;padding:9px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.1);border-bottom:2px solid #60cdff;background:rgba(20,20,20,.85);color:#fff;font:inherit;font-size:13px;outline:0}
    .w11-sec-h{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600}
    .w11-sgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
    .w11-tile{padding:10px 4px;border-radius:6px;border:0;background:transparent;color:inherit;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;font:inherit;font-size:11.5px;text-align:center}
    .w11-tile:hover{background:rgba(255,255,255,.08)}
    .w11-rec{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .w11-rec-it{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;border:0;background:transparent;color:inherit;cursor:pointer;text-align:left;font:inherit}
    .w11-rec-it:hover{background:rgba(255,255,255,.08)}
    .w11-start-foot{background:rgba(22,22,22,.75);border-top:1px solid rgba(255,255,255,.07);padding:12px 26px;display:flex;justify-content:space-between;align-items:center;font-size:12.5px}

    /* Windows 11 Calendar + Notifications Flyout */
    .w11-fly{position:fixed;bottom:58px;right:12px;width:min(92vw,336px);display:none;flex-direction:column;gap:10px;z-index:40}
    .w11-fly.open{display:flex}
    .w11-card{background:rgba(32,32,32,.9);backdrop-filter:blur(36px);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:14px;box-shadow:0 16px 44px rgba(0,0,0,.55)}
    .w11-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;font-size:11.5px;margin-top:8px}
    .w11-cal-d{height:30px;display:grid;place-items:center;border-radius:50%}
    .w11-cal-d.today{background:#60cdff;color:#000;font-weight:700}

    /* Desktop Wallpaper & OS Settings Modal */
    #pcSetDlg{border:0;border-radius:12px;padding:22px;width:min(92vw,460px);background:#202020;color:#f3f3f3;margin:auto;box-shadow:0 24px 64px rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.1);font-family:inherit;z-index:9999}
    #pcSetDlg::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(5px)}
    .pcs-sec{margin-top:14px;display:flex;flex-direction:column;gap:8px}
    .pcs-lbl{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#60cdff}
    .pcs-seg{display:flex;gap:6px;background:rgba(255,255,255,.06);padding:4px;border-radius:8px}
    .pcs-seg button{flex:1;border:0;background:transparent;color:#cbd5e1;font:inherit;font-size:12px;font-weight:600;padding:8px;border-radius:6px;cursor:pointer}
    .pcs-seg button.on{background:#60cdff;color:#000}
    .pcs-in{width:100%;padding:9px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font:inherit;font-size:12.5px;outline:0}

    @media(max-width:900px){
      .noc-widgets,.pc-icons{display:none}
      .w11-sgrid{grid-template-columns:repeat(3,1fr)}
      .w11-rec{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(st);

  const root = document.createElement("div");
  root.id = "wt-pc";
  root.className = isNoc
    ? "nocturnal" + (cfg.light ? " daylight" : "") + (cfg.glass !== false ? " glass" : "")
    : "win11";

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

  function iconMedia(a, sz = 32) {
    return a.logo
      ? `<img src="${a.logo}" alt="${a.name}" style="width:${sz}px;height:${sz}px;object-fit:contain;border-radius:7px">`
      : `<span class="ms fill" style="font-size:${Math.round(sz * 0.85)}px;color:${a.color}">${a.icon}</span>`;
  }

  const iconsHtml = APPS.map(a =>
    `<button type="button" class="pc-ico" data-app="${a.id}"><div class="pc-ico-box">${iconMedia(a, 34)}</div><span class="lbl">${a.name}</span></button>`
  ).join("");

  const appWinHtml = `
    <div class="pc-win hidden-win" id="pcAppWin">
      <div class="pc-titlebar">
        <div class="pc-wtitle">
          <img src="/images/logo.png" alt="" width="16" height="16" style="border-radius:4px">
          <span id="pcAppTitle">Web Tok</span>
        </div>
        <div class="pc-wbtns">
          <button type="button" class="pc-wbtn" id="pcAppReload" title="Reload"><span class="ms" style="font-size:15px">refresh</span></button>
          <a class="pc-wbtn" id="pcAppPop" href="/scroll#fyp" title="Open full page"><span class="ms" style="font-size:15px">open_in_new</span></a>
          <button type="button" class="pc-wbtn" id="pcAppMin" title="Minimize"><span class="ms" style="font-size:15px">remove</span></button>
          <button type="button" class="pc-wbtn" id="pcAppMax" title="Maximize"><span class="ms" style="font-size:15px">crop_square</span></button>
          <button type="button" class="pc-wbtn close" id="pcAppClose" title="Close"><span class="ms" style="font-size:15px">close</span></button>
        </div>
      </div>
      <div class="pc-iframe-wrap">
        <iframe class="pc-iframe" id="pcAppFrame" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe>
      </div>
    </div>`;

  function buildCalGrid() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const hdr = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => `<div style="opacity:.6;font-weight:600">${d}</div>`).join("");
    let cells = "";
    for (let i = 0; i < first; i++) cells += `<div></div>`;
    for (let d = 1; d <= days; d++) cells += `<div class="w11-cal-d ${d === today ? "today" : ""}">${d}</div>`;
    return hdr + cells;
  }

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
        ${appWinHtml}
        <aside class="noc-widgets" style="margin-left:auto">
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
          <button type="button" data-app="wp_settings" title="Wallpaper & OS Settings" style="color:#c084fc"><span class="ms fill">wallpaper</span></button>
          <button type="button" id="nocDockSec" title="Secret Settings" style="color:#fb7185"><span class="ms fill">tune</span></button>
        </nav>
      </div>`;
  } else {
    root.innerHTML = `
      <div class="pc-stage">
        <div class="pc-icons">${iconsHtml}</div>
        ${appWinHtml}
      </div>

      <div class="w11-start" id="w11Start">
        <div class="w11-start-in">
          <input type="text" class="w11-search" id="w11Search" placeholder="Type here to search">
          <div class="w11-sec-h"><span>Pinned</span><button type="button" class="pc-btn" id="w11SwitchNoc" style="padding:4px 10px;font-size:11px">Nocturnal Shell</button></div>
          <div class="w11-sgrid">
            ${APPS.map(a => `<button type="button" class="w11-tile" data-app="${a.id}">${iconMedia(a, 30)}<span>${a.name}</span></button>`).join("")}
          </div>
          <div class="w11-sec-h"><span>Recommended</span><span style="font-size:11px;opacity:.65" id="w11StatsTxt">Web Tok</span></div>
          <div class="w11-rec">
            <button type="button" class="w11-rec-it" data-app="webtok">
              <img src="/images/logo.png" alt="" width="28" height="28" style="border-radius:6px">
              <div><b style="display:block;font-size:12px">Web Tok</b><small style="opacity:.65;font-size:11px">For You Feed</small></div>
            </button>
            <button type="button" class="w11-rec-it" data-app="wp_settings">
              <span class="ms fill" style="font-size:26px;color:#60cdff">wallpaper</span>
              <div><b style="display:block;font-size:12px">Wallpaper &amp; OS</b><small style="opacity:.65;font-size:11px">Personalize desktop</small></div>
            </button>
          </div>
        </div>
        <div class="w11-start-foot">
          <span style="display:flex;align-items:center;gap:8px"><span class="ms fill" style="font-size:22px;color:#60cdff">account_circle</span><span id="w11UserLbl">Web Tok User</span></span>
          <button type="button" class="pc-wbtn" id="w11PowerBtn" title="Exit Computer Mode" style="width:32px;height:32px;border-radius:6px"><span class="ms" style="font-size:18px">power_settings_new</span></button>
        </div>
      </div>

      <div class="w11-fly" id="w11Fly">
        <div class="w11-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b style="font-size:12.5px">Notifications</b>
            <span style="font-size:11px;opacity:.65" id="w11FlyStats">Online</span>
          </div>
          <div style="font-size:12px;opacity:.8">Web Tok is running in Windows 11 Dark Mode. Click the Web Tok icon to launch the feed.</div>
        </div>
        <div class="w11-card">
          <div style="font-size:12.5px;font-weight:600" id="w11CalHead">${new Date().toLocaleDateString([], { month: "long", year: "numeric" })}</div>
          <div class="w11-cal-grid">${buildCalGrid()}</div>
        </div>
      </div>

      <footer class="w11-bar">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;opacity:.85">
          <span class="pc-dot"></span><span id="w11OnlineBar">Web Tok</span>
        </div>
        <div class="w11-center">
          <button type="button" class="w11-tbtn" id="w11StartBtn" title="Start">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#60cdff"><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>
          </button>
          <button type="button" class="w11-tbtn" id="w11SearchBtn" title="Search"><span class="ms" style="font-size:20px">search</span></button>
          <button type="button" class="w11-tbtn" id="w11WebTokTask" data-app="webtok" title="Web Tok"><img src="/images/logo.png" alt="Web Tok" width="24" height="24" style="border-radius:5px"></button>
          <button type="button" class="w11-tbtn" data-app="wp_settings" title="Settings"><span class="ms" style="font-size:20px;color:#cbd5e1">settings</span></button>
          <button type="button" class="w11-tbtn" id="pcOpenSec" title="Secret Settings"><span class="ms" style="font-size:20px;color:#f472b6">tune</span></button>
        </div>
        <div class="w11-tray">
          <div style="display:flex;align-items:center;gap:6px;padding:0 6px;opacity:.9">
            <span class="ms" style="font-size:16px">wifi</span>
            <span class="ms" style="font-size:16px">volume_up</span>
            <span class="ms" style="font-size:16px">battery_full</span>
          </div>
          <button type="button" class="w11-tray-btn" id="w11TrayClock" title="Calendar &amp; Notifications">
            <span id="pcClock" style="text-align:right;line-height:1.2">--:--</span>
          </button>
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
          <b style="font-size:16px;display:flex;align-items:center;gap:8px"><span class="ms fill" style="color:#60cdff">wallpaper</span>Desktop &amp; Wallpaper Settings</b>
          <button type="button" class="pc-wbtn" id="pcsClose" style="width:32px;height:32px;border-radius:6px"><span class="ms">close</span></button>
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
            <button type="button" class="pc-btn p" id="pcsCustSave">Apply</button>
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
          <button type="button" class="pc-btn" id="pcsExitBtn" style="color:#f472b6">Exit Computer Mode</button>
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

  const appWin = root.querySelector("#pcAppWin");
  const appFrame = root.querySelector("#pcAppFrame");
  const w11Start = root.querySelector("#w11Start");
  const w11Fly = root.querySelector("#w11Fly");
  const w11WebTokTask = root.querySelector("#w11WebTokTask");

  function openInWindow(app) {
    if (!app) return;
    if (app.action) { app.action(); return; }
    w11Start?.classList.remove("open");
    w11Fly?.classList.remove("open");
    curAppHref = app.href;
    root.querySelector("#pcAppTitle").textContent = app.name;
    const pop = root.querySelector("#pcAppPop");
    if (pop) pop.href = app.href;
    if (appFrame && appFrame.getAttribute("src") !== app.href) appFrame.src = app.href;
    appWin?.classList.remove("hidden-win");
    w11WebTokTask?.classList.add("active");
  }

  root.querySelectorAll("[data-app]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.app;
      if (id === "webtok" && curAppHref && appWin?.classList.contains("hidden-win") && el.id === "w11WebTokTask") {
        appWin.classList.remove("hidden-win");
        return;
      }
      openInWindow(APPS.find(a => a.id === id));
    });
  });

  root.querySelectorAll("#pcOpenSec, #nocDockSec").forEach(el => {
    el.onclick = () => window.openSecretSettings?.();
  });

  root.querySelector("#pcAppReload")?.addEventListener("click", () => { if (appFrame && curAppHref) appFrame.src = curAppHref; });
  root.querySelector("#pcAppMax")?.addEventListener("click", () => appWin?.classList.toggle("max-win"));
  root.querySelector("#pcAppMin")?.addEventListener("click", () => appWin?.classList.add("hidden-win"));
  root.querySelector("#pcAppClose")?.addEventListener("click", () => {
    if (appFrame) appFrame.src = "about:blank";
    curAppHref = "";
    appWin?.classList.add("hidden-win");
    appWin?.classList.remove("max-win");
    w11WebTokTask?.classList.remove("active");
  });

  root.querySelector("#w11StartBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    w11Fly?.classList.remove("open");
    w11Start?.classList.toggle("open");
  });
  root.querySelector("#w11SearchBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    w11Fly?.classList.remove("open");
    w11Start?.classList.add("open");
    root.querySelector("#w11Search")?.focus();
  });
  root.querySelector("#w11TrayClock")?.addEventListener("click", e => {
    e.stopPropagation();
    w11Start?.classList.remove("open");
    w11Fly?.classList.toggle("open");
  });
  document.addEventListener("click", e => {
    if (w11Start && !w11Start.contains(e.target) && !e.target.closest("#w11StartBtn,#w11SearchBtn")) w11Start.classList.remove("open");
    if (w11Fly && !w11Fly.contains(e.target) && !e.target.closest("#w11TrayClock")) w11Fly.classList.remove("open");
  });
  root.querySelector("#w11SwitchNoc")?.addEventListener("click", () => {
    cfg.style = "nocturnal"; saveCfg(cfg); location.reload();
  });
  root.querySelector("#w11PowerBtn")?.addEventListener("click", () => {
    cfg.enabled = false; saveCfg(cfg); location.href = "/";
  });

  root.querySelector("#nocWs")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    activeWs = Number(b.dataset.ws || 1);
    root.querySelectorAll("#nocWs button").forEach(x => x.classList.toggle("on", Number(x.dataset.ws) === activeWs));
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
    const dateStr = now.toLocaleDateString([], { month: "numeric", day: "numeric", year: "numeric" });
    const shortDate = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const clk = root.querySelector("#pcClock");
    if (clk) clk.innerHTML = isNoc ? `${shortDate} · ${timeStr}` : `${timeStr}<br><span style="opacity:.85;font-size:11px">${dateStr}</span>`;
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
        const on = Number(j.data.onlineUsers || 0).toLocaleString();
        const tot = Number(j.data.totalUsers || 0).toLocaleString();
        const wb = root.querySelector("#w11OnlineBar");
        const fs = root.querySelector("#w11FlyStats");
        const stTxt = root.querySelector("#w11StatsTxt");
        if (wb) wb.textContent = `${on} online`;
        if (fs) fs.textContent = `${on} online · ${tot} users`;
        if (stTxt) stTxt.textContent = `${on} online`;
      }
    } catch {}
    try {
      if (window.sb?.auth?.getSession) {
        const { data } = await sb.auth.getSession();
        if (data?.session?.user?.id) {
          const { data: prof } = await sb.from("profiles").select("username,display_name,theme").eq("id", data.session.user.id).maybeSingle();
          const ul = root.querySelector("#w11UserLbl");
          if (ul && (prof?.display_name || prof?.username)) ul.textContent = prof.display_name || `@${prof.username}`;
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
