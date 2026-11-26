/* Comments panel: list, threaded replies, delete comments, video-owner polls, time-ago, built-in + custom stickers */
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

function fmtPollEnd(iso, ended) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const txt = d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return ended ? `Ended ${txt}` : `Ends ${txt}`;
}

function defaultEndLocalVal() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ensurePollControls() {
  const head = document.querySelector("#commentsDlg .dlg-head");
  if (!head) return;
  let btn = document.getElementById("cmtPollBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "cmtPollBtn";
    btn.className = "btn sm hidden";
    btn.innerHTML = '<span class="ms" style="font-size:16px">poll</span>Poll';
    const closeBtn = head.querySelector("button:last-child");
    if (closeBtn) head.insertBefore(btn, closeBtn);
    else head.appendChild(btn);
  }
  const isOwner = !!(typeof user !== "undefined" && user && activeVideo && activeVideo.user_id === user.id);
  btn.classList.toggle("hidden", !isOwner);
  btn.onclick = () => togglePollComposer();

  const existingComp = document.getElementById("cmtPollComposer");
  if (existingComp) existingComp.remove();
}

function togglePollComposer() {
  let comp = document.getElementById("cmtPollComposer");
  if (comp) { comp.remove(); return; }
  comp = document.createElement("div");
  comp.id = "cmtPollComposer";
  comp.className = "cmt-poll-comp";
  comp.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b style="font-size:13px">Create Comment Poll</b>
      <button type="button" class="cmt-reply-x" id="cpCancel" aria-label="Close"><span class="ms" style="font-size:16px">close</span></button>
    </div>
    <input type="text" id="cpQuestion" maxlength="160" placeholder="Ask a question (e.g. Part 2?)">
    <div id="cpOpts" class="cmt-poll-opts-in">
      <input type="text" class="cp-opt" maxlength="60" value="Yes" placeholder="Option 1">
      <input type="text" class="cp-opt" maxlength="60" value="No" placeholder="Option 2">
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn sm" id="cpAddOpt">+ Option</button>
      <label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px">
        Ends: <input type="datetime-local" id="cpEnds" value="${defaultEndLocalVal()}" style="width:auto;padding:6px 10px;font-size:12px">
      </label>
    </div>
    <div id="cpHint" style="font-size:12px;color:var(--bad);min-height:14px"></div>
    <button type="button" class="btn primary sm" id="cpSubmit">Post Poll</button>`;
  const list = $("cmtList");
  list.parentNode.insertBefore(comp, list);
  $("cpCancel").onclick = () => comp.remove();
  $("cpAddOpt").onclick = () => {
    const opts = $("cpOpts").querySelectorAll(".cp-opt");
    if (opts.length >= 4) return;
    const inp = document.createElement("input");
    inp.type = "text"; inp.className = "cp-opt"; inp.maxLength = 60;
    inp.placeholder = `Option ${opts.length + 1}`;
    $("cpOpts").appendChild(inp);
    if (opts.length + 1 >= 4) $("cpAddOpt").disabled = true;
  };
  $("cpSubmit").onclick = async () => {
    const question = $("cpQuestion").value.trim();
    const options = [...$("cpOpts").querySelectorAll(".cp-opt")].map(i => i.value.trim()).filter(Boolean);
    const endsRaw = $("cpEnds").value;
    const endsIso = endsRaw ? new Date(endsRaw).toISOString() : "";
    if (question.length < 2) { $("cpHint").textContent = "Enter a poll question."; return; }
    if (options.length < 2) { $("cpHint").textContent = "Enter at least 2 options."; return; }
    $("cpSubmit").disabled = true; $("cpHint").textContent = "";
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in required.");
      const r = await fetch(`/api/videos/${encodeURIComponent(activeVideo.id)}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ question, options, ends_at: endsIso })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error?.message || "Could not create poll.");
      comp.remove();
      await fetchAndRenderComments();
    } catch (e) {
      $("cpHint").textContent = e.message;
      $("cpSubmit").disabled = false;
    }
  };
}

function renderPollCard(poll) {
  const card = document.createElement("div");
  card.className = "cmt-poll-card";
  const isOwner = !!(typeof user !== "undefined" && user && activeVideo && activeVideo.user_id === user.id);
  const showResults = poll.myVote !== null || poll.ended || isOwner;
  const total = Number(poll.totalVotes || 0);

  const optsHtml = (poll.options || []).map((opt, idx) => {
    const cnt = Number(poll.counts?.[idx] || 0);
    const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
    const chosen = poll.myVote === idx;
    return `
      <button type="button" class="cmt-poll-opt ${chosen ? "chosen" : ""}" data-idx="${idx}" ${poll.ended ? "disabled" : ""}>
        ${showResults ? `<span class="cmt-poll-bar" style="width:${pct}%"></span>` : ""}
        <span class="cmt-poll-lbl">${escapeHtml(opt)}${chosen ? ' <span class="ms" style="font-size:14px">check_circle</span>' : ""}</span>
        ${showResults ? `<span class="cmt-poll-stat">${cnt} (${pct}%)</span>` : ""}
      </button>`;
  }).join("");

  card.innerHTML = `
    <div class="cmt-poll-head">
      <span class="cmt-poll-badge"><span class="ms" style="font-size:14px">poll</span>Poll</span>
      <span class="cmt-poll-meta">${total} vote${total === 1 ? "" : "s"} · ${escapeHtml(fmtPollEnd(poll.ends_at, poll.ended))}</span>
      ${isOwner ? '<button type="button" class="cmt-del-btn" title="Delete poll" style="margin-left:auto">Delete</button>' : ""}
    </div>
    <div class="cmt-poll-q">${escapeHtml(poll.question)}</div>
    <div class="cmt-poll-opts">${optsHtml}</div>`;

  card.querySelectorAll(".cmt-poll-opt").forEach(btn => {
    btn.onclick = () => requireLogin(async () => {
      if (poll.ended) return;
      const optionIndex = parseInt(btn.dataset.idx, 10);
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) throw new Error("Sign in required.");
        const r = await fetch(`/api/polls/${encodeURIComponent(poll.id)}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ optionIndex })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error?.message || "Could not vote.");
        card.replaceWith(renderPollCard(j.data));
      } catch (e) {
        $("cmtHint").textContent = e.message;
      }
    });
  });

  const delBtn = card.querySelector(".cmt-del-btn");
  if (delBtn) {
    delBtn.onclick = async () => {
      const ok = typeof wtConfirm === "function"
        ? await wtConfirm({ title: "Delete poll?", message: "Remove this poll and all its votes?", danger: true, confirmText: "Delete" })
        : confirm("Delete this poll?");
      if (!ok) return;
      try {
        const { data: { session } } = await sb.auth.getSession();
        const r = await fetch(`/api/polls/${encodeURIComponent(poll.id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (r.ok) card.remove();
      } catch {}
    };
  }
  return card;
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
  ensurePollControls();
  $("commentsDlg").show();
  await fetchAndRenderComments();
}

function renderOneComment(c, pmap, isReply = false) {
  const p = pmap[c.user_id] || {};
  const uname = p.username || "user";
  const dname = p.display_name || uname;
  const init = dname[0].toUpperCase();
  const av = p.avatar_url ? `style="background-image:url(${escapeHtml(p.avatar_url)})"` : "";
  const canDel = !!(typeof user !== "undefined" && user && (c.user_id === user.id || activeVideo?.user_id === user.id));
  const item = document.createElement("div");
  item.className = "cmt-item" + (isReply ? " is-reply" : "");
  item.innerHTML = `<div class="mini-av" ${av}>${p.avatar_url ? "" : escapeHtml(init)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">${escapeHtml(dname)} <span style="color:var(--muted);font-weight:400">@${escapeHtml(uname)}</span></div>
      ${commentBody(c.text)}
      <div class="cmt-meta"><span>${timeAgo(c.created_at)}</span><button type="button" class="cmt-reply-btn">Reply</button>${canDel ? '<button type="button" class="cmt-del-btn">Delete</button>' : ""}</div>
    </div>`;
  item.querySelector(".cmt-reply-btn").onclick = () => setReplyTo(c, uname);
  const delBtn = item.querySelector(".cmt-del-btn");
  if (delBtn) {
    delBtn.onclick = async () => {
      const ok = typeof wtConfirm === "function"
        ? await wtConfirm({ title: "Delete comment?", message: "Permanently delete this comment?", danger: true, confirmText: "Delete" })
        : confirm("Delete this comment?");
      if (!ok) return;
      delBtn.disabled = true;
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) throw new Error("Sign in required.");
        const r = await fetch(`/api/comments/${encodeURIComponent(c.id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error?.message || "Could not delete comment.");
        const removed = Number(j?.data?.removedCount || 1);
        activeVideo.commentsCount = Math.max(0, (activeVideo.commentsCount || 0) - removed);
        $("cmtCount").textContent = activeVideo.commentsCount || "";
        if (activeCommentBtn) activeCommentBtn.querySelector("small").textContent = activeVideo.commentsCount;
        await fetchAndRenderComments();
      } catch (e) {
        $("cmtHint").textContent = e.message;
        delBtn.disabled = false;
      }
    };
  }
  return item;
}

async function fetchAndRenderComments() {
  let tok = "";
  try {
    const { data } = await sb.auth.getSession();
    tok = data?.session?.access_token || "";
  } catch {}

  const [cmtRes, pollRes] = await Promise.all([
    sb.from("comments").select("id, user_id, text, parent_id, created_at").eq("video_id", activeVideo.id).order("created_at", { ascending: true }),
    fetch(`/api/videos/${encodeURIComponent(activeVideo.id)}/polls`, tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})
      .then(r => r.json())
      .catch(() => ({ data: [] }))
  ]);

  const { data: list, error } = cmtRes;
  const polls = Array.isArray(pollRes?.data) ? pollRes.data : [];
  if (error) { $("cmtList").innerHTML = '<div style="color:var(--bad);padding:12px">Could not load comments.</div>'; return; }

  const box = $("cmtList");
  box.innerHTML = "";
  polls.forEach(p => box.appendChild(renderPollCard(p)));

  if (!list.length && !polls.length) {
    box.innerHTML = '<div style="color:var(--muted);padding:12px">No comments yet. Be the first!</div>';
    return;
  }
  if (!list.length) return;

  const uids = [...new Set(list.map(c => c.user_id))];
  const { data: profs } = await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", uids);
  const pmap = Object.fromEntries((profs || []).map(p => [p.id, p]));

  const roots = [], byParent = {};
  list.forEach(c => {
    if (c.parent_id) (byParent[c.parent_id] ||= []).push(c);
    else roots.push(c);
  });

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

$("commentsDlg").addEventListener("close", () => {
  document.body.classList.remove("cmt-open");
  setReplyTo(null);
  const comp = document.getElementById("cmtPollComposer");
  if (comp) comp.remove();
});
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
