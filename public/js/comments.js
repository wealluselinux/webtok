/* Comments panel: list, post, time-ago, image + WebP + Lottie JSON stickers */
/* ---------- Comments (Supabase) ---------- */
let activeVideo = null, activeCommentBtn = null;
async function openComments(v, btn) {
  activeVideo = v;
  activeCommentBtn = btn;
  $("cmtHint").textContent = "";
  $("cmtInput").value = "";
  $("cmtList").innerHTML = '<div style="color:var(--muted);padding:12px">Loading comments…</div>';
  $("cmtCount").textContent = v.commentsCount || ""; $("stkPanel").classList.add("hidden"); document.body.classList.add("cmt-open"); $("commentsDlg").show();
  await fetchAndRenderComments();
}
async function fetchAndRenderComments() {
  const { data: list, error } = await sb
    .from("comments")
    .select("id, user_id, text, created_at")
    .eq("video_id", activeVideo.id)
    .order("created_at", { ascending: true });
  if (error) { $("cmtList").innerHTML = '<div style="color:var(--bad);padding:12px">Could not load comments.</div>'; return; }
  if (!list.length) { $("cmtList").innerHTML = '<div style="color:var(--muted);padding:12px">No comments yet. Be the first!</div>'; return; }

  const uids = [...new Set(list.map(c => c.user_id))];
  const { data: profs } = await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", uids);
  const pmap = Object.fromEntries((profs || []).map(p => [p.id, p]));

  const box = $("cmtList");
  box.innerHTML = "";
  list.forEach(c => {
    const p = pmap[c.user_id] || {};
    const uname = p.username || "user";
    const dname = p.display_name || uname;
    const init = dname[0].toUpperCase();
    const av = p.avatar_url ? `style="background-image:url(${p.avatar_url})"` : "";
    const item = document.createElement("div");
    item.className = "cmt-item";
    item.innerHTML = `<div class="mini-av" ${av}>${p.avatar_url ? "" : init}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700">${escapeHtml(dname)} <span style="color:var(--muted);font-weight:400">@${escapeHtml(uname)}</span></div>
        ${commentBody(c.text)}<div class="cmt-meta">${timeAgo(c.created_at)}</div>
      </div>`;
    box.appendChild(item);
  });
  box.querySelectorAll(".lottie-stk").forEach(el => {
    if (typeof loadLottieSticker === "function") loadLottieSticker(el, el.dataset.src);
  });
}

/* ---------- Comments panel: stickers, time, up/down ---------- */
$("commentsDlg").addEventListener("close", () => document.body.classList.remove("cmt-open"));
function commentBody(tx) {
  const m = /^\[sticker:([^\]\/\\]+\.(?:png|gif|webp|jpe?g|svg|json))\]$/i.exec((tx || "").trim());
  if (m) {
    const url = `/stickers/${encodeURIComponent(m[1])}`;
    if (/\.json$/i.test(m[1])) return `<div class="cmt-stk lottie-stk" data-src="${url}"></div>`;
    return `<img class="cmt-stk" src="${url}" alt="sticker">`;
  }
  return `<div class="cmt-t">${escapeHtml(tx || "")}</div>`;
}
function timeAgo(iso) {
  const s = Math.max(1, (Date.now() - new Date(iso)) / 1000);
  for (const [n, l] of [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]]) if (s >= n) return Math.floor(s / n) + l + " ago";
  return "just now";
}
async function postComment(text) {
  requireLogin(async () => {
    $("cmtHint").textContent = "Posting…";
    const { error } = await sb.from("comments").insert({ video_id: activeVideo.id, user_id: user.id, text });
    if (error) { $("cmtHint").textContent = error.message; return; }
    $("cmtHint").textContent = "";
    activeVideo.commentsCount += 1;
    $("cmtCount").textContent = activeVideo.commentsCount;
    if (activeCommentBtn) activeCommentBtn.querySelector("small").textContent = activeVideo.commentsCount;
    await fetchAndRenderComments();
    $("cmtList").scrollTop = 1e9;
  });
}
$("cmtForm").onsubmit = e => {
  e.preventDefault();
  const tx = $("cmtInput").value.trim();
  if (!tx) return;
  $("cmtInput").value = "";
  postComment(tx);
};
