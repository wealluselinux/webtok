/* Landing page buttons, dynamic auth state, and live user stats */
const startBtn = $("start");
if (startBtn) startBtn.onclick = e => {
  e.preventDefault();
  location.href = "/scroll#fyp";
};
if (typeof initAuth === "function") initAuth();

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

(async () => {
  try {
    if (!sb?.auth?.getSession) return;
    const { data } = await sb.auth.getSession();
    const btn = $("signin");
    if (btn && data?.session) {
      btn.textContent = "Go to Web Tok";
      btn.href = "/scroll";
    }
  } catch {}
})();
