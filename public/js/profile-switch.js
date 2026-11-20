/* Profile page: account switcher and sign out */
/* ---------- Account Switcher ---------- */
function getSavedAccounts() {
  try { return JSON.parse(localStorage.getItem("wt_accounts") || "[]"); } catch { return []; }
}
function setSavedAccounts(list) {
  try { localStorage.setItem("wt_accounts", JSON.stringify(list.slice(0, 10))); } catch {}
}
function syncCurrentAccount(session, prof) {
  if (!session?.user || !session?.refresh_token) return;
  const list = getSavedAccounts().filter(a => a.id !== session.user.id);
  const meta = session.user.user_metadata || {};
  list.unshift({
    id: session.user.id,
    email: session.user.email || "",
    username: prof?.username || meta.username || (session.user.email || "user").split("@")[0],
    display_name: prof?.display_name || meta.display_name || prof?.username || "Web Tok User",
    avatar_url: prof?.avatar_url || null,
    refresh_token: session.refresh_token
  });
  setSavedAccounts(list);
}
function renderSwitchList() {
  const listEl = $("sw-list");
  const accounts = getSavedAccounts();
  $("sw-hint").textContent = "";
  $("sw-hint").className = "hint";
  if (!accounts.length) {
    listEl.innerHTML = '<div style="color:var(--muted);padding:12px">No saved accounts yet.</div>';
    return;
  }
  listEl.innerHTML = "";
  accounts.forEach(acct => {
    const isCur = user && acct.id === user.id;
    const row = document.createElement("div");
    row.className = "u-row";
    row.style.cursor = isCur ? "default" : "pointer";
    const init = escapeHtml((acct.display_name || acct.username || "U")[0].toUpperCase());
    const av = acct.avatar_url ? `style="background-image:url(${escapeHtml(acct.avatar_url)})"` : "";
    row.innerHTML = `
      <div class="u-av" ${av}>${acct.avatar_url ? "" : init}</div>
      <div class="u-meta">
        <b>${escapeHtml(acct.display_name || acct.username)}</b>
        <small>@${escapeHtml(acct.username)}</small>
      </div>
      ${isCur ? '<span class="chip p" style="padding:5px 12px;font-size:12px">Active</span>' : '<button type="button" class="btn icon" title="Remove">✕</button>'}`;
    if (!isCur) {
      row.onclick = async e => {
        if (e.target.closest("button")) return;
        $("sw-hint").textContent = `Switching to @${acct.username}…`;
        $("sw-hint").className = "hint";
        const { data, error } = await sb.auth.refreshSession({ refresh_token: acct.refresh_token });
        if (error || !data?.session) {
          $("sw-hint").textContent = "Session expired for @" + acct.username + ". Please sign in again.";
          $("sw-hint").className = "hint bad";
          return;
        }
        syncCurrentAccount(data.session, acct);
        location.href = "/profile";
      };
      const rmBtn = row.querySelector("button");
      if (rmBtn) rmBtn.onclick = e => {
        e.stopPropagation();
        setSavedAccounts(getSavedAccounts().filter(a => a.id !== acct.id));
        renderSwitchList();
      };
    }
    listEl.appendChild(row);
  });
}
$("btn-switch-acct").onclick = () => { renderSwitchList(); $("switchDlg").showModal(); };

$("btn-signout").onclick = async () => {
  if (user) setSavedAccounts(getSavedAccounts().filter(a => a.id !== user.id));
  try { await sb.auth.signOut(); } catch {}
  location.href = "/scroll";
};
