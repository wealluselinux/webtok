/* Profile page: starts everything (load this last) */
(async () => {
  if (!sb) return location.href = "/login";
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  await loadMyFollows();
  await resolveTargetAndLoad();
  if (data.session && isMe && profile) syncCurrentAccount(data.session, profile);
})();
