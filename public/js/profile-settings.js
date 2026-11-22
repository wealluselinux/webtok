/* Profile page: full-screen sectioned settings (Theme, Wallpaper Match, Spin Shapes, Layout & Reorder, Account, Security) */
let origAcctEmail = "";
const SB_LABELS = { explore: "Explore", fyp: "For You", following: "Following", friends: "Friends", upload: "Upload", games: "Games", activity: "Activity", messages: "Messages", profile: "Profile" };
const RAIL_LABELS = { follow: "Follow", like: "Like", comment: "Comment", share: "Share" };

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

function renderOrderList(containerId, list, labels, key) {
  const box = $(containerId); if (!box) return;
  box.innerHTML = "";
  list.forEach((id, idx) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:16px;background:var(--surface)";
    row.innerHTML = `<span style="font-size:13px;font-weight:700">${labels[id] || id}</span>
      <div style="display:flex;gap:4px">
        <button type="button" class="btn icon" style="width:32px;height:32px" ${idx === 0 ? "disabled" : ""} data-d="-1"><span class="ms" style="font-size:16px">arrow_upward</span></button>
        <button type="button" class="btn icon" style="width:32px;height:32px" ${idx === list.length - 1 ? "disabled" : ""} data-d="1"><span class="ms" style="font-size:16px">arrow_downward</span></button>
      </div>`;
    row.querySelectorAll("button").forEach(btn => btn.onclick = async () => {
      const d = Number(btn.dataset.d), next = [...list], swap = idx + d;
      if (swap < 0 || swap >= next.length) return;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      await saveTheme({ [key]: next });
      renderSettings();
    });
    box.appendChild(row);
  });
}

function renderSettings() {
  const t = getTheme();
  $("st-mode").value = t.mode || "auto";
  $("st-custom-color").value = t.color || "#6750a4";
  if ($("st-spin-shapes")) $("st-spin-shapes").checked = !!t.spinShapes;
  if ($("st-sb-pos")) $("st-sb-pos").value = t.sbPos || "left";
  if ($("st-radius")) $("st-radius").value = t.radius || "round";
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
      await saveTheme({ wallpaper: w.css, wpColor: "" });
      renderSettings();
      if (window.lastThemeError) setThemeHint(window.lastThemeError, true);
    };
    wps.appendChild(b);
  });
  renderOrderList("st-sb-order", (Array.isArray(t.sbOrder) && t.sbOrder.length) ? t.sbOrder : (window.WT_DEFAULT_SB_ORDER || Object.keys(SB_LABELS)), SB_LABELS, "sbOrder");
  renderOrderList("st-rail-order", (Array.isArray(t.railOrder) && t.railOrder.length) ? t.railOrder : (window.WT_DEFAULT_RAIL_ORDER || Object.keys(RAIL_LABELS)), RAIL_LABELS, "railOrder");
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
if ($("st-wp-match")) {
  $("st-wp-match").onclick = async () => {
    const t = getTheme();
    if (!t.wallpaper) { setThemeHint("Pick or upload a wallpaper first!", true); return; }
    setThemeHint("Generating Material You palette from wallpaper…");
    const hex = t.wpColor || (window.wtExtractWallpaperColor ? await window.wtExtractWallpaperColor(t.wallpaper, t.color) : "#6750a4");
    await saveTheme({ color: hex });
    renderSettings();
    setThemeHint(`Matched wallpaper palette (${hex})!`);
  };
}
if ($("st-spin-shapes")) {
  $("st-spin-shapes").onchange = async e => {
    const on = !!e.target.checked;
    if (window.wtApplySpinShapes) window.wtApplySpinShapes(on);
    await saveTheme({ spinShapes: on });
    if (window.lastThemeError) setThemeHint(window.lastThemeError, true);
  };
}
if ($("st-sb-pos")) $("st-sb-pos").onchange = e => saveTheme({ sbPos: e.target.value });
if ($("st-radius")) $("st-radius").onchange = e => saveTheme({ radius: e.target.value });
if ($("st-sb-reset")) $("st-sb-reset").onclick = async () => { await saveTheme({ sbOrder: null }); renderSettings(); };
if ($("st-rail-reset")) $("st-rail-reset").onclick = async () => { await saveTheme({ railOrder: null }); renderSettings(); };

$("st-wp-upload").onclick = () => $("st-wp-file").click();
$("st-wp-file").onchange = e => {
  const f = e.target.files?.[0];
  if (!f) return;
  const img = new Image();
  const objUrl = URL.createObjectURL(f);
  img.onload = () => {
    URL.revokeObjectURL(objUrl);
    const maxW = 1440, scale = Math.min(1, maxW / img.width);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const extracted = window.wtExtractColorFromCanvas ? window.wtExtractColorFromCanvas(c) : "";
    $("st-wp-upload").disabled = true;
    setThemeHint("Uploading wallpaper…");
    c.toBlob(async blob => {
      try {
        if (!blob) throw new Error("Could not process image.");
        const { data } = await sb.auth.getSession();
        const tok = data?.session?.access_token;
        let wpValue = "";
        if (tok) {
          const r = await fetch("/api/wallpapers", { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + tok }, body: blob });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.error) throw new Error(j.error?.message || "Upload failed");
          wpValue = j.data.url;
        } else {
          wpValue = c.toDataURL("image/jpeg", 0.72);
        }
        await saveTheme({ wallpaper: wpValue, wpColor: extracted });
        renderSettings();
        setThemeHint(window.lastThemeError || "Wallpaper saved! Click 'Match wallpaper' to generate its palette.", !!window.lastThemeError);
      } catch (err) {
        setThemeHint(err?.message || "Could not upload wallpaper.", true);
      } finally {
        $("st-wp-upload").disabled = false;
        e.target.value = "";
      }
    }, "image/jpeg", 0.82);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objUrl);
    setThemeHint("Could not read image file.", true);
  };
  img.src = objUrl;
};
$("st-reset").onclick = async () => {
  localStorage.removeItem("wt_theme");
  activeProfileTheme = {};
  if (window.wtApplySpinShapes) window.wtApplySpinShapes(false);
  if (window.wtApplyLayoutPrefs) window.wtApplyLayoutPrefs({});
  applyTheme({});
  if (sb && user) { try { await sb.from("profiles").update({ theme: {} }).eq("id", user.id); } catch {} }
  renderSettings();
};

$("btn-logout-all").onclick = async () => {
  const ok = await wtConfirm({
    title: "Sign out all devices?",
    message: "You will be signed out on every browser and device where your account is logged in.",
    icon: "logout",
    confirmText: "Sign out all",
    danger: true
  });
  if (!ok) return;
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
  const ok = await wtConfirm({
    title: "Delete account?",
    message: "This will permanently delete your account and all your videos, likes, and comments. This cannot be undone.",
    icon: "delete_forever",
    confirmText: "Delete account",
    danger: true
  });
  if (!ok) return;
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