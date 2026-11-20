/* Starts the feed page: hash changes, up/down buttons, logo button */
const FEED_HASH = /^#(feed|fyp|following|friends|search=|v=)/;
addEventListener("hashchange", () => {
  if (!FEED_HASH.test(location.hash)) return;
  loadFeed();
});
const _lf = loadFeed;
loadFeed = async function () { if (location.hash === "#fyp") await loadViews(); await _lf(); document.querySelectorAll("[data-follow]").forEach(paintFollow); };
initAuth().then(loadFeed);

$("vprev").onclick = () => $("feed").scrollBy({ top: -$("feed").clientHeight, behavior: "smooth" });
$("vnext").onclick = () => $("feed").scrollBy({ top: $("feed").clientHeight, behavior: "smooth" });

if ($("home")) $("home").onclick = () => { location.href = "/"; };


// Keep the comments panel on the video that's on screen while you scroll
let cmtSyncTimer = null;
$("feed").addEventListener("scroll", () => {
  if (!$("commentsDlg").open) return;
  clearTimeout(cmtSyncTimer);
  cmtSyncTimer = setTimeout(() => {
    const feed = $("feed"), slide = feed.children[Math.round(feed.scrollTop / feed.clientHeight)];
    if (!slide || !slide.dataset.vid || (activeVideo && activeVideo.id === slide.dataset.vid)) return;
    const b = slide.querySelector('[data-a="comment"]');
    if (b) b.click();
  }, 180);
});
