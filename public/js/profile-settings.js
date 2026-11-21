/* Profile page: theme settings dialog and delete account */
/* ---------- Settings & Delete Account ---------- */
function setSettingsHint(msg, bad = false) {
  const el = $("st-del-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.className = bad ? "hint bad" : "hint";
}
function renderSettings() {
  const t = getTheme();
  $("st-mode").value = t.mode || "auto";
  $("st-custom-color").value = t.color || "#7b3f8c";
  setSettingsHint("");
  const sw = $("st-swatches"); sw.innerHTML = "";
  PRESETS.forEach(p => {
    const b = document.createElement("button");
    b.className = "swatch" + ((t.color || "#7b3f8c").toLowerCase() === p.hex ? " on" : "");
    b.style.background = p.hex; b.title = p.name;
    b.onclick = async () => {
      await saveTheme({ color: p.hex });
      renderSettings();
      if (window.lastThemeError) setSettingsHint(window.lastThemeError, true);
    };
    sw.appendChild(b);
  });
  const wps = $("st-wps"); wps.innerHTML = "";
  WP_PRESETS.forEach(w => {
    const b = document.createElement("button");
    b.className = "wp-opt" + ((t.wallpaper || "") === w.css ? " on" : "");
    if (w.css) b.style.backgroundImage = w.css;
    b.textContent = w.label;
    b.onclick = async () => {
      await saveTheme({ wallpaper: w.css });
      renderSettings();
      if (window.lastThemeError) setSettingsHint(window.lastThemeError, true);
    };
    wps.appendChild(b);
  });
}
$("btn-settings").onclick = () => { renderSettings(); $("settingsDlg").showModal(); };
$("st-mode").onchange = async e => {
  await saveTheme({ mode: e.target.value });
  if (window.lastThemeError) setSettingsHint(window.lastThemeError, true);
};
$("st-custom-color").oninput = e => saveTheme({ color: e.target.value });
$("st-wp-upload").onclick = () => $("st-wp-file").click();
$("st-wp-file").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const objUrl = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(objUrl);
    const c = document.createElement("canvas");
    const scale = Math.min(1280 / img.width, 1280 / img.height, 1);
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    $("st-wp-upload").disabled = true;
    setSettingsHint("Uploading wallpaper…");
    c.toBlob(async blob => {
      try {
        if (!blob) throw new Error("Could not process image.");
        let wpValue = "";
        if (sb && user) {
          const path = user.id + "/wallpaper.jpg";
          const up = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
          if (up?.error) throw up.error;
          wpValue = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?t=" + Date.now();
        } else {
          wpValue = c.toDataURL("image/jpeg", .82);
        }
        await saveTheme({ wallpaper: wpValue });
        renderSettings();
        setSettingsHint(window.lastThemeError || "Wallpaper saved!", !!window.lastThemeError);
      } catch (err) {
        setSettingsHint(err?.message || "Could not upload wallpaper.", true);
      } finally {
        $("st-wp-upload").disabled = false;
        e.target.value = "";
      }
    }, "image/jpeg", .82);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objUrl);
    setSettingsHint("Could not read image file.", true);
  };
  img.src = objUrl;
};
$("st-reset").onclick = async () => {
  localStorage.removeItem("wt_theme");
  activeProfileTheme = null;
  applyTheme({});
  if (sb && user) { try { await sb.from("profiles").update({ theme: {} }).eq("id", user.id); } catch {} }
  renderSettings();
};
$("btn-del-acct").onclick = async () => {
  if (!confirm("Permanently delete your account and all your videos, likes, and comments? This cannot be undone.")) return;
  $("btn-del-acct").disabled = true;
  setSettingsHint("Deleting account…");
  const { error } = await sb.rpc("delete_my_account");
  if (error) {
    $("btn-del-acct").disabled = false;
    setSettingsHint(error.message, true);
    return;
  }
  try { await sb.auth.signOut(); localStorage.clear(); } catch {}
  location.href = "/";
};
