/* Session, profile loading, top-bar buttons */
/* ---------- Auth ---------- */
async function loadProfile() {
  if (!sb || !user) { profile = null; return; }
  const meta = user.user_metadata || {};
  let row = null;
  try {
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
    row = data;
  } catch {}
  profile = {
    id: user.id,
    username: row?.username || meta.username || (user.email || "user").split("@")[0],
    display_name: row?.display_name || meta.display_name || meta.username || "Web Tok User",
    avatar_url: row?.avatar_url || null
  };
  if (row?.theme && Object.keys(row.theme).length) {
    try { localStorage.setItem("wt_theme", JSON.stringify(row.theme)); } catch {}
    applyTheme(row.theme);
  }
}
function paintAuth() {
  const dummy = document.createElement("span");
  const acctBtn = $("acct") || dummy, upBtn = $("openUpload") || dummy, signinBtn = $("signin") || dummy;
  if (user) {
    const label = profile?.username ? `@${profile.username}` : "Account";
    const initial = (profile?.display_name || profile?.username || "U")[0].toUpperCase();
    const avStyle = profile?.avatar_url ? `style="background-image:url(${profile.avatar_url})"` : "";
    acctBtn.innerHTML = `<span class="mini-av" ${avStyle}>${profile?.avatar_url ? "" : initial}</span><span>${label}</span>`;
    upBtn.classList.remove("hidden");
    signinBtn.textContent = "My account";
  } else {
    acctBtn.textContent = "Sign in";
    upBtn.classList.add("hidden");
    signinBtn.textContent = "Sign in";
  }
}
async function initAuth() {
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    await loadProfile(); if (typeof loadSocial === "function") await loadSocial();
    paintAuth();
    sb.auth.onAuthStateChange(async (_e, s) => {
      user = s?.user || null;
      await loadProfile(); if (typeof loadSocial === "function") await loadSocial();
      paintAuth();
    });
  } catch (e) { console.warn(e); }
}
function openAuth() { location.href = "/login"; }
if ($("acct")) $("acct").onclick = () => { location.href = user ? "/profile" : "/login"; };
if ($("signin")) $("signin").onclick = () => { location.href = user ? "/profile" : "/login"; };
function requireLogin(fn) { if (user) fn(); else openAuth(); }
