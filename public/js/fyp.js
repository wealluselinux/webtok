/* For You page: view tracking + hashtag-based ranking (runs in the browser, re-ranks each time For You loads) */
let viewRows = [];                 // this user's history: [{ video_id, created_at, liked }]
let activeVid = null;              // the video currently on screen
const seenThisSession = new Set();

async function loadViews() {
  viewRows = [];
  if (!sb || !user) return;
  const { data } = await sb.from("video_views").select("video_id, created_at, liked").eq("user_id", user.id).order("created_at");
  viewRows = data || [];
}

// Counts as a "view" once a video has been on screen for about a second
function trackView(id) {
  if (!user || !id || seenThisSession.has(id)) return;
  setTimeout(async () => {
    if (activeVid !== id || seenThisSession.has(id)) return;
    seenThisSession.add(id);
    const { error } = await sb.from("video_views").upsert({ user_id: user.id, video_id: id }, { onConflict: "user_id,video_id", ignoreDuplicates: true });
    if (!error && !viewRows.some(r => r.video_id === id)) viewRows.push({ video_id: id, created_at: new Date().toISOString(), liked: false });
  }, 1200);
}

async function markLiked(id, liked) {
  if (!user) return;
  await sb.from("video_views").upsert({ user_id: user.id, video_id: id, liked }, { onConflict: "user_id,video_id" });
  const r = viewRows.find(x => x.video_id === id);
  if (r) r.liked = liked; else viewRows.push({ video_id: id, created_at: new Date().toISOString(), liked });
}

const TAG_TRIES = 5; // show up to 5 videos for a liked tag; if none get liked, pause that tag

function fypOrder(list) {
  const byId = Object.fromEntries(list.map(v => [v.id, v]));
  const affinity = {}, streak = {};
  // Tags from videos you liked
  list.forEach(v => { if (v.likedByMe) (v.hashtags || []).forEach(t => { affinity[t] = (affinity[t] || 0) + 1; }); });
  // Tag tests: videos with the tag you saw and did NOT like since your last like on that tag
  viewRows.forEach(r => {
    const v = byId[r.video_id]; if (!v) return;
    (v.hashtags || []).forEach(t => { streak[t] = r.liked ? 0 : (streak[t] || 0) + 1; });
  });
  const active = t => affinity[t] > 0 && (streak[t] || 0) < TAG_TRIES;
  const score = v => (v.hashtags || []).reduce((s, t) => s + (active(t) ? 1 + Math.log(1 + affinity[t]) : 0), 0);

  const seen = new Set(viewRows.map(r => r.video_id));
  const fresh = list.filter(v => !seen.has(v.id) && !v.likedByMe && !(user && v.user_id === user.id));
  const pool = fresh.length >= 3 ? fresh : list;               // seen everything? start over

  const scored = pool.map(v => ({ v, s: score(v) })).filter(x => x.s > 0).map(x => ({ v: x.v, k: x.s + Math.random() * 0.5 }));
  const exploit = scored.sort((a, b) => b.k - a.k).map(x => x.v);                    // matches what you like
  const ids = new Set(exploit.map(v => v.id));
  const explore = pool.filter(v => !ids.has(v.id)).sort(() => Math.random() - 0.5);   // new things to test

  const out = []; let i = 0, j = 0;
  while (i < exploit.length || j < explore.length) {          // 7 you-might-like, then 3 new, repeat
    for (let k = 0; k < 7 && i < exploit.length; k++) out.push(exploit[i++]);
    for (let k = 0; k < 3 && j < explore.length; k++) out.push(explore[j++]);
    if (i >= exploit.length) while (j < explore.length) out.push(explore[j++]);
    if (j >= explore.length) while (i < exploit.length) out.push(exploit[i++]);
  }
  return out;
}
