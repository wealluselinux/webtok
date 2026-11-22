/* Talk Coins & Profile Decorations Shop API (Turso) */
const crypto = require("crypto");

const LIKE_REWARD = 10;
const COMMENT_REWARD = 15;
const CUSTOM_PRICE = 130;

const CATALOG = [
  { id: "av_neon_ring", slot: "avatar", name: "Neon Prism Ring", desc: "Glowing Material You gradient halo around your profile picture.", price: 60, style: "prism", color: "#d0bcff", icon: "auto_awesome" },
  { id: "av_sparkle_aura", slot: "avatar", name: "Starlight Sparkle", desc: "Twinkling starlight aura and corner sparkle badge.", price: 75, style: "sparkle", color: "#ffd58a", icon: "star" },
  { id: "av_sakura_bloom", slot: "avatar", name: "Sakura Bloom", desc: "Soft blossom ring with rosy petal glow.", price: 80, style: "sakura", color: "#ff9ed2", icon: "local_florist" },
  { id: "av_gold_crown", slot: "avatar", name: "Golden Crown", desc: "Royal gold frame with a floating crown crest.", price: 90, style: "crown", color: "#ffca28", icon: "workspace_premium" },
  { id: "av_cyber_glitch", slot: "avatar", name: "Cyber Glitch Frame", desc: "Electric cyan & magenta cyber border.", price: 110, style: "cyber", color: "#4dd0e1", icon: "bolt" },
  { id: "pr_aurora_glow", slot: "profile", name: "Aurora Card Glow", desc: "Iridescent aurora border and ambient glow on your profile card.", price: 70, style: "aurora", color: "#a8dab5", icon: "nights_stay" },
  { id: "pr_emerald_wave", slot: "profile", name: "Emerald Wave", desc: "Mint-emerald expressive trim and crest on your profile card.", price: 85, style: "emerald", color: "#66bb6a", icon: "waves" },
  { id: "pr_retro_arcade", slot: "profile", name: "Arcade Neon", desc: "Retro arcade neon outline and gamer badge on your profile.", price: 95, style: "arcade", color: "#f48fb1", icon: "sports_esports" },
  { id: "pr_vip_badge", slot: "profile", name: "Creator Crest", desc: "Bold Material You creator crest & gold accent border.", price: 100, style: "crest", color: "#ffd58a", icon: "verified" }
];

module.exports = function mountShop({ app, db, run, wrap, uidFrom, HttpError, nowIso }) {
  let ready = false;
  async function ensureTables() {
    if (ready) return;
    await db.batch([
      `CREATE TABLE IF NOT EXISTS user_shop_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        is_custom INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        color TEXT,
        style TEXT,
        icon TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_equipped_decos (
        user_id TEXT PRIMARY KEY,
        avatar_deco TEXT,
        profile_deco TEXT,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_shop_user ON user_shop_items(user_id, created_at DESC)"
    ], "write");
    ready = true;
  }

  async function getWallet(uid) {
    await ensureTables();
    const [likesRow, cmtsRow, spentRow] = await Promise.all([
      run("SELECT COUNT(*) AS c FROM likes l JOIN videos v ON v.id = l.video_id WHERE v.user_id = ?", [uid]),
      run("SELECT COUNT(*) AS c FROM comments c JOIN videos v ON v.id = c.video_id WHERE v.user_id = ?", [uid]),
      run("SELECT COALESCE(SUM(price), 0) AS s FROM user_shop_items WHERE user_id = ?", [uid])
    ]);
    const likesCount = Number(likesRow[0]?.c || 0);
    const commentsCount = Number(cmtsRow[0]?.c || 0);
    const earned = likesCount * LIKE_REWARD + commentsCount * COMMENT_REWARD;
    const spent = Number(spentRow[0]?.s || 0);
    return { balance: Math.max(0, earned - spent), earned, spent, likesCount, commentsCount };
  }

  app.get("/api/shop/me", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const wallet = await getWallet(uid);
    const owned = await run("SELECT * FROM user_shop_items WHERE user_id = ? ORDER BY created_at DESC", [uid]);
    const eq = (await run("SELECT avatar_deco, profile_deco FROM user_equipped_decos WHERE user_id = ?", [uid]))[0] || {};
    return {
      data: {
        ...wallet,
        likeReward: LIKE_REWARD,
        commentReward: COMMENT_REWARD,
        customPrice: CUSTOM_PRICE,
        catalog: CATALOG,
        owned,
        equipped: { avatar: eq.avatar_deco || null, profile: eq.profile_deco || null }
      },
      error: null
    };
  }));

  app.post("/api/shop/buy", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const itemId = String(req.body?.itemId || "").trim();
    const item = CATALOG.find(x => x.id === itemId);
    if (!item) throw new HttpError(404, "Decoration not found");
    const wallet = await getWallet(uid);
    const already = await run("SELECT 1 FROM user_shop_items WHERE user_id = ? AND item_id = ?", [uid, item.id]);
    if (already.length) throw new HttpError(409, "You already own this decoration!");
    if (wallet.balance < item.price) throw new HttpError(400, `Not enough Talk Coins (need ${item.price}, have ${wallet.balance}).`);

    const id = crypto.randomUUID(), ts = nowIso();
    const col = item.slot === "avatar" ? "avatar_deco" : "profile_deco";
    await db.batch([
      {
        sql: "INSERT INTO user_shop_items (id, user_id, item_id, slot, name, price, is_custom, image_url, color, style, icon, created_at) VALUES (?,?,?,?,?, ?,0,NULL,?,?,?,?)",
        args: [id, uid, item.id, item.slot, item.name, item.price, item.color, item.style, item.icon, ts]
      },
      {
        sql: `INSERT INTO user_equipped_decos (user_id, ${col}, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET ${col}=excluded.${col}, updated_at=excluded.updated_at`,
        args: [uid, item.id, ts]
      }
    ], "write");
    return { data: { itemId: item.id, slot: item.slot }, error: null };
  }));

  app.post("/api/shop/custom", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const name = String(req.body?.name || "").trim().slice(0, 32);
    const slot = req.body?.slot === "profile" ? "profile" : "avatar";
    const image_url = String(req.body?.image_url || "").trim();
    const color = /^#[0-9a-fA-F]{6}$/.test(String(req.body?.color || "")) ? req.body.color : "#d0bcff";
    if (!name) throw new HttpError(400, "Give your custom decoration a name.");
    if (image_url && !/^https?:\/\//i.test(image_url)) throw new HttpError(400, "Invalid image URL.");

    const wallet = await getWallet(uid);
    if (wallet.balance < CUSTOM_PRICE) throw new HttpError(400, `Making your own decoration costs ${CUSTOM_PRICE} Talk Coins (you have ${wallet.balance}).`);

    const id = crypto.randomUUID(), itemId = "custom_" + id.slice(0, 8), ts = nowIso();
    const col = slot === "avatar" ? "avatar_deco" : "profile_deco";
    await db.batch([
      {
        sql: "INSERT INTO user_shop_items (id, user_id, item_id, slot, name, price, is_custom, image_url, color, style, icon, created_at) VALUES (?,?,?,?,?, ?,1,?,?,?,?,?)",
        args: [id, uid, itemId, slot, name, CUSTOM_PRICE, image_url || null, color, "custom", "auto_awesome", ts]
      },
      {
        sql: `INSERT INTO user_equipped_decos (user_id, ${col}, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET ${col}=excluded.${col}, updated_at=excluded.updated_at`,
        args: [uid, itemId, ts]
      }
    ], "write");
    return { data: { itemId, slot }, error: null };
  }));

  app.post("/api/shop/equip", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureTables();
    const slot = req.body?.slot === "profile" ? "profile" : "avatar";
    const itemId = req.body?.itemId ? String(req.body.itemId) : null;
    if (itemId) {
      const owned = await run("SELECT 1 FROM user_shop_items WHERE user_id = ? AND item_id = ? AND slot = ?", [uid, itemId, slot]);
      if (!owned.length) throw new HttpError(403, "You don't own that decoration.");
    }
    const col = slot === "avatar" ? "avatar_deco" : "profile_deco";
    await db.execute({
      sql: `INSERT INTO user_equipped_decos (user_id, ${col}, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET ${col}=excluded.${col}, updated_at=excluded.updated_at`,
      args: [uid, itemId, nowIso()]
    });
    return { data: { slot, itemId }, error: null };
  }));

  app.get("/api/shop/equipped", wrap(async req => {
    await ensureTables();
    const uid = String(req.query.userId || "").trim();
    if (!uid) return { data: { avatar: null, profile: null }, error: null };
    const eq = (await run("SELECT avatar_deco, profile_deco FROM user_equipped_decos WHERE user_id = ?", [uid]))[0];
    if (!eq) return { data: { avatar: null, profile: null }, error: null };
    const owned = await run("SELECT item_id, slot, name, is_custom, image_url, color, style, icon FROM user_shop_items WHERE user_id = ?", [uid]);
    const find = id => id ? (owned.find(x => x.item_id === id) || CATALOG.find(x => x.id === id) || null) : null;
    return { data: { avatar: find(eq.avatar_deco), profile: find(eq.profile_deco) }, error: null };
  }));
};
