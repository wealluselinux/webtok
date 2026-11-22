/* Tok Coins, Profile Frames, Card Decorations, Video Banners, Capri Bundle & Coin Transfers Shop API (Turso) */
const crypto = require("crypto");

const LIKE_REWARD = 10;
const COMMENT_REWARD = 15;
const CUSTOM_PRICE = 130;

const CATALOG = [
  { id: "av_neon_ring", slot: "avatar", name: "Neon Prism Frame", desc: "Glowing Material You gradient frame around your profile picture.", price: 60, style: "prism", color: "#d0bcff", icon: "auto_awesome" },
  { id: "av_sparkle_aura", slot: "avatar", name: "Starlight Frame", desc: "Twinkling starlight frame and corner sparkle badge.", price: 75, style: "sparkle", color: "#ffd58a", icon: "star" },
  { id: "av_sakura_bloom", slot: "avatar", name: "Sakura Frame", desc: "Soft blossom frame with rosy petal glow.", price: 80, style: "sakura", color: "#ff9ed2", icon: "local_florist" },
  { id: "av_gold_crown", slot: "avatar", name: "Golden Crown Frame", desc: "Royal gold frame with a floating crown crest.", price: 90, style: "crown", color: "#ffca28", icon: "workspace_premium" },
  { id: "av_cyber_glitch", slot: "avatar", name: "Cyber Glitch Frame", desc: "Electric cyan & magenta cyber frame.", price: 110, style: "cyber", color: "#4dd0e1", icon: "bolt" },
  { id: "av_capri_frame", slot: "avatar", name: "Capri Glitch Frame", desc: "Crimson-magenta & neon-green Capri frame with mini Capri sprite.", price: 80, style: "capri", color: "#ff1744", icon: "auto_awesome", sprite: "/images/capri_assets/grin.webp" },

  { id: "pr_aurora_glow", slot: "profile", name: "Aurora Card Glow", desc: "Iridescent aurora border and ambient glow on your profile card.", price: 70, style: "aurora", color: "#a8dab5", icon: "nights_stay" },
  { id: "pr_emerald_wave", slot: "profile", name: "Emerald Wave", desc: "Mint-emerald expressive trim and crest on your profile card.", price: 85, style: "emerald", color: "#66bb6a", icon: "waves" },
  { id: "pr_retro_arcade", slot: "profile", name: "Arcade Neon", desc: "Retro arcade neon outline and gamer badge on your profile.", price: 95, style: "arcade", color: "#f48fb1", icon: "sports_esports" },
  { id: "pr_vip_badge", slot: "profile", name: "Creator Crest", desc: "Bold Material You creator crest & gold accent border.", price: 100, style: "crest", color: "#ffd58a", icon: "verified" },
  { id: "pr_capri_card", slot: "profile", name: "Capri Profile Card", desc: "Crimson & neon-green Capri glitch border with Capri crest.", price: 85, style: "capri", color: "#00e676", icon: "bolt", sprite: "/images/capri_assets/glitch.webp" },

  { id: "bn_neon_spotlight", slot: "banner", name: "Spotlight Banner", desc: "Glowing Material You top banner on any video you choose.", price: 75, style: "spotlight", color: "#d0bcff", icon: "auto_awesome" },
  { id: "bn_gold_premiere", slot: "banner", name: "Gold Premiere Banner", desc: "Royal gold premiere ribbon banner for your featured video.", price: 95, style: "premiere", color: "#ffca28", icon: "workspace_premium" },
  { id: "bn_cyber_ticker", slot: "banner", name: "Cyber Neon Banner", desc: "Electric cyan & pink neon banner across the top of your video.", price: 105, style: "cyber", color: "#4dd0e1", icon: "bolt" },
  { id: "bn_capri_banner", slot: "banner", name: "Capri Video Banner", desc: "Crimson-magenta & neon-green Capri banner for your video.", price: 85, style: "capri", color: "#ff1744", icon: "auto_awesome", sprite: "/images/capri_assets/idle.webp" }
];

const BUNDLES = [
  {
    id: "capri_bundle",
    name: "Capri Bundle",
    desc: "Complete Capri set: Capri Glitch Frame, Capri Profile Card, and Capri Video Banner!",
    price: 195,
    color: "#ff1744",
    accent: "#00e676",
    preview: "/images/capri_assets/idle.webp",
    items: ["av_capri_frame", "pr_capri_card", "bn_capri_banner"]
  }
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
      `CREATE TABLE IF NOT EXISTS user_coin_grants (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        granted_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_video_banners (
        video_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_coin_transfers (
        id TEXT PRIMARY KEY,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_shop_user ON user_shop_items(user_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_grants_user ON user_coin_grants(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_vb_user ON user_video_banners(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_xfer_from ON user_coin_transfers(from_user_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_xfer_to ON user_coin_transfers(to_user_id, created_at DESC)"
    ], "write");
    ready = true;
  }

  async function getWallet(uid) {
    await ensureTables();
    const [likesRow, cmtsRow, spentRow, grantRow, recvRow, sentRow] = await Promise.all([
      run("SELECT COUNT(*) AS c FROM likes l JOIN videos v ON v.id = l.video_id WHERE v.user_id = ?", [uid]),
      run("SELECT COUNT(*) AS c FROM comments c JOIN videos v ON v.id = c.video_id WHERE v.user_id = ?", [uid]),
      run("SELECT COALESCE(SUM(price), 0) AS s FROM user_shop_items WHERE user_id = ?", [uid]),
      run("SELECT COALESCE(SUM(amount), 0) AS g FROM user_coin_grants WHERE user_id = ?", [uid]),
      run("SELECT COALESCE(SUM(amount), 0) AS r FROM user_coin_transfers WHERE to_user_id = ?", [uid]),
      run("SELECT COALESCE(SUM(amount), 0) AS s FROM user_coin_transfers WHERE from_user_id = ?", [uid])
    ]);
    const likesCount = Number(likesRow[0]?.c || 0);
    const commentsCount = Number(cmtsRow[0]?.c || 0);
    const granted = Number(grantRow[0]?.g || 0);
    const received = Number(recvRow[0]?.r || 0);
    const sent = Number(sentRow[0]?.s || 0);
    const earned = likesCount * LIKE_REWARD + commentsCount * COMMENT_REWARD + granted + received;
    const spent = Number(spentRow[0]?.s || 0) + sent;
    return { balance: Math.max(0, earned - spent), earned, spent, granted, received, sent, likesCount, commentsCount };
  }

  app.post("/api/admin/tok-coins", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    if (!req.wt || !["admin", "owner"].includes(req.wt.role)) {
      throw new HttpError(403, "Admin or owner access required.");
    }
    const amount = Math.floor(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000000) {
      throw new HttpError(400, "Enter a valid amount of Tok Coins (1 to 1,000,000,000).");
    }
    const targetId = String(req.body?.targetUserId || uid).trim() || uid;
    await ensureTables();
    await db.execute({
      sql: "INSERT INTO user_coin_grants (id, user_id, amount, granted_by, created_at) VALUES (?,?,?,?,?)",
      args: [crypto.randomUUID(), targetId, amount, uid, nowIso()]
    });
    const wallet = await getWallet(targetId);
    return { data: { amount, targetUserId: targetId, balance: wallet.balance }, error: null };
  }));

  app.get("/api/shop/me", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const wallet = await getWallet(uid);
    const [owned, eqRows, myVideos, videoBanners, transfers] = await Promise.all([
      run("SELECT * FROM user_shop_items WHERE user_id = ? ORDER BY created_at DESC", [uid]),
      run("SELECT avatar_deco, profile_deco FROM user_equipped_decos WHERE user_id = ?", [uid]),
      run("SELECT id, title, created_at FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [uid]),
      run("SELECT video_id, item_id FROM user_video_banners WHERE user_id = ?", [uid]),
      run(
        `SELECT t.id, t.from_user_id, t.to_user_id, t.amount, t.note, t.created_at,
                pf.username AS from_username, pt.username AS to_username
         FROM user_coin_transfers t
         LEFT JOIN profiles pf ON pf.id = t.from_user_id
         LEFT JOIN profiles pt ON pt.id = t.to_user_id
         WHERE t.from_user_id = ? OR t.to_user_id = ?
         ORDER BY t.created_at DESC LIMIT 10`,
        [uid, uid]
      )
    ]);
    const eq = eqRows[0] || {};
    return {
      data: {
        ...wallet,
        likeReward: LIKE_REWARD,
        commentReward: COMMENT_REWARD,
        customPrice: CUSTOM_PRICE,
        catalog: CATALOG,
        bundles: BUNDLES,
        owned,
        myVideos,
        videoBanners,
        transfers,
        equipped: { avatar: eq.avatar_deco || null, profile: eq.profile_deco || null }
      },
      error: null
    };
  }));

  app.post("/api/shop/transfer", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const rawUser = String(req.body?.username || "").replace(/^@+/, "").trim().toLowerCase();
    const amount = Math.floor(Number(req.body?.amount));
    const note = String(req.body?.note || "").trim().slice(0, 100);
    if (!rawUser) throw new HttpError(400, "Enter the recipient's @username.");
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000000) {
      throw new HttpError(400, "Enter a valid amount of Tok Coins (1 or more).");
    }

    const recipient = (await run("SELECT id, username, display_name FROM profiles WHERE LOWER(username) = ?", [rawUser]))[0];
    if (!recipient) throw new HttpError(404, `User @${rawUser} not found.`);
    if (recipient.id === uid) throw new HttpError(400, "You can't send Tok Coins to yourself.");

    const wallet = await getWallet(uid);
    if (wallet.balance < amount) {
      throw new HttpError(400, `Not enough Tok Coins (need ${amount}, have ${wallet.balance}).`);
    }

    await db.execute({
      sql: "INSERT INTO user_coin_transfers (id, from_user_id, to_user_id, amount, note, created_at) VALUES (?,?,?,?,?,?)",
      args: [crypto.randomUUID(), uid, recipient.id, amount, note || null, nowIso()]
    });

    const updated = await getWallet(uid);
    return {
      data: {
        toUserId: recipient.id,
        toUsername: recipient.username,
        toDisplayName: recipient.display_name || recipient.username,
        amount,
        balance: updated.balance
      },
      error: null
    };
  }));

  app.post("/api/shop/buy-bundle", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const bundleId = String(req.body?.bundleId || "").trim();
    const videoId = req.body?.videoId ? String(req.body.videoId).trim() : null;
    const bundle = BUNDLES.find(b => b.id === bundleId);
    if (!bundle) throw new HttpError(404, "Bundle not found");

    const wallet = await getWallet(uid);
    const ownedRows = await run("SELECT item_id FROM user_shop_items WHERE user_id = ?", [uid]);
    const ownedSet = new Set(ownedRows.map(r => r.item_id));
    const missing = bundle.items.filter(id => !ownedSet.has(id));
    if (!missing.length) throw new HttpError(409, "You already own every item in this bundle!");
    if (wallet.balance < bundle.price) throw new HttpError(400, `Not enough Tok Coins (need ${bundle.price}, have ${wallet.balance}).`);

    const ts = nowIso();
    const stmts = missing.map((itemId, idx) => {
      const it = CATALOG.find(x => x.id === itemId);
      return {
        sql: "INSERT INTO user_shop_items (id, user_id, item_id, slot, name, price, is_custom, image_url, color, style, icon, created_at) VALUES (?,?,?,?,?, ?,0,NULL,?,?,?,?)",
        args: [crypto.randomUUID(), uid, it.id, it.slot, it.name, idx === 0 ? bundle.price : 0, it.color, it.style, it.icon, ts]
      };
    });

    const avId = bundle.items.find(id => CATALOG.find(x => x.id === id)?.slot === "avatar");
    const prId = bundle.items.find(id => CATALOG.find(x => x.id === id)?.slot === "profile");
    const bnId = bundle.items.find(id => CATALOG.find(x => x.id === id)?.slot === "banner");
    if (avId && prId) {
      stmts.push({
        sql: "INSERT INTO user_equipped_decos (user_id, avatar_deco, profile_deco, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_deco=excluded.avatar_deco, profile_deco=excluded.profile_deco, updated_at=excluded.updated_at",
        args: [uid, avId, prId, ts]
      });
    }
    if (bnId && videoId) {
      const v = await run("SELECT 1 FROM videos WHERE id = ? AND user_id = ?", [videoId, uid]);
      if (v.length) {
        stmts.push({
          sql: "INSERT INTO user_video_banners (video_id, user_id, item_id, updated_at) VALUES (?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET item_id=excluded.item_id, updated_at=excluded.updated_at",
          args: [videoId, uid, bnId, ts]
        });
      }
    }
    await db.batch(stmts, "write");
    return { data: { bundleId: bundle.id, unlocked: missing }, error: null };
  }));

  app.post("/api/shop/buy", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const itemId = String(req.body?.itemId || "").trim();
    const videoId = req.body?.videoId ? String(req.body.videoId).trim() : null;
    const item = CATALOG.find(x => x.id === itemId);
    if (!item) throw new HttpError(404, "Decoration not found");
    const wallet = await getWallet(uid);
    const already = await run("SELECT 1 FROM user_shop_items WHERE user_id = ? AND item_id = ?", [uid, item.id]);
    if (already.length) throw new HttpError(409, "You already own this decoration!");
    if (wallet.balance < item.price) throw new HttpError(400, `Not enough Tok Coins (need ${item.price}, have ${wallet.balance}).`);

    const id = crypto.randomUUID(), ts = nowIso();
    const stmts = [{
      sql: "INSERT INTO user_shop_items (id, user_id, item_id, slot, name, price, is_custom, image_url, color, style, icon, created_at) VALUES (?,?,?,?,?, ?,0,NULL,?,?,?,?)",
      args: [id, uid, item.id, item.slot, item.name, item.price, item.color, item.style, item.icon, ts]
    }];
    if (item.slot === "banner") {
      if (videoId) {
        const v = await run("SELECT 1 FROM videos WHERE id = ? AND user_id = ?", [videoId, uid]);
        if (v.length) {
          stmts.push({
            sql: "INSERT INTO user_video_banners (video_id, user_id, item_id, updated_at) VALUES (?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET item_id=excluded.item_id, updated_at=excluded.updated_at",
            args: [videoId, uid, item.id, ts]
          });
        }
      }
    } else {
      const col = item.slot === "avatar" ? "avatar_deco" : "profile_deco";
      stmts.push({
        sql: `INSERT INTO user_equipped_decos (user_id, ${col}, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET ${col}=excluded.${col}, updated_at=excluded.updated_at`,
        args: [uid, item.id, ts]
      });
    }
    await db.batch(stmts, "write");
    return { data: { itemId: item.id, slot: item.slot }, error: null };
  }));

  app.post("/api/shop/custom", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    const name = String(req.body?.name || "").trim().slice(0, 32);
    const slot = ["avatar", "profile", "banner"].includes(req.body?.slot) ? req.body.slot : "avatar";
    const videoId = req.body?.videoId ? String(req.body.videoId).trim() : null;
    const image_url = String(req.body?.image_url || "").trim();
    const color = /^#[0-9a-fA-F]{6}$/.test(String(req.body?.color || "")) ? req.body.color : "#d0bcff";
    if (!name) throw new HttpError(400, "Give your custom decoration a name.");
    if (image_url && !/^https?:\/\//i.test(image_url)) throw new HttpError(400, "Invalid image URL.");

    const wallet = await getWallet(uid);
    if (wallet.balance < CUSTOM_PRICE) throw new HttpError(400, `Making your own decoration costs ${CUSTOM_PRICE} Tok Coins (you have ${wallet.balance}).`);

    const id = crypto.randomUUID(), itemId = "custom_" + id.slice(0, 8), ts = nowIso();
    const stmts = [{
      sql: "INSERT INTO user_shop_items (id, user_id, item_id, slot, name, price, is_custom, image_url, color, style, icon, created_at) VALUES (?,?,?,?,?, ?,1,?,?,?,?,?)",
      args: [id, uid, itemId, slot, name, CUSTOM_PRICE, image_url || null, color, "custom", "auto_awesome", ts]
    }];
    if (slot === "banner") {
      if (videoId) {
        const v = await run("SELECT 1 FROM videos WHERE id = ? AND user_id = ?", [videoId, uid]);
        if (v.length) {
          stmts.push({
            sql: "INSERT INTO user_video_banners (video_id, user_id, item_id, updated_at) VALUES (?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET item_id=excluded.item_id, updated_at=excluded.updated_at",
            args: [videoId, uid, itemId, ts]
          });
        }
      }
    } else {
      const col = slot === "avatar" ? "avatar_deco" : "profile_deco";
      stmts.push({
        sql: `INSERT INTO user_equipped_decos (user_id, ${col}, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET ${col}=excluded.${col}, updated_at=excluded.updated_at`,
        args: [uid, itemId, ts]
      });
    }
    await db.batch(stmts, "write");
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

  app.post("/api/shop/equip-banner", wrap(async req => {
    const uid = uidFrom(req); if (!uid) throw new HttpError(401, "Sign in required");
    await ensureTables();
    const videoId = String(req.body?.videoId || "").trim();
    const itemId = req.body?.itemId ? String(req.body.itemId).trim() : null;
    if (!videoId) throw new HttpError(400, "Choose a video.");
    const v = await run("SELECT 1 FROM videos WHERE id = ? AND user_id = ?", [videoId, uid]);
    if (!v.length) throw new HttpError(403, "You can only add banners to your own videos.");
    if (!itemId) {
      await db.execute({ sql: "DELETE FROM user_video_banners WHERE video_id = ? AND user_id = ?", args: [videoId, uid] });
      return { data: { videoId, itemId: null }, error: null };
    }
    const owned = await run("SELECT 1 FROM user_shop_items WHERE user_id = ? AND item_id = ? AND slot = 'banner'", [uid, itemId]);
    if (!owned.length) throw new HttpError(403, "You don't own that video banner.");
    await db.execute({
      sql: "INSERT INTO user_video_banners (video_id, user_id, item_id, updated_at) VALUES (?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET item_id=excluded.item_id, updated_at=excluded.updated_at",
      args: [videoId, uid, itemId, nowIso()]
    });
    return { data: { videoId, itemId }, error: null };
  }));

  app.get("/api/shop/banners", wrap(async req => {
    await ensureTables();
    const ids = String(req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);
    if (!ids.length) return { data: {}, error: null };
    const ph = ids.map(() => "?").join(",");
    const rows = await run(`SELECT b.video_id, b.user_id, b.item_id FROM user_video_banners b WHERE b.video_id IN (${ph})`, ids);
    if (!rows.length) return { data: {}, error: null };
    const uids = [...new Set(rows.map(r => r.user_id))];
    const uph = uids.map(() => "?").join(",");
    const owned = await run(`SELECT user_id, item_id, name, is_custom, image_url, color, style, icon FROM user_shop_items WHERE user_id IN (${uph}) AND slot = 'banner'`, uids);
    const out = {};
    rows.forEach(r => {
      const cat = CATALOG.find(x => x.id === r.item_id);
      const ow = owned.find(x => x.user_id === r.user_id && x.item_id === r.item_id);
      out[r.video_id] = ow
        ? { ...cat, ...ow, image_url: ow.image_url || cat?.image_url || null, sprite: cat?.sprite || null }
        : (cat || null);
    });
    return { data: out, error: null };
  }));

  app.get("/api/shop/equipped", wrap(async req => {
    await ensureTables();
    const uid = String(req.query.userId || "").trim();
    if (!uid) return { data: { avatar: null, profile: null }, error: null };
    const eq = (await run("SELECT avatar_deco, profile_deco FROM user_equipped_decos WHERE user_id = ?", [uid]))[0];
    if (!eq) return { data: { avatar: null, profile: null }, error: null };
    const owned = await run("SELECT item_id, slot, name, is_custom, image_url, color, style, icon FROM user_shop_items WHERE user_id = ?", [uid]);
    const find = id => {
      if (!id) return null;
      const cat = CATALOG.find(x => x.id === id);
      const ow = owned.find(x => x.item_id === id);
      return ow ? { ...cat, ...ow, image_url: ow.image_url || cat?.image_url || null, sprite: cat?.sprite || null } : (cat || null);
    };
    return { data: { avatar: find(eq.avatar_deco), profile: find(eq.profile_deco) }, error: null };
  }));
};
