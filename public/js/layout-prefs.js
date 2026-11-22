/* Layout & Customization Engine: Sidebar position/compact mode, Sidebar item order, Video rail button order, Corner roundness */
(function () {
  if (window.wtApplyLayoutPrefs) return;

  const DEFAULT_SB = ["explore", "fyp", "following", "friends", "upload", "games", "activity", "messages", "profile"];
  const DEFAULT_RAIL = ["follow", "like", "comment", "share"];

  window.WT_DEFAULT_SB_ORDER = DEFAULT_SB;
  window.WT_DEFAULT_RAIL_ORDER = DEFAULT_RAIL;

  window.wtApplyLayoutPrefs = function (t) {
    if (!t) { try { t = JSON.parse(localStorage.getItem("wt_theme") || "{}"); } catch { t = {}; } }
    const root = document.documentElement;

    const rad = t.radius || "round";
    if (rad === "sharp") {
      root.style.setProperty("--r-xl", "14px");
      root.style.setProperty("--r-lg", "10px");
      root.style.setProperty("--r-md", "8px");
    } else if (rad === "pill") {
      root.style.setProperty("--r-xl", "44px");
      root.style.setProperty("--r-lg", "32px");
      root.style.setProperty("--r-md", "24px");
    } else {
      root.style.setProperty("--r-xl", "32px");
      root.style.setProperty("--r-lg", "24px");
      root.style.setProperty("--r-md", "18px");
    }

    let st = document.getElementById("wt-layout-prefs-css");
    if (!st) { st = document.createElement("style"); st.id = "wt-layout-prefs-css"; document.head.appendChild(st); }

    const sbPos = t.sbPos || "left";
    const sbOrder = Array.isArray(t.sbOrder) && t.sbOrder.length ? t.sbOrder : DEFAULT_SB;
    const railOrder = Array.isArray(t.railOrder) && t.railOrder.length ? t.railOrder : DEFAULT_RAIL;

    let css = "";
    if (sbPos === "right") {
      css += `@media(min-width:801px){
        :root{--sbw:0px!important}
        #sb{left:auto!important;right:0!important;border-right:0!important;border-left:1px solid var(--surface)!important}
        body.has-sb #feed,body.has-sb #landing,body.has-sb #app{left:0!important;right:240px!important}
        body.has-sb .wrap,body.has-sb .acct-wrap{padding-left:0!important;padding-right:240px!important}
        #wt-top-tools{right:254px!important}
        #wt-stories-bar{left:14px!important;right:254px!important}
      }`;
    } else if (sbPos === "compact") {
      css += `@media(min-width:801px){
        :root{--sbw:84px!important}
        #sb{width:84px!important;padding:18px 12px!important;align-items:center}
        #sb .brand span,#sb .lbl,#sb .srch-wrap{display:none!important}
        #sb .it{justify-content:center;padding:12px!important;width:52px!important}
      }`;
    }

    css += `#sb .brand{order:-10}#sb .srch-wrap{order:-5}#sb #sbmore{order:100}`;
    sbOrder.forEach((id, i) => { css += `#sb .it[data-id="${id}"]{order:${i}}`; });
    railOrder.forEach((id, i) => { css += `.rail .fab[data-a="${id}"]{order:${i}}`; });

    st.textContent = css;
  };

  window.wtExtractColorFromCanvas = function (canvas) {
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let bestScore = -1, best = [103, 80, 164];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
      if (d < 0.08) continue;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      const score = s * (1 - Math.abs(l - 0.52) * 1.4);
      if (score > bestScore) { bestScore = score; best = [data[i], data[i + 1], data[i + 2]]; }
    }
    return "#" + best.map(v => v.toString(16).padStart(2, "0")).join("");
  };

  window.wtExtractWallpaperColor = function (wp, fallbackHex) {
    return new Promise(resolve => {
      if (!wp) return resolve(fallbackHex || "#6750a4");
      const hexes = wp.match(/#[0-9a-fA-F]{6}/g);
      if (hexes && hexes.length && wp.includes("gradient")) {
        return resolve(hexes[0]);
      }
      const urlMatch = /url\(["']?([^"')]+)["']?\)/.exec(wp);
      const src = urlMatch ? urlMatch[1] : wp;
      if (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("/")) {
        return resolve(fallbackHex || "#6750a4");
      }
      const img = new Image();
      if (src.startsWith("http")) img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = c.height = 32;
          c.getContext("2d").drawImage(img, 0, 0, 32, 32);
          resolve(window.wtExtractColorFromCanvas(c));
        } catch { resolve(fallbackHex || "#6750a4"); }
      };
      img.onerror = () => resolve(fallbackHex || "#6750a4");
      img.src = src;
    });
  };

  window.wtApplyLayoutPrefs();
})();