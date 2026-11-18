/* Follows, friends and search filtering */
/* ---------- Social: follow / friends / search ---------- */
let following = new Set(), followedBy = new Set();
const friendIds = () => [...following].filter(id => followedBy.has(id));
async function loadSocial() {
  following = new Set(); followedBy = new Set();
  if (!sb || !user) return;
  const [a, b] = await Promise.all([
    sb.from("follows").select("following_id").eq("follower_id", user.id),
    sb.from("follows").select("follower_id").eq("following_id", user.id)]);
  (a.data || []).forEach(r => following.add(r.following_id));
  (b.data || []).forEach(r => followedBy.add(r.follower_id));
}
function followBtn(v) {
  if (!v.user_id || (user && v.user_id === user.id)) return "";
  return `<button class="fab" data-a="follow" data-follow="${v.user_id}"><span class="ms">person_add</span><small>Follow</small></button>`;
}
function paintFollow(b) {
  const id = b.dataset.follow, f = following.has(id);
  b.classList.toggle("on", f);
  b.querySelector("span").textContent = f ? "how_to_reg" : "person_add";
  b.querySelector("small").textContent = f ? (followedBy.has(id) ? "Friends" : "Following") : "Follow";
}
function filterMode(list) {
  const h = location.hash;
  if (h === "#following") return list.filter(v => following.has(v.user_id));
  if (h === "#friends") { const f = new Set(friendIds()); return list.filter(v => f.has(v.user_id)); }
  if (h.startsWith("#search=")) {
    const q = decodeURIComponent(h.slice(8)).toLowerCase();
    return list.filter(v => (v.name || "").toLowerCase().includes(q) || (v.username || "").toLowerCase().includes(q));
  }
  return list;
}
