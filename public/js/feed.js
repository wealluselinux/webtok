/* Video feed: loading, slides, like/follow/sound buttons */
/* ---------- Feed (Supabase) ---------- */
let obs, muted = true;
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

  const [profRes, likeRes, cmtRes] = await Promise.all([
    sb.from("profiles").select("id, username, display_name").in("id", userIds),
    sb.from("likes").select("video_id, user_id").in("video_id", vidIds),
    sb.from("comments").select("video_id").in("video_id", vidIds)
  ]);

  const profMap = Object.fromEntries((profRes.data || []).map(p => [p.id, p]));
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
    username: profMap[v.user_id]?.username || null,
    likesCount: likeCounts[v.id] || 0,
    commentsCount: cCounts[v.id] || 0,
    likedByMe: likedSet.has(v.id)
  })));
}

function slide(v) {
  const s = document.createElement("section");
  s.className = "slide";
  s.dataset.vid = v.id;
  const by = v.username ? `<small><a href="/profile?u=${encodeURIComponent(v.username)}">@${escapeHtml(v.username)}</a></small>` : "";
  const orientClass = v.orientation === "landscape" || v.orientation === "square" ? " " + v.orientation : "";
  s.innerHTML = `<div class="player${orientClass}"><video loop playsinline muted preload="metadata"></video><div class="cap"><span class="cap-t"></span>${by}</div></div>
    <div class="rail">
      ${followBtn(v)}
      <button class="fab ${v.likedByMe ? "on" : ""}" data-a="like" aria-label="Like"><span class="ms">favorite</span><small>${v.likesCount || 0}</small></button>
      <button class="fab" data-a="comment" aria-label="Comment"><span class="ms">chat_bubble</span><small>${v.commentsCount || 0}</small></button>
      <button class="fab" data-a="sound" aria-label="Sound"><span class="ms">${muted ? "volume_off" : "volume_up"}</span><small>${muted ? "Muted" : "Sound"}</small></button>
    </div>`;
  const player = s.querySelector(".player");
  const vid = s.querySelector("video");
  vid.src = v.src;
  if (!v.orientation) {
    vid.onloadedmetadata = () => {
      if (vid.videoWidth > vid.videoHeight * 1.15) player.classList.add("landscape");
      else if (Math.abs(vid.videoWidth - vid.videoHeight) <= vid.videoWidth * 0.15) player.classList.add("square");
    };
  }
  s.querySelector(".cap-t").textContent = v.name;
  vid.onclick = () => vid.paused ? vid.play() : vid.pause();
  s.querySelector(".rail").onclick = e => {
    const b = e.target.closest("button");
    if (!b) return;
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
        v.likedByMe = false; v.likesCount = Math.max(0, v.likesCount - 1);
      } else {
        const { error } = await sb.from("likes").insert({ video_id: v.id, user_id: user.id });
        if (error) return;
        v.likedByMe = true; v.likesCount += 1;
      }
      b.classList.toggle("on", v.likedByMe);
      b.querySelector("small").textContent = v.likesCount;
    });
    if (b.dataset.a === "comment") openComments(v, b);
    if (b.dataset.a === "sound") {
      muted = !muted;
      document.querySelectorAll("video").forEach(x => x.muted = muted);
      document.querySelectorAll('[data-a=sound]').forEach(btn => {
        btn.querySelector("span").textContent = muted ? "volume_off" : "volume_up";
        btn.querySelector("small").textContent = muted ? "Muted" : "Sound";
      });
    }
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
      if (e.isIntersecting) { v.muted = muted; v.play().catch(() => {}); }
      else { v.pause(); v.currentTime = 0; }
    }), { threshold: .7 });
    vids.forEach(v => { const s = slide(v); feed.appendChild(s); obs.observe(s); });
    if (location.hash.startsWith("#v=")) {
      const targetId = decodeURIComponent(location.hash.slice(3));
      const el = feed.querySelector(`[data-vid="${CSS.escape(targetId)}"]`);
      if (el) el.scrollIntoView({ behavior: "instant" });
    }
  } catch (e) {
    feed.innerHTML = `<div class="empty"><div>Couldn't load videos.<br>${e.message}</div></div>`;
  }
}
