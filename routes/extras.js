/* Extra server features, mounted from server.js with one line:
     require("./routes/extras")({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso });
   Unread messages: powers the dot next to Messages and the browser notifications.
   (Password resets are handled by the site owner: see tools/reset_password.js) */

module.exports = function mount({ app, db, run, wrap, uidFrom, HttpError, limit, weakPassword, nowIso }) {
  let ready = null;
  const ensure = () => ready || (ready = (async () => {
    const cols = (await db.execute("PRAGMA table_info(messages)")).rows.map(r => r[1]);
    if (!cols.includes("read_at")) {
      await db.execute("ALTER TABLE messages ADD COLUMN read_at TEXT");
      await db.execute("UPDATE messages SET read_at = created_at WHERE read_at IS NULL");   // old messages count as read
    }
  })().catch(e => { ready = null; throw e; }));
  ensure().catch(e => console.warn("extras setup:", e.message));

  app.get("/api/messages/unread", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensure();
    const rows = await run(`SELECT m.id, m.sender_id, m.body, m.created_at, p.username, p.display_name
      FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE m.recipient_id = ? AND m.read_at IS NULL ORDER BY m.id DESC LIMIT 100`, [uid]);
    const bySender = {};
    rows.forEach(r => { bySender[r.sender_id] = (bySender[r.sender_id] || 0) + 1; });
    return { data: { count: rows.length, maxId: rows.length ? rows[0].id : 0, bySender, latest: rows.slice(0, 5) }, error: null };
  }));
  app.post("/api/messages/read", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const from = String(req.body?.from || "");
    if (!from) throw new HttpError(400, "Missing sender");
    await ensure();
    await db.execute({ sql: "UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL", args: [nowIso(), uid, from] });
    return { data: true, error: null };
  }));
};
