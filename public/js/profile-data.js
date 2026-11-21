/* Profile page: load profile, role/tenure badge, follow button, tabs (videos / liked / comments) */
async function loadMyFollows() {
  myFollowing = new Set(); myFollowers = new Set();
  if (!user) return;
  const [a, b] = await Promise.all([
    sb.from("follows").select("following_id").eq("follower_id", user.id),
    sb.from("follows").select("follower_id").eq("following_id", user.id)
  ]);
  (a.data || []).forEach(r => myFollowing.add(r.following_id));
  (b.data || []).forEach(r => myFollowers.add(r.follower_id));
}

function formatTenure(iso) {
  if (!iso) return "";
  const ms = Math.max(0, Date.now() - Date.parse(iso));
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const mos = Math.floor(days / 30);
  if (mos < 12) return `${mos}mo`;
  return `${Math.floor(mos / 12)}y`;
}

async function resolveTargetAndLoad() {
  const qs = new URLSearchParams(location.search);
  const qUser = qs.get("u"), qId = qs.get("id");
  let row = null;
  if (qUser) {
    const { data } = await sb.from("profiles").select("*").eq("username", qUser).maybeSingle();
    row = data;
  } else if (qId) {
    const { data } = await sb.from("profiles").select("*").eq("id", qId).maybeSingle();
    row = data;
  } else if (user) {
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    row = data;
  } else {
    location.href = "/login";
    return;
  }

  if (!row && (qUser || qId)) {
    $("p-display").textContent = "User not found";
    $("p-user").textContent = qUser ? "@" + qUser : "";
    $("p-actions-me").classList.add("hidden");
    $("acct-content").innerHTML = '<div class="empty-box">This profile doesn\'t exist.</div>';
    return;
  }

  targetId = row?.id || user.id;
  isMe = !!(user && targetId === user.id);
  const meta = isMe ? (user.user_metadata || {}) : {};
  let badge = { role: "user", role_since: null };
  try {
    const br = await fetch(`/api/profiles/${encodeURIComponent(targetId)}/badge`);
    badge = (await br.json()).data || badge;
  } catch {}

  profile = {
    id: targetId,
    username: row?.username || meta.username || (isMe ? (user.email || "user").split("@")[0] : "user"),
    display_name: row?.display_name || meta.display_name || row?.username || "Web Tok User",
    bio: row?.bio ?? meta.bio ?? "",
    avatar_url: row?.avatar_url || null,
    role: badge.role,
    role_since: badge.role_since
  };

  let rowTheme = row?.theme;
  if (typeof rowTheme === "string") {
    try { rowTheme = JSON.parse(rowTheme); } catch { rowTheme = null; }
  }
  if (isMe) {
    activeProfileTheme = null;
    if (rowTheme && Object.keys(rowTheme).length) {
      try { localStorage.setItem("wt_theme", JSON.stringify(rowTheme)); } catch {}
      applyTheme(rowTheme);
    }
  } else {
    const pubTheme = (rowTheme && (rowTheme.color || rowTheme.mode || rowTheme.wallpaper)) ? rowTheme : {};
    activeProfileTheme = pubTheme;
    applyTheme(pubTheme);
  }

  $("openUpload").classList.toggle("hidden", !isMe);
  $("p-actions-me").classList.toggle("hidden", !isMe);
  $("p-actions-other").classList.toggle("hidden", isMe);
  if (!isMe) paintOtherFollowBtn();

  paintProfileHeader();
  await loadAccountData();
}

function paintOtherFollowBtn() {
  const btn = $("btn-follow-user");
  const isF = myFollowing.has(targetId);
  const isBack = myFollowers.has(targetId);
  btn.textContent = isF ? (isBack ? "Friends" : "Following") : (isBack ? "Follow back" : "Follow");
  btn.className = "btn sm " + (isF ? "tonal" : "primary");
}

$("btn-follow-user").onclick = async () => {
  if (!user) return location.href = "/login";
  const was = myFollowing.has(targetId);
  if (was) {
    await sb.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
    myFollowing.delete(targetId);
  } else {
    await sb.from("follows").insert({ follower_id: user.id, following_id: targetId });
    myFollowing.add(targetId);
  }
  paintOtherFollowBtn();
  await loadAccountData();
};

function paintProfileHeader() {
  const pfp = $("p-pfp");
  if (profile.avatar_url) { pfp.style.backgroundImage = `url(${profile.avatar_url})`; pfp.textContent = ""; }
  else { pfp.style.backgroundImage = ""; pfp.textContent = (profile.display_name || profile.username || "U")[0].toUpperCase(); }
  $("p-display").textContent = profile.display_name;
  $("p-user").textContent = "@" + profile.username;
  $("p-bio").textContent = profile.bio || "No bio yet.";

  let rb = document.getElementById("p-role-badge");
  if (rb) rb.remove();
  if (profile.role === "owner" || profile.role === "admin") {
    rb = document.createElement("span");
    rb.id = "p-role-badge";
    rb.className = "role-badge";
    const label = profile.role === "owner" ? "Owner" : "Admin";
    const ten = formatTenure(profile.role_since);
    rb.title = profile.role_since ? `${label} since ${new Date(profile.role_since).toLocaleDateString()}` : label;
    rb.innerHTML = `<span class="ms fill" style="font-size:15px">verified_user</span>${label}${ten ? " · " + ten : ""}`;
    $("p-display").parentNode.appendChild(rb);
  }
}

async function loadAccountData() {
  $("acct-content").innerHTML = '<div class="empty-box">Loading…</div>';
  try {
    const [postedRes, myLikesRes, myCmtsRes, followingRes, followersRes] = await Promise.all([
      sb.from("videos").select("id, title, video_url, storage_path, created_at").eq("user_id", targetId).order("created_at", { ascending: false }),
      sb.from("likes").select("video_id").eq("user_id", targetId),
      sb.from("comments").select("id, video_id, text, created_at").eq("user_id", targetId).order("created_at", { ascending: false }),
      sb.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", targetId),
      sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", targetId)
    ]);

    const postedRows = postedRes.data || [];
    const likedIds = (myLikesRes.data || []).map(l => l.video_id);
    const myCmts = myCmtsRes.data || [];

    const allRelevantIds = [...new Set([...postedRows.map(v => v.id), ...likedIds, ...myCmts.map(c => c.video_id)])];
    const [allLikesRes, allCmtsRes, likedVidsRes] = await Promise.all([
      allRelevantIds.length ? sb.from("likes").select("video_id").in("video_id", allRelevantIds) : { data: [] },
      allRelevantIds.length ? sb.from("comments").select("video_id").in("video_id", allRelevantIds) : { data: [] },
      allRelevantIds.length ? sb.from("videos").select("id, title, video_url, created_at").in("id", allRelevantIds) : { data: [] }
    ]);

    const lCounts = {}, cCounts = {};
    (allLikesRes.data || []).forEach(l => lCounts[l.video_id] = (lCounts[l.video_id] || 0) + 1);
    (allCmtsRes.data || []).forEach(c => cCounts[c.video_id] = (cCounts[c.video_id] || 0) + 1);
    const vidMap = Object.fromEntries((likedVidsRes.data || []).map(v => [v.id, v]));

    const posted = postedRows.map(v => ({
      id: v.id, name: v.title, src: v.video_url, storage_path: v.storage_path,
      likesCount: lCounts[v.id] || 0, commentsCount: cCounts[v.id] || 0
    }));
    const liked = likedIds.map(id => vidMap[id]).filter(Boolean).map(v => ({
      id: v.id, name: v.title, src: v.video_url,
      likesCount: lCounts[v.id] || 0, commentsCount: cCounts[v.id] || 0
    }));
    const comments = myCmts.map(c => ({
      ...c, videoName: vidMap[c.video_id]?.title || "Video", createdAt: c.created_at
    }));
    const likesReceived = posted.reduce((sum, v) => sum + v.likesCount, 0);

    acctData = { posted, liked, comments };
    $("st-following").textContent = followingRes.count || 0;
    $("st-followers").textContent = followersRes.count || 0;
    $("st-likes").textContent = likesReceived;
    $("st-comments").textContent = comments.length;
    renderAccountTab();
  } catch (e) {
    $("acct-content").innerHTML = `<div class="empty-box">Could not load account data.<br>${escapeHtml(e.message)}</div>`;
  }
}

function renderAccountTab() {
  const box = $("acct-content");
  if (!acctData) return;
  if (acctTab === "comments") {
    if (!acctData.comments.length) { box.innerHTML = '<div class="empty-box">No comments yet.</div>'; return; }
    const list = document.createElement("div");
    list.className = "cmt-feed";
    acctData.comments.forEach(c => {
      const card = document.createElement("div");
      card.className = "cmt-card";
      card.innerHTML = `<div class="meta"><b>On: ${escapeHtml(c.videoName)}</b><span>${new Date(c.createdAt).toLocaleDateString()}</span></div><div>${escapeHtml(c.text)}</div>`;
      card.onclick = () => location.href = `/scroll#v=${encodeURIComponent(c.video_id)}`;
      list.appendChild(card);
    });
    box.innerHTML = ""; box.appendChild(list);
    return;
  }
  const vids = acctTab === "liked" ? acctData.liked : acctData.posted;
  if (!vids.length) {
    box.innerHTML = `<div class="empty-box">${acctTab === "liked" ? "No liked videos yet." : "No posted videos yet."}</div>`;
    return;
  }
  const grid = document.createElement("div");
  grid.className = "vid-grid";
  vids.forEach(v => {
    const tile = document.createElement("div");
    tile.className = "vid-tile";
    const delBtn = (isMe && acctTab === "posted") ? `<button type="button" class="vid-del" title="Delete video" aria-label="Delete video"><span class="ms" style="font-size:18px">delete</span></button>` : "";
    tile.innerHTML = `${delBtn}<video data-src="${v.src}" muted playsinline preload="none"></video>
      <div class="v-ov"><b>${escapeHtml(v.name)}</b><span><span class="ms fill" style="font-size:13px">favorite</span> ${v.likesCount} · <span class="ms" style="font-size:13px">chat_bubble</span> ${v.commentsCount}</span></div>`;
    const db = tile.querySelector(".vid-del");
    if (db) db.onclick = async e => {
      e.stopPropagation();
      if (!confirm(`Delete "${v.name}"?`)) return;
      if (v.storage_path && !v.storage_path.startsWith("cloudinary:")) {
        await sb.storage.from("videos").remove([v.storage_path]);
      }
      await sb.from("videos").delete().eq("id", v.id).eq("user_id", user.id);
      await loadAccountData();
    };
    tile.onclick = () => location.href = `/scroll#v=${encodeURIComponent(v.id)}`;
    grid.appendChild(tile);
  });
  box.innerHTML = ""; box.appendChild(grid);
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b === btn));
    acctTab = btn.dataset.tab;
    renderAccountTab();
  };
});

// Profile thumbnails: only request a video file when its tile scrolls into view (saves bandwidth)
const tileObs = new IntersectionObserver(es => es.forEach(e => {
  const v = e.target;
  if (e.isIntersecting) { if (!v.src && v.dataset.src) { v.preload = "metadata"; v.src = v.dataset.src + "#t=0.1"; } tileObs.unobserve(v); }
}), { rootMargin: "200px" });
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
  if (n.querySelectorAll) n.querySelectorAll("video[data-src]").forEach(v => tileObs.observe(v));
}))).observe(document.body, { childList: true, subtree: true });
