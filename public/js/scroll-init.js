/* Starts the feed page: animated hash transitions, up/down buttons, logo button, comment sync */
const FEED_HASH = /^(?:#(?:feed|fyp|following|friends)|#(?:search|v)=.*)?$/;
const TAB_ORDER = ["fyp", "explore", "following", "friends"];
const tabOf = h => (h === "#fyp" ? "fyp" : h === "#following" ? "following" : h === "#friends" ? "friends" : "explore");
let lastTab = tabOf(location.hash);

async function switchFeedAnimated() {
  const feed = $("feed");
  const nextTab = tabOf(location.hash);
  const oldIdx = TAB_ORDER.indexOf(lastTab);
  const newIdx = TAB_ORDER.indexOf(nextTab);
  const dir = newIdx >= oldIdx ? 1 : -1;
  lastTab = nextTab;

  if (feed) {
    feed.style.transition = "transform 170ms cubic-bezier(.4,0,1,1), opacity 170ms ease";
    feed.style.transform = `translateX(${-28 * dir}px) scale(.985)`;
    feed.style.opacity = "0";
    await new Promise(r => setTimeout(r, 170));
  }
  await loadFeed();
  if (feed) {
    feed.style.transition = "none";
    feed.style.transform = `translateX(${32 * dir}px) scale(.985)`;
    feed.style.opacity = "0";
    void feed.offsetWidth;
    feed.style.transition = "transform 280ms cubic-bezier(.2,.9,.3,1.1), opacity 240ms ease";
    feed.style.transform = "translateX(0) scale(1)";
    feed.style.opacity = "1";
  }
}

addEventListener("hashchange", () => {
  if (!FEED_HASH.test(location.hash)) return;
  switchFeedAnimated();
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
