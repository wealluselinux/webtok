/* Webify: Spotify-style Music & Playlist Studio (Web Tok Sounds + Discover Music) */
(function () {
  const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const audio = new Audio();
  audio.volume = 0.85;

  let webtokTracks = [];
  let discoverTracks = [];
  let playlists = [];
  let activeSource = "both"; // both | webtok | discover
  let activePlaylistId = null; // null = browse mode
  let queue = [];
  let queueIdx = -1;
  let shuffleOn = false;
  let repeatOn = false;
  let myUid = null;
  let pendingAddTrack = null;

  async function getToken() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      myUid = session?.user?.id || null;
      return session?.access_token || null;
    } catch { return null; }
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function currentBrowseTracks() {
    const q = (document.getElementById("wfSearchInp")?.value || "").trim().toLowerCase();
    const matchQ = t => !q || `${t.title} ${t.artist} ${t.album || ""}`.toLowerCase().includes(q);
    const wt = webtokTracks.filter(matchQ);
    const disc = discoverTracks.filter(matchQ);
    if (activeSource === "webtok") return wt;
    if (activeSource === "discover") return disc;
    return [...wt, ...disc];
  }

  function renderPlaylists() {
    const box = document.getElementById("wfPlList");
    if (!box) return;
    if (!playlists.length) {
      box.innerHTML = `<div style="font-size:13px;color:var(--muted);padding:8px 4px">No playlists yet. Create one to get started!</div>`;
      return;
    }
    box.innerHTML = "";
    playlists.forEach(pl => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wf-pl-it" + (activePlaylistId === pl.id ? " on" : "");
      const count = (pl.tracks || []).length;
      const by = pl.user_id === myUid ? "Yours" : `@${pl.username || "user"}`;
      btn.innerHTML = `
        <span class="ms">queue_music</span>
        <div class="meta">
          <b>${esc(pl.name)}</b>
          <small>${count} track${count === 1 ? "" : "s"} · ${esc(by)}</small>
        </div>`;
      btn.onclick = () => {
        activePlaylistId = pl.id;
        renderPlaylists();
        renderTracks();
      };
      box.appendChild(btn);
    });
  }

  function renderTracks() {
    const box = document.getElementById("wfTrackList");
    const titleEl = document.getElementById("wfMainTitle");
    if (!box || !titleEl) return;

    let list = [];
    let activePl = null;
    if (activePlaylistId) {
      activePl = playlists.find(p => p.id === activePlaylistId);
      if (!activePl) { activePlaylistId = null; }
    }

    if (activePl) {
      list = activePl.tracks || [];
      const isMine = myUid && activePl.user_id === myUid;
      titleEl.innerHTML = `
        <span>${esc(activePl.name)} <small style="font-size:12px;font-weight:500;color:var(--muted)">(${list.length} tracks)</small></span>
        <span style="display:flex;gap:8px">
          ${list.length ? `<button type="button" class="btn sm primary" id="wfPlayPlBtn"><span class="ms" style="font-size:16px">play_arrow</span>Play All</button>` : ""}
          ${isMine ? `<button type="button" class="btn sm" id="wfDelPlBtn" style="color:var(--bad)">Delete</button>` : ""}
        </span>`;
      const playAllBtn = document.getElementById("wfPlayPlBtn");
      if (playAllBtn) playAllBtn.onclick = () => playFromList(list, 0);
      const delBtn = document.getElementById("wfDelPlBtn");
      if (delBtn) delBtn.onclick = () => deletePlaylist(activePl.id);
    } else {
      list = currentBrowseTracks();
      const label = activeSource === "webtok" ? "Web Tok Sounds" : activeSource === "discover" ? "Discover Music" : "All Tracks (Web Tok + Discover)";
      titleEl.innerHTML = `<span>${label}</span>${list.length ? `<button type="button" class="btn sm primary" id="wfPlayAllBtn"><span class="ms" style="font-size:16px">play_arrow</span>Play All</button>` : ""}`;
      const playAllBtn = document.getElementById("wfPlayAllBtn");
      if (playAllBtn) playAllBtn.onclick = () => playFromList(list, 0);
    }

    if (!list.length) {
      box.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:14px">${activePl ? "This playlist has no tracks yet. Browse tracks and click + to add some!" : "No tracks found."}</div>`;
      return;
    }

    const nowTrack = queue[queueIdx];
    box.innerHTML = "";
    list.forEach((t, idx) => {
      const isPlaying = nowTrack && nowTrack.audio_url === t.audio_url && !audio.paused;
      const row = document.createElement("div");
      row.className = "wf-trk" + (nowTrack && nowTrack.audio_url === t.audio_url ? " playing" : "");
      row.innerHTML = `
        <div class="wf-cov" style="${t.cover_url ? `background-image:url(${esc(t.cover_url)})` : ""}">${t.cover_url ? "" : `<span class="ms" style="color:var(--primary)">${t.source === "webtok" ? "graphic_eq" : "music_note"}</span>`}</div>
        <div class="wf-tmeta">
          <b>${esc(t.title)}</b>
          <small>${esc(t.artist)}${t.album ? " · " + esc(t.album) : ""}</small>
        </div>
        <span class="wf-badge ${t.source === "discover" ? "disc" : ""}">${t.source === "webtok" ? "Web Tok" : "Discover"}</span>
        <div class="wf-tacts">
          <button type="button" class="btn icon wf-play-one" title="${isPlaying ? "Pause" : "Play"}"><span class="ms">${isPlaying ? "pause" : "play_arrow"}</span></button>
          ${activePl && myUid && activePl.user_id === myUid
            ? `<button type="button" class="btn icon wf-rem-one" title="Remove from playlist"><span class="ms" style="color:var(--bad)">delete</span></button>`
            : `<button type="button" class="btn icon wf-add-one" title="Add to playlist"><span class="ms">playlist_add</span></button>`}
        </div>`;
      row.querySelector(".wf-play-one").onclick = () => {
        if (nowTrack && nowTrack.audio_url === t.audio_url) togglePlay();
        else playFromList(list, idx);
      };
      const addBtn = row.querySelector(".wf-add-one");
      if (addBtn) addBtn.onclick = () => openAddToPlaylist(t);
      const remBtn = row.querySelector(".wf-rem-one");
      if (remBtn) remBtn.onclick = () => removeTrackFromPlaylist(activePl.id, t.id);
      box.appendChild(row);
    });
  }

  function updatePlayerUI() {
    const t = queue[queueIdx];
    document.getElementById("wfNowTitle").textContent = t ? t.title : "Nothing playing";
    document.getElementById("wfNowArtist").textContent = t ? `${t.artist} · ${t.source === "webtok" ? "Web Tok" : "Discover"}` : "Pick a track or playlist";
    const cov = document.getElementById("wfNowCov");
    cov.style.backgroundImage = t?.cover_url ? `url(${t.cover_url})` : "";
    cov.innerHTML = t?.cover_url ? "" : '<span class="ms">music_note</span>';
    document.getElementById("wfBtnPlay").innerHTML = `<span class="ms">${audio.paused ? "play_arrow" : "pause"}</span>`;
    document.getElementById("wfBtnShuf").style.color = shuffleOn ? "var(--primary)" : "";
    document.getElementById("wfBtnRep").style.color = repeatOn ? "var(--primary)" : "";
    renderTracks();
  }

  function playFromList(list, idx) {
    if (!list.length) return;
    queue = [...list];
    queueIdx = Math.max(0, Math.min(idx, queue.length - 1));
    const t = queue[queueIdx];
    audio.src = t.audio_url;
    audio.play().catch(() => {});
    updatePlayerUI();
  }

  function togglePlay() {
    if (!queue.length) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    updatePlayerUI();
  }

  function playNext() {
    if (!queue.length) return;
    if (repeatOn) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    if (shuffleOn && queue.length > 1) {
      let n = queueIdx;
      while (n === queueIdx) n = Math.floor(Math.random() * queue.length);
      queueIdx = n;
    } else {
      queueIdx = (queueIdx + 1) % queue.length;
    }
    audio.src = queue[queueIdx].audio_url;
    audio.play().catch(() => {});
    updatePlayerUI();
  }

  function playPrev() {
    if (!queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    queueIdx = (queueIdx - 1 + queue.length) % queue.length;
    audio.src = queue[queueIdx].audio_url;
    audio.play().catch(() => {});
    updatePlayerUI();
  }

  async function loadWebTokSounds() {
    try {
      const r = await fetch("/api/sounds");
      const j = await r.json();
      webtokTracks = (Array.isArray(j?.data) ? j.data : []).map(s => ({
        id: s.id,
        source: "webtok",
        sound_id: s.id,
        title: s.title,
        artist: s.artist && s.artist !== "Original sound" ? s.artist : `@${s.username || "user"}`,
        album: "Web Tok Sounds",
        audio_url: s.audio_url,
        cover_url: null
      }));
    } catch { webtokTracks = []; }
  }

  async function loadDiscover(q = "") {
    try {
      const r = await fetch("/api/webify/discover" + (q ? "?q=" + encodeURIComponent(q) : ""));
      const j = await r.json();
      discoverTracks = Array.isArray(j?.data) ? j.data : [];
    } catch { discoverTracks = []; }
  }

  async function loadPlaylists() {
    const tok = await getToken();
    try {
      const r = await fetch("/api/webify/playlists", tok ? { headers: { Authorization: "Bearer " + tok } } : {});
      const j = await r.json();
      playlists = Array.isArray(j?.data) ? j.data : [];
    } catch { playlists = []; }
    renderPlaylists();
  }

  async function deletePlaylist(pid) {
    const tok = await getToken();
    if (!tok) return;
    await fetch("/api/webify/playlists/" + encodeURIComponent(pid), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + tok }
    });
    if (activePlaylistId === pid) activePlaylistId = null;
    await loadPlaylists();
    renderTracks();
  }

  async function removeTrackFromPlaylist(pid, tid) {
    const tok = await getToken();
    if (!tok) return;
    await fetch(`/api/webify/playlists/${encodeURIComponent(pid)}/tracks/${encodeURIComponent(tid)}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + tok }
    });
    await loadPlaylists();
    renderTracks();
  }

  async function openAddToPlaylist(track) {
    const tok = await getToken();
    if (!tok) { alert("Sign in to save tracks to playlists."); return; }
    pendingAddTrack = track;
    document.getElementById("wfAddTrackLabel").textContent = `${track.title} — ${track.artist}`;
    const box = document.getElementById("wfAddPlChoices");
    const mine = playlists.filter(p => p.user_id === myUid);
    if (!mine.length) {
      box.innerHTML = `<div style="font-size:13px;color:var(--muted)">You don't have any playlists yet. Create one first!</div>`;
    } else {
      box.innerHTML = "";
      mine.forEach(pl => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wf-pl-it";
        b.innerHTML = `<span class="ms">playlist_add</span><div class="meta"><b>${esc(pl.name)}</b><small>${(pl.tracks || []).length} tracks</small></div>`;
        b.onclick = async () => {
          const r = await fetch(`/api/webify/playlists/${encodeURIComponent(pl.id)}/tracks`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
            body: JSON.stringify(pendingAddTrack)
          });
          if (r.ok) {
            document.getElementById("wfAddDlg").close();
            await loadPlaylists();
            renderTracks();
          }
        };
        box.appendChild(b);
      });
    }
    document.getElementById("wfAddDlg").showModal();
  }

  function wireEvents() {
    audio.addEventListener("ended", playNext);
    audio.addEventListener("timeupdate", () => {
      document.getElementById("wfTimeCur").textContent = fmtTime(audio.currentTime);
      document.getElementById("wfTimeDur").textContent = fmtTime(audio.duration);
      const seek = document.getElementById("wfSeek");
      if (audio.duration > 0) seek.value = String((audio.currentTime / audio.duration) * 100);
    });
    document.getElementById("wfSeek").oninput = e => {
      if (audio.duration > 0) audio.currentTime = (Number(e.target.value) / 100) * audio.duration;
    };
    document.getElementById("wfVol").oninput = e => { audio.volume = Number(e.target.value); };
    document.getElementById("wfBtnPlay").onclick = togglePlay;
    document.getElementById("wfBtnNext").onclick = playNext;
    document.getElementById("wfBtnPrev").onclick = playPrev;
    document.getElementById("wfBtnShuf").onclick = () => { shuffleOn = !shuffleOn; updatePlayerUI(); };
    document.getElementById("wfBtnRep").onclick = () => { repeatOn = !repeatOn; updatePlayerUI(); };

    document.getElementById("wfSourcePills").onclick = e => {
      const p = e.target.closest(".wf-pill[data-src]");
      if (!p) return;
      activeSource = p.dataset.src;
      activePlaylistId = null;
      document.querySelectorAll("#wfSourcePills .wf-pill").forEach(b => b.classList.toggle("on", b === p));
      renderPlaylists();
      renderTracks();
    };
    document.getElementById("wfShowBrowse").onclick = () => {
      activePlaylistId = null;
      renderPlaylists();
      renderTracks();
    };
    document.getElementById("wfSearchForm").onsubmit = async e => {
      e.preventDefault();
      activePlaylistId = null;
      await loadDiscover(document.getElementById("wfSearchInp").value.trim());
      renderPlaylists();
      renderTracks();
    };
    document.getElementById("wfSearchInp").oninput = () => {
      if (!activePlaylistId) renderTracks();
    };

    document.getElementById("wfNewPlBtn").onclick = async () => {
      if (!(await getToken())) { alert("Sign in to create playlists."); return; }
      document.getElementById("wfPlDlg").showModal();
    };
    document.getElementById("wfPlCancel").onclick = () => document.getElementById("wfPlDlg").close();
    document.getElementById("wfAddCancel").onclick = () => document.getElementById("wfAddDlg").close();
    document.getElementById("wfPlForm").onsubmit = async e => {
      e.preventDefault();
      const tok = await getToken();
      if (!tok) return;
      const name = document.getElementById("wfPlName").value.trim();
      const description = document.getElementById("wfPlDesc").value.trim();
      const is_public = document.getElementById("wfPlPub").checked;
      const r = await fetch("/api/webify/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
        body: JSON.stringify({ name, description, is_public })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.data?.id) {
        document.getElementById("wfPlForm").reset();
        document.getElementById("wfPlDlg").close();
        activePlaylistId = j.data.id;
        await loadPlaylists();
        renderTracks();
      }
    };
  }

  async function init() {
    wireEvents();
    await Promise.all([loadWebTokSounds(), loadDiscover(), loadPlaylists()]);
    renderTracks();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
