/* Profile page: redirect upload actions to the dedicated /upload studio */
if (typeof $ === "function") {
  if ($("openUpload")) $("openUpload").onclick = () => { location.href = "/upload"; };
  if ($("btn-upload-acct")) $("btn-upload-acct").onclick = () => { location.href = "/upload"; };
}
