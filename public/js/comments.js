/* Comments panel: list, threaded replies, post, time-ago, built-in + custom stickers */
let activeVideo = null, activeCommentBtn = null, replyTo = null;

function setReplyTo(c, uname) {
  replyTo = c ? { id: c.id, username: uname } : null;
  let bar = document.getElementById("cmtReplyBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "cmtReplyBar";
    bar.className = "cmt-reply-bar hidden";
    $("cmtForm").parentNode.insertBefore(bar, $("cmtForm"));
  }
  if (replyTo) {
    bar.classList.remove("hidden");
    bar.innerHTML = `<span>Replying to <b>@${escapeHtml(replyTo.username)}</b></span><button type="button" class="cmt-reply-x" aria-label="Cancel reply"><span class="ms" style="font-size:16px">close</span></button>`;
    bar.querySelector("button").onclick = () => setReplyTo(null);
    $("cmtInput").focus();
  } else {
    bar.classList.add("hidden");
    bar.innerHTML = "";
  }
}

async function openComments(v, btn) {
  activeVideo = v;
  activeCommentBtn = btn;
  setReplyTo(null);
  $("cmtHint").textContent = "";
  $("cmtInput").value = "";
  $("cmtList").innerHTML = '<div class="m3-loader"><div class="m3-wave"><svg viewBox="0 0 160 14" fill="none"><path d="M0 7 Q10 1 20 7 T40 7 T60 7 T80 7 T100 7 T120 7 T140 7 T160 7" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round"/></svg></div><span>Loading comments…</span></div>';
  $("cmtCount").textContent = v.commentsCount || "";
  $("stkPanel").classList.add("hidden");
  document.body.classList.add("cmt-open");
  $("commentsDlg").show();
  await fetchAndRenderComments();
}

function renderOneComment(c, pmap, isReply = false) {
  const p = pmap[c.user_id] || {};
  const uname = p.username || "user";
  const dname = p.display_name || uname;
  const init = dname[0].toUpperCase();
  const av = p.avatar_url ? `style="background-image:url(${escapeHtml(p.avatar_url)})"` : "";
  const item = document.createElement("div");
  item.className = "cmt-item" + (isReply ? " is-reply" : "");
  item.innerHTML = `<div class="mini-av" ${av}>${p.avatar_url ? "" : escapeHtml(init)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">${escapeHtml(dname)} <span style="color:var(--muted);font-weight:400">@${escapeHtml(uname)}</span></div>
      ${commentBody(c.text)}
      <div class="cmt-meta"><span>${timeAgo(c.created_at)}</span><button type="button" class="cmt-reply-btn">Reply</button></div>
    </div>`;
  item.querySelector(".cmt-reply-btn").onclick = () => setReplyTo(c, uname);
  return item;
}

async function fetchAndRenderComments() {
  const { data: list, error } = await sb
    .from("comments")
    .select("id, user_id, text, parent_id, created_at")
    .eq("video_id", activeVideo.id)
    .order("created_at", { ascending: true });
  if (error) { $("cmtList").innerHTML = '<div style="color:var(--bad);padding:12px">Could not load comments.</div>'; return; }
  if (!list.length) { $("cmtList").innerHTML = '<div style="color:var(--muted);padding:12px">No comments yet. Be the first!</div>'; return; }

  const uids = [...new Set(list.map(c => c.user_id))];
  const { data: profs } = await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", uids);
  const pmap = Object.fromEntries((profs || []).map(p => [p.id, p]));

  const roots = [], byParent = {};
  list.forEach(c => {
    if (c.parent_id) (byParent[c.parent_id] ||= []).push(c);
    else roots.push(c);
  });

  const box = $("cmtList");
  box.innerHTML = "";
  roots.forEach(c => {
    box.appendChild(renderOneComment(c, pmap, false));
    const replies = byParent[c.id] || [];
    if (replies.length) {
      const wrap = document.createElement("div");
      wrap.className = "cmt-replies";
      replies.forEach(r => wrap.appendChild(renderOneComment(r, pmap, true)));
      box.appendChild(wrap);
    }
  });
  box.querySelectorAll(".lottie-stk").forEach(el => {
    if (typeof loadLottieSticker === "function") loadLottieSticker(el, el.dataset.src);
  });
}

$("commentsDlg").addEventListener("close", () => { document.body.classList.remove("cmt-open"); setReplyTo(null); });
function commentBody(tx) {
  const raw = (tx || "").trim();
  const mu = /^\[sticker_url:(https?:\/\/[^\]]+)\]$/i.exec(raw);
  if (mu) return `<img class="cmt-stk" src="${escapeHtml(mu[1])}" alt="sticker">`;
  const m = /^\[sticker:([^\]\/\\]+\.(?:png|gif|webp|jpe?g|svg|json))\]$/i.exec(raw);
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
    const row = { video_id: activeVideo.id, user_id: user.id, text, parent_id: replyTo ? replyTo.id : null };
    const { error } = await sb.from("comments").insert(row);
    if (error) { $("cmtHint").textContent = error.message; return; }
    setReplyTo(null);
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
