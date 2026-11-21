/* Profile page: full-screen batch upload (R2 Storage, 50 MB, progress + ETA, AI safety check) */
let upQueue = [];
function fmtEta(sec) {
  if (!isFinite(sec) || sec <= 0) return "almost done";
  if (sec < 60) return `~${sec}s left`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return `~${m}m ${s}s left`;
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
function captureVideoFrame(url) {
  return new Promise(resolve => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "metadata"; v.src = url;
    const done = out => { v.src = ""; resolve(out); };
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      } catch { done(""); }
    };
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
function renderUpQueue() {
  const q = $("upQueue");
  q.innerHTML = "";
  upQueue.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "up-card";
    const mb = (item.file.size / (1024 * 1024)).toFixed(1);
    const over = item.file.size > MAX_INPUT_BYTES;
    card.innerHTML = `
      <video class="up-prev" src="${item.url}" muted playsinline></video>
      <div class="up-fields">
        <div class="up-meta">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.file.name)} (${mb} MB)</span>
          <span data-st="${idx}" style="font-weight:700;color:${over ? "var(--bad)" : "var(--primary)"}">${over ? "Over 50 MB" : escapeHtml(item.status)}</span>
        </div>
        <input type="text" value="${escapeHtml(item.title)}" placeholder="Caption / Title" maxlength="100" style="background:var(--bg)">
        <input type="text" class="up-tags" value="${escapeHtml(item.tags || "")}" placeholder="#hashtags (1 to 5, required)" maxlength="120" style="background:var(--bg)">
        <div class="up-orients">
          <button type="button" class="up-or ${item.orientation === "portrait" ? "on" : ""}" data-o="portrait">Portrait (9:16)</button>
          <button type="button" class="up-or ${item.orientation === "landscape" ? "on" : ""}" data-o="landscape">Landscape (16:9)</button>
          <button type="button" class="up-or ${item.orientation === "square" ? "on" : ""}" data-o="square">Square (1:1)</button>
        </div>
      </div>
      <button type="button" class="btn icon" title="Remove">✕</button>`;
    card.querySelector("input").oninput = e => { item.title = e.target.value; };
    card.querySelector(".up-tags").oninput = e => { item.tags = e.target.value; };
    card.querySelectorAll(".up-or").forEach(b => {
      b.onclick = () => { item.orientation = b.dataset.o; renderUpQueue(); };
    });
    card.querySelector(".btn.icon").onclick = () => { upQueue.splice(idx, 1); renderUpQueue(); };
    q.appendChild(card);
  });
}
function openUpload() {
  hideStatusBar();
  upQueue = [];
  $("upFile").value = ""; $("upHint").textContent = "";
  $("upHint").className = "hint"; $("upSubmit").disabled = false;
  renderUpQueue();
  $("uploadDlg").showModal();
}
$("openUpload").onclick = openUpload;
$("btn-upload-acct").onclick = openUpload;
$("upFile").onchange = e => {
  [...(e.target.files || [])].forEach(file => {
    const defTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 100);
    const item = { file, title: defTitle, orientation: "portrait", status: "Ready", url: URL.createObjectURL(file) };
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = item.url;
    probe.onloadedmetadata = () => {
      if (probe.videoWidth > probe.videoHeight * 1.15) item.orientation = "landscape";
      else if (Math.abs(probe.videoWidth - probe.videoHeight) <= probe.videoWidth * 0.15) item.orientation = "square";
      renderUpQueue();
    };
    upQueue.push(item);
  });
  renderUpQueue();
};
$("upSubmit").onclick = async () => {
  const valid = upQueue.filter(it => it.file.size <= MAX_INPUT_BYTES);
  if (!valid.length) {
    $("upHint").textContent = upQueue.length ? "All selected videos exceed 50 MB." : "Pick one or more video files first.";
    $("upHint").className = "hint bad";
    return;
  }
  $("upSubmit").disabled = true; $("upHint").className = "hint";
  setStatusBar("Starting upload…", 0, "");
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error("Session expired. Sign in again.");
    let okCount = 0;
    for (let i = 0; i < upQueue.length; i++) {
      const item = upQueue[i];
      if (item.file.size > MAX_INPUT_BYTES) { item.status = "Skipped (>50 MB)"; continue; }
      const tags = parseTags(item.tags || "");
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
        let { error: dbErr } = await sb.from("videos").insert({
          user_id: user.id, title, video_url: url, storage_path: storagePath, orientation: item.orientation, hashtags: tags
        });
        if (dbErr && /orientation/i.test(dbErr.message)) {
          dbErr = (await sb.from("videos").insert({ user_id: user.id, title, video_url: url, storage_path: storagePath, hashtags: tags })).error;
        }
        if (dbErr) throw dbErr;
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
      await loadAccountData();
    } else {
      $("upSubmit").disabled = false;
      $("upHint").textContent = `Uploaded ${okCount} of ${upQueue.length} videos.`;
      if (okCount > 0) await loadAccountData();
    }
  } catch (e) {
    hideStatusBar();
    $("upSubmit").disabled = false; $("upHint").textContent = e.message; $("upHint").className = "hint bad";
  }
};
