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

### 6. Home Screen Redesign & Feature Showcase

* **Files:** `public/index.html`, `public/css/landing.css`, `public/js/landing.js`, `handoff.md`

* **Summary:**

  * Added top navigation pills (`Feed`, `Games`, `Shop`, `Studio`, `DMs`, `Sign in`), hero actions (`Start scrolling`, `Play Mini Games`, `Build a Game`), and an upgraded phone preview with 4 floating feature pills.

  * Added a 6-card **Everything inside Web Tok** M3 Expressive bento grid highlighting Video Feed, Mini Games & 3D Blockland, Developer Studio, Tok Coins & Shop, Messages & Calls, and Material You Themes/Wallpapers.

  * Added a Quick Launch bar and footer while preserving `#wtHomeLogo` 10-click Secret Settings and `initAuth()`.
