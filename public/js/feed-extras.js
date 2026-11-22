/* Global User Search + Sounds Link on Feed */
(function initExtrasBar() {
  const page = document.body.dataset.page || "";
  if (page !== "scroll" && page !== "home") return;

  const style = document.createElement("style");
  style.textContent = `
    #wt-top-tools{position:fixed;top:14px;right:14px;z-index:25;display:flex;gap:8px;align-items:center}
    .wt-pill{padding:9px 15px;border-radius:999px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;box-shadow:0 4px 16px #0002;transition:transform .15s}
    .wt-pill:hover{transform:translateY(-1px)}
    .wt-sav{width:38px;height:38px;clip-path:var(--m3-cookie-7);background:var(--surface) center/cover;display:grid;place-items:center;font-weight:700;font-size:16px;color:var(--primary);flex:none}
    #wt-search-dlg{border:0;border-radius:32px;padding:22px;width:min(94vw,420px);background:var(--bg);color:var(--text);margin:auto;box-shadow:0 16px 48px #0005}
    #wt-search-dlg::backdrop{background:#0007;backdrop-filter:blur(4px)}
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

  const sDlg = document.createElement("dialog");
  sDlg.id = "wt-search-dlg";
  sDlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Find Users</h3><button type="button" class="wt-pill" onclick="this.closest('dialog').close()"><span class="ms" style="font-size:18px">close</span></button></div>
    <input id="wtSearchIn" type="text" placeholder="Search @username or name…" style="width:100%;padding:12px 16px;border-radius:999px;border:0;background:var(--surface);color:var(--text);font:inherit;outline:0">
    <div class="wt-sres" id="wtSearchRes"></div>`;
  document.body.appendChild(sDlg);

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
        a.innerHTML = `<div class="wt-sav" style="${u.avatar_url ? `background-image:url(${u.avatar_url})` : ""}">${u.avatar_url ? "" : init}</div>
          <div><div style="font-weight:700;font-size:14px">${(u.display_name || u.username).replace(/</g,"&lt;")}</div><div style="font-size:12px;color:var(--muted)">@${u.username.replace(/</g,"&lt;")}</div></div>`;
        resEl.appendChild(a);
      });
    }, 220);
  };
})();
