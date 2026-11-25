/* Video feed: loading, slides, M3 shaped buttons, left mute button, seek bar, attached sounds, share to Web Tok AI / friends / groups */
function getFeedPrefs() { try { return JSON.parse(localStorage.getItem("wt_theme") || "{}"); } catch { return {}; } }
let obs, muted = getFeedPrefs().vidStartUnmuted === true ? false : true;
const AI_BOT_ID = "00000000-0000-0000-0000-000000000002";

function fmtVidTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

async function listVideos() {
  if (!sb) return [];
  let { data: vids, error } = await sb
    .from("videos")
    .select("id, user_id, title, video_url, orientation, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    const res = await sb
      .from("videos")
      .select("id, user_id, title, video_url, created_at")
      .order("created_at", { ascending: false });
    if (res.error) throw res.error;
    vids = res.data;
  }
  if (!vids || !vids.length) return [];

  const userIds = [...new Set(vids.map(v => v.user_id))];
  const vidIds = vids.map(v => v.id);

  const [profRes, likeRes, cmtRes, soundRes] = await Promise.all([
    sb.from("profiles").select("id, username, display_name").in("id", userIds),
    sb.from("likes").select("video_id, user_id").in("video_id", vidIds),
    sb.from("comments").select("video_id").in("video_id", vidIds),
    fetch("/api/video-sounds?ids=" + encodeURIComponent(vidIds.slice(0, 50).join(",")))
      .then(r => r.json())
      .catch(() => ({ data: {} }))
  ]);

  const profMap = Object.fromEntries((profRes.data || []).map(p => [p.id, p]));
  const soundMap = soundRes?.data || {};
  const likeCounts = {}, likedSet = new Set(), cmtCounts = {};
  (likeRes.data || []).forEach(l => {
    likeCounts[l.video_id] = (likeCounts[l.video_id] || 0) + 1;
    if (user && l.user_id === user.id) likedSet.add(l.video_id);
  });
  (cmtRes.data || []).forEach(c => {
    cmtCounts[c.video_id] = (cmtCounts[c.video_id] || 0) + 1;
  });

  return filterMode(vids.map(v => ({
    id: v.id,
    user_id: v.user_id,
    name: v.title,
    src: v.video_url,
    orientation: v.orientation || null,
    hashtags: v.hashtags || [],
    sound: soundMap[v.id] || null,
    username: profMap[v.user_id]?.username || null,
    likesCount: likeCounts[v.id] || 0,
    commentsCount: cmtCounts[v.id] || 0,
    likedByMe: likedSet.has(v.id)
  })));
}

function toggleFeedSound() {
  muted = !muted;
  document.querySelectorAll(".slide").forEach(sl => {
    const vid = sl.querySelector("video");
    const snd = sl.querySelector(".wt-vid-snd");
    if (snd) {
      if (vid) vid.muted = true;
      snd.muted = muted;
      if (!muted && vid && !vid.paused) snd.play().catch(() => {});
    } else if (vid) {
      vid.muted = muted;
    }
  });
  document.querySelectorAll('[data-a="sound"]').forEach(btn => {
    btn.querySelector("span").textContent = muted ? "volume_off" : "volume_up";
    btn.querySelector("small").textContent = muted ? "Muted" : "Sound";
  });
}

async function openShareVideo(v) {
  requireLogin(async () => {
    let dlg = document.getElementById("wt-share-dlg");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "wt-share-dlg";
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = `<div class="dlg-head"><h2>Share video</h2><button type="button" class="btn icon" aria-label="Close" onclick="document.getElementById('wt-share-dlg').close()"><span class="ms">close</span></button></div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(v.name || "Web Tok")}</div>
      <input type="text" id="shNote" placeholder="Add a message or ask Web Tok AI…" maxlength="200">
      <div class="sh-list" id="shList"><div style="color:var(--muted);padding:12px;text-align:center">Loading…</div></div>
      <div class="row" style="justify-content:space-between;margin-top:14px">
        <button type="button" class="btn sm" id="shCopy"><span class="ms" style="font-size:18px">link</span>Copy link</button>
        <button type="button" class="btn sm" onclick="document.getElementById('wt-share-dlg').close()">Done</button>
      </div>`;
    dlg.showModal();

    $("shCopy").onclick = async () => {
      const link = `${location.origin}/scroll#v=${encodeURIComponent(v.id)}`;
      try { await navigator.clipboard.writeText(link); $("shCopy").innerHTML = '<span class="ms" style="font-size:18px">check</span>Copied!'; }
      catch { if (window.wtAlert) await wtAlert({ title: "Video link", message: link }); }
    };

    const listEl = $("shList");
    try {
      const { data: sessData } = await sb.auth.getSession();
      const tok = sessData?.session?.access_token;
      const [a, b, grpRes] = await Promise.all([
        sb.from("follows").select("following_id").eq("follower_id", user.id),
        sb.from("follows").select("follower_id").eq("following_id", user.id),
        fetch("/api/groups", { headers: { Authorization: "Bearer " + tok } }).then(r => r.json()).catch(() => ({ data: { groups: [] } }))
      ]);
      const mine = new Set((a.data || []).map(r => r.following_id));
      const friendIds = (b.data || []).map(r => r.follower_id).filter(id => mine.has(id));
      const friends = friendIds.length ? (await sb.from("profiles").select("id,username,display_name,avatar_url").in("id", friendIds)).data || [] : [];
      const groups = grpRes?.data?.groups || [];

      const buildPayload = (defNote = "") => {
        const note = ($("shNote").value || "").trim() || defNote;
        const tag = `[video_share:${v.id}|${String(v.name || "Web Tok").replace(/[\r\n\]|]/g, " ").slice(0, 80)}]`;
        return note ? `${tag}\n${note}` : tag;
      };

      listEl.innerHTML = "";
      const aiLbl = document.createElement("div"); aiLbl.className = "sh-sec"; aiLbl.textContent = "Assistant"; listEl.appendChild(aiLbl);
      const aiRow = document.createElement("div"); aiRow.className = "sh-row";
      aiRow.innerHTML = `<div class="sh-av grp" style="background:var(--primary);color:var(--on-primary)"><span class="ms" style="font-size:20px">smart_toy</span></div>
        <div class="sh-meta"><b>Web Tok AI</b><small>Ask what this video is about</small></div>
        <button type="button" class="btn primary sm">Ask AI</button>`;
      const aiBtn = aiRow.querySelector("button");
      aiBtn.onclick = async () => {
        aiBtn.disabled = true; aiBtn.textContent = "Sending…";
        try {
          const r = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
            body: JSON.stringify({ body: buildPayload("What is this video about?") })
          });
          if (!r.ok) throw new Error();
          dlg.close();
          location.href = "/messages#" + AI_BOT_ID;
        } catch {
          aiBtn.disabled = false; aiBtn.textContent = "Retry";
        }
      };
      listEl.appendChild(aiRow);

      if (groups.length) {
        const lbl = document.createElement("div"); lbl.className = "sh-sec"; lbl.textContent = "Group Chats"; listEl.appendChild(lbl);
        groups.forEach(g => {
          const row = document.createElement("div"); row.className = "sh-row";
          row.innerHTML = `<div class="sh-av grp"><span class="ms" style="font-size:20px">groups</span></div>
            <div class="sh-meta"><b>${escapeHtml(g.name)}</b><small>${g.member_count || 1} member${(g.member_count || 1) === 1 ? "" : "s"}</small></div>
            <button type="button" class="btn primary sm">Send</button>`;
          const btn = row.querySelector("button");
          btn.onclick = async () => {
            btn.disabled = true; btn.textContent = "Sending…";
            try {
              const r = await fetch(`/api/groups/${encodeURIComponent(g.id)}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
                body: JSON.stringify({ body: buildPayload() })
              });
              const j = await r.json().catch(() => ({}));
              if (!r.ok || j.error) throw new Error(j.error?.message || "Failed");
              btn.textContent = "Sent"; btn.className = "btn sm";
            } catch {
              btn.disabled = false; btn.textContent = "Retry";
            }
          };
          listEl.appendChild(row);
        });
      }

      if (friends.length) {
        const lbl = document.createElement("div"); lbl.className = "sh-sec"; lbl.textContent = "Friends"; listEl.appendChild(lbl);
        friends.forEach(f => {
          const row = document.createElement("div"); row.className = "sh-row";
          const init = escapeHtml((f.display_name || f.username || "U")[0].toUpperCase());
          const av = f.avatar_url ? `style="background-image:url(${escapeHtml(f.avatar_url)})"` : "";
          row.innerHTML = `<div class="sh-av" ${av}>${f.avatar_url ? "" : init}</div>
            <div class="sh-meta"><b>${escapeHtml(f.display_name || f.username)}</b><small>@${escapeHtml(f.username)}</small></div>
            <button type="button" class="btn primary sm">Send</button>`;
          const btn = row.querySelector("button");
          btn.onclick = async () => {
            btn.disabled = true; btn.textContent = "Sending…";
            const { error } = await sb.from("messages").insert({ sender_id: user.id, recipient_id: f.id, body: buildPayload() });
            if (error) { btn.disabled = false; btn.textContent = "Retry"; return; }
            btn.textContent = "Sent"; btn.className = "btn sm";
          };
          listEl.appendChild(row);
        });
      }
    } catch {
      listEl.innerHTML = '<div style="color:var(--bad);padding:12px;text-align:center">Could not load friends or groups.</div>';
    }
  });
}

function slide(v) {
  const s = document.createElement("section");
  s.className = "slide";
  s.dataset.vid = v.id;
  if (v.sound?.title) s.dataset.soundTitle = v.sound.title;
  const by = v.username ? `<small><a href="/profile?u=${encodeURIComponent(v.username)}">@${escapeHtml(v.username)}</a></small>` : "";
  const orientClass = v.orientation === "landscape" || v.orientation === "square" ? " " + v.orientation : "";
  const sndHtml = v.sound?.audio_url ? `<audio class="wt-vid-snd" loop preload="none" src="${escapeHtml(v.sound.audio_url)}"></audio>` : "";
  s.innerHTML = `<div class="player${orientClass}"><video playsinline muted preload="none"></video><div class="cap"><span class="cap-t"></span>${by}</div></div>
    ${sndHtml}
    <div class="vid-seek-wrap">
      <input type="range" class="vid-seek" min="0" max="1000" value="0" aria-label="Seek video">
      <span class="vid-time">0:00 / 0:00</span>
    </div>
    <div class="sound-left">
      <button class="fab" data-a="sound" aria-label="Sound"><span class="ms">${muted ? "volume_off" : "volume_up"}</span><small>${muted ? "Muted" : "Sound"}</small></button>
    </div>
    <div class="rail">
      ${followBtn(v)}
      <button class="fab ${v.likedByMe ? "on" : ""}" data-a="like" aria-label="Like"><span class="ms">favorite</span><small>${v.likesCount || 0}</small></button>
      <button class="fab" data-a="comment" aria-label="Comment"><span class="ms">chat_bubble</span><small>${v.commentsCount || 0}</small></button>
      <button class="fab" data-a="share" aria-label="Share"><span class="ms">share</span><small>Share</small></button>
    </div>`;
  const player = s.querySelector(".player");
  const vid = s.querySelector("video");
  const sndEl = s.querySelector(".wt-vid-snd");
  const seek = s.querySelector(".vid-seek");
  const timeEl = s.querySelector(".vid-time");
  let scrubbing = false;

  vid.dataset.src = v.src;
  vid.loop = getFeedPrefs().vidLoop !== false;
  if (sndEl) sndEl.loop = vid.loop;
  vid.onloadedmetadata = () => {
    if (!v.orientation) {
      if (vid.videoWidth > vid.videoHeight * 1.15) player.classList.add("landscape");
      else if (Math.abs(vid.videoWidth - vid.videoHeight) <= vid.videoWidth * 0.15) player.classList.add("square");
    }
    timeEl.textContent = `${fmtVidTime(vid.currentTime)} / ${fmtVidTime(vid.duration)}`;
  };
  vid.onplay = () => {
    if (sndEl) {
      vid.muted = true;
      sndEl.muted = muted;
      if (isFinite(sndEl.duration) && sndEl.duration > 0) sndEl.currentTime = vid.currentTime % sndEl.duration;
      sndEl.play().catch(() => {});
    }
  };
  vid.onpause = () => {
    if (sndEl) sndEl.pause();
  };
  vid.ontimeupdate = () => {
    if (scrubbing || !isFinite(vid.duration) || vid.duration <= 0) return;
    seek.value = Math.round((vid.currentTime / vid.duration) * 1000);
    timeEl.textContent = `${fmtVidTime(vid.currentTime)} / ${fmtVidTime(vid.duration)}`;
  };
  seek.oninput = () => {
    scrubbing = true;
    if (isFinite(vid.duration) && vid.duration > 0) {
      const target = (seek.value / 1000) * vid.duration;
      vid.currentTime = target;
      if (sndEl && isFinite(sndEl.duration) && sndEl.duration > 0) sndEl.currentTime = target % sndEl.duration;
      timeEl.textContent = `${fmtVidTime(target)} / ${fmtVidTime(vid.duration)}`;
    }
  };
  seek.onchange = () => { scrubbing = false; };

  s.querySelector(".cap-t").textContent = v.name;
  if ((v.hashtags || []).length) {
    const tg = document.createElement("div");
    tg.className = "cap-tags";
    v.hashtags.forEach(t => { const a = document.createElement("a"); a.href = "/scroll#search=" + encodeURIComponent("#" + t); a.textContent = "#" + t; tg.appendChild(a); });
    s.querySelector(".cap").appendChild(tg);
  }
  vid.onclick = () => vid.paused ? vid.play() : vid.pause();
  s.querySelector(".sound-left").onclick = e => { if (e.target.closest("button")) toggleFeedSound(); };
  s.querySelector(".rail").onclick = e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.animate) b.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 240, easing: "cubic-bezier(.2,.9,.3,1.1)" });
    if (b.dataset.a === "follow") requireLogin(async () => {
      const id = v.user_id, was = following.has(id);
      const { error } = was ? await sb.from("follows").delete().eq("follower_id", user.id).eq("following_id", id)
                            : await sb.from("follows").insert({ follower_id: user.id, following_id: id });
      if (error) return;
      was ? following.delete(id) : following.add(id);
      document.querySelectorAll(`[data-follow="${id}"]`).forEach(paintFollow);
    });
    if (b.dataset.a === "like") requireLogin(async () => {
      if (v.likedByMe) {
        const { error } = await sb.from("likes").delete().eq("video_id", v.id).eq("user_id", user.id);
        if (error) return;
        v.likedByMe = false; v.likesCount = Math.max(0, v.likesCount - 1); markLiked(v.id, false);
      } else {
        const { error } = await sb.from("likes").insert({ video_id: v.id, user_id: user.id });
        if (error) return;
        v.likedByMe = true; v.likesCount += 1; markLiked(v.id, true);
      }
      b.classList.toggle("on", v.likedByMe);
      b.querySelector("small").textContent = v.likesCount;
    });
    if (b.dataset.a === "comment") openComments(v, b);
    if (b.dataset.a === "share") openShareVideo(v);
  };
  return s;
}

async function loadFeed() {
  const feed = $("feed");
  feed.innerHTML = '<div class="empty"><div>Loading…</div></div>';
  try {
    const vids = await listVideos();
    if (!vids.length) {
      const h = location.hash;
      const msg = h === "#following" ? "You're not following anyone with videos yet.<br>Tap <b>Follow</b> on a video to see them here."
        : h === "#friends" ? "No videos from friends yet.<br>Follow someone and have them follow you back to become friends."
        : h.startsWith("#search=") ? "No results found."
        : "No videos yet.<br>Click <b>+ Upload</b> to post the first one!";
      feed.innerHTML = `<div class="empty"><div>${msg}</div></div>`;
      return;
    }
    feed.innerHTML = "";
    obs = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target.querySelector("video");
      const snd = e.target.querySelector(".wt-vid-snd");
      if (e.isIntersecting) {
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        v.preload = "auto";
        const fp = getFeedPrefs();
        v.loop = fp.vidLoop !== false;
        if (snd) snd.loop = v.loop;
        if (fp.vidAutoplay !== false) {
          if (snd) {
            v.muted = true;
            snd.muted = muted;
            v.play().then(() => { snd.play().catch(() => {}); }).catch(() => {});
          } else {
            v.muted = muted;
            v.play().catch(() => {});
          }
        }
        activeVid = e.target.dataset.vid;
        trackView(activeVid);
      } else {
        v.pause(); v.currentTime = 0;
        if (snd) { snd.pause(); snd.currentTime = 0; }
      }
    }), { threshold: .7 });
    const near = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target.querySelector("video");
      if (e.isIntersecting && v && !v.src && v.dataset.src) { v.preload = "metadata"; v.src = v.dataset.src; }
    }), { root: feed, rootMargin: "100% 0px 100% 0px" });
    vids.forEach(v => { const s = slide(v); feed.appendChild(s); obs.observe(s); near.observe(s); });
    if (location.hash.startsWith("#v=")) {
      const targetId = decodeURIComponent(location.hash.slice(3));
      const el = feed.querySelector(`[data-vid="${CSS.escape(targetId)}"]`);
      if (el) el.scrollIntoView({ behavior: "instant" });
    }
  } catch (e) {
    feed.innerHTML = `<div class="empty"><div>Couldn't load videos.<br>${e.message}</div></div>`;
  }
}
