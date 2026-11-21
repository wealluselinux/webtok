/* Message alerts: a red dot next to "Messages" and optional browser (Chrome) notifications.
   Works while Web Tok is open in a tab, even in the background. Loaded by sidebar.js on every page. */
(function () {
  const sbc = window.supabase && window.supabase.createClient();
  if (!sbc) return;
  document.head.insertAdjacentHTML("beforeend", `<style>
#sb .it{position:relative}
.msg-dot{position:absolute;top:8px;left:30px;width:11px;height:11px;border-radius:50%;background:#e5484d;box-shadow:0 0 0 2px var(--bg)}
#notif-toast{position:fixed;left:calc(var(--sbw,0px) + 16px);bottom:calc(var(--sbh,0px) + 16px);z-index:60;background:var(--card);color:var(--text);padding:14px 16px;border-radius:24px;box-shadow:0 8px 30px #0004;display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:min(92vw,400px);font-size:14px}
#notif-toast button{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;background:var(--surface);color:var(--text)}
#notif-toast button.p{background:var(--primary);color:var(--on-primary,#fff)}</style>`);

  const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
  let notifiedId = Number(localStorage.getItem("wt_notified_id") || -1), asked = false;

  function setDot(n) {
    const a = document.querySelector('#sb [data-id="messages"]');
    if (a) {
      let d = a.querySelector(".msg-dot");
      if (n > 0 && !d) { d = document.createElement("i"); d.className = "msg-dot"; d.setAttribute("aria-label", "New messages"); a.appendChild(d); }
      if (!n && d) d.remove();
    }
    document.title = (n ? `(${n}) ` : "") + baseTitle;
  }

  function show(list) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (document.hasFocus() && location.pathname.startsWith("/messages")) return;   // you're already looking at chats
    const m = list[0], name = m.display_name || m.username || "Someone";
    const body = /^\[sticker:/.test(m.body || "") ? "Sent you a sticker" : String(m.body || "").slice(0, 120);
    const n = new Notification(list.length > 1 ? `${name} (${list.length} new messages)` : name, { body, icon: "/images/logo.png", tag: "wt-msg-" + m.sender_id });
    n.onclick = () => { window.focus(); location.href = "/messages#" + m.sender_id; n.close(); };
  }

  function askOnce() {
    if (asked || !("Notification" in window) || Notification.permission !== "default" || localStorage.getItem("wt_notif_asked")) return;
    asked = true;
    setTimeout(() => {
      const t = document.createElement("div");
      t.id = "notif-toast";
      t.innerHTML = '<span>Get a notification when someone messages you?</span><button class="p" id="nt-on">Turn on</button><button id="nt-no">Not now</button>';
      document.body.appendChild(t);
      const done = () => { localStorage.setItem("wt_notif_asked", "1"); t.remove(); };
      t.querySelector("#nt-on").onclick = () => { done(); Notification.requestPermission(); };
      t.querySelector("#nt-no").onclick = done;
    }, 4000);
  }

  async function check() {
    const { data } = await sbc.auth.getSession(), s = data.session;
    if (!s) { setDot(0); return; }
    let j;
    try {
      const r = await fetch("/api/messages/unread", { headers: { Authorization: "Bearer " + s.access_token } });
      if (!r.ok) return;
      j = (await r.json()).data;
    } catch { return; }
    setDot(j.count);
    askOnce();
    if (notifiedId < 0) { notifiedId = j.maxId; localStorage.setItem("wt_notified_id", notifiedId); return; }   // first run: don't alert for old messages
    const fresh = j.latest.filter(m => m.id > notifiedId);
    if (fresh.length) { notifiedId = Math.max(...fresh.map(m => m.id)); localStorage.setItem("wt_notified_id", notifiedId); show(fresh); }
  }

  window.wtMarkRead = async function (fromId) {      // called by the Messages page when you open or receive in a chat
    const { data } = await sbc.auth.getSession(); if (!data.session) return;
    await fetch("/api/messages/read", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token }, body: JSON.stringify({ from: fromId }) }).catch(() => {});
    check();
  };

  // "More" menu: Terms, Privacy, and the Admin panel link for admins
  async function menuExtras() {
    const menu = document.getElementById("sbmenu"); if (!menu || menu.dataset.extras) return;
    menu.dataset.extras = "1";
    const add = (href, icon, text) => { const a = document.createElement("a"); a.className = "it"; a.href = href; a.innerHTML = `<span class="ms">${icon}</span>${text}`; menu.insertBefore(a, menu.querySelector("#sbout")); return a; };
    add("/terms", "description", "Terms of Service"); add("/privacy", "policy", "Privacy Policy");
    try {
      const { data } = await sbc.auth.getSession(); if (!data.session) return;
      const r = await fetch("/api/admin/me", { headers: { Authorization: "Bearer " + data.session.access_token } });
      const role = r.ok ? (await r.json()).data.role : "user";
      if (role === "admin" || role === "owner") add("/admin", "admin_panel_settings", "Admin panel");
    } catch {}
  }
  setTimeout(menuExtras, 600);

  check();
  setInterval(check, 12000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  addEventListener("focus", check);
})();
