/* PC Look Mode (Windows 11 Dark Mode & Nocturnal Shell Hyprland + Quickshell) on /computer with Fake Browser (Firefox / Edge / Chrome), OS-native Settings & Admin Panel */
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
        fakeBrowser: false,
        winBrowser: "edge",
        ...JSON.parse(localStorage.getItem("wt_pc_look") || "{}")
      };
    } catch {
      return { enabled: false, style: "nocturnal", light: false, glass: true, wpMode: "default", customWp: "", fakeBrowser: false, winBrowser: "edge" };
    }
  }
  function saveCfg(next) {
    localStorage.setItem("wt_pc_look", JSON.stringify(next));
  }
  function getSb() {
    if (typeof sb !== "undefined" && sb) return sb;
    if (window.sb) return window.sb;
    if (window.supabase && window.WT_CONFIG?.SUPABASE_URL) {
      try { return window.supabase.createClient(window.WT_CONFIG.SUPABASE_URL, window.WT_CONFIG.SUPABASE_ANON_KEY); } catch {}
    }
    return null;
  }
  function goToLogin() {
    try {
      const last = Number(sessionStorage.getItem("wt_pc_login_ts") || "0");
      if (Date.now() - last < 5000) return false;
      sessionStorage.setItem("wt_pc_login_ts", String(Date.now()));
    } catch {}
    location.replace("/login?next=" + encodeURIComponent("/computer"));
    return true;
  }

  let cfg = loadCfg();
  if (page === "landing") {
    if (cfg.enabled) location.replace("/computer");
    return;
  }
  if (page !== "computer") return;

  const BUILTIN_APPS = [
    { id: "webtok", name: "Web Tok", sub: "For You & Feed", logo: "/images/logo.png", href: "/scroll#fyp", color: "#60cdff" },
    { id: "wp_settings", name: "Settings", sub: "Home, Wallpaper & Apps", icon: "settings", action: () => openDesktopSettings("home"), color: "#60cdff" }
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
  let customApps = [];
  let authToken = null;
  let isAdminUser = false;
  let userDisplayName = "Web Tok User";
  let userHandle = "user";
  let activeSettingsTab = "home";
  let editingAppId = null;

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
    #wt-pc.win11{
      background-image:url("/images/win11.jpg"), url("/images/win11.png"), radial-gradient(circle at 54% 48%,#1d4ed8 0%,#0b1938 42%,#040711 100%);
      color:#f3f3f3;
    }

    .pc-stage{position:relative;flex:1;min-height:0;padding:16px;display:flex;gap:16px;overflow:hidden}
    .pc-icons{display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;gap:6px;max-height:100%;z-index:2}
    .pc-ico{width:80px;padding:8px 4px;border-radius:6px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;color:inherit;text-decoration:none;cursor:pointer;border:1px solid transparent;background:transparent;font:inherit;transition:background .12s,border-color .12s}
    .pc-ico:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.14)}
    .pc-ico-box{width:44px;height:44px;border-radius:10px;display:grid;place-items:center;background:rgba(24,24,28,.55);backdrop-filter:blur(10px);box-shadow:0 4px 12px #0005;overflow:hidden}
    #wt-pc.win11 .pc-ico-box{background:transparent;backdrop-filter:none;box-shadow:none}
    .pc-ico-box img{width:34px;height:34px;object-fit:contain;border-radius:7px}
    .pc-ico span.lbl{font-size:11.5px;line-height:1.2;font-weight:500;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.9);max-width:74px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    /* Windows */
    .pc-win{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(24px);box-shadow:0 22px 60px rgba(0,0,0,.58);transition:opacity .18s,transform .18s}
    .pc-win.hidden-win{display:none!important}
    .pc-win.max-win{position:fixed;inset:0 0 48px 0;z-index:28;border-radius:0!important}
    #wt-pc.nocturnal .pc-win.max-win{inset:62px 12px 68px 12px;border-radius:14px!important}
    #wt-pc.win11 .pc-win{background:rgba(32,32,32,.92);border:1px solid rgba(255,255,255,.09);border-radius:8px}
    #wt-pc.nocturnal .pc-win{background:rgba(16,18,28,.56);border:1.5px solid rgba(165,243,252,.35);border-radius:16px}
    #wt-pc.nocturnal.daylight .pc-win{background:rgba(243,241,250,.84);border:1.5px solid #7c5dfa}

    .pc-titlebar{height:34px;padding:0 0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.07);flex:none;background:rgba(24,24,24,.65)}
    #wt-pc.nocturnal .pc-titlebar{height:40px;padding:0 14px;background:transparent;border-bottom-color:rgba(255,255,255,.08)}
    .pc-wtitle{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pc-wbtns{display:flex;align-items:stretch;flex:none;height:100%}
    .pc-wbtn{width:44px;height:100%;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;font-size:15px;text-decoration:none;transition:background .12s}
    #wt-pc.nocturnal .pc-wbtn{width:28px;height:28px;border-radius:7px;align-self:center;margin-left:4px}
    .pc-wbtn:hover{background:rgba(255,255,255,.1)}
    .pc-wbtn.close:hover{background:#c42b1c;color:#fff}

    /* Fake Browser Chrome (Firefox / Edge / Chrome) */
    .pc-br-head{display:none;flex-direction:column;flex:none;color:#f3f4f6}
    .pc-win.is-browser .pc-titlebar{display:none}
    .pc-win.is-browser .pc-br-head{display:flex}

    .pc-br-tabs{height:38px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 0 0 8px;gap:8px}
    .pc-br-tabrow{display:flex;align-items:flex-end;gap:4px;min-width:0;flex:1;height:100%;padding-top:6px}
    .pc-br-tab{height:32px;max-width:240px;min-width:120px;padding:0 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:500;cursor:pointer;position:relative}
    .pc-br-tab span.t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pc-br-plus{width:28px;height:28px;margin-bottom:2px;border-radius:50%;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;opacity:.8}
    .pc-br-plus:hover{background:rgba(255,255,255,.12);opacity:1}

    .pc-br-nav{height:40px;padding:0 10px;display:flex;align-items:center;gap:6px}
    .pc-br-nbtn{width:28px;height:28px;border-radius:50%;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;opacity:.85;text-decoration:none}
    .pc-br-nbtn:hover{background:rgba(255,255,255,.11);opacity:1}
    .pc-br-omnibox{flex:1;min-width:0;height:28px;border-radius:999px;display:flex;align-items:center;gap:8px;padding:0 12px}
    .pc-br-omnibox input{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:inherit;font-size:12.5px;outline:0}

    .pc-br-bms{height:30px;padding:0 10px;display:flex;align-items:center;gap:4px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.08)}
    .pc-br-bm{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;border:0;background:transparent;color:inherit;font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;flex:none;opacity:.88}
    .pc-br-bm:hover,.pc-br-bm.active{background:rgba(255,255,255,.12);opacity:1}
    .pc-br-bm img{width:14px;height:14px;object-fit:contain;border-radius:3px}

    /* Firefox (Nocturnal Shell) */
    .pc-win.br-firefox .pc-br-head{background:#1c1b22}
    .pc-win.br-firefox .pc-br-tab{background:#42414d;border-radius:6px 6px 0 0;border-top:2px solid #7dd3fc}
    .pc-win.br-firefox .pc-br-nav{background:#2b2a33}
    .pc-win.br-firefox .pc-br-omnibox{background:#1c1b22;border-radius:6px;border:1px solid rgba(255,255,255,.1)}
    .pc-win.br-firefox .pc-br-bms{background:#2b2a33}

    /* Microsoft Edge (Windows 11 Dark) */
    .pc-win.br-edge .pc-br-head{background:#1f1f1f}
    .pc-win.br-edge .pc-br-tab{background:#333333;border-radius:8px 8px 0 0;border-top:2px solid #60cdff}
    .pc-win.br-edge .pc-br-nav{background:#333333}
    .pc-win.br-edge .pc-br-omnibox{background:#242424;border:1px solid rgba(255,255,255,.12)}
    .pc-win.br-edge .pc-br-bms{background:#2c2c2c}

    /* Google Chrome (Windows 11 Dark) */
    .pc-win.br-chrome .pc-br-head{background:#202124}
    .pc-win.br-chrome .pc-br-tab{background:#35363a;border-radius:10px 10px 0 0}
    .pc-win.br-chrome .pc-br-nav{background:#35363a}
    .pc-win.br-chrome .pc-br-omnibox{background:#202124;border:1px solid rgba(255,255,255,.08)}
    .pc-win.br-chrome .pc-br-bms{background:#35363a}

    .pc-iframe-wrap{flex:1;min-height:0;background:#0e0d14;display:flex}
    .pc-iframe{width:100%;height:100%;border:0;flex:1}

    .pc-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.07);color:inherit;text-decoration:none;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .12s}
    .pc-btn:hover{background:rgba(255,255,255,.13)}
    .pc-btn.p{background:#60cdff;color:#000;border-color:transparent}
    .pc-btn:disabled{opacity:.5;cursor:default}
    #wt-pc.nocturnal .pc-btn.p{background:#7dd3fc;color:#0f172a;border-radius:10px}

    .pc-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #22c55e33}

    /* Shared Settings Inputs & Lists */
    .pcs-lbl{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#60cdff}
    #wt-pc.nocturnal .pcs-lbl{color:#7dd3fc}
    .pcs-seg{display:flex;gap:6px;background:rgba(255,255,255,.06);padding:4px;border-radius:8px}
    .pcs-seg button{flex:1;border:0;background:transparent;color:inherit;opacity:.75;font:inherit;font-size:12px;font-weight:600;padding:8px;border-radius:6px;cursor:pointer}
    .pcs-seg button.on{background:#60cdff;color:#000;opacity:1}
    #wt-pc.nocturnal .pcs-seg button.on{background:#7dd3fc;color:#0f172a}
    .pcs-in{width:100%;padding:9px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);color:inherit;font:inherit;font-size:12.5px;outline:0}
    .pca-list{display:flex;flex-direction:column;gap:8px}
    .pca-row{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:12.5px}
    .pca-row-top{display:flex;align-items:center;justify-content:space-between;gap:10px}

    /* Windows 11 Dark Mode Settings Layout */
    .w11s-wrap{flex:1;min-height:0;display:flex;overflow:hidden}
    .w11s-side{width:236px;flex:none;padding:14px 12px;display:flex;flex-direction:column;gap:10px;border-right:1px solid rgba(255,255,255,.06);background:rgba(24,24,24,.45)}
    .w11s-user{display:flex;align-items:center;gap:10px;padding:6px 8px}
    .w11s-av{width:38px;height:38px;border-radius:50%;background:#60cdff22;color:#60cdff;display:grid;place-items:center;flex:none}
    .w11s-nav{display:flex;flex-direction:column;gap:3px}
    .w11s-nb{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;position:relative}
    .w11s-nb:hover{background:rgba(255,255,255,.06)}
    .w11s-nb.on{background:rgba(255,255,255,.09);font-weight:600}
    .w11s-nb.on::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:99px;background:#60cdff}
    .w11s-main{flex:1;min-width:0;overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:18px}
    .w11s-dev{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:6px}
    .w11s-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .w11s-card{background:rgba(44,44,44,.72);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:10px}
    .w11s-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:6px;border:0;background:rgba(255,255,255,.04);color:inherit;font:inherit;font-size:12.5px;cursor:pointer;text-align:left}
    .w11s-row:hover{background:rgba(255,255,255,.09)}
    .w11s-wpthumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .w11s-wpth{height:56px;border-radius:6px;border:2px solid rgba(255,255,255,.12);background-size:cover;background-position:center;cursor:pointer;display:flex;align-items:flex-end;padding:4px 6px;font-size:10.5px;font-weight:600;color:#fff;text-shadow:0 1px 3px #000}
    .w11s-wpth.on{border-color:#60cdff}

    /* Nocturnal Shell Settings Layout */
    .nocs-wrap{flex:1;min-height:0;display:flex;overflow:hidden}
    .nocs-rail{width:64px;flex:none;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:10px;border-right:1px solid rgba(255,255,255,.1);background:rgba(14,16,24,.38)}
    .nocs-rb{width:42px;height:42px;border-radius:12px;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;transition:background .15s,color .15s}
    .nocs-rb:hover{background:rgba(255,255,255,.1)}
    .nocs-rb.on{background:#a5f3fc;color:#0f172a}
    .nocs-main{flex:1;min-width:0;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:14px}
    .nocs-hero{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:18px 20px;display:flex;align-items:center;gap:18px}
    .nocs-moon{width:76px;height:76px;border-radius:50%;border:2px solid #67e8f9;display:grid;place-items:center;color:#67e8f9;box-shadow:0 0 24px rgba(103,232,249,.22);flex:none}
    .nocs-bento{display:grid;grid-template-columns:1fr 1.2fr;gap:14px}
    .nocs-col{display:flex;flex-direction:column;gap:12px}
    .nocs-box{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);border-radius:14px;padding:16px}
    .nocs-tgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .nocs-tile{padding:14px 10px;border-radius:14px;border:1.5px solid rgba(103,232,249,.55);background:rgba(255,255,255,.04);color:inherit;font:inherit;font-size:12px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;transition:background .15s}
    .nocs-tile:hover{background:rgba(103,232,249,.14)}
    .nocs-tile.on{background:rgba(103,232,249,.18);border-color:#67e8f9}

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
    .noc-dock{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:18px;background:rgba(18,19,26,.78);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.15);max-width:95vw;overflow-x:auto}
    #wt-pc.nocturnal.daylight .noc-dock{background:rgba(243,241,250,.86);border-color:rgba(0,0,0,.12)}
    .noc-dock button{width:42px;height:42px;flex:none;border-radius:12px;border:0;background:rgba(255,255,255,.08);color:inherit;display:grid;place-items:center;cursor:pointer;transition:transform .15s,background .15s}
    .noc-dock button:hover{transform:translateY(-3px) scale(1.06);background:rgba(201,184,255,.28)}
    .noc-dock button img{width:26px;height:26px;object-fit:contain;border-radius:6px}

    /* Windows 11 Dark Taskbar, Start Menu & Calendar/Notifications Flyout */
    .w11-bar{height:48px;padding:0 12px;background:rgba(28,28,28,.82);backdrop-filter:blur(32px) saturate(140%);border-top:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;flex:none;z-index:30}
    .w11-center{display:flex;align-items:center;gap:4px;overflow-x:auto}
    .w11-tbtn{width:40px;height:40px;flex:none;border-radius:6px;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;position:relative;transition:background .12s}
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

    .w11-fly{position:fixed;bottom:58px;right:12px;width:min(92vw,336px);display:none;flex-direction:column;gap:10px;z-index:40}
    .w11-fly.open{display:flex}
    .w11-card{background:rgba(32,32,32,.9);backdrop-filter:blur(36px);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:14px;box-shadow:0 16px 44px rgba(0,0,0,.55)}
    .w11-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;font-size:11.5px;margin-top:8px}
    .w11-cal-d{height:30px;display:grid;place-items:center;border-radius:50%}
    .w11-cal-d.today{background:#60cdff;color:#000;font-weight:700}

    @media(max-width:900px){
      .noc-widgets,.pc-icons{display:none}
      .w11-sgrid{grid-template-columns:repeat(3,1fr)}
      .w11-rec,.w11s-grid,.nocs-bento{grid-template-columns:1fr}
      .w11s-wrap,.nocs-wrap{flex-direction:column}
      .w11s-side,.nocs-rail{width:100%;flex-direction:row;border-right:0;border-bottom:1px solid rgba(255,255,255,.08);overflow-x:auto}
      .w11s-nav{flex-direction:row}
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

  function allApps() {
    const customMapped = customApps.map(a => ({
      id: "c_" + a.id,
      dbId: a.id,
      name: a.name,
      sub: a.url,
      logo: a.logo_url || "",
      href: a.url,
      color: "#60cdff",
      isCustom: true
    }));
    const list = [BUILTIN_APPS[0], ...customMapped];
    if (isAdminUser) {
      list.push({ id: "admin_panel", name: "Admin Panel", sub: "Moderation & Users", icon: "admin_panel_settings", href: "/admin", color: "#fbbf24" });
    }
    list.push(BUILTIN_APPS[1]);
    return list;
  }

  function iconMedia(a, sz = 32) {
    return a.logo
      ? `<img src="${a.logo}" alt="${a.name}" style="width:${sz}px;height:${sz}px;object-fit:contain;border-radius:7px" onerror="this.src='/images/logo.png'">`
      : `<span class="ms fill" style="font-size:${Math.round(sz * 0.85)}px;color:${a.color}">${a.icon || "language"}</span>`;
  }

  const appWinHtml = `
    <div class="pc-win hidden-win" id="pcAppWin">
      <div class="pc-titlebar">
        <div class="pc-wtitle">
          <img id="pcAppWinLogo" src="/images/logo.png" alt="" width="16" height="16" style="border-radius:4px">
          <span id="pcAppTitle">Web Tok</span>
        </div>
        <div class="pc-wbtns">
          <button type="button" class="pc-wbtn" id="pcAppReload" title="Reload"><span class="ms" style="font-size:15px">refresh</span></button>
          <a class="pc-wbtn" id="pcAppPop" href="/scroll#fyp" target="_blank" title="Open full page"><span class="ms" style="font-size:15px">open_in_new</span></a>
          <button type="button" class="pc-wbtn" id="pcAppMin" title="Minimize"><span class="ms" style="font-size:15px">remove</span></button>
          <button type="button" class="pc-wbtn" id="pcAppMax" title="Maximize"><span class="ms" style="font-size:15px">crop_square</span></button>
          <button type="button" class="pc-wbtn close" id="pcAppClose" title="Close"><span class="ms" style="font-size:15px">close</span></button>
        </div>
      </div>

      <div class="pc-br-head">
        <div class="pc-br-tabs">
          <div class="pc-br-tabrow">
            <div class="pc-br-tab">
              <img id="pcBrTabLogo" src="/images/logo.png" alt="" width="15" height="15" style="border-radius:3px">
              <span class="t" id="pcBrTabTitle">Web Tok</span>
              <span class="ms" id="pcBrTabClose" style="font-size:14px;opacity:.7">close</span>
            </div>
            <button type="button" class="pc-br-plus" id="pcBrNewTab" title="Web Tok Home"><span class="ms" style="font-size:16px">add</span></button>
          </div>
          <div class="pc-wbtns">
            <button type="button" class="pc-wbtn" id="pcBrMin" title="Minimize"><span class="ms" style="font-size:15px">remove</span></button>
            <button type="button" class="pc-wbtn" id="pcBrMax" title="Maximize"><span class="ms" style="font-size:15px">crop_square</span></button>
            <button type="button" class="pc-wbtn close" id="pcBrClose" title="Close"><span class="ms" style="font-size:15px">close</span></button>
          </div>
        </div>
        <div class="pc-br-nav">
          <button type="button" class="pc-br-nbtn" id="pcBrBack" title="Back"><span class="ms" style="font-size:17px">arrow_back</span></button>
          <button type="button" class="pc-br-nbtn" id="pcBrFwd" title="Forward"><span class="ms" style="font-size:17px">arrow_forward</span></button>
          <button type="button" class="pc-br-nbtn" id="pcBrReload" title="Reload"><span class="ms" style="font-size:17px">refresh</span></button>
          <div class="pc-br-omnibox">
            <span class="ms" id="pcBrLock" style="font-size:15px;opacity:.75">lock</span>
            <input type="text" id="pcBrUrl" spellcheck="false" aria-label="Address bar">
          </div>
          <a class="pc-br-nbtn" id="pcBrPop" href="/scroll#fyp" target="_blank" title="Open in real tab"><span class="ms" style="font-size:17px">open_in_new</span></a>
        </div>
        <div class="pc-br-bms" id="pcBrBookmarks"></div>
      </div>

      <div class="pc-iframe-wrap">
        <iframe class="pc-iframe" id="pcAppFrame" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe>
      </div>
    </div>`;

  const wpFormHtml = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="pcs-lbl">Wallpaper Source</div>
      <div class="pcs-seg" id="pcsWpSeg">
        <button type="button" data-wp="default">OS Default</button>
        <button type="button" data-wp="profile">Use Profile Wallpaper</button>
        <button type="button" data-wp="custom">Custom URL</button>
      </div>
      <div id="pcsProfNote" style="font-size:12px;opacity:.75"></div>
      <div id="pcsCustRow" style="display:none;gap:8px;align-items:center">
        <input type="text" class="pcs-in" id="pcsCustIn" placeholder="Paste image URL (https://…)">
        <button type="button" class="pc-btn p" id="pcsCustSave">Apply</button>
      </div>
    </div>`;

  const fakeBrowserCardHtml = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="pcs-lbl">Fake Browser</div>
      <div style="font-size:12px;opacity:.78">Run apps inside a realistic browser frame (${isNoc ? "Firefox on Nocturnal Shell" : "Microsoft Edge or Google Chrome on Windows 11"}) with all your apps pinned as bookmarks.</div>
      <div class="pcs-seg" id="pcsFbSeg">
        <button type="button" data-fb="off">Off (Window)</button>
        <button type="button" data-fb="on">On (${isNoc ? "Firefox" : "Browser"})</button>
      </div>
      ${isNoc ? "" : `
        <div id="pcsWinBrWrap" style="display:flex;flex-direction:column;gap:6px">
          <div class="pcs-lbl">Windows 11 Browser Style</div>
          <div class="pcs-seg" id="pcsWbSeg">
            <button type="button" data-wb="edge">Microsoft Edge</button>
            <button type="button" data-wb="chrome">Google Chrome</button>
          </div>
        </div>`}
    </div>`;

  const appsFormHtml = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="pcs-lbl">Add New App</div>
      <input type="text" class="pcs-in" id="pcaName" maxlength="40" placeholder="App name (e.g. Wikipedia)">
      <input type="text" class="pcs-in" id="pcaUrl" placeholder="Website URL (https://example.com)">
      <input type="text" class="pcs-in" id="pcaLogo" placeholder="Logo URL (optional — auto-fetched if blank)">
      <div id="pcaHint" style="font-size:12px;min-height:18px;color:#cbd5e1"></div>
      <button type="button" class="pc-btn p" id="pcaAddBtn" style="align-self:flex-start"><span class="ms" style="font-size:17px">add</span>Add App</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
      <div class="pcs-lbl">Saved Apps</div>
      <div class="pca-list" id="pcaList"></div>
    </div>`;

  const settingsWinHtml = isNoc ? `
    <div class="pc-win hidden-win" id="pcSettingsWin">
      <div class="pc-titlebar">
        <div class="pc-wtitle"><span class="ms fill" style="font-size:17px;color:#67e8f9">settings</span><span id="nocSetTitle">Home</span></div>
        <div class="pc-wbtns">
          <button type="button" class="pc-wbtn" id="pcSetMin" title="Minimize"><span class="ms" style="font-size:15px">remove</span></button>
          <button type="button" class="pc-wbtn" id="pcSetMax" title="Maximize"><span class="ms" style="font-size:15px">crop_square</span></button>
          <button type="button" class="pc-wbtn close" id="pcSetClose" title="Close"><span class="ms" style="font-size:15px">close</span></button>
        </div>
      </div>
      <div class="nocs-wrap">
        <nav class="nocs-rail">
          <button type="button" class="nocs-rb on" data-stab="home" title="Home"><span class="ms fill">home</span></button>
          <button type="button" class="nocs-rb" data-stab="wp" title="Wallpaper &amp; Theme"><span class="ms fill">palette</span></button>
          <button type="button" class="nocs-rb" data-stab="apps" title="Apps"><span class="ms fill">apps</span></button>
          <button type="button" class="nocs-rb" data-stab="system" title="System &amp; Browser"><span class="ms fill">tune</span></button>
        </nav>
        <div class="nocs-main" id="pcsPaneHome">
          <div class="nocs-hero">
            <div class="nocs-moon"><span class="ms fill" style="font-size:38px">dark_mode</span></div>
            <div>
              <div style="font-size:20px;font-weight:700;letter-spacing:.4px" id="nocSetUser">@USER</div>
              <div style="font-size:12.5px;color:#67e8f9;margin-top:2px">Nocturnal Shell v1.2.9 (Nebula)</div>
              <div style="font-size:12px;opacity:.7;margin-top:4px">Web Tok Computer Mode · Online</div>
            </div>
          </div>
          <div class="nocs-bento">
            <div class="nocs-col">
              <div class="nocs-box" style="display:flex;align-items:center;gap:12px">
                <img src="/images/logo.png" alt="" width="40" height="40" style="border-radius:10px">
                <div><b style="display:block;font-size:13.5px">Web Tok Desktop</b><small style="opacity:.7" id="nocSetAppCount">0 custom apps pinned</small></div>
              </div>
              <div class="nocs-box" style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
                <div style="font-size:34px;font-weight:700" id="nocSetClock">--:--</div>
                <div style="text-align:right;font-size:12px"><div style="color:#67e8f9;font-weight:700" id="nocSetDay">Day</div><div style="opacity:.75" id="nocSetDate">Date</div></div>
              </div>
            </div>
            <div class="nocs-tgrid">
              <button type="button" class="nocs-tile ${cfg.light ? "" : "on"}" id="nocSetDayTog"><span class="ms">dark_mode</span><span>${cfg.light ? "Daylight" : "Nocturnal"}</span></button>
              <button type="button" class="nocs-tile ${cfg.glass !== false ? "on" : ""}" id="nocSetGlassTog"><span class="ms">water_drop</span><span>Liquid Glass</span></button>
              <button type="button" class="nocs-tile ${cfg.fakeBrowser ? "on" : ""}" id="nocSetFbTog"><span class="ms">public</span><span>Firefox Mode</span></button>
              <button type="button" class="nocs-tile" data-jump="apps"><span class="ms">apps</span><span>Apps</span></button>
              <button type="button" class="nocs-tile" id="nocSetWinBtn"><span class="ms">window</span><span>Windows 11</span></button>
              <button type="button" class="nocs-tile" id="pcsExitBtn" style="border-color:rgba(244,114,182,.6);color:#f472b6"><span class="ms">power_settings_new</span><span>Exit PC</span></button>
            </div>
          </div>
        </div>
        <div class="nocs-main" id="pcsPaneWp" style="display:none">
          <h2 style="margin:0;font-size:19px">Wallpaper &amp; Theme</h2>
          <div class="nocs-box">${wpFormHtml}</div>
        </div>
        <div class="nocs-main" id="pcsPaneApps" style="display:none">
          <h2 style="margin:0;font-size:19px">App Settings</h2>
          <div class="nocs-box">${appsFormHtml}</div>
        </div>
        <div class="nocs-main" id="pcsPaneSys" style="display:none">
          <h2 style="margin:0;font-size:19px">System &amp; Browser</h2>
          <div class="nocs-box">${fakeBrowserCardHtml}</div>
          <div class="nocs-box" style="display:flex;flex-direction:column;gap:14px">
            <div class="pcs-lbl">Desktop Style</div>
            <div class="pcs-seg" id="pcsStyleSeg">
              <button type="button" data-st="win11">Windows 11</button>
              <button type="button" data-st="nocturnal">Nocturnal Shell</button>
            </div>
            <div><button type="button" class="pc-btn" id="pcsExitBtn2" style="color:#f472b6"><span class="ms" style="font-size:17px">power_settings_new</span>Exit Computer Mode</button></div>
          </div>
        </div>
      </div>
    </div>` : `
    <div class="pc-win hidden-win" id="pcSettingsWin">
      <div class="pc-titlebar">
        <div class="pc-wtitle"><span class="ms fill" style="font-size:16px;color:#60cdff">settings</span><span>Settings</span></div>
        <div class="pc-wbtns">
          <button type="button" class="pc-wbtn" id="pcSetMin" title="Minimize"><span class="ms" style="font-size:15px">remove</span></button>
          <button type="button" class="pc-wbtn" id="pcSetMax" title="Maximize"><span class="ms" style="font-size:15px">crop_square</span></button>
          <button type="button" class="pc-wbtn close" id="pcSetClose" title="Close"><span class="ms" style="font-size:15px">close</span></button>
        </div>
      </div>
      <div class="w11s-wrap">
        <aside class="w11s-side">
          <div class="w11s-user">
            <div class="w11s-av"><span class="ms fill" style="font-size:22px">account_circle</span></div>
            <div style="min-width:0"><b style="display:block;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="w11SetUser">Web Tok User</b><small style="opacity:.65;font-size:11px" id="w11SetHandle">Signed in</small></div>
          </div>
          <nav class="w11s-nav">
            <button type="button" class="w11s-nb on" data-stab="home"><span class="ms fill" style="font-size:18px;color:#60cdff">home</span>Home</button>
            <button type="button" class="w11s-nb" data-stab="wp"><span class="ms fill" style="font-size:18px;color:#c084fc">brush</span>Personalization</button>
            <button type="button" class="w11s-nb" data-stab="apps"><span class="ms fill" style="font-size:18px;color:#34d399">apps</span>Apps</button>
            <button type="button" class="w11s-nb" data-stab="system"><span class="ms fill" style="font-size:18px;color:#60cdff">laptop_windows</span>System &amp; Browser</button>
          </nav>
        </aside>
        <div class="w11s-main" id="pcsPaneHome">
          <h2 style="margin:0;font-size:22px;font-weight:600">Home</h2>
          <div class="w11s-dev">
            <div style="display:flex;align-items:center;gap:14px">
              <div id="w11SetPrev" style="width:78px;height:48px;border-radius:6px;border:2px solid rgba(255,255,255,.18);background-size:cover;background-position:center;background-image:url('/images/win11.jpg')"></div>
              <div><b style="font-size:14px;display:block">WebTok-PC</b><small style="opacity:.7;font-size:12px">Windows 11 Dark Mode</small></div>
            </div>
            <div style="display:flex;gap:18px;font-size:12px;opacity:.85">
              <span style="display:flex;align-items:center;gap:6px"><span class="ms" style="font-size:16px;color:#60cdff">wifi</span>Connected</span>
              <span style="display:flex;align-items:center;gap:6px"><span class="ms" style="font-size:16px;color:#34d399">verified</span>Web Tok</span>
            </div>
          </div>
          <div class="w11s-grid">
            <div class="w11s-card">
              <b style="font-size:13.5px">Recommended settings</b>
              <button type="button" class="w11s-row" data-jump="wp"><span>Wallpaper &amp; Background</span><span class="ms" style="font-size:16px">chevron_right</span></button>
              <button type="button" class="w11s-row" data-jump="apps"><span>Installed Apps &amp; Add App</span><span class="ms" style="font-size:16px">chevron_right</span></button>
              <button type="button" class="w11s-row" data-jump="system"><span>Fake Browser (Edge / Chrome)</span><span class="ms" style="font-size:16px">chevron_right</span></button>
            </div>
            <div class="w11s-card">
              <b style="font-size:13.5px">Personalize your device</b>
              <div class="w11s-wpthumbs" id="w11WpThumbs">
                <button type="button" class="w11s-wpth" data-qwp="default" style="background-image:url('/images/win11.jpg')">Default</button>
                <button type="button" class="w11s-wpth" data-qwp="profile" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6)">Profile</button>
                <button type="button" class="w11s-wpth" data-qwp="custom" style="background:linear-gradient(135deg,#1f2937,#0f172a)">Custom</button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.8">
                <span>Desktop style</span>
                <button type="button" class="pc-btn" data-jump="system" style="padding:4px 10px;font-size:11.5px">Windows 11</button>
              </div>
            </div>
          </div>
        </div>
        <div class="w11s-main" id="pcsPaneWp" style="display:none">
          <h2 style="margin:0;font-size:22px;font-weight:600">Personalization</h2>
          <div class="w11s-card">${wpFormHtml}</div>
        </div>
        <div class="w11s-main" id="pcsPaneApps" style="display:none">
          <h2 style="margin:0;font-size:22px;font-weight:600">Apps</h2>
          <div class="w11s-card">${appsFormHtml}</div>
        </div>
        <div class="w11s-main" id="pcsPaneSys" style="display:none">
          <h2 style="margin:0;font-size:22px;font-weight:600">System &amp; Browser</h2>
          <div class="w11s-card">${fakeBrowserCardHtml}</div>
          <div class="w11s-card">
            <div class="pcs-lbl">Desktop Style</div>
            <div class="pcs-seg" id="pcsStyleSeg">
              <button type="button" data-st="win11">Windows 11</button>
              <button type="button" data-st="nocturnal">Nocturnal Shell</button>
            </div>
            <div style="margin-top:6px"><button type="button" class="pc-btn" id="pcsExitBtn" style="color:#f472b6"><span class="ms" style="font-size:17px">power_settings_new</span>Exit Computer Mode</button></div>
          </div>
        </div>
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
          <button type="button" class="noc-pill" id="pcAuthPill" title="Web Tok Account">Sign in</button>
          <button type="button" class="noc-pill" data-app="wp_settings" title="Settings"><span class="ms" style="font-size:16px">settings</span>Settings</button>
        </div>
      </header>
      <div class="pc-stage">
        <div class="pc-icons" id="pcDesktopIcons"></div>
        ${appWinHtml}
        ${settingsWinHtml}
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
              <button type="button" class="noc-qbtn" data-app="wp_settings"><span class="ms" style="font-size:18px">settings</span>Settings</button>
              <button type="button" class="noc-qbtn" id="nocSwitchWin"><span class="ms" style="font-size:18px">window</span>Windows 11</button>
            </div>
          </div>
        </aside>
      </div>
      <div class="noc-dock-wrap">
        <nav class="noc-dock" id="nocDock"></nav>
      </div>`;
  } else {
    root.innerHTML = `
      <div class="pc-stage">
        <div class="pc-icons" id="pcDesktopIcons"></div>
        ${appWinHtml}
        ${settingsWinHtml}
      </div>

      <div class="w11-start" id="w11Start">
        <div class="w11-start-in">
          <input type="text" class="w11-search" id="w11Search" placeholder="Type here to search">
          <div class="w11-sec-h"><span>Pinned</span><button type="button" class="pc-btn" id="w11SwitchNoc" style="padding:4px 10px;font-size:11px">Nocturnal Shell</button></div>
          <div class="w11-sgrid" id="w11StartGrid"></div>
          <div class="w11-sec-h"><span>Recommended</span><span style="font-size:11px;opacity:.65" id="w11StatsTxt">Web Tok</span></div>
          <div class="w11-rec">
            <button type="button" class="w11-rec-it" data-app="webtok">
              <img src="/images/logo.png" alt="" width="28" height="28" style="border-radius:6px">
              <div><b style="display:block;font-size:12px">Web Tok</b><small style="opacity:.65;font-size:11px">For You Feed</small></div>
            </button>
            <button type="button" class="w11-rec-it" id="w11OpenAppsTab">
              <span class="ms fill" style="font-size:26px;color:#34d399">apps</span>
              <div><b style="display:block;font-size:12px">App Settings</b><small style="opacity:.65;font-size:11px">Add, edit &amp; delete apps</small></div>
            </button>
          </div>
        </div>
        <div class="w11-start-foot">
          <button type="button" id="w11UserBtn" style="display:flex;align-items:center;gap:8px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:4px 8px;border-radius:6px">
            <span class="ms fill" style="font-size:22px;color:#60cdff">account_circle</span>
            <span id="w11UserLbl">Sign in</span>
          </button>
          <button type="button" class="pc-wbtn" id="w11PowerBtn" title="Exit Computer Mode" style="width:32px;height:32px;border-radius:6px"><span class="ms" style="font-size:18px">power_settings_new</span></button>
        </div>
      </div>

      <div class="w11-fly" id="w11Fly">
        <div class="w11-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b style="font-size:12.5px">Notifications</b>
            <span style="font-size:11px;opacity:.65" id="w11FlyStats">Online</span>
          </div>
          <div style="font-size:12px;opacity:.8">Web Tok is running in Windows 11 Dark Mode. Open Settings to manage wallpaper, browser mode, and custom apps.</div>
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
        <div class="w11-center" id="w11TaskCenter"></div>
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

  const appWin = root.querySelector("#pcAppWin");
  const settingsWin = root.querySelector("#pcSettingsWin");
  const appFrame = root.querySelector("#pcAppFrame");
  const w11Start = root.querySelector("#w11Start");
  const w11Fly = root.querySelector("#w11Fly");

  function applyBrowserChrome() {
    if (!appWin) return;
    appWin.classList.remove("is-browser", "br-firefox", "br-edge", "br-chrome");
    if (cfg.fakeBrowser) {
      const brClass = isNoc ? "br-firefox" : (cfg.winBrowser === "chrome" ? "br-chrome" : "br-edge");
      appWin.classList.add("is-browser", brClass);
    }
    const bms = root.querySelector("#pcBrBookmarks");
    if (bms) {
      const bmApps = allApps().filter(a => a.href);
      bms.innerHTML = bmApps.map(a => {
        const ico = a.logo
          ? `<img src="${a.logo}" alt="" onerror="this.src='/images/logo.png'">`
          : `<span class="ms fill" style="font-size:14px;color:${a.color}">${a.icon || "language"}</span>`;
        return `<button type="button" class="pc-br-bm ${curAppHref === a.href ? "active" : ""}" data-app="${a.id}" title="${a.name.replace(/"/g, "&quot;")}">${ico}<span>${a.name.replace(/</g, "&lt;")}</span></button>`;
      }).join("");
    }
  }

  function openInWindow(app) {
    if (!app) return;
    if (app.action) { app.action(); return; }
    w11Start?.classList.remove("open");
    w11Fly?.classList.remove("open");
    settingsWin?.classList.add("hidden-win");
    curAppHref = app.href;
    root.querySelector("#pcAppTitle").textContent = app.name;
    root.querySelector("#pcBrTabTitle").textContent = app.name;
    const wl = root.querySelector("#pcAppWinLogo");
    const bl = root.querySelector("#pcBrTabLogo");
    if (wl) wl.src = app.logo || "/images/logo.png";
    if (bl) bl.src = app.logo || "/images/logo.png";
    const fullUrl = app.href.startsWith("/") ? location.origin + app.href : app.href;
    const urlIn = root.querySelector("#pcBrUrl");
    if (urlIn) urlIn.value = fullUrl;
    const pop = root.querySelector("#pcAppPop");
    if (pop) pop.href = app.href;
    const bpop = root.querySelector("#pcBrPop");
    if (bpop) bpop.href = app.href;
    if (appFrame && appFrame.getAttribute("src") !== app.href) appFrame.src = app.href;
    appWin?.classList.remove("hidden-win");
    applyBrowserChrome();
    renderAppLists();
  }

  function renderAppLists() {
    const apps = allApps();
    const iconsEl = root.querySelector("#pcDesktopIcons");
    if (iconsEl) {
      iconsEl.innerHTML = apps.map(a =>
        `<button type="button" class="pc-ico" data-app="${a.id}"><div class="pc-ico-box">${iconMedia(a, 34)}</div><span class="lbl">${a.name.replace(/</g, "&lt;")}</span></button>`
      ).join("");
    }
    const startGrid = root.querySelector("#w11StartGrid");
    if (startGrid) {
      startGrid.innerHTML = apps.map(a =>
        `<button type="button" class="w11-tile" data-app="${a.id}">${iconMedia(a, 30)}<span>${a.name.replace(/</g, "&lt;")}</span></button>`
      ).join("");
    }
    const nocDock = root.querySelector("#nocDock");
    if (nocDock) {
      nocDock.innerHTML = apps.map(a =>
        `<button type="button" data-app="${a.id}" title="${a.name.replace(/"/g, "&quot;")}">${iconMedia(a, 26)}</button>`
      ).join("");
    }
    const w11Center = root.querySelector("#w11TaskCenter");
    if (w11Center) {
      const setOpen = settingsWin && !settingsWin.classList.contains("hidden-win");
      const appOpen = appWin && !appWin.classList.contains("hidden-win");
      w11Center.innerHTML = `
        <button type="button" class="w11-tbtn" id="w11StartBtn" title="Start">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#60cdff"><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>
        </button>
        <button type="button" class="w11-tbtn" id="w11SearchBtn" title="Search"><span class="ms" style="font-size:20px">search</span></button>
        ${apps.map(a => {
          const isAct = a.id === "wp_settings" ? setOpen : (appOpen && curAppHref && curAppHref === a.href);
          return `<button type="button" class="w11-tbtn ${isAct ? "active" : ""}" data-app="${a.id}" title="${a.name.replace(/"/g, "&quot;")}">${iconMedia(a, 22)}</button>`;
        }).join("")}`;
      w11Center.querySelector("#w11StartBtn")?.addEventListener("click", e => {
        e.stopPropagation();
        w11Fly?.classList.remove("open");
        w11Start?.classList.toggle("open");
      });
      w11Center.querySelector("#w11SearchBtn")?.addEventListener("click", e => {
        e.stopPropagation();
        w11Fly?.classList.remove("open");
        w11Start?.classList.add("open");
        root.querySelector("#w11Search")?.focus();
      });
    }
    applyBrowserChrome();
  }
  renderAppLists();

  // Delegated click for all [data-app] buttons (including bookmarks!)
  root.addEventListener("click", e => {
    const btn = e.target.closest("[data-app]");
    if (!btn) return;
    const app = allApps().find(a => a.id === btn.dataset.app);
    if (app) openInWindow(app);
  });

  function paintSettingsWindow() {
    root.querySelectorAll("[data-stab]").forEach(b => b.classList.toggle("on", b.dataset.stab === activeSettingsTab));
    const titles = { home: "Home", wp: "Wallpaper & Theme", apps: "Apps", system: "System & Browser" };
    const nt = root.querySelector("#nocSetTitle");
    if (nt) nt.textContent = titles[activeSettingsTab] || "Settings";

    const pHome = root.querySelector("#pcsPaneHome");
    const pWp = root.querySelector("#pcsPaneWp");
    const pApps = root.querySelector("#pcsPaneApps");
    const pSys = root.querySelector("#pcsPaneSys");
    if (pHome) pHome.style.display = activeSettingsTab === "home" ? "flex" : "none";
    if (pWp) pWp.style.display = activeSettingsTab === "wp" ? "flex" : "none";
    if (pApps) pApps.style.display = activeSettingsTab === "apps" ? "flex" : "none";
    if (pSys) pSys.style.display = activeSettingsTab === "system" ? "flex" : "none";

    root.querySelectorAll("#pcsWpSeg button").forEach(b => b.classList.toggle("on", b.dataset.wp === (cfg.wpMode || "default")));
    root.querySelectorAll("#pcsStyleSeg button").forEach(b => b.classList.toggle("on", b.dataset.st === (cfg.style || "nocturnal")));
    root.querySelectorAll("#pcsFbSeg button").forEach(b => b.classList.toggle("on", b.dataset.fb === (cfg.fakeBrowser ? "on" : "off")));
    root.querySelectorAll("#pcsWbSeg button").forEach(b => b.classList.toggle("on", b.dataset.wb === (cfg.winBrowser || "edge")));
    root.querySelectorAll("#w11WpThumbs [data-qwp]").forEach(b => b.classList.toggle("on", b.dataset.qwp === (cfg.wpMode || "default")));

    const wbWrap = root.querySelector("#pcsWinBrWrap");
    if (wbWrap) wbWrap.style.display = cfg.fakeBrowser ? "flex" : "none";
    const nocFb = root.querySelector("#nocSetFbTog");
    if (nocFb) nocFb.classList.toggle("on", !!cfg.fakeBrowser);

    const custRow = root.querySelector("#pcsCustRow");
    if (custRow) custRow.style.display = cfg.wpMode === "custom" ? "flex" : "none";
    const custIn = root.querySelector("#pcsCustIn");
    if (custIn) custIn.value = cfg.customWp || "";
    const profNote = root.querySelector("#pcsProfNote");
    if (profNote) {
      profNote.textContent = profileWallpaper
        ? "Profile wallpaper detected and ready."
        : "No profile wallpaper set yet (set one in My Profile → Theme & settings).";
    }

    const wu = root.querySelector("#w11SetUser"), wh = root.querySelector("#w11SetHandle");
    if (wu) wu.textContent = userDisplayName;
    if (wh) wh.textContent = "@" + userHandle;
    const nu = root.querySelector("#nocSetUser"), nac = root.querySelector("#nocSetAppCount");
    if (nu) nu.textContent = `${userHandle.toUpperCase()}@WEBTOK`;
    if (nac) nac.textContent = `${customApps.length} custom app${customApps.length === 1 ? "" : "s"} pinned`;

    paintSavedAppsList();
  }

  function paintSavedAppsList() {
    const list = root.querySelector("#pcaList");
    if (!list) return;
    if (!customApps.length) {
      list.innerHTML = `<div style="font-size:12px;opacity:.65">No custom apps saved yet. Add one above!</div>`;
      return;
    }
    list.innerHTML = customApps.map(a => {
      const isEditing = editingAppId === a.id;
      return `
        <div class="pca-row" data-row="${a.id}">
          <div class="pca-row-top">
            <div style="display:flex;align-items:center;gap:10px;min-width:0">
              <img src="${a.logo_url || "/images/logo.png"}" alt="" width="24" height="24" style="border-radius:5px;object-fit:contain;flex:none" onerror="this.src='/images/logo.png'">
              <div style="min-width:0">
                <b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name.replace(/</g, "&lt;")}</b>
                <small style="display:block;opacity:.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.url.replace(/</g, "&lt;")}</small>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex:none">
              <button type="button" class="pc-btn" data-edit="${a.id}" style="padding:5px 10px;font-size:11.5px">${isEditing ? "Close" : "Edit"}</button>
              <button type="button" class="pc-btn" data-del="${a.id}" style="padding:5px 10px;font-size:11.5px;color:#fb7185">Delete</button>
            </div>
          </div>
          ${isEditing ? `
            <div style="display:flex;flex-direction:column;gap:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.08)">
              <input type="text" class="pcs-in" data-ename="${a.id}" maxlength="40" value="${a.name.replace(/"/g, "&quot;")}" placeholder="App name">
              <input type="text" class="pcs-in" data-eurl="${a.id}" value="${a.url.replace(/"/g, "&quot;")}" placeholder="Website URL">
              <input type="text" class="pcs-in" data-elogo="${a.id}" value="${(a.logo_url || "").replace(/"/g, "&quot;")}" placeholder="Logo URL (optional)">
              <div style="display:flex;gap:8px">
                <button type="button" class="pc-btn p" data-save="${a.id}" style="padding:6px 14px;font-size:12px">Save</button>
                <button type="button" class="pc-btn" data-cancel="${a.id}" style="padding:6px 14px;font-size:12px">Cancel</button>
              </div>
            </div>` : ""}
        </div>`;
    }).join("");

    list.querySelectorAll("[data-edit]").forEach(b => {
      b.onclick = () => {
        editingAppId = editingAppId === b.dataset.edit ? null : b.dataset.edit;
        paintSavedAppsList();
      };
    });
    list.querySelectorAll("[data-cancel]").forEach(b => {
      b.onclick = () => { editingAppId = null; paintSavedAppsList(); };
    });
    list.querySelectorAll("[data-save]").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.save;
        const hint = root.querySelector("#pcaHint");
        const name = list.querySelector(`[data-ename="${id}"]`)?.value.trim();
        const url = list.querySelector(`[data-eurl="${id}"]`)?.value.trim();
        const logoUrl = list.querySelector(`[data-elogo="${id}"]`)?.value.trim();
        if (!authToken) { goToLogin(); return; }
        b.disabled = true;
        try {
          const r = await fetch("/api/computer/apps/" + encodeURIComponent(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
            body: JSON.stringify({ name, url, logoUrl })
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.error) throw new Error(j.error?.message || "Could not update app.");
          customApps = customApps.map(x => x.id === id ? j.data : x);
          editingAppId = null;
          hint.style.color = "#34d399";
          hint.textContent = `Updated "${j.data.name}"!`;
          renderAppLists();
          paintSavedAppsList();
        } catch (err) {
          hint.style.color = "#fb7185";
          hint.textContent = err.message;
        } finally {
          b.disabled = false;
        }
      };
    });
    list.querySelectorAll("[data-del]").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.del;
        if (!authToken) { goToLogin(); return; }
        await fetch("/api/computer/apps/" + encodeURIComponent(id), {
          method: "DELETE",
          headers: { Authorization: "Bearer " + authToken }
        }).catch(() => {});
        customApps = customApps.filter(x => x.id !== id);
        if (editingAppId === id) editingAppId = null;
        renderAppLists();
        paintSavedAppsList();
      };
    });
  }

  function openDesktopSettings(tab = "home") {
    w11Start?.classList.remove("open");
    w11Fly?.classList.remove("open");
    appWin?.classList.add("hidden-win");
    activeSettingsTab = tab;
    settingsWin?.classList.remove("hidden-win");
    paintSettingsWindow();
    renderAppLists();
  }

  // Wire Settings window controls
  root.querySelectorAll("[data-stab]").forEach(b => {
    b.onclick = () => { activeSettingsTab = b.dataset.stab; paintSettingsWindow(); };
  });
  root.querySelectorAll("[data-jump]").forEach(b => {
    b.onclick = () => { activeSettingsTab = b.dataset.jump; paintSettingsWindow(); };
  });
  root.querySelector("#w11WpThumbs")?.addEventListener("click", e => {
    const b = e.target.closest("[data-qwp]"); if (!b) return;
    cfg.wpMode = b.dataset.qwp;
    saveCfg(cfg);
    applyWallpaper();
    if (cfg.wpMode === "custom") activeSettingsTab = "wp";
    paintSettingsWindow();
  });
  root.querySelector("#pcSetMin")?.addEventListener("click", () => { settingsWin?.classList.add("hidden-win"); renderAppLists(); });
  root.querySelector("#pcSetMax")?.addEventListener("click", () => settingsWin?.classList.toggle("max-win"));
  root.querySelector("#pcSetClose")?.addEventListener("click", () => {
    settingsWin?.classList.add("hidden-win");
    settingsWin?.classList.remove("max-win");
    renderAppLists();
  });
  root.querySelector("#pcsWpSeg")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    cfg.wpMode = b.dataset.wp;
    saveCfg(cfg);
    applyWallpaper();
    paintSettingsWindow();
  });
  root.querySelector("#pcsFbSeg")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    cfg.fakeBrowser = b.dataset.fb === "on";
    saveCfg(cfg);
    applyBrowserChrome();
    paintSettingsWindow();
  });
  root.querySelector("#pcsWbSeg")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    cfg.winBrowser = b.dataset.wb;
    saveCfg(cfg);
    applyBrowserChrome();
    paintSettingsWindow();
  });
  root.querySelector("#nocSetFbTog")?.addEventListener("click", () => {
    cfg.fakeBrowser = !cfg.fakeBrowser;
    saveCfg(cfg);
    applyBrowserChrome();
    paintSettingsWindow();
  });
  root.querySelector("#pcsCustSave")?.addEventListener("click", () => {
    cfg.wpMode = "custom";
    cfg.customWp = root.querySelector("#pcsCustIn").value.trim();
    saveCfg(cfg);
    applyWallpaper();
    paintSettingsWindow();
  });
  root.querySelector("#pcsStyleSeg")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    cfg.style = b.dataset.st;
    saveCfg(cfg);
    location.reload();
  });
  root.querySelectorAll("#pcsExitBtn, #pcsExitBtn2").forEach(b => {
    b.addEventListener("click", () => { cfg.enabled = false; saveCfg(cfg); location.href = "/"; });
  });
  root.querySelector("#nocSetDayTog")?.addEventListener("click", () => {
    cfg.light = !cfg.light; saveCfg(cfg); location.reload();
  });
  root.querySelector("#nocSetGlassTog")?.addEventListener("click", () => {
    cfg.glass = !(cfg.glass !== false); saveCfg(cfg);
    root.classList.toggle("glass", cfg.glass);
    root.querySelector("#nocGlassBtn")?.classList.toggle("on", cfg.glass);
    root.querySelector("#nocSetGlassTog")?.classList.toggle("on", cfg.glass);
  });
  root.querySelector("#nocSetWinBtn")?.addEventListener("click", () => {
    cfg.style = "win11"; saveCfg(cfg); location.reload();
  });
  root.querySelector("#w11OpenAppsTab")?.addEventListener("click", () => openDesktopSettings("apps"));

  root.querySelector("#pcaAddBtn")?.addEventListener("click", async () => {
    const name = root.querySelector("#pcaName").value.trim();
    const url = root.querySelector("#pcaUrl").value.trim();
    const logoUrl = root.querySelector("#pcaLogo").value.trim();
    const hint = root.querySelector("#pcaHint");
    const btn = root.querySelector("#pcaAddBtn");
    if (!authToken) {
      location.href = "/login?next=" + encodeURIComponent("/computer");
      return;
    }
    if (!name || !url) {
      hint.style.color = "#fb7185";
      hint.textContent = "Enter both an app name and a URL.";
      return;
    }
    btn.disabled = true;
    hint.style.color = "#60cdff";
    hint.textContent = "Adding app…";
    try {
      const r = await fetch("/api/computer/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
        body: JSON.stringify({ name, url, logoUrl })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error?.message || "Could not add app.");
      customApps.push(j.data);
      root.querySelector("#pcaName").value = "";
      root.querySelector("#pcaUrl").value = "";
      root.querySelector("#pcaLogo").value = "";
      hint.style.color = "#34d399";
      hint.textContent = `Added "${j.data.name}"!`;
      renderAppLists();
      paintSavedAppsList();
    } catch (err) {
      hint.style.color = "#fb7185";
      hint.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector("#pcAuthPill")?.addEventListener("click", () => {
    if (!authToken) location.href = "/login?next=" + encodeURIComponent("/computer");
  });
  root.querySelector("#w11UserBtn")?.addEventListener("click", () => {
    if (!authToken) location.href = "/login?next=" + encodeURIComponent("/computer");
  });

  // App Window & Fake Browser controls
  const reloadApp = () => { if (appFrame && curAppHref) appFrame.src = curAppHref; };
  const maxApp = () => appWin?.classList.toggle("max-win");
  const minApp = () => { appWin?.classList.add("hidden-win"); renderAppLists(); };
  const closeApp = () => {
    if (appFrame) appFrame.src = "about:blank";
    curAppHref = "";
    appWin?.classList.add("hidden-win");
    appWin?.classList.remove("max-win");
    renderAppLists();
  };
  root.querySelector("#pcAppReload")?.addEventListener("click", reloadApp);
  root.querySelector("#pcBrReload")?.addEventListener("click", reloadApp);
  root.querySelector("#pcAppMax")?.addEventListener("click", maxApp);
  root.querySelector("#pcBrMax")?.addEventListener("click", maxApp);
  root.querySelector("#pcAppMin")?.addEventListener("click", minApp);
  root.querySelector("#pcBrMin")?.addEventListener("click", minApp);
  root.querySelector("#pcAppClose")?.addEventListener("click", closeApp);
  root.querySelector("#pcBrClose")?.addEventListener("click", closeApp);
  root.querySelector("#pcBrTabClose")?.addEventListener("click", closeApp);
  root.querySelector("#pcBrNewTab")?.addEventListener("click", () => openInWindow(BUILTIN_APPS[0]));
  root.querySelector("#pcBrBack")?.addEventListener("click", () => { try { appFrame?.contentWindow?.history.back(); } catch {} });
  root.querySelector("#pcBrFwd")?.addEventListener("click", () => { try { appFrame?.contentWindow?.history.forward(); } catch {} });
  root.querySelector("#pcBrUrl")?.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    let val = e.target.value.trim();
    if (!val) return;
    if (!/^https?:\/\//i.test(val) && !val.startsWith("/")) val = "https://" + val;
    curAppHref = val;
    if (appFrame) appFrame.src = val;
    const pop = root.querySelector("#pcAppPop"), bpop = root.querySelector("#pcBrPop");
    if (pop) pop.href = val;
    if (bpop) bpop.href = val;
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
    const time24 = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const dateStr = now.toLocaleDateString([], { month: "numeric", day: "numeric", year: "numeric" });
    const shortDate = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const clk = root.querySelector("#pcClock");
    if (clk) clk.innerHTML = isNoc ? `${shortDate} · ${timeStr}` : `${timeStr}<br><span style="opacity:.85;font-size:11px">${dateStr}</span>`;
    const bt = root.querySelector("#nocBigTime"), bd = root.querySelector("#nocBigDate");
    if (bt) bt.textContent = timeStr;
    if (bd) bd.textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    const sc = root.querySelector("#nocSetClock"), sd = root.querySelector("#nocSetDay"), sdt = root.querySelector("#nocSetDate");
    if (sc) sc.textContent = time24;
    if (sd) sd.textContent = now.toLocaleDateString([], { weekday: "long" });
    if (sdt) sdt.textContent = now.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }
  tickClock();
  setInterval(tickClock, 15000);

  async function syncUserSession() {
    try {
      const client = getSb();
      if (!client?.auth?.getSession) return false;
      const { data } = await client.auth.getSession();
      authToken = data?.session?.access_token || null;
      if (!authToken) return false;
      try { sessionStorage.removeItem("wt_pc_login_ts"); } catch {}

      const ar = await fetch("/api/computer/apps", { headers: { Authorization: "Bearer " + authToken } });
      const aj = await ar.json().catch(() => ({}));
      if (ar.ok) {
        if (Array.isArray(aj?.data)) customApps = aj.data;
        isAdminUser = !!aj?.isAdmin;
      }
      if (data?.session?.user?.id) {
        const { data: prof } = await client.from("profiles").select("username,display_name,theme").eq("id", data.session.user.id).maybeSingle();
        userHandle = prof?.username || (data.session.user.email || "user").split("@")[0];
        userDisplayName = prof?.display_name || `@${userHandle}`;
        const ul = root.querySelector("#w11UserLbl");
        if (ul) ul.textContent = userDisplayName;
        const ap = root.querySelector("#pcAuthPill");
        if (ap) ap.textContent = userDisplayName;
        let rt = prof?.theme;
        if (typeof rt === "string") { try { rt = JSON.parse(rt); } catch { rt = null; } }
        if (rt?.wallpaper) {
          profileWallpaper = rt.wallpaper;
          applyWallpaper();
        }
      }
      renderAppLists();
      paintSettingsWindow();
      return true;
    } catch {
      return false;
    }
  }

  (async () => {
    const isSignedIn = await syncUserSession();
    if (!isSignedIn) {
      if (goToLogin()) return;
    }
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
  })();
})();
