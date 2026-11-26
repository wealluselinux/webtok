/* Landing page buttons, dynamic auth state, and live user stats */
const startBtn = $("start");
if (startBtn) startBtn.onclick = e => {
  e.preventDefault();
  location.href = "/scroll#fyp";
};
if (typeof initAuth === "function") initAuth();

// Update sign-in button based on auth state
(async () => {
  if (!window.sb) return;
  try {
    const { data } = await window.sb.auth.getSession();
    const signinBtn = document.getElementById("signin");
    if (signinBtn && data?.session?.user) {
      signinBtn.textContent = "Go to Web Tok";
      signinBtn.href = "/scroll";
    }
  } catch {}
})();

async function loadHomeStats() {
  try {
    const r = await fetch("/api/stats/users");
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.data) return;
    const tot = $("stTotal"), on = $("stOnline");
    if (tot) tot.textContent = Number(j.data.totalUsers || 0).toLocaleString();
    if (on) on.textContent = Number(j.data.onlineUsers || 0).toLocaleString();
  } catch {}
}
loadHomeStats();
setInterval(() => { if (!document.hidden) loadHomeStats(); }, 15000);
