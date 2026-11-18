/* Starts the feed page: hash changes, up/down buttons, logo button */
const FEED_HASH = /^#(feed|following|friends|search=)/;
addEventListener("hashchange", () => {
  if (!FEED_HASH.test(location.hash)) return;
  loadFeed();
});
const _lf = loadFeed;
loadFeed = async function () { await _lf(); document.querySelectorAll("[data-follow]").forEach(paintFollow); };
initAuth().then(loadFeed);

$("vprev").onclick = () => $("feed").scrollBy({ top: -$("feed").clientHeight, behavior: "smooth" });
$("vnext").onclick = () => $("feed").scrollBy({ top: $("feed").clientHeight, behavior: "smooth" });


if ($("home")) $("home").onclick = () => { location.href = "/"; };
