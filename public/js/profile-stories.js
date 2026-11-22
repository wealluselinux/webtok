/* Profile page: 24-hour Stories strip (moved from main feed to user profile) */
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
    #wt-story-dlg{border:0;border-radius:var(--r-xl,32px);padding:22px;width:min(94vw,420px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 16px 48px #0005}
    #wt-story-dlg::backdrop{background:#0007;backdrop-filter:blur(4px)}
  `;
  document.head.appendChild(st);

  let vDlg = document.getElementById("wt-story-dlg");
  if (!vDlg) {
    vDlg = document.createElement("dialog");
    vDlg.id = "wt-story-dlg";
    vDlg.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px">
        <b id="stViewerUser">Story</b>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="btn sm hidden" id="stViewerDel" style="color:var(--bad)"><span class="ms" style="font-size:16px">delete</span>Delete</button>
          <button type="button" class="btn icon" aria-label="Close" onclick="this.closest('dialog').close()"><span class="ms">close</span></button>
        </div>
      </div>
      <div id="stViewerBody" style="border-radius:24px;overflow:hidden;background:#000;max-height:60dvh;display:grid;place-items:center"></div>
      <div id="stViewerCap" style="margin-top:10px;font-size:13px;color:var(--muted)"></div>
    `;
    document.body.appendChild(vDlg);
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

      rows.forEach((story, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "st-pill";
        const init = (story.display_name || story.username || profile?.username || "U")[0].toUpperCase();
        const thumb = story.media_type === "image" ? story.media_url : (story.avatar_url || profile?.avatar_url || "");
        const lbl = story.caption ? story.caption : `Story ${idx + 1}`;
        b.innerHTML = `<div class="st-ring"><div class="st-in" style="${thumb ? `background-image:url(${thumb})` : ""}">${thumb ? "" : init}</div></div><span class="st-lbl">${escapeHtml(lbl)}</span>`;
        b.onclick = () => {
          document.getElementById("stViewerUser").textContent = "@" + (story.username || profile?.username || "user");
          document.getElementById("stViewerCap").textContent = story.caption || "";
          document.getElementById("stViewerBody").innerHTML = story.media_type === "video"
            ? `<video src="${story.media_url}" controls autoplay playsinline style="max-height:58dvh;max-width:100%"></video>`
            : `<img src="${story.media_url}" style="max-height:58dvh;max-width:100%;object-fit:contain">`;

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
          vDlg.showModal();
        };
        sBar.appendChild(b);
      });
    } catch {}
  };
})();
