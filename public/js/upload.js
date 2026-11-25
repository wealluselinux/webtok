/* Full-screen Material You batch upload studio (R2 direct upload + status bar + ETA + AI safety check + sound picker + auto hashtags + description/captions) */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
let upQueue = [], uploadUIReady = false, uploadedSounds = [], upPreviewAudio = null, upPreviewIdx = -1;
const _parseTags = s => typeof parseTags === "function"
  ? parseTags(s)
  : [...new Set(String(s || "").toLowerCase().match(/[a-z0-9_]{1,30}/g) || [])];

function fmtEta(sec) {
  if (!isFinite(sec) || sec <= 0) return "almost done";
  if (sec < 60) return `~${sec}s left`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return `~${m}m ${s}s left`;
}

function isAutoTagsOn() {
  try { return JSON.parse(localStorage.getItem("wt_theme") || "{}").autoHashtags !== false; } catch { return true; }
}
function setAutoTagsPref(on) {
  try {
    const t = JSON.parse(localStorage.getItem("wt_theme") || "{}");
    t.autoHashtags = !!on;
    localStorage.setItem("wt_theme", JSON.stringify(t));
    if (typeof window.saveTheme === "function") window.saveTheme({ autoHashtags: !!on }).catch(() => {});
  } catch {}
}
function localQuickTags(title, desc) {
  const stop = new Set(["the","and","for","with","this","that","from","your","you","are","was","were","have","has","had","not","but","out","all","just","like","into","about","video","clip","mp4","mov","webm","new","my","our"]);
  const words = `${title || ""} ${desc || ""}`.toLowerCase().match(/[a-z0-9_]{3,20}/g) || [];
  const uniq = [...new Set(words.filter(w => !stop.has(w) && !/^\d+$/.test(w)))].slice(0, 4);
  if (!uniq.length) uniq.push("webtok", "fyp");
  return uniq.map(w => "#" + w).join(" ");
}
async function generateTagsForItem(item, idx, force = false) {
  if (!force && (!isAutoTagsOn() || item.manualTags)) return;
  const quick = localQuickTags(item.title, item.description);
  if (!item.tags || force) {
    item.tags = quick;
    const inp = document.querySelector(`.up-tags[data-idx="${idx}"]`);
    if (inp) inp.value = item.tags;
  }
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return;
    const r = await fetch("/api/ai/hashtags", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ title: item.title || "", description: item.description || "" })
    });
    const j = await r.json().catch(() => ({}));
    const arr = j?.data?.hashtags;
    if (Array.isArray(arr) && arr.length && (force || (!item.manualTags && isAutoTagsOn()))) {
      item.tags = arr.map(t => "#" + String(t).replace(/^#+/, "")).join(" ");
      const inp = document.querySelector(`.up-tags[data-idx="${idx}"]`);
      if (inp) inp.value = item.tags;
    }
  } catch {}
}

function setStatusBar(phase, pct, etaText) {
  const wrap = $("upBarWrap");
  if (!wrap) return;
  wrap.classList.remove("hidden");
  $("upPhase").textContent = phase;
  $("upStats").textContent = etaText ? `${pct}% · ${etaText}` : `${pct}%`;
  $("upBarFill").style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

function hideStatusBar() {
  const wrap = $("upBarWrap");
  if (wrap) wrap.classList.add("hidden");
}

function stopSoundPreview() {
  if (upPreviewAudio) {
    upPreviewAudio.pause();
    upPreviewAudio.src = "";
  }
  upPreviewIdx = -1;
  document.querySelectorAll(".up-snd-prev").forEach(b => {
    b.innerHTML = '<span class="ms" style="font-size:16px">play_arrow</span>Preview';
  });
}

async function loadUploadSounds() {
  try {
    const r = await fetch("/api/sounds");
    const j = await r.json();
    uploadedSounds = Array.isArray(j?.data) ? j.data : [];
  } catch {
    uploadedSounds = [];
  }
  if ($("uploadDlg")?.open) renderUpQueue();
}

function soundSelectHtml(selectedId) {
  const opts = uploadedSounds.map(s => {
    const label = `${s.title}${s.artist && s.artist !== "Original sound" ? " — " + s.artist : ""} (@${s.username || "user"})`;
    return `<option value="${escapeHtml(s.id)}" ${s.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  return `<option value="">Original video audio (no added sound)</option>${opts ? `<optgroup label="Uploaded Sounds">${opts}</optgroup>` : ""}`;
}

function captureVideoFrame(url) {
  return new Promise(resolve => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "metadata"; v.src = url;
    const done = out => { v.src = ""; resolve(out); };
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch { done(""); } };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        const sc = Math.min(360 / (v.videoWidth || 360), 360 / (v.videoHeight || 360), 1);
        c.width = Math.max(1, Math.round((v.videoWidth || 360) * sc));
        c.height = Math.max(1, Math.round((v.videoHeight || 360) * sc));
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        done(c.toDataURL("image/jpeg", 0.7));
      } catch { done(""); }
    };
    v.onerror = () => done("");
    setTimeout(() => done(""), 3000);
  });
}

async function uploadToSupabaseStorage(file, path, token, onProgress) {
  const ct = file.type || "video/mp4";
  const pre = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bucket: "videos", path, contentType: ct })
  });
  const info = await pre.json().catch(() => ({}));
  if (!pre.ok || !info.uploadUrl) throw new Error((info.error && info.error.message) || "Could not start upload.");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();
    xhr.open("PUT", info.uploadUrl);
    xhr.setRequestHeader("Content-Type", ct);
    xhr.timeout = 300000;
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        const elapsed = (Date.now() - startedAt) / 1000;
        const eta = pct >= 3 ? fmtEta(Math.round((elapsed / pct) * (100 - pct))) : "estimating…";
        onProgress(pct, eta);
      }
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve({ url: info.publicUrl, storagePath: path })
      : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));
    xhr.send(file);
  });
}

function initFullUploadUI() {
  if (uploadUIReady) return;
  uploadUIReady = true;
  const dlg = $("uploadDlg");
  if (!dlg) return;

  const style = document.createElement("style");
  style.textContent = `
    #uploadDlg{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border-radius:0;padding:0;background:var(--bg);color:var(--text);overflow:hidden}
    #uploadDlg[open]{display:flex;flex-direction:column}
    .up-top{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--surface);background:var(--bg);gap:12px;flex-wrap:wrap}
    .up-top h2{font-size:22px;font-weight:700}
    .up-body{flex:1;overflow-y:auto;padding:24px;max-width:860px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:18px}
    .up-drop{background:var(--card);border:2px dashed var(--primary);border-radius:var(--r-xl);padding:28px 20px;text-align:center;cursor:pointer;transition:transform .15s}
    .up-drop:hover{transform:scale(.995)}
    .up-drop b{display:block;font-size:17px;margin-bottom:4px}
    .up-drop span{font-size:13px;color:var(--muted)}
    .up-bar-wrap{background:var(--card);border-radius:var(--r-xl);padding:16px 20px;display:flex;flex-direction:column;gap:10px}
    .up-bar-wrap.hidden{display:none}
    .up-bar-head{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:600;gap:10px}
    .up-bar-track{width:100%;height:10px;border-radius:999px;background:var(--surface);overflow:hidden}
    .up-bar-fill{height:100%;width:0%;border-radius:999px;background:var(--primary);transition:width .2s ease}
    .up-list{display:flex;flex-direction:column;gap:12px}
    .up-card{display:flex;gap:16px;background:var(--surface);padding:14px;border-radius:var(--r-xl);align-items:center;flex-wrap:wrap}
    .up-prev{width:76px;height:104px;border-radius:16px;background:#000;object-fit:contain;flex-shrink:0}
    .up-fields{flex:1;min-width:220px;display:flex;flex-direction:column;gap:10px}
    .up-meta{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);gap:8px}
    .up-orients{display:flex;gap:6px;flex-wrap:wrap}
    .up-or{padding:7px 14px;border-radius:999px;font-size:12px;font-weight:600;background:var(--card);color:var(--text);display:inline-flex;align-items:center;gap:4px}
    .up-or.on{background:var(--primary);color:var(--on-primary)}
    .up-snd-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .up-snd{flex:1;min-width:190px;padding:9px 14px;border-radius:999px;border:0;background:var(--bg);color:var(--text);font:inherit;font-size:13px;outline:0}
    .up-snd-prev:disabled{opacity:.45;cursor:default}
    .up-snd-link{font-size:12px;font-weight:700;color:var(--primary);text-decoration:none;white-space:nowrap}
    .up-snd-link:hover{text-decoration:underline}
  `;
  document.head.appendChild(style);

  dlg.innerHTML = `
    <div class="up-top">
      <div style="display:flex;align-items:center;gap:12px">
        <button type="button" class="btn icon" id="upClose">✕</button>
        <h2>Upload videos</h2>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer;background:var(--surface);padding:6px 12px;border-radius:999px">
          <input type="checkbox" id="upAutoTags" style="accent-color:var(--primary)">Auto hashtags
        </label>
        <span class="hint" id="upHint" style="margin:0"></span>
        <button type="button" class="btn primary" id="upSubmit">Upload all</button>
      </div>
    </div>
    <div class="up-body">
      <label class="up-drop" for="upFile">
        <b>Choose videos to upload</b>
        <span>MP4, WebM, or MOV · Up to 100 MB each · Select multiple at once</span>
      </label>
      <input type="file" id="upFile" accept="video/mp4,video/webm,video/quicktime" multiple hidden>
      <div class="up-bar-wrap hidden" id="upBarWrap">
        <div class="up-bar-head">
          <span id="upPhase">Preparing…</span>
          <span id="upStats" style="color:var(--primary)">0%</span>
        </div>
        <div class="up-bar-track"><div class="up-bar-fill" id="upBarFill"></div></div>
      </div>
      <div class="up-list" id="upQueue"></div>
    </div>`;

  dlg.addEventListener("close", stopSoundPreview);
  $("upClose").onclick = () => { stopSoundPreview(); dlg.close(); };
  $("upFile").onchange = e => {
    [...(e.target.files || [])].forEach(file => {
      const defTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 100);
      const item = { file, title: defTitle, description: "", captions: "", tags: "", manualTags: false, orientation: "portrait", soundId: "", status: "Ready", url: URL.createObjectURL(file) };
      if (isAutoTagsOn()) item.tags = localQuickTags(defTitle, "");
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = item.url;
      probe.onloadedmetadata = () => {
        if (probe.videoWidth > probe.videoHeight * 1.15) item.orientation = "landscape";
        else if (Math.abs(probe.videoWidth - probe.videoHeight) <= probe.videoWidth * 0.15) item.orientation = "square";
        renderUpQueue();
      };
      upQueue.push(item);
      const newIdx = upQueue.length - 1;
      if (isAutoTagsOn()) setTimeout(() => generateTagsForItem(item, newIdx, false), 50);
    });
    renderUpQueue();
  };
  $("upSubmit").onclick = submitBatchUpload;
}

function renderUpQueue() {
  const q = $("upQueue");
  if (!q) return;
  q.innerHTML = "";
  upQueue.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "up-card";
    const mb = (item.file.size / (1024 * 1024)).toFixed(1);
    const over = item.file.size > MAX_INPUT_BYTES;
    const isPlaying = upPreviewIdx === idx && upPreviewAudio && !upPreviewAudio.paused;
    card.innerHTML = `
      <video class="up-prev" src="${item.url}" muted playsinline></video>
      <div class="up-fields">
        <div class="up-meta">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.file.name)} (${mb} MB)</span>
          <span data-st="${idx}" style="font-weight:700;color:${over ? "var(--bad)" : "var(--primary)"}">${over ? "Over 100 MB" : escapeHtml(item.status)}</span>
        </div>
        <input type="text" class="up-title" value="${escapeHtml(item.title)}" placeholder="Video name / title" maxlength="100" style="background:var(--bg)">
        <textarea class="up-desc" rows="2" placeholder="Video bio / description (optional)" maxlength="300" style="background:var(--bg);border-radius:16px;padding:10px 14px;border:0;color:var(--text);font:inherit;font-size:13px;resize:vertical;outline:0">${escapeHtml(item.description || "")}</textarea>
        <textarea class="up-caps" rows="2" placeholder="Captions / subtitles text (optional, shown on video)" maxlength="500" style="background:var(--bg);border-radius:16px;padding:10px 14px;border:0;color:var(--text);font:inherit;font-size:13px;resize:vertical;outline:0">${escapeHtml(item.captions || "")}</textarea>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" class="up-tags" data-idx="${idx}" value="${escapeHtml(item.tags || "")}" placeholder="#hashtags (1 to 5, required)" maxlength="120" style="background:var(--bg);flex:1">
          <button type="button" class="up-or up-auto-btn" title="Auto-generate hashtags"><span class="ms" style="font-size:15px">auto_awesome</span>Auto</button>
        </div>
        <div class="up-orients">
          <button type="button" class="up-or ${item.orientation === "portrait" ? "on" : ""}" data-o="portrait">Portrait (9:16)</button>
          <button type="button" class="up-or ${item.orientation === "landscape" ? "on" : ""}" data-o="landscape">Landscape (16:9)</button>
          <button type="button" class="up-or ${item.orientation === "square" ? "on" : ""}" data-o="square">Square (1:1)</button>
        </div>
        <div class="up-snd-row">
          <select class="up-snd" aria-label="Choose a sound">${soundSelectHtml(item.soundId || "")}</select>
          <button type="button" class="up-or up-snd-prev" ${item.soundId ? "" : "disabled"}><span class="ms" style="font-size:16px">${isPlaying ? "stop" : "play_arrow"}</span>${isPlaying ? "Stop" : "Preview"}</button>
          <a href="/sounds" target="_blank" class="up-snd-link">+ Upload sound</a>
        </div>
      </div>
      <button type="button" class="btn icon" title="Remove">✕</button>`;
    let tagTmr = null;
    card.querySelector(".up-title").oninput = e => {
      item.title = e.target.value;
      if (isAutoTagsOn() && !item.manualTags) {
        clearTimeout(tagTmr);
        tagTmr = setTimeout(() => generateTagsForItem(item, idx, false), 550);
      }
    };
    card.querySelector(".up-desc").oninput = e => { item.description = e.target.value; };
    card.querySelector(".up-caps").oninput = e => { item.captions = e.target.value; };
    card.querySelector(".up-tags").oninput = e => { item.tags = e.target.value; item.manualTags = !!e.target.value.trim(); };
    card.querySelector(".up-auto-btn").onclick = () => { item.manualTags = false; generateTagsForItem(item, idx, true); };
    card.querySelectorAll(".up-or[data-o]").forEach(b => {
      b.onclick = () => { item.orientation = b.dataset.o; renderUpQueue(); };
    });
    const sndSel = card.querySelector(".up-snd");
    const prevBtn = card.querySelector(".up-snd-prev");
    sndSel.onchange = () => {
      item.soundId = sndSel.value;
      if (upPreviewIdx === idx) stopSoundPreview();
      prevBtn.disabled = !item.soundId;
    };
    prevBtn.onclick = () => {
      if (upPreviewIdx === idx && upPreviewAudio && !upPreviewAudio.paused) {
        stopSoundPreview();
        return;
      }
      const snd = uploadedSounds.find(s => s.id === item.soundId);
      if (!snd) return;
      stopSoundPreview();
      if (!upPreviewAudio) {
        upPreviewAudio = new Audio();
        upPreviewAudio.onended = stopSoundPreview;
      }
      upPreviewAudio.src = snd.audio_url;
      upPreviewIdx = idx;
      prevBtn.innerHTML = '<span class="ms" style="font-size:16px">stop</span>Stop';
      upPreviewAudio.play().catch(() => stopSoundPreview());
    };
    card.querySelector(".btn.icon").onclick = () => {
      if (upPreviewIdx === idx) stopSoundPreview();
      upQueue.splice(idx, 1);
      renderUpQueue();
    };
    q.appendChild(card);
  });
}

async function submitBatchUpload() {
  stopSoundPreview();
  const valid = upQueue.filter(it => it.file.size <= MAX_INPUT_BYTES);
  if (!valid.length) {
    $("upHint").textContent = upQueue.length ? "All selected videos exceed 100 MB." : "Pick one or more video files first.";
    $("upHint").className = "hint bad";
    return;
  }
  $("upSubmit").disabled = true;
  $("upHint").className = "hint";
  setStatusBar("Starting upload…", 0, "");
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error("Session expired. Sign in again.");

    let okCount = 0;
    for (let i = 0; i < upQueue.length; i++) {
      const item = upQueue[i];
      if (item.file.size > MAX_INPUT_BYTES) { item.status = "Skipped (>100 MB)"; continue; }
      const tags = _parseTags(item.tags || "");
      if (tags.length < 1 || tags.length > 5) {
        item.status = "Add 1-5 hashtags";
        const se = document.querySelector(`[data-st="${i}"]`);
        if (se) { se.textContent = item.status; se.style.color = "var(--bad)"; }
        continue;
      }
      const stEl = document.querySelector(`[data-st="${i}"]`);
      const setSt = txt => { item.status = txt; if (stEl) stEl.textContent = txt; };
      try {
        setStatusBar(`Uploading video (${i + 1} of ${upQueue.length})…`, 0, "estimating…");
        const ext = (item.file.name.split(".").pop() || "mp4").toLowerCase();
        const path = `${user.id}/${Date.now()}_${i}.${ext}`;
        const title = item.title.trim() || item.file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        const frame = await captureVideoFrame(item.url);
        const { url, storagePath } = await uploadToSupabaseStorage(item.file, path, session.access_token, (pct, eta) => {
          setSt(`Uploading ${pct}%`);
          setStatusBar(`Uploading video (${i + 1} of ${upQueue.length})…`, pct, eta);
        });
        setSt("Checking safety…");
        setStatusBar(`Checking safety (${i + 1} of ${upQueue.length})…`, 100, "");
        const chkR = await fetch("/api/ai/check-media", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ title, hashtags: tags, frame, storage_path: storagePath })
        });
        const chkJ = await chkR.json().catch(() => ({}));
        if (!chkR.ok || chkJ.error) throw new Error(chkJ.error?.message || "Blocked by safety filter.");
        setSt("Saving…");
        setStatusBar(`Saving post (${i + 1} of ${upQueue.length})…`, 100, "");
        const description = (item.description || "").trim().slice(0, 300) || null;
        const captions = (item.captions || "").trim().slice(0, 500) || null;
        let insRes = await sb.from("videos").insert({
          user_id: user.id, title, description, captions, video_url: url, storage_path: storagePath, orientation: item.orientation, hashtags: tags
        }).select("id").single();
        if (insRes.error && /orientation|description|captions/i.test(insRes.error.message)) {
          insRes = await sb.from("videos").insert({ user_id: user.id, title, video_url: url, storage_path: storagePath, hashtags: tags }).select("id").single();
        }
        if (insRes.error) throw insRes.error;
        if (item.soundId && insRes.data?.id) {
          const sr = await fetch("/api/video-sounds", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ videoId: insRes.data.id, soundId: item.soundId })
          });
          const sj = await sr.json().catch(() => ({}));
          if (!sr.ok || sj.error) throw new Error(sj.error?.message || "Could not attach sound.");
        }
        setSt("Done");
        okCount++;
      } catch (err) {
        setSt("Failed");
        if (stEl) stEl.style.color = "var(--bad)";
        $("upHint").textContent = err.message;
        console.warn(err);
      }
    }
    hideStatusBar();
    if (okCount === upQueue.length) {
      $("uploadDlg").close();
      await loadFeed();
    } else {
      $("upSubmit").disabled = false;
      $("upHint").textContent = `Uploaded ${okCount} of ${upQueue.length} videos.`;
      if (okCount > 0) await loadFeed();
    }
  } catch (e) {
    hideStatusBar();
    $("upSubmit").disabled = false;
    $("upHint").textContent = e.message;
    $("upHint").className = "hint bad";
  }
}

$("openUpload").onclick = () => requireLogin(() => {
  initFullUploadUI();
  hideStatusBar();
  stopSoundPreview();
  upQueue = [];
  $("upFile").value = "";
  $("upHint").textContent = "";
  $("upHint").className = "hint";
  $("upSubmit").disabled = false;
  if ($("upAutoTags")) {
    $("upAutoTags").checked = isAutoTagsOn();
    $("upAutoTags").onchange = e => setAutoTagsPref(e.target.checked);
  }
  renderUpQueue();
  loadUploadSounds();
  $("uploadDlg").showModal();
});
