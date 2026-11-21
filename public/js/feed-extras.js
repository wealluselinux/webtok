/* Global User Search + Sounds Link + 24h Stories Strip on Feed */
(function initExtrasBar() {
  const page = document.body.dataset.page || "";
  if (page !== "scroll" && page !== "home") return;

  const M3_COOKIE_7 = "polygon(94.8% 50.0%,97.1% 53.5%,98.4% 57.3%,98.4% 61.0%,96.8% 64.4%,93.9% 67.2%,90.4% 69.4%,86.7% 71.2%,83.6% 72.9%,81.3% 74.9%,79.8% 77.6%,78.8% 81.1%,77.9% 85.0%,76.6% 89.0%,74.5% 92.4%,71.5% 94.7%,67.9% 95.6%,63.9% 95.1%,60.0% 93.7%,56.3% 91.9%,53.0% 90.5%,50.0% 90.0%,47.0% 90.5%,43.7% 91.9%,40.0% 93.7%,36.1% 95.1%,32.1% 95.6%,28.5% 94.7%,25.5% 92.4%,23.4% 89.0%,22.1% 85.0%,21.2% 81.1%,20.2% 77.6%,18.7% 74.9%,16.4% 72.9%,13.3% 71.2%,9.6% 69.4%,6.1% 67.2%,3.2% 64.4%,1.6% 61.0%,1.6% 57.3%,2.9% 53.5%,5.2% 50.0%,7.7% 46.8%,9.8% 43.9%,11.0% 41.1%,11.2% 38.0%,10.5% 34.5%,9.6% 30.6%,9.1% 26.4%,9.5% 22.4%,11.2% 19.1%,14.1% 16.7%,17.9% 15.4%,22.1% 15.0%,26.1% 15.0%,29.7% 14.8%,32.6% 14.0%,35.2% 12.2%,37.5% 9.5%,40.0% 6.3%,43.0% 3.3%,46.3% 1.2%,50.0% 0.4%,53.7% 1.2%,57.0% 3.3%,60.0% 6.3%,62.5% 9.5%,64.8% 12.2%,67.4% 14.0%,70.3% 14.8%,73.9% 15.0%,77.9% 15.0%,82.1% 15.4%,85.9% 16.7%,88.8% 19.1%,90.5% 22.4%,90.9% 26.4%,90.4% 30.6%,89.5% 34.5%,88.8% 38.0%,89.0% 41.1%,90.2% 43.9%,92.3% 46.8%)";

  const style = document.createElement("style");
  style.textContent = `
    #wt-top-tools{position:fixed;top:14px;right:14px;z-index:25;display:flex;gap:8px;align-items:center}
    .wt-pill{padding:9px 15px;border-radius:999px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;box-shadow:0 4px 16px #0002;transition:transform .15s}
    .wt-pill:hover{transform:translateY(-1px)}
    #wt-stories-bar{position:fixed;top:60px;left:calc(var(--sbw, 0px) + 14px);right:14px;z-index:18;display:flex;gap:10px;overflow-x:auto;padding:4px 2px;scrollbar-width:none;pointer-events:none}
    #wt-stories-bar>*{pointer-events:auto}
    #wt-stories-bar::-webkit-scrollbar{display:none}
    .st-pill{display:flex;flex-direction:column;align-items:center;gap:4px;background:none;border:0;color:var(--text);cursor:pointer;flex:none;width:58px}
    .st-ring{width:50px;height:50px;clip-path:${M3_COOKIE_7};padding:3px;background:linear-gradient(135deg,var(--primary),var(--accent));display:grid;place-items:center;filter:drop-shadow(0 4px 10px #0003)}
    .st-ring.add{background:var(--card)}
    .st-in{width:100%;height:100%;clip-path:${M3_COOKIE_7};background:var(--surface) center/cover;display:grid;place-items:center;font-weight:700;font-size:16px;color:var(--primary)}
    .st-lbl{font-size:11px;font-weight:600;max-width:58px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px var(--bg)}
    #wt-search-dlg,#wt-story-dlg{border:0;border-radius:32px;padding:22px;width:min(94vw,420px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 16px 48px #0005}
    #wt-search-dlg::backdrop,#wt-story-dlg::backdrop{background:#0007;backdrop-filter:blur(4px)}
    .wt-sres{max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:10px}
    .wt-srow{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:18px;background:var(--surface);text-decoration:none;color:inherit}
    .wt-srow:hover{background:var(--card)}
  `;
  document.head.appendChild(style);

  const tools = document.createElement("div");
  tools.id = "wt-top-tools";
  tools.innerHTML = `<button type="button" class="wt-pill" id="wtSearchBtn"><span class="ms" style="font-size:18px">search</span>Users</button>
    <a class="wt-pill" href="/sounds"><span class="ms" style="font-size:18px">music_note</span>Sounds</a>`;
  document.body.appendChild(tools);

  const sBar = document.createElement("div");
  sBar.id = "wt-stories-bar";
  document.body.appendChild(sBar);

  const sDlg = document.createElement("dialog");
  sDlg.id = "wt-search-dlg";
  sDlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Find Users</h3><button type="button" class="wt-pill" onclick="this.closest('dialog').close()"><span class="ms" style="font-size:18px">close</span></button></div>
    <input id="wtSearchIn" type="text" placeholder="Search @username or name…" style="width:100%;padding:12px 16px;border-radius:999px;border:0;background:var(--surface);color:var(--text);font:inherit;outline:0">
    <div class="wt-sres" id="wtSearchRes"></div>`;
  document.body.appendChild(sDlg);

  const vDlg = document.createElement("dialog");
  vDlg.id = "wt-story-dlg";
  vDlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b id="stViewerUser">Story</b><button type="button" class="wt-pill" onclick="this.closest('dialog').close()"><span class="ms" style="font-size:18px">close</span></button></div>
    <div id="stViewerBody" style="border-radius:24px;overflow:hidden;background:#000;max-height:60dvh;display:grid;place-items:center"></div>
    <div id="stViewerCap" style="margin-top:10px;font-size:13px;color:var(--muted)"></div>`;
  document.body.appendChild(vDlg);

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
        a.innerHTML = `<div class="st-in" style="width:38px;height:38px;flex:none;${u.avatar_url ? `background-image:url(${u.avatar_url})` : ""}">${u.avatar_url ? "" : init}</div>
          <div><div style="font-weight:700;font-size:14px">${(u.display_name || u.username).replace(/</g,"&lt;")}</div><div style="font-size:12px;color:var(--muted)">@${u.username.replace(/</g,"&lt;")}</div></div>`;
        resEl.appendChild(a);
      });
    }, 220);
  };

  async function loadStories() {
    try {
      const r = await fetch("/api/stories");
      const j = await r.json();
      const rows = j.data || [];
      sBar.innerHTML = "";

      const addBtn = document.createElement("button");
      addBtn.type = "button"; addBtn.className = "st-pill";
      addBtn.innerHTML = `<div class="st-ring add"><div class="st-in"><span class="ms">add</span></div></div><span class="st-lbl">Your story</span>`;
      const fin = document.createElement("input");
      fin.type = "file"; fin.accept = "image/*,video/mp4,video/webm,video/quicktime"; fin.hidden = true;
      addBtn.onclick = () => fin.click();
      fin.onchange = async e => {
        const f = e.target.files?.[0]; if (!f) return;
        const { data } = await sb.auth.getSession();
        const sess = data?.session;
        if (!sess) { location.href = "/login"; return; }
        const isVid = f.type.startsWith("video/");
        const bucket = isVid ? "videos" : "avatars";
        const ext = isVid ? "mp4" : "jpg";
        const path = `${sess.user.id}/story-${Date.now()}.${ext}`;
        const up = await sb.storage.from(bucket).upload(path, f, { upsert: true, contentType: f.type });
        if (up?.error) { if (window.wtAlert) await wtAlert({ title: "Story upload failed", message: up.error.message || "Could not upload story" }); return; }
        const url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        const cap = window.wtPrompt ? await wtPrompt({ title: "Story caption", message: "Add an optional caption for your 24-hour story.", placeholder: "Write something…", confirmText: "Post story" }) : "";
        if (cap === null) return;
        await fetch("/api/stories", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token },
          body: JSON.stringify({ media_url: url, media_type: isVid ? "video" : "image", caption: cap })
        });
        loadStories();
      };
      sBar.appendChild(addBtn); sBar.appendChild(fin);

      rows.forEach(st => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "st-pill";
        const init = (st.display_name || st.username || "U")[0].toUpperCase();
        b.innerHTML = `<div class="st-ring"><div class="st-in" style="${st.avatar_url ? `background-image:url(${st.avatar_url})` : ""}">${st.avatar_url ? "" : init}</div></div><span class="st-lbl">@${(st.username || "user").replace(/</g,"&lt;")}</span>`;
        b.onclick = () => {
          document.getElementById("stViewerUser").textContent = "@" + (st.username || "user");
          document.getElementById("stViewerCap").textContent = st.caption || "";
          document.getElementById("stViewerBody").innerHTML = st.media_type === "video"
            ? `<video src="${st.media_url}" controls autoplay playsinline style="max-height:58dvh;max-width:100%"></video>`
            : `<img src="${st.media_url}" style="max-height:58dvh;max-width:100%;object-fit:contain">`;
          vDlg.showModal();
        };
        sBar.appendChild(b);
      });
    } catch {}
  }
  loadStories();
})();
