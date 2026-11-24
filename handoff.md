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

  * Updated `frame.sandbox` to `"allow-scripts allow-pointer-lock"` in `public/js/games.js`, added `g.url` iframe support in `openBuiltin()`, and registered **Blockland** (`url: "/games/Blockland.html"`) in `BUILTINS`.

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

### 8. Full-Screen Sign-In Transition & Full-Screen Non-Confirmation Dialogs (2026-11-23)

* **Files:** `public/pages/login.html`, `public/js/secret-settings.js`, `public/css/profile-dialogs.css`, `public/js/developer-npc.js`, `handoff.md`

* **Summary:**

  * **`public/pages/login.html`:** Added `#auth-overlay` full-screen loading screen with animated progress bar (`"Signing you in…"` -> `"Sign in successful!"` -> `"Taking you to the homepage in 3… 2… 1…"` -> reloads to `/`).

  * **`public/js/secret-settings.js`:** Converted `#wt-secret-dlg` to a full-screen Material You settings page with grouped cards (`Capri Desktop Pet`, `Physics & Motion`, `Capri AI Prompt`).

  * **`public/css/profile-dialogs.css` & `public/js/developer-npc.js`:** Made `#editProfDlg`, `#followListDlg`, `#switchDlg`, and `#npcDrawDlg` full-screen while keeping confirmation/delete modals (`#wt-m3-dlg`) compact.

### 9. Role-Gate Admin Panel Link & Hard-Block `/admin` for Guests

* **Commits:** `8fc4343b9b486f62e22c955c2e2117a05137aca1`, `89646320b1d16770126406ff18cf4e3eeed510ca`

* **Files:** `public/js/shop-deco.js`, `public/js/admin.js`, `handoff.md`

* **Summary:**

  * Role-gated `#sbadmin` in `public/js/shop-deco.js` and removed `#app` DOM on `/admin` when accessed by guests or non-admins.

### 10. Fix `@notifications` in Messages, Web Tok AI Errors, Admin Error Reporting & Admin More-Menu Link (2026-11-23)

* **Commit:** `8466a87c88f3bde379d66c213e8150b37a2e4973`

* **Files:** `public/js/messages-app.js`, `routes/ai.js`, `public/js/admin.js`, `public/js/shop-deco.js`, `handoff.md`

* **Summary:**

  * **`public/js/messages-app.js`:** Added `NOTIF_BOT` (`00000000-0000-0000-0000-000000000001`, `@notifications`) to the Messages sidebar under **Announcements** whenever the user has announcement messages or unread notifications, added read-only chat view + Clear support, and wired `#00000000-0000-0000-0000-000000000001` deep-links and realtime `INSERT` updates.

  * **`routes/ai.js`:** Updated `CHAT_MODELS` to reliable NVIDIA NIM models (`meta/llama-3.3-70b-instruct`, `meta/llama-3.1-8b-instruct`, `nvidia/nemotron-3.5-lightning-30b-a3b`, `qwen/qwen2.5-coder-32b-instruct`), added 25s `AbortSignal.timeout`, and surfaced exact AI/API error details (`Web Tok AI error: ...`) instead of swallowing errors.

  * **`public/js/admin.js`:** Updated `api()` to parse raw responses and return exact HTTP status / server error messages instead of generic `"Request failed"`, and surfaced detailed errors in `resetPw()`.

  * **`public/js/shop-deco.js`:** Fixed `wireMoreMenu()` so it initializes the client with `WT_CONFIG`, checks both `/api/admin/me` and `/api/profiles/:id/badge`, and no longer hides `#sbadmin` for admins/owners.

### 11. Group Collage, Group Kick/Delete, Support Tickets, DM Calling + WebRTC Fix + Speaking Ring + Mic Test, Owner Account Deletion (2026-11-24)

* **Files:** `routes/extras.js`, `public/pages/messages.html`, `public/js/messages-app.js`, `public/js/messages-call.js`, `public/pages/support.html`, `public/index.html`, `public/pages/admin.html`, `public/js/admin.js`, `handoff.md`

* **Summary:**

  * **Group Chat 3-Avatar Collage:** Added `.av-collage` (`c1`/`c2`/`c3`) and `groupAvatarHtml()` in `public/pages/messages.html` and `public/js/messages-app.js` to display up to 3 member avatars/initials in both the sidebar and chat header.

  * **Group Owner Kick & Delete:** Added `POST /api/groups/:id/kick` and `DELETE /api/groups/:id` in `routes/extras.js` (owner-only, with WebSocket room cleanup and `kicked`/`group-deleted` notifications), plus **Members** (with Kick) and **Delete** buttons in `public/js/messages-app.js`.

  * **Support Ticket System:** Added `support_tickets` & `support_replies` tables, `/support` route, `/api/support/tickets` endpoints, and `/api/admin/support` endpoints in `routes/extras.js`; created `public/pages/support.html` (linked from the `public/index.html` footer, not in sidebar); added the **Support** tab to `public/pages/admin.html` & `public/js/admin.js`.

  * **DM Calling + WebRTC Fix + Green Speaking Ring + Mic Test:** Enabled `dm:` call rooms and `dm-call-ring` notifications in `routes/extras.js`; fixed WebRTC ICE candidate queuing (`pendingIce`), peer cleanup on disconnect, and audio playback in `public/js/messages-call.js`; added `AudioContext` + `AnalyserNode` green speaking rings (`.speaking`) and the **Test Mic** modal (`#micTestDlg`).

  * **Owner-Only Account Deletion:** Added `POST /api/admin/delete-user` in `routes/extras.js` (strictly `owner` role, protecting owner/system/self) and the **Delete account** button in `public/js/admin.js`.
