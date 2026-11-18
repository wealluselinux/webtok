/* Full-screen Material You batch upload studio (100 MB limit + auto-compress >48 MB + orientation selector) */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
const SUPABASE_LIMIT_BYTES = 48 * 1024 * 1024;
let upQueue = [], uploadUIReady = false;

function compressVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement("video");
    vid.src = url;
    vid.playsInline = true;
    vid.preload = "auto";

    vid.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read video for compression.")); };
    vid.onloadedmetadata = async () => {
      try {
        const dur = vid.duration || 30;
        const maxDim = 1280;
        const scale = Math.min(maxDim / (vid.videoWidth || 720), maxDim / (vid.videoHeight || 1280), 1);
        const w = Math.max(2, Math.round((vid.videoWidth * scale) / 2) * 2);
        const h = Math.max(2, Math.round((vid.videoHeight * scale) / 2) * 2);

        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");

        const stream = canvas.captureStream(30);
        let audioCtx = null;
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const src = audioCtx.createMediaElementSource(vid);
          const dest = audioCtx.createMediaStreamDestination();
          src.connect(dest);
          dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        } catch {}

        const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
          .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
        const targetBps = Math.min(Math.max(Math.floor((42 * 1024 * 1024 * 8) / dur) - 96000, 350000), 3000000);
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: targetBps } : { videoBitsPerSecond: targetBps });
        const chunks = [];
        rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
          URL.revokeObjectURL(url);
          if (audioCtx) audioCtx.close().catch(() => {});
          const outType = mime.split(";")[0] || "video/webm";
          const ext = outType.includes("mp4") ? ".mp4" : ".webm";
          const outFile = new File(chunks, file.name.replace(/\.[^.]+$/, "") + ext, { type: outType });
          if (outFile.size > 50 * 1024 * 1024) reject(new Error("Compressed file is still over 50 MB. Try a shorter clip."));
          else resolve(outFile);
        };

        let raf = 0;
        const draw = () => {
          if (vid.paused || vid.ended) return;
          ctx.drawImage(vid, 0, 0, w, h);
          if (onProgress && dur > 0) onProgress(Math.min(99, Math.round((vid.currentTime / dur) * 100)));
          raf = requestAnimationFrame(draw);
        };
        vid.onended = () => { cancelAnimationFrame(raf); if (rec.state !== "inactive") rec.stop(); };

        rec.start(1000);
        await vid.play();
        draw();
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
  });
}

function uploadToBucket(storagePath, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/videos/${storagePath}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.setRequestHeader("x-upsert", "true");
    xhr.timeout = 240000;
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
    .up-top{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--surface);background:var(--bg)}
    .up-top h2{font-size:22px;font-weight:700}
    .up-body{flex:1;overflow-y:auto;padding:24px;max-width:860px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:18px}
    .up-drop{background:var(--card);border:2px dashed var(--primary);border-radius:var(--r-xl);padding:28px 20px;text-align:center;cursor:pointer;transition:transform .15s}
    .up-drop:hover{transform:scale(.995)}
    .up-drop b{display:block;font-size:17px;margin-bottom:4px}
    .up-drop span{font-size:13px;color:var(--muted)}
    .up-list{display:flex;flex-direction:column;gap:12px}
    .up-card{display:flex;gap:16px;background:var(--surface);padding:14px;border-radius:var(--r-xl);align-items:center;flex-wrap:wrap}
    .up-prev{width:76px;height:104px;border-radius:16px;background:#000;object-fit:contain;flex-shrink:0}
    .up-fields{flex:1;min-width:220px;display:flex;flex-direction:column;gap:10px}
    .up-meta{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);gap:8px}
    .up-orients{display:flex;gap:6px;flex-wrap:wrap}
    .up-or{padding:7px 14px;border-radius:999px;font-size:12px;font-weight:600;background:var(--card);color:var(--text)}
    .up-or.on{background:var(--primary);color:var(--on-primary)}
  `;
  document.head.appendChild(style);

  dlg.innerHTML = `
    <div class="up-top">
      <div style="display:flex;align-items:center;gap:12px">
        <button type="button" class="btn icon" id="upClose">✕</button>
        <h2>Upload videos</h2>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="hint" id="upHint" style="margin:0"></span>
        <button type="button" class="btn primary" id="upSubmit">Upload all</button>
      </div>
    </div>
    <div class="up-body">
      <label class="up-drop" for="upFile">
        <b>Choose videos to upload</b>
        <span>MP4, WebM, or MOV · Up to 100 MB (files over 48 MB auto-compress)</span>
      </label>
      <input type="file" id="upFile" accept="video/mp4,video/webm,video/quicktime" multiple hidden>
      <div class="up-list" id="upQueue"></div>
    </div>`;

  $("upClose").onclick = () => dlg.close();
  $("upFile").onchange = e => {
    [...(e.target.files || [])].forEach(file => {
      const defTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 100);
      const item = { file, title: defTitle, orientation: "portrait", status: file.size > SUPABASE_LIMIT_BYTES ? "Will compress" : "Ready", url: URL.createObjectURL(file) };
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
    card.innerHTML = `
      <video class="up-prev" src="${item.url}" muted playsinline></video>
      <div class="up-fields">
        <div class="up-meta">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.file.name)} (${mb} MB)</span>
          <span data-st="${idx}" style="font-weight:700;color:${over ? "var(--bad)" : "var(--primary)"}">${over ? "Over 100 MB" : escapeHtml(item.status)}</span>
        </div>
        <input type="text" value="${escapeHtml(item.title)}" placeholder="Caption / Title" maxlength="100" style="background:var(--bg)">
        <div class="up-orients">
          <button type="button" class="up-or ${item.orientation === "portrait" ? "on" : ""}" data-o="portrait">Portrait (9:16)</button>
          <button type="button" class="up-or ${item.orientation === "landscape" ? "on" : ""}" data-o="landscape">Landscape (16:9)</button>
          <button type="button" class="up-or ${item.orientation === "square" ? "on" : ""}" data-o="square">Square (1:1)</button>
        </div>
      </div>
      <button type="button" class="btn icon" title="Remove">✕</button>`;
    card.querySelector("input").oninput = e => { item.title = e.target.value; };
    card.querySelectorAll(".up-or").forEach(b => {
      b.onclick = () => { item.orientation = b.dataset.o; renderUpQueue(); };
    });
    card.querySelector(".btn.icon").onclick = () => { upQueue.splice(idx, 1); renderUpQueue(); };
    q.appendChild(card);
  });
}

async function submitBatchUpload() {
  const valid = upQueue.filter(it => it.file.size <= MAX_INPUT_BYTES);
  if (!valid.length) {
    $("upHint").textContent = upQueue.length ? "All selected videos exceed 100 MB." : "Pick one or more video files first.";
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
      if (item.file.size > MAX_INPUT_BYTES) { item.status = "Skipped (>100 MB)"; continue; }
      const stEl = document.querySelector(`[data-st="${i}"]`);
      const setSt = txt => { item.status = txt; if (stEl) stEl.textContent = txt; };
      try {
        let fileToUpload = item.file;
        if (fileToUpload.size > SUPABASE_LIMIT_BYTES) {
          fileToUpload = await compressVideo(fileToUpload, pct => {
            setSt(`Compressing ${pct}%`);
            $("upHint").textContent = `Compressing ${i + 1} of ${upQueue.length} (${pct}%)…`;
          });
        }
        const ext = (fileToUpload.name.match(/\.(mp4|webm|mov)$/i)?.[0] || ".mp4").toLowerCase();
        const safe = fileToUpload.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "video";
        const storagePath = `${user.id}/${Date.now()}-${i}-${safe}${ext}`;
        await uploadToBucket(storagePath, fileToUpload, session.access_token, pct => {
          setSt(`${pct}%`);
          $("upHint").textContent = `Uploading ${i + 1} of ${upQueue.length} (${pct}%)…`;
        });
        setSt("Saving…");
        const videoUrl = sb.storage.from("videos").getPublicUrl(storagePath).data.publicUrl;
        const title = item.title.trim() || safe.replace(/[-_]+/g, " ");
        let { error: dbErr } = await sb.from("videos").insert({
          user_id: user.id, title, video_url: videoUrl, storage_path: storagePath, orientation: item.orientation
        });
        if (dbErr && /orientation/i.test(dbErr.message)) {
          dbErr = (await sb.from("videos").insert({ user_id: user.id, title, video_url: videoUrl, storage_path: storagePath })).error;
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
}

$("openUpload").onclick = () => requireLogin(() => {
  initFullUploadUI();
  upQueue = [];
  $("upFile").value = "";
  $("upHint").textContent = "";
  $("upHint").className = "hint";
  $("upSubmit").disabled = false;
  renderUpQueue();
  $("uploadDlg").showModal();
});
