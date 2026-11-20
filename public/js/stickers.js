/* Sticker picker (stickers come from public/stickers via /api/stickers) */
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

$("stkBtn").onclick = async () => {
  const pn = $("stkPanel");
  pn.classList.toggle("hidden");
  if (stickersLoaded || pn.classList.contains("hidden")) return;
  stickersLoaded = true;
  try {
    const list = await (await fetch("/api/stickers")).json();
    pn.innerHTML = list.length ? "" : '<div style="grid-column:1/-1;color:var(--muted);padding:8px">No stickers yet.</div>';
    list.forEach(f => {
      const b = document.createElement("button");
      b.type = "button";
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
      pn.appendChild(b);
    });
  } catch { stickersLoaded = false; pn.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);padding:8px">Couldn\'t load stickers.</div>'; }
};

