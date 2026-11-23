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

## Pending / Latest Prepared Update (2026-11-22)

### 5. Blockland & Mini Games Pointer Lock / Iframe Fix

* **Files:**

  * `public/games/Blockland.html` (new / updated game file)

  * `public/js/games.js` (updated)

* **Root Cause:**

  1. `public/js/games.js` created `#gameFrame` with `frame.sandbox = "allow-scripts"`, which blocks `requestPointerLock()` inside the iframe.

  2. `Blockland.html` only hid `#menu` inside `pointerlockchange`, so when Pointer Lock was blocked or rejected in an iframe, clicking "Click to play" did nothing.

* **Changes Prepared:**

  * **`Blockland.html`:** Clicking `#menu` now immediately enters gameplay (`playing = true`), focuses the canvas (`tabIndex = 0`) for keyboard input, safely attempts `requestPointerLock()` (catching Promise rejections), and falls back to **click-and-drag to look** (with normal clicks to break/place) whenever Pointer Lock is unavailable.

  * **`public/js/games.js`:** Updated `frame.sandbox` to `"allow-scripts allow-pointer-lock"` in `openCommunityGame()`, added `g.url` iframe support to `openBuiltin()`, and registered **Blockland** (`url: "/games/Blockland.html"`) in `BUILTINS`.

* **Follow-up Note for Claude / Next Session:**

  * Check `developer.html` (not yet inspected) to verify whether `#prevFrame` also needs `allow-pointer-lock` in its `sandbox` attribute when previewing 3D/pointer-lock games in `/developer`.
