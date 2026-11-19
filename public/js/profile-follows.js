/* Profile page: followers / following pop-up */
/* ---------- Followers / Following Modal ---------- */
async function openFollowModal(mode) {
  $("fl-title").textContent = mode === "followers" ? "Followers" : "Following";
  $("fl-list").innerHTML = '<div style="color:var(--muted);padding:12px">Loading…</div>';
  $("followListDlg").showModal();

  const col = mode === "followers" ? "follower_id" : "following_id";
  const filterCol = mode === "followers" ? "following_id" : "follower_id";
  const { data: rows } = await sb.from("follows").select(col).eq(filterCol, targetId);
  const ids = (rows || []).map(r => r[col]);
  if (!ids.length) {
    $("fl-list").innerHTML = `<div style="color:var(--muted);padding:12px">No ${mode} yet.</div>`;
    return;
  }
  const { data: profs } = await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
  const list = $("fl-list");
  list.innerHTML = "";
  (profs || []).forEach(p => {
    const row = document.createElement("div");
    row.className = "u-row";
    const init = escapeHtml((p.display_name || p.username || "U")[0].toUpperCase());
    const av = p.avatar_url ? `style="background-image:url(${escapeHtml(p.avatar_url)})"` : "";
    const btnHtml = (user && p.id !== user.id)
      ? `<button class="btn sm ${myFollowing.has(p.id) ? "tonal" : "primary"}" data-uid="${p.id}">${myFollowing.has(p.id) ? (myFollowers.has(p.id) ? "Friends" : "Following") : (myFollowers.has(p.id) ? "Follow back" : "Follow")}</button>`
      : "";
    row.innerHTML = `<div class="u-av" ${av}>${p.avatar_url ? "" : init}</div>
      <a class="u-meta" href="/profile?u=${encodeURIComponent(p.username)}"><b>${escapeHtml(p.display_name || p.username)}</b><small>@${escapeHtml(p.username)}</small></a>
      ${btnHtml}`;
    const fbtn = row.querySelector("button");
    if (fbtn) fbtn.onclick = async () => {
      const was = myFollowing.has(p.id);
      if (was) {
        await sb.from("follows").delete().eq("follower_id", user.id).eq("following_id", p.id);
        myFollowing.delete(p.id);
      } else {
        await sb.from("follows").insert({ follower_id: user.id, following_id: p.id });
        myFollowing.add(p.id);
      }
      const nowF = myFollowing.has(p.id);
      fbtn.className = "btn sm " + (nowF ? "tonal" : "primary");
      fbtn.textContent = nowF ? (myFollowers.has(p.id) ? "Friends" : "Following") : (myFollowers.has(p.id) ? "Follow back" : "Follow");
      if (isMe) $("st-following").textContent = myFollowing.size;
    };
    list.appendChild(row);
  });
}
$("btn-followers-list").onclick = () => openFollowModal("followers");
$("btn-following-list").onclick = () => openFollowModal("following");
