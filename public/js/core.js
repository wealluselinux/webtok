/* Shared basics: Supabase client, $ helper, escapeHtml. Loaded on every app page. */
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.WT_CONFIG || {};
const $ = id => document.getElementById(id);
let sb = null, user = null, profile = null;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { console.warn(e); }

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

