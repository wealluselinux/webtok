/* Video upload dialog: batch multi-video upload with per-video title editing */
function uploadToBucket(storagePath, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/videos/${storagePath}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.setRequestHeader("x-upsert", "true");
    xhr.timeout = 120000;
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller video."));
    xhr.send(file);
  });
}

let upQueue = [];
function ensureBatchUI() {
  const fileEl = $("upFile");
  if (!fileEl) return;
  fileEl.multiple = true;
  if ($("upQueue")) return;
  const titleEl = $("upTitle");
  if (titleEl) {
    titleEl.classList.add("hidden");
    const lbl = titleEl.previousElementSibling;
    if (lbl && lbl.tagName === "LABEL") lbl.classList.add("hidden");
  }
  const q = document.createElement("div");
  q.id = "upQueue";
  q.style.cssText = "display:flex;flex-direction:column;gap:8px;max-height:42vh;overflow-y:auto;margin-top:10px";
  $("upHint").parentNode.insertBefore(q, $("upHint"));
}

function renderUpQueue() {
  const q = $("upQueue");
  if (!q) return;
  q.innerHTML = "";
  upQueue.forEach((item, idx) => {
    const row = document.createElement("div");
    row.style.cssText = "background:var(--surface);padding:10px 12px;border-radius:18px;display:flex;flex-direction:column;gap:6px";
    const mb = (item.file.size / (1024 * 1024)).toFixed(1);
    const over = item.file.size > 50 * 1024 * 1024;
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--muted)">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.file.name)} (${mb} MB)</span>
        <span data-st="${idx}" style="font-weight:700;color:${over ? "var(--bad)" : "var(--primary)"}">${over ? "Over 50 MB" : escapeHtml(item.status || "Ready")}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <input type="text" value="${escapeHtml(item.title)}" placeholder="Caption / Title" maxlength="100" style="padding:10px 12px;background:var(--bg)">
        <button type="button" class="btn icon" style="width:36px;height:36px;flex-shrink:0" title="Remove">✕</button>
      </div>`;
    const inp = row.querySelector("input");
    inp.oninput = e => { item.title = e.target.value; };
    row.querySelector("button").onclick = () => { upQueue.splice(idx, 1); renderUpQueue(); };
    q.appendChild(row);
  });
}

$("openUpload").onclick = () => requireLogin(() => {
  ensureBatchUI();
  upQueue = [];
  $("upFile").value = "";
  $("upHint").textContent = "";
  $("upHint").className = "hint";
  $("upSubmit").disabled = false;
  renderUpQueue();
  $("uploadDlg").showModal();
});

$("upFile").onchange = e => {
  ensureBatchUI();
  const files = [...(e.target.files || [])];
  files.forEach(file => {
    const defTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 100);
    upQueue.push({ file, title: defTitle, status: "Ready" });
  });
  renderUpQueue();
};

$("upSubmit").onclick = async () => {
  const valid = upQueue.filter(it => it.file.size <= 50 * 1024 * 1024);
  if (!valid.length) {
    $("upHint").textContent = upQueue.length ? "All selected videos exceed the 50 MB limit." : "Pick one or more video files first.";
    $("upHint").className = "hint bad";
    return;
  }
  $("upSubmit").disabled = true;
  $("upHint").className = "hint";
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error("Session expired. Sign in again.");

    let okCount = 0;
    for (let i = 0; i < upQueue.length; i++) {
      const item = upQueue[i];
      if (item.file.size > 50 * 1024 * 1024) { item.status = "Skipped (>50 MB)"; continue; }
      const stEl = document.querySelector(`[data-st="${i}"]`);
      const setSt = txt => { item.status = txt; if (stEl) stEl.textContent = txt; };
      try {
        const ext = (item.file.name.match(/\.(mp4|webm|mov)$/i)?.[0] || ".mp4").toLowerCase();
        const safe = item.file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "video";
        const storagePath = `${user.id}/${Date.now()}-${i}-${safe}${ext}`;
        await uploadToBucket(storagePath, item.file, session.access_token, pct => {
          setSt(`${pct}%`);
          $("upHint").textContent = `Uploading ${i + 1} of ${upQueue.length} (${pct}%)…`;
        });
        setSt("Saving…");
        const videoUrl = sb.storage.from("videos").getPublicUrl(storagePath).data.publicUrl;
        const title = item.title.trim() || safe.replace(/[-_]+/g, " ");
        const { error: dbErr } = await sb.from("videos").insert({
          user_id: user.id, title, video_url: videoUrl, storage_path: storagePath
        });
        if (dbErr) throw dbErr;
        setSt("Done");
        okCount++;
      } catch (err) {
        setSt("Failed");
        if (stEl) stEl.style.color = "var(--bad)";
        console.warn(err);
      }
    }
    if (okCount === upQueue.length) {
      $("uploadDlg").close();
      await loadFeed();
    } else {
      $("upSubmit").disabled = false;
      $("upHint").textContent = `Uploaded ${okCount} of ${upQueue.length} videos.`;
      if (okCount > 0) await loadFeed();
    }
  } catch (e) {
    $("upSubmit").disabled = false;
    $("upHint").textContent = e.message;
    $("upHint").className = "hint bad";
  }
};
