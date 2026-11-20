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

