/* Hashtag helper shared by uploads, feed and search. "#fun #viral", "fun, viral" and "fun viral" all work. */
function parseTags(str) {
  const out = [];
  (String(str || "").toLowerCase().match(/[a-z0-9_]{1,30}/g) || []).forEach(t => { if (!out.includes(t)) out.push(t); });
  return out;
}
