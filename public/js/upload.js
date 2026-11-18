/* Video upload dialog */
/* ---------- Upload with live progress & error handling ---------- */
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

$("openUpload").onclick = () => requireLogin(() => {
  $("upFile").value = ""; $("upTitle").value = ""; $("upHint").textContent = "";
  $("upHint").className = "hint"; $("upSubmit").disabled = false;
  $("uploadDlg").showModal();
});
$("upSubmit").onclick = async () => {
  const file = $("upFile").files[0];
  if (!file) { $("upHint").textContent = "Pick a video file first."; $("upHint").className = "hint bad"; return; }
  if (file.size > 50 * 1024 * 1024) {
    $("upHint").textContent = "Video is over 50 MB (Supabase free-tier limit).";
    $("upHint").className = "hint bad";
    return;
  }
  $("upSubmit").disabled = true; $("upHint").textContent = "Starting upload…"; $("upHint").className = "hint";
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error("Session expired. Sign in again.");
    const ext = (file.name.match(/\.(mp4|webm|mov)$/i)?.[0] || ".mp4").toLowerCase();
    const safe = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "video";
    const storagePath = `${user.id}/${Date.now()}-${safe}${ext}`;
    await uploadToBucket(storagePath, file, session.access_token, pct => {
      $("upHint").textContent = `Uploading… ${pct}%`;
    });
    $("upHint").textContent = "Saving post…";
    const videoUrl = sb.storage.from("videos").getPublicUrl(storagePath).data.publicUrl;
    const title = $("upTitle").value.trim() || safe.replace(/[-_]+/g, " ");
    const { error: dbErr } = await sb.from("videos").insert({
      user_id: user.id, title, video_url: videoUrl, storage_path: storagePath
    });
    if (dbErr) throw dbErr;
    $("uploadDlg").close();
    await loadFeed();
  } catch (e) {
    $("upSubmit").disabled = false; $("upHint").textContent = e.message; $("upHint").className = "hint bad";
  }
};
