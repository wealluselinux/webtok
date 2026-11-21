/* Admin panel. Every action is checked again on the server, so hiding buttons here is only for convenience. */
const sbc = window.supabase.createClient();
const $ = id => document.getElementById(id);
let me = null;

// Builds elements safely (text is never treated as HTML)
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach(c => e.append(c)); return e;
}
async function api(path, body) {
  const { data } = await sbc.auth.getSession(), s = data.session;
  if (!s) { location.href = "/login"; return { error: { message: "Sign in" } }; }
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access_token }, body: JSON.stringify(body) }
                                   : { headers: { Authorization: "Bearer " + s.access_token } });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { data: null, error: j.error || { message: "Request failed" } };
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
      h("button", { class: "btn " + (u.banned ? "" : "bad"), disabled: !canAct, text: u.banned ? "Unsuspend" : "Suspend", onclick: () => ban(u) })),
    h("div", { class: "acts" }, ...boxes, h("button", { class: "btn p", disabled: !canAct, text: "Save limits", onclick: () => saveLimits(u, card) })));
  return card;
}
async function resetPw(u) {
  const ok = await wtConfirm({
    title: `Reset password for @${u.username}?`,
    message: "They will be signed out everywhere and given a temporary password.",
    icon: "lock_reset",
    confirmText: "Reset",
    danger: true
  });
  if (!ok) return;
  const r = await api("/api/admin/reset-password", { userId: u.id });
  if (r.error) return toast(r.error.message);
  const box = $("result"); box.classList.remove("hidden");
  box.replaceChildren(h("div", { text: `New temporary password for @${r.data.username} (${r.data.email}). It's shown only once:` }), h("code", { text: r.data.password }),
    h("div", {}, h("button", { class: "btn", text: "Copy", onclick: () => navigator.clipboard && navigator.clipboard.writeText(r.data.password) }),
      h("button", { class: "btn", style: "margin-left:8px", text: "Close", onclick: () => box.classList.add("hidden") })));
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
  ["users", "content", "log"].forEach(t => $(t).classList.toggle("hidden", t !== b.dataset.tab));
  if (b.dataset.tab === "content") loadContent(); if (b.dataset.tab === "log") loadLog();
});
let qt = null; $("q").oninput = () => { clearTimeout(qt); qt = setTimeout(loadUsers, 300); };

(async () => {
  const r = await api("/api/admin/me");
  if (r.error || !["admin", "owner"].includes(r.data.role)) { $("denied").classList.remove("hidden"); return; }
  me = r.data.role; $("app").classList.remove("hidden");
  if (me === "owner") $("logTab").classList.remove("hidden");
  loadUsers();
})();
