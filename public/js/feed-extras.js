/* Global User Search + Sounds Link + Feed Rail Avatar, Sound Label & Video Banners */
(function initExtrasBar() {
  const page = document.body.dataset.page || "";
  if (page !== "scroll" && page !== "home") return;

  const style = document.createElement("style");
  style.textContent = `
    #wt-top-tools{position:fixed;top:14px;right:14px;z-index:25;display:flex;gap:8px;align-items:center}
    .wt-pill{padding:9px 15px;border-radius:999px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;box-shadow:0 4px 16px #0002;transition:transform .15s}
    .wt-pill:hover{transform:translateY(-1px)}
    .wt-sav{width:38px;height:38px;clip-path:var(--m3-cookie-7);background:var(--surface) center/cover;display:grid;place-items:center;font-weight:700;font-size:16px;color:var(--primary);flex:none}
    #wt-search-dlg{border:0;border-radius:32px;padding:22px;width:min(94vw,420px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 16px 48px #0005}
    #wt-search-dlg::backdrop{background:#0007;backdrop-filter:blur(4px)}
    .wt-sres{max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:10px}
    .wt-srow{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:18px;background:var(--surface);text-decoration:none;color:inherit}
    .wt-srow:hover{background:var(--card)}
    .rail-av{order:-10!important;clip-path:var(--m3-cookie-7)!important;background:var(--card) center/cover;color:var(--primary);font-weight:700;font-size:18px;text-decoration:none}
    .rail-snd{order:99!important;text-decoration:none;color:var(--text);padding:4px}
    .rail-snd small{max-width:54px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
    .wt-vid-banner{position:absolute;top:12px;left:12px;right:12px;z-index:5;padding:8px 14px;border-radius:18px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#16121e;box-shadow:0 6px 20px #0005;pointer-events:none;overflow:hidden}
    .wt-vid-banner img{height:28px;width:auto;border-radius:8px;object-fit:contain}
  `;
  document.head.appendChild(style);

  const tools = document.createElement("div");
  tools.id = "wt-top-tools";
  tools.innerHTML = `<button type="button" class="wt-pill" id="wtSearchBtn"><span class="ms" style="font-size:18px">search</span>Users</button>
    <a class="wt-pill" href="/sounds"><span class="ms" style="font-size:18px">music_note</span>Sounds</a>`;
  document.body.appendChild(tools);

  const sDlg = document.createElement("dialog");
  sDlg.id = "wt-search-dlg";
  sDlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Find Users</h3><button type="button" class="wt-pill" onclick="this.closest('dialog').close()"><span class="ms" style="font-size:18px">close</span></button></div>
    <input id="wtSearchIn" type="text" placeholder="Search @username or name…" style="width:100%;padding:12px 16px;border-radius:999px;border:0;background:var(--surface);color:var(--text);font:inherit;outline:0">
    <div class="wt-sres" id="wtSearchRes"></div>`;
  document.body.appendChild(sDlg);

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
        const init = (u.display_name || u.username || "U")[0].toUpperCase();
        a.innerHTML = `<div class="wt-sav" style="${u.avatar_url ? `background-image:url(${u.avatar_url})` : ""}">${u.avatar_url ? "" : init}</div>
          <div><div style="font-weight:700;font-size:14px">${(u.display_name || u.username).replace(/</g,"&lt;")}</div><div style="font-size:12px;color:var(--muted)">@${u.username.replace(/</g,"&lt;")}</div></div>`;
        resEl.appendChild(a);
      });
    }, 220);
  };

  let soundsCache = null;
  async function getSounds() {
    if (soundsCache) return soundsCache;
    try { const r = await fetch("/api/sounds"); soundsCache = (await r.json())?.data || []; }
    catch { soundsCache = []; }
    return soundsCache;
  }

  async function enhanceSlides() {
    const feed = document.getElementById("feed");
    if (!feed) return;
    const slides = [...feed.querySelectorAll(".slide:not([data-wt-enh])")];
    if (!slides.length) return;
    slides.forEach(s => { s.dataset.wtEnh = "1"; });

    const usernames = [];
    const vids = [];
    slides.forEach(s => {
      if (s.dataset.vid) vids.push(s.dataset.vid);
      const a = s.querySelector('.cap a[href^="/profile?u="]');
      if (a) {
        try { usernames.push(decodeURIComponent(a.getAttribute("href").split("u=")[1])); } catch {}
      }
    });

    const [profMap, bannerMap, sounds] = await Promise.all([
      (async () => {
        const m = {};
        try {
          if (usernames.length && typeof sb !== "undefined") {
            const res = await sb.from("profiles").select("username,display_name,avatar_url").in("username", [...new Set(usernames)]);
            (res?.data || []).forEach(p => { m[p.username] = p; });
          }
        } catch {}
        return m;
      })(),
      (async () => {
        if (!vids.length) return {};
        try { const r = await fetch("/api/shop/banners?ids=" + encodeURIComponent(vids.join(","))); return (await r.json())?.data || {}; }
        catch { return {}; }
      })(),
      getSounds()
    ]);

    slides.forEach(s => {
      const rail = s.querySelector(".rail");
      const capLink = s.querySelector('.cap a[href^="/profile?u="]');
      const uname = capLink ? decodeURIComponent(capLink.getAttribute("href").split("u=")[1]) : "";
      const p = profMap[uname];

      if (rail && uname && !rail.querySelector(".rail-av")) {
        const av = document.createElement("a");
        av.className = "fab rail-av";
        av.href = "/profile?u=" + encodeURIComponent(uname);
        av.title = "@" + uname;
        if (p?.avatar_url) av.style.backgroundImage = `url(${p.avatar_url})`;
        else av.textContent = (p?.display_name || uname || "U")[0].toUpperCase();
        rail.insertBefore(av, rail.firstChild);
      }

      if (rail && !rail.querySelector(".rail-snd")) {
        const capTxt = (s.querySelector(".cap-t")?.textContent || "").toLowerCase();
        const match = Array.isArray(sounds) ? sounds.find(sn => sn.title && capTxt.includes(sn.title.toLowerCase())) : null;
        const sndLabel = s.dataset.soundTitle || (match ? match.title : "Original sound");
        const snd = document.createElement("a");
        snd.className = "fab rail-snd";
        snd.href = "/sounds";
        snd.title = sndLabel;
        snd.innerHTML = `<span class="ms">music_note</span><small>${sndLabel.replace(/</g, "&lt;")}</small>`;
        rail.appendChild(snd);
      }

      const bn = bannerMap[s.dataset.vid];
      const player = s.querySelector(".player");
      if (bn && player && !player.querySelector(".wt-vid-banner")) {
        const el = document.createElement("div");
        el.className = "wt-vid-banner";
        if (bn.style === "turkey") {
          el.style.background = "linear-gradient(90deg,#7c2d12,#b45309,#d97706,#991b1b)";
          el.style.color = "#fff";
          el.style.border = "1px solid #fbbf24";
        } else if (bn.style === "cyber") {
          el.style.background = "linear-gradient(90deg,#00e5ff,#ff4081)";
          el.style.color = "#fff";
        } else {
          el.style.background = `linear-gradient(90deg, ${bn.color || "#d0bcff"}, var(--accent,#ffd8e4))`;
        }
        const imgSrc = bn.image_url || bn.sprite;
        el.innerHTML = imgSrc
          ? `<img src="${imgSrc}" alt=""><span>${(bn.name || "Banner").replace(/</g, "&lt;")}</span>`
          : `<span class="ms fill" style="font-size:18px">${bn.icon || "auto_awesome"}</span><span>${(bn.name || "Banner").replace(/</g, "&lt;")}</span>`;
        player.appendChild(el);
      }
    });
  }

  const feedEl = document.getElementById("feed");
  if (feedEl) {
    new MutationObserver(() => enhanceSlides()).observe(feedEl, { childList: true });
    enhanceSlides();
    setTimeout(enhanceSlides, 300);
    setTimeout(enhanceSlides, 900);
  }
})();
