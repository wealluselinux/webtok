/* Profile page: theme settings dialog and delete account */
/* ---------- Settings & Delete Account ---------- */
function renderSettings() {
  const t = getTheme();
  $("st-mode").value = t.mode || "auto";
  $("st-custom-color").value = t.color || "#7b3f8c";
  $("st-del-hint").textContent = "";
  const sw = $("st-swatches"); sw.innerHTML = "";
  PRESETS.forEach(p => {
    const b = document.createElement("button");
    b.className = "swatch" + ((t.color || "#7b3f8c").toLowerCase() === p.hex ? " on" : "");
    b.style.background = p.hex; b.title = p.name;
    b.onclick = () => { saveTheme({ color: p.hex }); renderSettings(); };
    sw.appendChild(b);
  });
  const wps = $("st-wps"); wps.innerHTML = "";
  WP_PRESETS.forEach(w => {
    const b = document.createElement("button");
    b.className = "wp-opt" + ((t.wallpaper || "") === w.css ? " on" : "");
    if (w.css) b.style.backgroundImage = w.css;
    b.textContent = w.label;
    b.onclick = () => { saveTheme({ wallpaper: w.css }); renderSettings(); };
    wps.appendChild(b);
  });
}
$("btn-settings").onclick = () => { renderSettings(); $("settingsDlg").showModal(); };
$("st-mode").onchange = e => saveTheme({ mode: e.target.value });
$("st-custom-color").oninput = e => saveTheme({ color: e.target.value });
$("st-wp-upload").onclick = () => $("st-wp-file").click();
$("st-wp-file").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    const scale = Math.min(1280 / img.width, 1280 / img.height, 1);
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    saveTheme({ wallpaper: c.toDataURL("image/jpeg", .82) });
    renderSettings();
  };
  img.src = URL.createObjectURL(f);
};
$("st-reset").onclick = async () => {
  localStorage.removeItem("wt_theme");
  applyTheme({});
  if (sb && user) { try { await sb.from("profiles").update({ theme: {} }).eq("id", user.id); } catch {} }
  renderSettings();
};
$("btn-del-acct").onclick = async () => {
  if (!confirm("Permanently delete your account and all your videos, likes, and comments? This cannot be undone.")) return;
  $("btn-del-acct").disabled = true;
  $("st-del-hint").textContent = "Deleting account…";
  const { error } = await sb.rpc("delete_my_account");
  if (error) {
    $("btn-del-acct").disabled = false;
    $("st-del-hint").textContent = error.message;
    $("st-del-hint").className = "hint bad";
    return;
  }
  try { await sb.auth.signOut(); localStorage.clear(); } catch {}
  location.href = "/";
};
