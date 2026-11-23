# WebTok Engineering Handoff Log

Repository: `wealluselinux/webtok` (branch: `main`, auto-deploys to `https://webtok.onrender.com`)

Purpose: Shared changelog and handoff notes for **Gemini** and **Claude** so both assistants stay aligned on recent changes, architecture decisions, and pending updates.

## Completed Updates (Pushed to `main`)

### 1. Secret Settings — Element Rotation & Shape Spin Toggles

* **Commit:** `af0505318caf13d21f603cb448c09bba9fbbf05a`

* **Files:** `public/js/secret-settings.js`, `public/js/gravity-mode.js`

* **Summary:** Added persistent on/off toggles in Secret Settings for **Element Rotation** (`gravityRotate`, default `true`) and **Spin All Shapes** (`spinShapes`).

### 2. Video Banners Fix (`/scroll` & `/shop`)

* **Commit:** `3c8da6034c27709d23bfd3dc16b6906a6844f115`

* **Files:** `public/js/feed-extras.js`, `public/pages/shop.html`, `routes/shop.js`

* **Summary:**

  * Wrapped `sb.from("profiles")` in `try/catch` inside `enhanceSlides()`, added immediate + `MutationObserver` + fallback runs, and raised `.wt-vid-banner` `z-index` to `5` so banners render reliably on `/scroll`.

  * Added live banner preview and a **Remove** button on `/shop`.

  * Preserved `image_url` / `sprite` fields in `/api/shop/banners` and `/api/shop/equipped`.

### 3. Tok Coins Transfers

* **Commit:** `95ab5e427c4a55939ba747c139fd85e549947ec1`

* **Files:** `routes/shop.js`, `public/pages/shop.html`

* **Summary:**

  * Added `user_coin_transfers` table, `POST /api/shop/transfer` endpoint, and updated `getWallet()` / `GET /api/shop/me`.

  * Added **Send Tok Coins** UI and recent transfers list on `/shop`.

### 4. Remove 20-Minute Post-Login Video Upload Cooldown

* **Commit:** `210790427816199c17a8da0d518799235697ecb2` (cleaned up temporary workaround from `17ede1a7f08b470417a8da0df508282de2062a`)

* **Files:** `routes/extras.js`, `server.js`, `routes/shop.js`

* **Summary:**

  * Removed `POST_COOLDOWN_MS`, removed `last_login_at` selection in `stateOf()`, and removed the 20-minute post-login cooldown check in `/api` middleware in `routes/extras.js` while keeping new-device login alerts (`known_devices`, `login_alerts`, `recordLoginDevice`) intact.

  * Removed `UPDATE users SET last_login_at = ?` from `POST /api/auth/login` in `server.js`.

  * Removed the temporary `recordLoginDevice` wrapper and startup SQL workaround from `routes/shop.js`.

### 5. Blockland & Mini Games Pointer Lock / Iframe Fix

* **Commit:** `3bb3e01c023831592bd37a11c187de2e2c4c4aee`

* **Files:** `public/games/Blockland.html`, `public/js/games.js`, `handoff.md`

* **Summary:**

  * Fixed `Blockland.html` "Click to play" so it enters gameplay immediately, focuses the canvas (`tabIndex = 0`), safely requests Pointer Lock, and falls back to click-and-drag look when Pointer Lock is blocked.

  * Updated `frame.sandbox` to `"allow-scripts allow-pointer-lock"` in `public/js/games.js`, added `g.url` iframe support in `openBuiltin()`, and registered **Blockland** in `BUILTINS`.

  * Follow-up note: Check `public/pages/developer.html` `#prevFrame` `sandbox` attribute if testing pointer-lock games in `/developer` preview.

### 6. Home Screen Redesign & Material Symbols Fix

* **Commits:** `4bf32f9dd6d0ae2f7dbeabfca972c311f28cd14c`, `dff4f4675221f7791ededfffd389512f0d6ee331`

* **Files:** `public/index.html`, `public/css/landing.css`, `public/js/landing.js`, `handoff.md`

* **Summary:**

  * Added top navigation pills, hero actions, upgraded phone preview, 6-card **Everything inside Web Tok** bento grid, Quick Launch bar, and Material Symbols Outlined font + `.ms` styles.

### 7. Fix Signup TOS Auto-Accept, Admin Password Reset & Notifications

* **Commit:** `f3649c908fe96f1a5f05767f7fae5d1ffbff9d45`

* **Files:** `public/pages/login.html`, `public/pages/admin.html`, `routes/ai.js`, `handoff.md`

* **Summary:**

  * Restored `accepted_terms: true` automatically on `sb.auth.signUp()`, restored `POST /api/admin/set-password`, and hardened `POST /api/admin/announce` + `/admin` announcement button.

### 8. Full-Screen Sign-In Transition & Full-Screen Non-Confirmation Dialogs

* **Commit:** `f263bf627a71df3dfd6e461101077d752dc7b5b6`

* **Files:** `public/pages/login.html`, `public/js/secret-settings.js`, `public/css/profile-dialogs.css`, `public/js/developer-npc.js`, `handoff.md`

* **Summary:**

  * Added full-screen sign-in loading & 3-2-1 countdown overlay, converted Secret Settings to full-screen, and made Edit Profile / Followers / Switch Account / NPC Drawer full-screen.

### 9. Role-Gate Admin Panel Link in Sidebar More Menu (2026-11-23)

* **Files:** `public/js/shop-deco.js`, `handoff.md`

* **Summary:**

  * Fixed `wireMoreMenu()` in `public/js/shop-deco.js` so `#sbadmin` stays hidden for guests and regular users and is only revealed after `/api/admin/me` confirms `admin` or `owner`.
