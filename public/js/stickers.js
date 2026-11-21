/* Sticker picker: built-in stickers + user-created custom stickers (uploaded to R2) */
let stickersLoaded = false, lottieReady = null;

function ensureLottie() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (lottieReady) return lottieReady;
  lottieReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js";
    s.onload = () => resolve(window.lottie);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return lottieReady;
}

async function loadLottieSticker(el, path) {
  try {
    const lottie = await ensureLottie();
    lottie.loadAnimation({ container: el, renderer: "svg", loop: true, autoplay: true, path });
  } catch (e) { console.warn(e); }
}

function makeStickerBlob(file) {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const max = 256, scale = Math.min(max / img.width, max / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error("Could not process sticker")), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("Could not read image")); };
    img.src = objUrl;
  });
}

async function createCustomSticker(file, onDone) {
  const { data } = await sb.auth.getSession();
  const sess = data?.session;
  if (!sess) { location.href = "/login"; return; }
  const blob = await makeStickerBlob(file);
  const path = `${sess.user.id}/sticker-${crypto.randomUUID()}.png`;
  const up = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/png" });
  if (up?.error) throw up.error;
  const publicUrl = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const r = await fetch("/api/stickers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token },
    body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Sticker", url: publicUrl })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || "Could not save sticker");
  if (onDone) onDone();
}

async function renderStickerPanel() {
  const pn = $("stkPanel");
  const list = await (await fetch("/api/stickers")).json();
  pn.innerHTML = "";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "stk-add";
  addBtn.innerHTML = '<span class="ms">add_photo_alternate</span><span>Make</span>';
  const fileIn = document.createElement("input");
  fileIn.type = "file";
  fileIn.accept = "image/png,image/webp,image/jpeg,image/gif";
  fileIn.hidden = true;
  addBtn.onclick = () => fileIn.click();
  fileIn.onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    addBtn.disabled = true;
    try {
      await createCustomSticker(f, renderStickerPanel);
    } catch (err) {
      alert(err?.message || "Could not create sticker.");
    } finally {
      addBtn.disabled = false;
      e.target.value = "";
    }
  };
  pn.appendChild(addBtn);
  pn.appendChild(fileIn);

  if (!list.length) {
    const msg = document.createElement("div");
    msg.style.cssText = "grid-column:span 3;color:var(--muted);padding:8px;align-self:center;font-size:12px";
    msg.textContent = "Tap Make to create your first sticker!";
    pn.appendChild(msg);
    return;
  }

  list.forEach(item => {
    const b = document.createElement("button");
    b.type = "button";
    if (item && typeof item === "object" && item.url) {
      b.innerHTML = `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name || "sticker")}" loading="lazy">`;
      b.onclick = () => { pn.classList.add("hidden"); postComment(`[sticker_url:${item.url}]`); };
    } else {
      const f = String(item);
      const url = `/stickers/${encodeURIComponent(f)}`;
      if (/\.json$/i.test(f)) {
        const box = document.createElement("div");
        box.className = "stk-lottie";
        b.appendChild(box);
        loadLottieSticker(box, url);
      } else {
        b.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
      }
      b.onclick = () => { pn.classList.add("hidden"); postComment(`[sticker:${f}]`); };
    }
    pn.appendChild(b);
  });
}

$("stkBtn").onclick = async () => {
  const pn = $("stkPanel");
  pn.classList.toggle("hidden");
  if (stickersLoaded || pn.classList.contains("hidden")) return;
  stickersLoaded = true;
  try {
    await renderStickerPanel();
  } catch {
    stickersLoaded = false;
    pn.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);padding:8px">Couldn\'t load stickers.</div>';
  }
};
