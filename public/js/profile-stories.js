/* Profile page: 24-hour Stories strip + Full-screen post-style Story Viewer */
(function initProfileStories() {
  const st = document.createElement("style");
  st.textContent = `
    #wt-profile-stories{background:var(--card);border-radius:var(--r-xl);padding:16px 20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 18px #0001}
    #wt-profile-stories.hidden{display:none}
    .st-head{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;color:var(--muted)}
    .st-strip{display:flex;gap:12px;overflow-x:auto;padding:4px 2px;scrollbar-width:none}
    .st-strip::-webkit-scrollbar{display:none}
    .st-pill{display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:0;color:var(--text);cursor:pointer;flex:none;width:64px}
    .st-ring{width:56px;height:56px;clip-path:var(--m3-cookie-7);padding:3px;background:linear-gradient(135deg,var(--primary),var(--accent));display:grid;place-items:center;filter:drop-shadow(0 4px 10px #0002);transition:transform .2s var(--spring)}
    .st-pill:hover .st-ring{transform:scale(1.06)}
    .st-ring.add{background:var(--surface)}
    .st-in{width:100%;height:100%;clip-path:var(--m3-cookie-7);background:var(--surface) center/cover;display:grid;place-items:center;font-weight:700;font-size:18px;color:var(--primary)}
    .st-lbl{font-size:11px;font-weight:600;max-width:64px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    /* Full-screen post-style story viewer */
    #wt-story-dlg{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:#000;color:#fff;overflow:hidden}
    #wt-story-dlg[open]{display:flex;flex-direction:column}
    .stv-progress{position:absolute;top:10px;left:12px;right:12px;z-index:20;display:flex;gap:4px}
    .stv-seg{flex:1;height:3px;border-radius:999px;background:rgba(255,255,255,.28);overflow:hidden}
    .stv-seg.done{background:#fff}
    .stv-seg.active{background:rgba(255,255,255,.92)}
    .stv-top{position:absolute;top:22px;left:14px;right:14px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:10px;pointer-events:none}
    .stv-top>*{pointer-events:auto}
    .stv-author{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.65)}
    .stv-av{width:38px;height:38px;clip-path:var(--m3-cookie-7);background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-weight:700;font-size:15px;background-size:cover;background-position:center;flex-shrink:0}
    .stv-meta{min-width:0}
    .stv-meta b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .stv-meta small{display:block;font-size:12px;opacity:.82}
    .stv-acts{display:flex;align-items:center;gap:6px}
    .stv-btn{border:0;border-radius:999px;background:rgba(0,0,0,.48);color:#fff;backdrop-filter:blur(8px);padding:8px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
    .stv-btn.ic{width:38px;height:38px;padding:0;justify-content:center}
    .stv-stage{position:relative;flex:1;width:100%;height:100%;display:grid;place-items:center;background:#000}
    .stv-stage img,.stv-stage video{width:100%;height:100%;object-fit:contain;max-height:100dvh;max-width:100vw}
    .stv-nav{position:absolute;top:76px;bottom:110px;width:24%;z-index:10;background:none;border:0;cursor:pointer;display:flex;align-items:center;padding:12px;color:rgba(255,255,255,.7);opacity:0;transition:opacity .15s}
    .stv-stage:hover .stv-nav{opacity:1}
    .stv-nav.prev{left:0;justify-content:flex-start}
    .stv-nav.next{right:0;justify-content:flex-end}
    .stv-bottom{position:absolute;left:0;right:0;bottom:0;z-index:20;padding:42px 20px 24px;background:linear-gradient(transparent,rgba(0,0,0,.84));pointer-events:none}
    .stv-cap{font-size:15px;line-height:1.4;max-width:680px;text-shadow:0 2px 8px rgba(0,0,0,.7)}
    .stv-sub{font-size:12px;opacity:.75;margin-top:6px}
  `;
  document.head.appendChild(st);

  let vDlg = document.getElementById("wt-story-dlg");
  if (!vDlg) {
    vDlg = document.createElement("dialog");
    vDlg.id = "wt-story-dlg";
    vDlg.innerHTML = `
      <div class="stv-progress" id="stViewerProg"></div>
      <div class="stv-top">
        <div class="stv-author">
          <div class="stv-av" id="stViewerAv"></div>
          <div class="stv-meta">
            <b id="stViewerUser">Story</b>
            <small id="stViewerTime"></small>
          </div>
        </div>
        <div class="stv-acts">
          <button type="button" class="stv-btn hidden" id="stViewerDel" style="background:rgba(198,40,40,.85)"><span class="ms" style="font-size:16px">delete</span>Delete</button>
          <button type="button" class="stv-btn ic" id="stViewerClose" aria-label="Close"><span class="ms">close</span></button>
        </div>
      </div>
      <div class="stv-stage">
        <button type="button" class="stv-nav prev" id="stViewerPrev" aria-label="Previous story"><span class="ms" style="font-size:32px">chevron_left</span></button>
        <div id="stViewerBody" style="width:100%;height:100%;display:grid;place-items:center"></div>
        <button type="button" class="stv-nav next" id="stViewerNext" aria-label="Next story"><span class="ms" style="font-size:32px">chevron_right</span></button>
      </div>
      <div class="stv-bottom">
        <div class="stv-cap" id="stViewerCap"></div>
        <div class="stv-sub" id="stViewerCount"></div>
      </div>
    `;
    document.body.appendChild(vDlg);
    document.getElementById("stViewerClose").onclick = () => vDlg.close();
    vDlg.addEventListener("close", () => {
      const vid = vDlg.querySelector("video");
      if (vid) vid.pause();
    });
  }

  function ensureSection() {
    let sec = document.getElementById("wt-profile-stories");
    if (sec) return sec;
    sec = document.createElement("section");
    sec.id = "wt-profile-stories";
    sec.className = "hidden";
    sec.innerHTML = `<div class="st-head"><span>Stories · 24h</span><span id="stCount"></span></div><div class="st-strip" id="wt-stories-bar"></div>`;
    const wrap = document.querySelector(".acct-wrap");
    const tabs = wrap?.querySelector(".tabs");
    if (wrap && tabs) wrap.insertBefore(sec, tabs);
    else if (wrap) wrap.appendChild(sec);
    return sec;
  }

  function relTime(iso) {
    const mins = Math.max(1, Math.floor((Date.now() - Date.parse(iso || Date.now())) / 60000));
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  window.loadProfileStories = async function () {
    if (!targetId) return;
    const sec = ensureSection();
    const sBar = document.getElementById("wt-stories-bar");
    const countEl = document.getElementById("stCount");
    if (!sBar) return;

    try {
      const r = await fetch("/api/stories");
      const j = await r.json();
      const rows = (j.data || []).filter(s => s.user_id === targetId);

      if (!isMe && !rows.length) {
        sec.classList.add("hidden");
        return;
      }

      sec.classList.remove("hidden");
      if (countEl) countEl.textContent = rows.length ? `${rows.length} active` : "";
      sBar.innerHTML = "";

      if (isMe) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "st-pill";
        addBtn.innerHTML = `<div class="st-ring add"><div class="st-in"><span class="ms">add</span></div></div><span class="st-lbl">Add story</span>`;
        const fin = document.createElement("input");
        fin.type = "file";
        fin.accept = "image/*,video/mp4,video/webm,video/quicktime";
        fin.hidden = true;
        addBtn.onclick = () => fin.click();
        fin.onchange = async e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const { data } = await sb.auth.getSession();
          const sess = data?.session;
          if (!sess) { location.href = "/login"; return; }
          const isVid = f.type.startsWith("video/");
          const bucket = isVid ? "videos" : "avatars";
          const ext = isVid ? "mp4" : "jpg";
          const path = `${sess.user.id}/story-${Date.now()}.${ext}`;
          const up = await sb.storage.from(bucket).upload(path, f, { upsert: true, contentType: f.type });
          if (up?.error) {
            if (window.wtAlert) await wtAlert({ title: "Story upload failed", message: up.error.message || "Could not upload story" });
            return;
          }
          const url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
          const cap = window.wtPrompt
            ? await wtPrompt({ title: "Story caption", message: "Add an optional caption for your 24-hour story.", placeholder: "Write something…", confirmText: "Post story" })
            : "";
          if (cap === null) return;
          await fetch("/api/stories", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token },
            body: JSON.stringify({ media_url: url, media_type: isVid ? "video" : "image", caption: cap })
          });
          window.loadProfileStories();
        };
        sBar.appendChild(addBtn);
        sBar.appendChild(fin);
      }

      function openStoryAt(startIdx) {
        let curIdx = Math.max(0, Math.min(startIdx, rows.length - 1));
        const render = () => {
          const story = rows[curIdx];
          if (!story) return;
          const uname = story.username || profile?.username || "user";
          const dname = story.display_name || profile?.display_name || ("@" + uname);
          const avUrl = story.avatar_url || profile?.avatar_url || "";
          const avEl = document.getElementById("stViewerAv");
          avEl.style.backgroundImage = avUrl ? `url(${avUrl})` : "";
          avEl.textContent = avUrl ? "" : (dname[0] || "U").toUpperCase();
          document.getElementById("stViewerUser").textContent = `${dname} (@${uname})`;
          document.getElementById("stViewerTime").textContent = relTime(story.created_at);
          document.getElementById("stViewerCap").textContent = story.caption || "";
          document.getElementById("stViewerCount").textContent = rows.length > 1 ? `Story ${curIdx + 1} of ${rows.length}` : "24-hour Story";
          document.getElementById("stViewerProg").innerHTML = rows.map((_, i) => `<div class="stv-seg ${i < curIdx ? "done" : i === curIdx ? "active" : ""}"></div>`).join("");
          document.getElementById("stViewerPrev").style.visibility = curIdx > 0 ? "visible" : "hidden";
          document.getElementById("stViewerNext").style.visibility = curIdx < rows.length - 1 ? "visible" : "hidden";

          const body = document.getElementById("stViewerBody");
          body.innerHTML = story.media_type === "video"
            ? `<video src="${story.media_url}" controls autoplay playsinline loop></video>`
            : `<img src="${story.media_url}" alt="Story">`;

          const delBtn = document.getElementById("stViewerDel");
          if (delBtn) {
            delBtn.classList.toggle("hidden", !isMe);
            delBtn.onclick = async () => {
              const ok = window.wtConfirm
                ? await wtConfirm({ title: "Delete story?", message: "Remove this 24-hour story?", danger: true, confirmText: "Delete" })
                : confirm("Delete this story?");
              if (!ok) return;
              const { data } = await sb.auth.getSession();
              const tok = data?.session?.access_token;
              if (!tok) return;
              await fetch(`/api/stories/${encodeURIComponent(story.id)}`, {
                method: "DELETE",
                headers: { Authorization: "Bearer " + tok }
              });
              vDlg.close();
              window.loadProfileStories();
            };
          }
        };
        document.getElementById("stViewerPrev").onclick = () => { if (curIdx > 0) { curIdx--; render(); } };
        document.getElementById("stViewerNext").onclick = () => { if (curIdx < rows.length - 1) { curIdx++; render(); } };
        render();
        vDlg.showModal();
      }

      rows.forEach((story, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "st-pill";
        const init = (story.display_name || story.username || profile?.username || "U")[0].toUpperCase();
        const thumb = story.media_type === "image" ? story.media_url : (story.avatar_url || profile?.avatar_url || "");
        const lbl = story.caption ? story.caption : `Story ${idx + 1}`;
        b.innerHTML = `<div class="st-ring"><div class="st-in" style="${thumb ? `background-image:url(${thumb})` : ""}">${thumb ? "" : init}</div></div><span class="st-lbl">${escapeHtml(lbl)}</span>`;
        b.onclick = () => openStoryAt(idx);
        sBar.appendChild(b);
      });
    } catch {}
  };
})();
