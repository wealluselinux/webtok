/* Profile page: config, shared state, escapeHtml */
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.WT_CONFIG || {};
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const $ = id => document.getElementById(id);
let sb = null, user = null, profile = null, targetId = null, isMe = false, acctData = null, acctTab = "posted";
let myFollowing = new Set(), myFollowers = new Set();
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { console.warn(e); }

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
