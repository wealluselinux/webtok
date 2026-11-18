/* Sticker picker (stickers come from public/stickers via /api/stickers) */
let stickersLoaded = false;
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
      b.innerHTML = `<img src="/stickers/${encodeURIComponent(f)}" alt="" loading="lazy">`;
      b.onclick = () => { pn.classList.add("hidden"); postComment(`[sticker:${f}]`); };
      pn.appendChild(b);
    });
  } catch { stickersLoaded = false; pn.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);padding:8px">Couldn\'t load stickers.</div>'; }
};
