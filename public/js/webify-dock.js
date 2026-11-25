/* Optional Side-Docked Webify Mini Player (toggleable while scrolling) */
(function () {
  if (/^\/webify\b/.test(location.pathname)) return;
  if (window.wtToggleWebifyDock) return;

  const DOCK_KEY = "wt_webify_dock_open";
  const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const audio = new Audio();
  audio.volume = 0.85;

  let webtokTracks = [];
  let discoverTracks = [];
  let playlists = [];
  let activeSource = "both";
  let activePlaylistId = "";
  let queue = [];
  let queueIdx = -1;
  let loadedOnce = false;

  function ensureStyles() {
    if (document.getElementById("wt-wf-dock-css")) return;
    const st = document.createElement("style");
    st.id = "wt-wf-dock-css";
    st.textContent = `
      #wt-wf-tab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9200;display:flex;align-items:center;gap:6px;padding:10px 12px 10px 14px;border-radius:999px 0 0 999px;border:1px solid var(--surface,#333);border-right:0;background:var(--card,#211f26);color:var(--text,#fff);font:inherit;font-size:13px;font-weight:700;cursor:pointer;box-shadow:-4px 6px 22px rgba(0,0,0,.32)}
      #wt-wf-tab:hover{background:var(--surface,#2b2930)}
      #wt-wf-dock{position:fixed;top:14px;right:14px;bottom:14px;width:min(340px,calc(100vw - 24px));z-index:9300;background:var(--card,#211f26);color:var(--text,#fff);border:1px solid var(--surface,#333);border-radius:26px;box-shadow:0 18px 48px rgba(0,0,0,.5);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,sans-serif}
      #wt-wf-dock.open{display:flex}
      .wfd-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;border-bottom:1px solid var(--surface,#333)}
      .wfd-top b{display:flex;align-items:center;gap:7px;font-size:16px}
      .wfd-top-acts{display:flex;align-items:center;gap:6px}
      .wfd-ic{border:0;border-radius:999px;width:34px;height:34px;background:var(--surface,#2b2930);color:var(--text,#fff);display:grid;place-items:center;cursor:pointer;text-decoration:none}
      .wfd-ctrl-pad{padding:10px 14px;border-bottom:1px solid var(--surface,#333);display:flex;flex-direction:column;gap:8px}
      .wfd-srch{display:flex;gap:6px}
      .wfd-srch input{flex:1;min-width:0;padding:8px 12px;border-radius:999px;border:1px solid var(--surface,#444);background:var(--bg,#141218);color:var(--text,#fff);font:inherit;font-size:13px;outline:0}
      .wfd-pills{display:flex;gap:6px;flex-wrap:wrap}
      .wfd-pill{border:0;border-radius:999px;padding:5px 10px;background:var(--surface,#2b2930);color:var(--text,#fff);font:inherit;font-size:11px;font-weight:700;cursor:pointer}
      .wfd-pill.on{background:var(--primary,#d0bcff);color:var(--on-primary,#381e72)}
      .wfd-sel{width:100%;padding:7px 12px;border-radius:999px;border:1px solid var(--surface,#444);background:var(--bg,#141218);color:var(--text,#fff);font:inherit;font-size:12px;font-weight:600;outline:0}
      .wfd-list{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
      .wfd-trk{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:14px;background:var(--surface,#2b2930);cursor:pointer;border:0;color:var(--text,#fff);font:inherit;text-align:left;width:100%}
      .wfd-trk.playing{box-shadow:0 0 0 2px var(--primary,#d0bcff)}
      .wfd-cov{width:36px;height:36px;border-radius:10px;background:var(--bg,#141218) center/cover no-repeat;display:grid;place-items:center;flex-shrink:0}
      .wfd-meta{min-width:0;flex:1}
      .wfd-meta b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .wfd-meta small{display:block;font-size:11px;color:var(--muted,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .wfd-player{padding:12px 14px;border-top:1px solid var(--surface,#333);background:var(--bg,#141218);display:flex;flex-direction:column;gap:8px}
      .wfd-now{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .wfd-pbtns{display:flex;align-items:center;justify-content:center;gap:10px}
      .wfd-play{width:38px;height:38px;border-radius:999px;border:0;background:var(--primary,#d0bcff);color:var(--on-primary,#381e72);display:grid;place-items:center;cursor:pointer}
      .wfd-seek{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted,#aaa)}
      .wfd-seek input{flex:1;accent-color:var(--primary,#d0bcff)}
    `;
    document.head.appendChild(st);
  }

  function currentList() {
    if (activePlaylistId) {
      const pl = playlists.find(p => p.id === activePlaylistId);
      return pl ? (pl.tracks || []) : [];
    }
    const q = (document.getElementById("wfdSearch")?.value || "").trim().toLowerCase();
    const match = t => !q || `${t.title} ${t.artist}`.toLowerCase().includes(q);
    const wt = webtokTracks.filter(match);
    const disc = discoverTracks.filter(match);
    if (activeSource === "webtok") return wt;
    if (activeSource === "discover") return disc;
    return [...wt, ...disc];
  }

  function renderList() {
    const box = document.getElementById("wfdList");
    if (!box) return;
    const list = currentList();
    if (!list.length) {
      box.innerHTML = `<div style="padding:20px;text-align:center;font-size:12px;color:var(--muted,#aaa)">No tracks found. Try another search or genre!</div>`;
      return;
    }
    const now = queue[queueIdx];
    box.innerHTML = "";
    list.forEach((t, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wfd-trk" + (now && now.audio_url === t.audio_url ? " playing" : "");
      b.innerHTML = `
        <div class="wfd-cov" style="${t.cover_url ? `background-image:url(${esc(t.cover_url)})` : ""}">${t.cover_url ? "" : `<span class="ms" style="font-size:18px;color:var(--primary)">${t.source === "webtok" ? "graphic_eq" : "music_note"}</span>`}</div>
        <div class="wfd-meta">
          <b>${esc(t.title)}</b>
          <small>${esc(t.artist)} · ${t.source === "webtok" ? "Web Tok" : (t.provider || "Discover")}</small>
        </div>
        <span class="ms" style="font-size:20px">${now && now.audio_url === t.audio_url && !audio.paused ? "pause" : "play_arrow"}</span>`;
      b.onclick = () => {
        if (now && now.audio_url === t.audio_url) {
          if (audio.paused) audio.play().catch(() => {}); else audio.pause();
          updatePlayer();
        } else {
          queue = [...list];
          queueIdx = idx;
          audio.src = t.audio_url;
          audio.play().catch(() => {});
          updatePlayer();
        }
      };
      box.appendChild(b);
    });
  }

  function updatePlayer() {
    const t = queue[queueIdx];
    const ttl = document.getElementById("wfdNowTitle");
    const art = document.getElementById("wfdNowArt");
    const playBtn = document.getElementById("wfdPlay");
    if (ttl) ttl.textContent = t ? t.title : "Nothing playing";
    if (art) art.textContent = t ? t.artist : "Pick a track below";
    if (playBtn) playBtn.innerHTML = `<span class="ms">${audio.paused ? "play_arrow" : "pause"}</span>`;
    renderList();
  }

  async function loadData(q = "") {
    try {
      const [sRes, dRes, pRes] = await Promise.all([
        fetch("/api/sounds").then(r => r.json()).catch(() => ({})),
        fetch("/api/webify/discover" + (q ? "?q=" + encodeURIComponent(q) : "")).then(r => r.json()).catch(() => ({})),
        fetch("/api/webify/playlists").then(r => r.json()).catch(() => ({}))
      ]);
      webtokTracks = (Array.isArray(sRes?.data) ? sRes.data : []).map(s => ({
        id: s.id, source: "webtok", title: s.title,
        artist: s.artist && s.artist !== "Original sound" ? s.artist : `@${s.username || "user"}`,
        audio_url: s.audio_url, cover_url: null
      }));
      discoverTracks = Array.isArray(dRes?.data) ? dRes.data : [];
      playlists = Array.isArray(pRes?.data) ? pRes.data : [];

      const sel = document.getElementById("wfdPlSel");
      if (sel) {
        const cur = sel.value;
        sel.innerHTML = `<option value="">Browse All Tracks</option>` + playlists.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${(p.tracks || []).length})</option>`).join("");
        sel.value = cur;
      }
      renderList();
    } catch {}
  }

  function setDockOpen(open) {
    const dock = document.getElementById("wt-wf-dock");
    const tab = document.getElementById("wt-wf-tab");
    if (!dock || !tab) return;
    dock.classList.toggle("open", open);
    tab.style.display = open ? "none" : "flex";
    try { localStorage.setItem(DOCK_KEY, open ? "1" : "0"); } catch {}
    if (open && !loadedOnce) { loadedOnce = true; loadData(); }
  }

  window.wtToggleWebifyDock = force => {
    const dock = document.getElementById("wt-wf-dock");
    const next = typeof force === "boolean" ? force : !(dock && dock.classList.contains("open"));
    setDockOpen(next);
  };

  function init() {
    ensureStyles();
    const tab = document.createElement("button");
    tab.id = "wt-wf-tab";
    tab.type = "button";
    tab.title = "Open Webify side player";
    tab.innerHTML = `<span class="ms" style="font-size:18px;color:var(--primary)">music_note</span><span>Webify</span>`;
    tab.onclick = () => setDockOpen(true);

    const dock = document.createElement("aside");
    dock.id = "wt-wf-dock";
    dock.innerHTML = `
      <div class="wfd-top">
        <b><span class="ms" style="color:var(--primary)">music_note</span>Webify</b>
        <div class="wfd-top-acts">
          <a class="wfd-ic" href="/webify" title="Open full Webify"><span class="ms" style="font-size:18px">open_in_new</span></a>
          <button type="button" class="wfd-ic" id="wfdClose" title="Hide side dock"><span class="ms" style="font-size:20px">chevron_right</span></button>
        </div>
      </div>
      <div class="wfd-ctrl-pad">
        <form class="wfd-srch" id="wfdSrchForm">
          <input id="wfdSearch" placeholder="Search Web Tok or music…">
          <button type="submit" class="wfd-ic" title="Search"><span class="ms" style="font-size:18px">search</span></button>
        </form>
        <div class="wfd-pills" id="wfdSrcPills">
          <button type="button" class="wfd-pill on" data-src="both">Both</button>
          <button type="button" class="wfd-pill" data-src="webtok">Web Tok</button>
          <button type="button" class="wfd-pill" data-src="discover">Discover</button>
          <button type="button" class="wfd-pill" data-genre="hip hop">Hip-Hop</button>
          <button type="button" class="wfd-pill" data-genre="lofi chill">Lo-Fi</button>
          <button type="button" class="wfd-pill" data-genre="pop hits">Pop</button>
        </div>
        <select class="wfd-sel" id="wfdPlSel"><option value="">Browse All Tracks</option></select>
      </div>
      <div class="wfd-list" id="wfdList"></div>
      <div class="wfd-player">
        <div class="wfd-now">
          <div class="wfd-meta"><b id="wfdNowTitle">Nothing playing</b><small id="wfdNowArt">Pick a track below</small></div>
          <input type="range" id="wfdVol" min="0" max="1" step="0.05" value="0.85" style="width:64px;accent-color:var(--primary)">
        </div>
        <div class="wfd-pbtns">
          <button type="button" class="wfd-ic" id="wfdPrev"><span class="ms">skip_previous</span></button>
          <button type="button" class="wfd-play" id="wfdPlay"><span class="ms">play_arrow</span></button>
          <button type="button" class="wfd-ic" id="wfdNext"><span class="ms">skip_next</span></button>
        </div>
        <div class="wfd-seek">
          <input type="range" id="wfdSeek" min="0" max="100" value="0">
        </div>
      </div>`;

    document.body.append(tab, dock);

    document.getElementById("wfdClose").onclick = () => setDockOpen(false);
    document.getElementById("wfdSrchForm").onsubmit = e => {
      e.preventDefault();
      activePlaylistId = "";
      document.getElementById("wfdPlSel").value = "";
      loadData(document.getElementById("wfdSearch").value.trim());
    };
    document.getElementById("wfdSearch").oninput = () => { if (!activePlaylistId) renderList(); };
    document.getElementById("wfdPlSel").onchange = e => { activePlaylistId = e.target.value; renderList(); };
    document.getElementById("wfdSrcPills").onclick = e => {
      const srcBtn = e.target.closest("[data-src]");
      if (srcBtn) {
        activeSource = srcBtn.dataset.src;
        activePlaylistId = "";
        document.getElementById("wfdPlSel").value = "";
        document.querySelectorAll("#wfdSrcPills [data-src]").forEach(b => b.classList.toggle("on", b === srcBtn));
        renderList();
        return;
      }
      const genBtn = e.target.closest("[data-genre]");
      if (genBtn) {
        activeSource = "discover";
        activePlaylistId = "";
        document.getElementById("wfdPlSel").value = "";
        document.getElementById("wfdSearch").value = genBtn.dataset.genre;
        document.querySelectorAll("#wfdSrcPills [data-src]").forEach(b => b.classList.toggle("on", b.dataset.src === "discover"));
        loadData(genBtn.dataset.genre);
      }
    };

    document.getElementById("wfdPlay").onclick = () => {
      if (!queue.length) return;
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
      updatePlayer();
    };
    const step = dir => {
      if (!queue.length) return;
      queueIdx = (queueIdx + dir + queue.length) % queue.length;
      audio.src = queue[queueIdx].audio_url;
      audio.play().catch(() => {});
      updatePlayer();
    };
    document.getElementById("wfdPrev").onclick = () => step(-1);
    document.getElementById("wfdNext").onclick = () => step(1);
    audio.addEventListener("ended", () => step(1));
    audio.addEventListener("timeupdate", () => {
      const s = document.getElementById("wfdSeek");
      if (s && audio.duration > 0) s.value = String((audio.currentTime / audio.duration) * 100);
    });
    document.getElementById("wfdSeek").oninput = e => {
      if (audio.duration > 0) audio.currentTime = (Number(e.target.value) / 100) * audio.duration;
    };
    document.getElementById("wfdVol").oninput = e => { audio.volume = Number(e.target.value); };

    try {
      if (localStorage.getItem(DOCK_KEY) === "1") setDockOpen(true);
    } catch {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
