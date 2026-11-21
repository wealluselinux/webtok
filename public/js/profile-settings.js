/* Profile page: full-screen sectioned settings (Theme, Account with current-password verification, Security) */
let origAcctEmail = "";

function setThemeHint(msg, bad = false) {
  const el = $("st-theme-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.className = bad ? "hint bad" : "hint";
}
function setAcctHint(msg, bad = false) {
  const el = $("st-acct-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.className = bad ? "hint bad" : "hint";
}
function setDelHint(msg, bad = false) {
  const el = $("st-del-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.className = bad ? "hint bad" : "hint";
}

function showSettingsSection(sec) {
  document.querySelectorAll(".st-nav-btn").forEach(b => b.classList.toggle("on", b.dataset.sec === sec));
  document.querySelectorAll(".st-sec").forEach(s => s.classList.toggle("hidden", s.id !== "st-sec-" + sec));
}
document.querySelectorAll(".st-nav-btn").forEach(b => {
  b.onclick = () => showSettingsSection(b.dataset.sec);
});

function updateVerifyState() {
  const emailVal = ($("st-acct-email")?.value || "").trim().toLowerCase();
  const newPw = $("st-acct-newpw")?.value || "";
  const needsVerify = (origAcctEmail && emailVal !== origAcctEmail) || newPw.length > 0;
  $("st-verify-box")?.classList.toggle("req", needsVerify);
}

function renderSettings() {
  const t = getTheme();
  $("st-mode").value = t.mode || "auto";
  $("st-custom-color").value = t.color || "#6750a4";
  setThemeHint("");
  setDelHint("");
  const sw = $("st-swatches"); sw.innerHTML = "";
  PRESETS.forEach(p => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + ((t.color || "#6750a4").toLowerCase() === p.hex ? " on" : "");
    b.style.background = p.hex; b.title = p.name;
    b.onclick = async () => {
      await saveTheme({ color: p.hex });
      renderSettings();
      if (window.lastThemeError) setThemeHint(window.lastThemeError, true);
    };
    sw.appendChild(b);
  });
  const wps = $("st-wps"); wps.innerHTML = "";
  WP_PRESETS.forEach(w => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wp-opt" + ((t.wallpaper || "") === w.css ? " on" : "");
    if (w.css) b.style.backgroundImage = w.css;
    b.textContent = w.label;
    b.onclick = async () => {
      await saveTheme({ wallpaper: w.css });
      renderSettings();
      if (window.lastThemeError) setThemeHint(window.lastThemeError, true);
    };
    wps.appendChild(b);
  });
}

async function loadAccountSettings() {
  setAcctHint("");
  $("st-acct-newpw").value = "";
  $("st-acct-curpw").value = "";
  if (profile) {
    $("st-acct-display").value = profile.display_name || "";
    $("st-acct-user").value = profile.username || "";
  }
  try {
    const { data } = await sb.auth.getSession();
    const tok = data?.session?.access_token;
    if (!tok) return;
    const r = await fetch("/api/account/me", { headers: { Authorization: "Bearer " + tok } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.data) {
      origAcctEmail = (j.data.email || "").toLowerCase();
      $("st-acct-email").value = j.data.email || "";
      $("st-acct-display").value = j.data.display_name || "";
      $("st-acct-user").value = j.data.username || "";
    }
  } catch {}
  updateVerifyState();
}

$("btn-settings").onclick = () => {
  showSettingsSection("theme");
  renderSettings();
  loadAccountSettings();
  $("settingsDlg").showModal();
};

$("st-acct-email").oninput = updateVerifyState;
$("st-acct-newpw").oninput = updateVerifyState;

$("st-acct-save").onclick = async () => {
  const display_name = $("st-acct-display").value.trim();
  const username = $("st-acct-user").value.trim().toLowerCase();
  const email = $("st-acct-email").value.trim().toLowerCase();
  const new_password = $("st-acct-newpw").value;
  const current_password = $("st-acct-curpw").value;

  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    setAcctHint("Username must be 3 to 20 characters (letters, numbers, _ or .).", true);
    return;
  }
  if ((email !== origAcctEmail || new_password) && !current_password) {
    setAcctHint("Enter your current password to verify email or password changes.", true);
    $("st-acct-curpw").focus();
    return;
  }

  $("st-acct-save").disabled = true;
  setAcctHint("Saving changes…");
  try {
    const { data } = await sb.auth.getSession();
    const tok = data?.session?.access_token;
    if (!tok) throw new Error("Please sign in again.");
    const r = await fetch("/api/account/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ display_name, username, email, new_password, current_password })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error?.message || "Could not update account.");
    origAcctEmail = (j.data.email || email).toLowerCase();
    $("st-acct-newpw").value = "";
    $("st-acct-curpw").value = "";
    updateVerifyState();
    if (profile) {
      profile.display_name = j.data.display_name || j.data.username;
      profile.username = j.data.username;
      if (typeof paintProfileHeader === "function") paintProfileHeader();
    }
    setAcctHint("Account updated!");
  } catch (err) {
    setAcctHint(err?.message || "Could not update account.", true);
  } finally {
    $("st-acct-save").disabled = false;
  }
};

$("st-mode").onchange = async e => {
  await saveTheme({ mode: e.target.value });
  if (window.lastThemeError) setThemeHint(window.lastThemeError, true);
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
    setThemeHint("Uploading wallpaper…");
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
        setThemeHint(window.lastThemeError || "Wallpaper saved!", !!window.lastThemeError);
      } catch (err) {
        setThemeHint(err?.message || "Could not upload wallpaper.", true);
      } finally {
        $("st-wp-upload").disabled = false;
        e.target.value = "";
      }
    }, "image/jpeg", .82);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objUrl);
    setThemeHint("Could not read image file.", true);
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

$("btn-logout-all").onclick = async () => {
  if (!confirm("Sign out of all devices and browsers?")) return;
  $("btn-logout-all").disabled = true;
  try {
    const { data } = await sb.auth.getSession();
    const tok = data?.session?.access_token;
    if (tok) await fetch("/api/security/logout-all", { method: "POST", headers: { Authorization: "Bearer " + tok } });
    try { await sb.auth.signOut(); localStorage.removeItem("wt_accounts"); } catch {}
    location.href = "/login";
  } catch {
    $("btn-logout-all").disabled = false;
  }
};

$("btn-del-acct").onclick = async () => {
  if (!confirm("Permanently delete your account and all your videos, likes, and comments? This cannot be undone.")) return;
  $("btn-del-acct").disabled = true;
  setDelHint("Deleting account…");
  const { error } = await sb.rpc("delete_my_account");
  if (error) {
    $("btn-del-acct").disabled = false;
    setDelHint(error.message, true);
    return;
  }
  try { await sb.auth.signOut(); localStorage.clear(); } catch {}
  location.href = "/";
};
