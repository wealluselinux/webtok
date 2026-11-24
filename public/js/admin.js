/* Admin panel: users, owner-only account deletion, content moderation, support tickets, log */
const sbc = window.supabase.createClient();
const $ = id => document.getElementById(id);
let me = null;

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach(c => e.append(c)); return e;
}
async function api(path, body) {
  const { data } = await sbc.auth.getSession(), s = data.session;
  if (!s) return { data: null, error: { message: "Guest session — sign in required", guest: true } };
  try {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access_token }, body: JSON.stringify(body) }
                                     : { headers: { Authorization: "Bearer " + s.access_token } });
    const raw = await r.text();
    let j = {};
    try { j = JSON.parse(raw); } catch {}
    if (r.ok && !j.error) return j;
    const msg = j.error?.message || j.message || (raw ? `HTTP ${r.status}: ${raw.replace(/<[^>]+>/g, " ").trim().slice(0, 160)}` : `HTTP ${r.status} ${r.statusText || "Request failed"}`);
    return { data: null, error: { message: msg, status: r.status } };
  } catch (e) {
    return { data: null, error: { message: e?.message || "Network request failed" } };
  }
}
const when = iso => iso ? new Date(iso).toLocaleString() : "";
function toast(msg) { const r = $("result"); r.classList.remove("hidden"); r.replaceChildren(h("div", { text: msg }), h("button", { class: "btn", style: "margin-top:8px", text: "Close", onclick: () => r.classList.add("hidden") })); }

/* ----- users ----- */
async function loadUsers() {
  const q = $("q").value.trim();
  const r = await api("/api/admin/users" + (q ? "?q=" + encodeURIComponent(q) : ""));
  const box = $("ulist"); box.replaceChildren();
  if (r.error) { box.append(h("div", { class: "msg", text: r.error.message })); return; }
  if (!r.data.length) box.append(h("div", { class: "msg", text: "No users found." }));
  r.data.forEach(u => box.append(userCard(u)));
}
function userCard(u) {
  const isOwner = u.role === "owner";
  const canAct = !isOwner && (me === "owner" || u.role === "user");
  const boxes = ["post", "comment", "message"].map(k => h("label", {}, h("input", { type: "checkbox", value: k, checked: u.restrictions.includes(k) || null, disabled: !canAct }), "can't " + k));
  const name = u.display_name || u.username || "(no profile)";
  const card = h("div", { class: "card" },
    h("div", { class: "line" },
      h("div", {}, h("span", { class: "name", text: name }), h("span", { class: "sub", text: "  @" + (u.username || "?") }),
        u.role !== "user" ? h("span", { class: "badge role", text: u.role }) : "", u.banned ? h("span", { class: "badge bad", text: "suspended" }) : "",
        u.restrictions.length ? h("span", { class: "badge", text: "limited" }) : ""),
      h("div", { class: "sub", text: "Joined " + when(u.created_at) })),
    h("div", { class: "sub", text: u.email + (u.ban_reason ? "  ·  reason: " + u.ban_reason : "") }),
    h("div", { class: "acts" },
      h("button", { class: "btn", disabled: !canAct, text: "Reset password", onclick: () => resetPw(u) }),
      me === "owner" && !isOwner ? h("button", { class: "btn", text: u.role === "admin" ? "Remove admin" : "Make admin", onclick: () => setRole(u, u.role === "admin" ? "user" : "admin") }) : "",
      h("button", { class: "btn " + (u.banned ? "" : "bad"), disabled: !canAct, text: u.banned ? "Unsuspend" : "Suspend", onclick: () => ban(u) }),
      me === "owner" && !isOwner && u.role !== "system" ? h("button", { class: "btn bad", text: "Delete account", onclick: () => deleteUser(u) }) : ""),
    h("div", { class: "acts" }, ...boxes, h("button", { class: "btn p", disabled: !canAct, text: "Save limits", onclick: () => saveLimits(u, card) })));
  return card;
}
async function resetPw(u) {
  const pw = await wtPrompt({
    title: `Set password for @${u.username}`,
    message: "Type the new password directly (at least 6 characters). They will be signed out everywhere.",
    placeholder: "Enter new password…",
    icon: "lock_reset",
    confirmText: "Set password",
    danger: true
  });
  if (pw === null) return;
  const nextPw = pw.trim();
  if (nextPw.length < 6) return toast("Password must be at least 6 characters.");
  const r = await api("/api/admin/set-password", { userId: u.id, password: nextPw });
  if (r.error) return toast(`Password reset failed: ${r.error.message}`);
  toast(`Password updated for @${r.data.username} (${r.data.email}).`);
}
async function setRole(u, role) {
  const ok = await wtConfirm({
    title: role === "admin" ? `Make @${u.username} an admin?` : `Remove admin from @${u.username}?`,
    message: role === "admin" ? "They will be able to moderate users and content." : "They will return to a regular user account.",
    icon: "admin_panel_settings",
    confirmText: role === "admin" ? "Make admin" : "Remove",
    danger: role !== "admin"
  });
  if (!ok) return;
  const r = await api("/api/admin/set-role", { userId: u.id, role }); if (r.error) toast(r.error.message); loadUsers();
}
async function ban(u) {
  let reason = "";
  if (!u.banned) {
    reason = await wtPrompt({
      title: `Suspend @${u.username}?`,
      message: "Optional reason (they will see it when trying to sign in):",
      placeholder: "Reason for suspension…",
      icon: "block",
      confirmText: "Suspend",
      danger: true
    });
    if (reason === null) return;
  }
  const r = await api("/api/admin/ban", { userId: u.id, banned: !u.banned, reason }); if (r.error) toast(r.error.message); loadUsers();
}
async function deleteUser(u) {
  const ok = await wtConfirm({
    title: `Delete @${u.username}?`,
    message: `Permanently delete @${u.username || "?"} (${u.email}) and all of their videos, comments, messages, and data? This cannot be undone.`,
    icon: "delete_forever",
    confirmText: "Delete account",
    danger: true
  });
  if (!ok) return;
  const r = await api("/api/admin/delete-user", { userId: u.id });
  if (r.error) return toast(`Delete failed: ${r.error.message}`);
  toast(`Deleted account @${r.data.username || "?"} (${r.data.email}).`);
  loadUsers();
}
async function saveLimits(u, card) {
  const list = [...card.querySelectorAll("input[type=checkbox]:checked")].map(x => x.value);
  const r = await api("/api/admin/restrict", { userId: u.id, restrictions: list }); toast(r.error ? r.error.message : `Saved limits for @${u.username}.`); loadUsers();
}

/* ----- content ----- */
async function loadContent() {
  const box = $("content"); box.replaceChildren(h("div", { class: "msg", text: "Loading…" }));
  const r = await api("/api/admin/content");
  box.replaceChildren();
  if (r.error) { box.append(h("div", { class: "msg", text: r.error.message })); return; }
  box.append(h("h2", { text: "Recent videos", style: "margin:8px 0" }));
  r.data.videos.forEach(v => box.append(h("div", { class: "card line" },
    h("div", {}, h("div", { class: "name", text: v.title }), h("div", { class: "sub", text: "@" + (v.username || "?") + " · " + when(v.created_at) }), h("a", { href: v.video_url, target: "_blank", rel: "noopener", text: "Open video" })),
    h("button", { class: "btn bad", text: "Delete", onclick: async () => {
      const ok = await wtConfirm({ title: "Delete video?", message: `Delete the video "${v.title}"?`, icon: "delete", confirmText: "Delete", danger: true });
      if (!ok) return;
      const x = await api("/api/admin/delete-video", { videoId: v.id }); if (x.error) toast(x.error.message); loadContent();
    } }))));
  box.append(h("h2", { text: "Recent comments", style: "margin:16px 0 8px" }));
  r.data.comments.forEach(c => box.append(h("div", { class: "card line" },
    h("div", {}, h("div", { class: "name", text: c.text.length > 140 ? c.text.slice(0, 140) + "…" : c.text }), h("div", { class: "sub", text: "@" + (c.username || "?") + " · " + when(c.created_at) })),
    h("button", { class: "btn bad", text: "Delete", onclick: async () => { const x = await api("/api/admin/delete-comment", { commentId: c.id }); if (x.error) toast(x.error.message); loadContent(); } }))));
}

/* ----- support tickets ----- */
async function loadSupport() {
  const box = $("support"); box.replaceChildren(h("div", { class: "msg", text: "Loading support tickets…" }));
  const r = await api("/api/admin/support");
  box.replaceChildren();
  if (r.error) { box.append(h("div", { class: "msg", text: r.error.message })); return; }
  if (!r.data.length) { box.append(h("div", { class: "msg", text: "No support tickets yet." })); return; }
  r.data.forEach(t => {
    const sel = h("select", { style: "width:auto;margin:0;padding:8px 14px" },
      ...["open", "resolved", "closed"].map(s => h("option", { value: s, selected: t.status === s || null, text: s }))
    );
    sel.onchange = async () => {
      const x = await api(`/api/admin/support/${encodeURIComponent(t.id)}/status`, { status: sel.value });
      if (x.error) toast(x.error.message);
      else loadSupport();
    };
    const repIn = h("textarea", { rows: 2, maxlength: 2000, placeholder: "Write a response to this ticket…", style: "margin-top:10px" });
    const sendBtn = h("button", { class: "btn p", text: "Send reply & mark resolved" });
    sendBtn.onclick = async () => {
      const body = repIn.value.trim();
      if (!body) return toast("Write a reply first.");
      sendBtn.disabled = true;
      const x = await api(`/api/admin/support/${encodeURIComponent(t.id)}/reply`, { body, status: "resolved" });
      if (x.error) { toast(x.error.message); sendBtn.disabled = false; return; }
      toast("Support reply sent.");
      loadSupport();
    };
    const repliesEl = (t.replies || []).map(rep => h("div", { class: "tk-rep" + (rep.is_admin ? " adm" : "") },
      h("div", { class: "sub", text: `${rep.is_admin ? "Admin (@" + (rep.username || "staff") + ")" : "@" + (rep.username || "user")} · ${when(rep.created_at)}` }),
      h("div", { text: rep.body, style: "white-space:pre-wrap;margin-top:3px" })
    ));
    box.append(h("div", { class: "card" },
      h("div", { class: "line" },
        h("div", {}, h("span", { class: "name", text: t.subject }), h("span", { class: "badge " + (t.status === "open" ? "role" : ""), text: t.status })),
        sel),
      h("div", { class: "sub", style: "margin:4px 0 8px", text: `@${t.username || "?"} (${t.email || ""}) · ${when(t.created_at)}` }),
      h("div", { text: t.message, style: "white-space:pre-wrap;line-height:1.45" }),
      ...repliesEl,
      repIn,
      h("div", { class: "acts", style: "margin-top:0" }, sendBtn)
    ));
  });
}


/* ----- admin applications (AI_ADMINFROM_CHECKER + owner Yes/No) ----- */
async function loadApps() {
  const box = $("apps"); box.replaceChildren(h("div", { class: "msg", text: "Loading admin applications…" }));
  const r = await api("/api/admin/applications");
  box.replaceChildren();
  if (r.error) { box.append(h("div", { class: "msg", text: r.error.message })); return; }
  if (!r.data.length) { box.append(h("div", { class: "msg", text: "No admin applications yet." })); return; }
  r.data.forEach(a => {
    const ans = a.answers || {};
    const aiBadge = a.ai_verdict
      ? h("span", { class: "badge " + (a.ai_verdict === "APPROVE" ? "ok" : a.ai_verdict === "DENY" ? "bad" : ""), text: `AI: ${a.ai_verdict}${a.ai_score ? ` (${a.ai_score}/10)` : ""}` })
      : "";
    const statusBadge = h("span", { class: "badge " + (a.status === "approved" ? "ok" : a.status === "denied" ? "bad" : "role"), text: a.status });
    const acts = [];
    if (a.status === "pending") {
      if (me === "owner") {
        acts.push(
          h("button", { class: "btn p", text: "Yes · Approve & Make Admin", onclick: async () => {
            const ok = await wtConfirm({ title: `Approve @${a.username || "user"}?`, message: "This will grant them Admin access right away.", icon: "verified_user", confirmText: "Yes, make admin" });
            if (!ok) return;
            const res = await api(`/api/admin/applications/${encodeURIComponent(a.id)}/decide`, { decision: "approved" });
            if (res.error) return toast(res.error.message);
            toast(`Approved @${a.username || "user"} as an Admin.`);
            loadApps();
          }}),
          h("button", { class: "btn bad", text: "No · Deny", onclick: async () => {
            const ok = await wtConfirm({ title: `Deny @${a.username || "user"}?`, message: "They will remain a regular user.", icon: "block", confirmText: "No, deny", danger: true });
            if (!ok) return;
            const res = await api(`/api/admin/applications/${encodeURIComponent(a.id)}/decide`, { decision: "denied" });
            if (res.error) return toast(res.error.message);
            toast(`Denied application from @${a.username || "user"}.`);
            loadApps();
          }})
        );
      } else {
        acts.push(h("div", { class: "sub", text: "Awaiting owner decision (Yes/No)." }));
      }
    }
    box.append(h("div", { class: "card" },
      h("div", { class: "line" },
        h("div", {}, h("span", { class: "name", text: a.display_name || a.username || "(user)" }), h("span", { class: "sub", text: `  @${a.username || "?"}` }), statusBadge, aiBadge),
        h("div", { class: "sub", text: "Applied " + when(a.created_at) })),
      h("div", { class: "sub", style: "margin:4px 0 8px", text: `${a.email || ""} · Joined ${when(a.user_created_at)}` }),
      h("div", { class: "tk-rep" }, h("b", { text: "Why become admin: " }), ans.why || ""),
      h("div", { class: "tk-rep" }, h("b", { text: "Moderation approach: " }), ans.moderation || ""),
      h("div", { class: "tk-rep" }, h("b", { text: "Activity & improvements: " }), ans.activity || ""),
      ans.extra ? h("div", { class: "tk-rep" }, h("b", { text: "Extra notes: " }), ans.extra) : "",
      h("div", { class: "tk-rep adm" }, h("div", { class: "sub", style: "font-weight:700;margin-bottom:3px", text: "AI Evaluation" }), h("div", { text: a.ai_reason || "No AI notes." })),
      acts.length ? h("div", { class: "acts" }, ...acts) : ""
    ));
  });
}

/* ----- log (owner only) ----- */
async function loadLog() {
  const box = $("log"); box.replaceChildren();
  const r = await api("/api/admin/log");
  if (r.error) { box.append(h("div", { class: "msg", text: r.error.message })); return; }
  if (!r.data.length) box.append(h("div", { class: "msg", text: "Nothing yet." }));
  r.data.forEach(l => box.append(h("div", { class: "card" }, h("div", { class: "name", text: l.action.replace(/_/g, " ") }), h("div", { class: "sub", text: `${l.detail || ""}  ·  by @${l.admin || "?"}  ·  ${when(l.created_at)}` }))));
}

document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
  document.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("on", x === b));
  ["users", "content", "support", "apps", "log"].forEach(t => $(t).classList.toggle("hidden", t !== b.dataset.tab));
  if (b.dataset.tab === "content") loadContent();
  if (b.dataset.tab === "support") loadSupport();
  if (b.dataset.tab === "apps") loadApps();
  if (b.dataset.tab === "log") loadLog();
});
let qt = null; $("q").oninput = () => { clearTimeout(qt); qt = setTimeout(loadUsers, 300); };

(async () => {
  const r = await api("/api/admin/me");
  if (r.error || !["admin", "owner"].includes(r.data?.role)) {
    $("app")?.remove();
    const denied = $("denied");
    const isGuest = !!r.error?.guest;
    const formWrap = h("div", { class: "hidden", style: "margin-top:16px;padding-top:14px;border-top:1px solid var(--surface)" });
    const statusWrap = h("div", { style: "margin:10px 0" });
    const applyBtn = !isGuest ? h("button", { class: "btn p", text: "Apply to become an Admin", onclick: () => formWrap.classList.toggle("hidden") }) : "";

    if (!isGuest) {
      const qWhy = h("textarea", { rows: 2, maxlength: 800, placeholder: "Why do you want to be an admin on Web Tok?" });
      const qMod = h("textarea", { rows: 2, maxlength: 800, placeholder: "How would you handle spam, rule-breaking videos, or user disputes?" });
      const qAct = h("textarea", { rows: 2, maxlength: 600, placeholder: "How active are you and what would you help improve?" });
      const qExt = h("textarea", { rows: 2, maxlength: 600, placeholder: "Anything else the owner & admins should know? (optional)" });
      const hint = h("div", { class: "sub", style: "margin-bottom:10px" });
      const subBtn = h("button", { class: "btn p", text: "Submit Admin Application", onclick: async () => {
        subBtn.disabled = true; hint.textContent = "Submitting & running AI review…";
        const res = await api("/api/admin-applications", { why: qWhy.value.trim(), moderation: qMod.value.trim(), activity: qAct.value.trim(), extra: qExt.value.trim() });
        if (res.error) { hint.textContent = res.error.message; subBtn.disabled = false; return; }
        formWrap.classList.add("hidden");
        applyBtn.classList.add("hidden");
        statusWrap.replaceChildren(h("div", { class: "tk-rep adm", text: "Application submitted! The AI reviewed your answers and sent your application to the owner for a Yes/No decision." }));
      }});
      formWrap.append(
        h("div", { class: "name", style: "margin-bottom:6px", text: "Admin Application Form" }),
        h("label", { class: "lbl-q", text: "1. Why do you want to be an admin?" }), qWhy,
        h("label", { class: "lbl-q", text: "2. How would you handle spam, rule-breaking videos, or user disputes?" }), qMod,
        h("label", { class: "lbl-q", text: "3. How active are you and what would you help improve?" }), qAct,
        h("label", { class: "lbl-q", text: "4. Anything else? (optional)" }), qExt,
        hint,
        subBtn
      );
      api("/api/admin-applications/mine").then(m => {
        if (m.data) {
          if (m.data.status === "pending") applyBtn.classList.add("hidden");
          statusWrap.replaceChildren(h("div", { class: "tk-rep adm", text: `Your latest admin application (${when(m.data.created_at)}): ${m.data.status === "pending" ? "Pending owner decision" : m.data.status}.` }));
        }
      });
    }

    denied.replaceChildren(
      h("div", { class: "name", text: isGuest ? "Guest accounts can't access the Admin panel." : "You don't have access to this page." }),
      h("div", { class: "sub", style: "margin:8px 0 14px", text: isGuest ? "This is a guest session. Sign in with an admin or owner account to use this feature." : "Only admins and the owner can open the Admin panel. Want to apply?" }),
      statusWrap,
      h("div", { style: "display:flex;gap:10px;flex-wrap:wrap" },
        applyBtn,
        h("a", { class: "btn", href: "/login", text: isGuest ? "Sign in" : "Switch account" }),
        h("a", { class: "btn", href: "/scroll", text: "Back to Feed" })),
      formWrap
    );
    denied.classList.remove("hidden");
    return;
  }
  me = r.data.role; $("app").classList.remove("hidden");
  if (me === "owner") $("logTab").classList.remove("hidden");
  loadUsers();
})();
