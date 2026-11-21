/* Profile page: edit profile dialog */
/* ---------- Edit Profile ---------- */
let editAvatarData = null;
$("btn-edit-prof").onclick = () => {
  editAvatarData = null;
  $("ep-display").value = profile.display_name || "";
  $("ep-user").value = profile.username || "";
  $("ep-bio").value = profile.bio || "";
  $("ep-hint").textContent = ""; $("ep-hint").className = "hint";
  if (profile.avatar_url) { $("ep-av").style.backgroundImage = `url(${profile.avatar_url})`; $("ep-av").innerHTML = ""; }
  else { $("ep-av").style.backgroundImage = ""; $("ep-av").innerHTML = '<span class="ms" style="font-size:32px">photo_camera</span>'; }
  $("editProfDlg").showModal();
};
$("ep-av").onclick = () => $("ep-file").click();
$("ep-file").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const s = Math.min(img.width, img.height);
    c.getContext("2d").drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, 256, 256);
    editAvatarData = c.toDataURL("image/jpeg", .85);
    $("ep-av").style.backgroundImage = `url(${editAvatarData})`; $("ep-av").innerHTML = "";
  };
  img.src = URL.createObjectURL(f);
};
$("ep-save").onclick = async () => {
  const dn = $("ep-display").value.trim(), un = $("ep-user").value.trim().toLowerCase(), bio = $("ep-bio").value.trim();
  if (!/^[a-z0-9_.]{3,20}$/.test(un)) { $("ep-hint").textContent = "Username must be 3–20 chars (a–z, 0–9, _ or .)."; $("ep-hint").className = "hint bad"; return; }
  $("ep-save").disabled = true; $("ep-hint").textContent = "Saving…";
  try {
    let avatar_url = profile.avatar_url;
    if (editAvatarData) {
      const blob = await (await fetch(editAvatarData)).blob();
      const path = user.id + "/avatar.jpg";
      await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      avatar_url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?t=" + Date.now();
    }
    await sb.from("profiles").upsert({ id: user.id, username: un, display_name: dn || un, bio, avatar_url });
    await resolveTargetAndLoad();
    $("editProfDlg").close();
  } catch (e) {
    $("ep-hint").textContent = e.message || "Could not save profile."; $("ep-hint").className = "hint bad";
  } finally { $("ep-save").disabled = false; }
};
