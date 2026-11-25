/* Client-side Bot Protection & CAPTCHA Verification Gate */
(function () {
  if (window.wtRequireBotCheck) return;

  const PASS_KEY = "wt_human_pass";
  const PASS_EXP_KEY = "wt_human_pass_exp";
  const PAGE_HITS_KEY = "wt_bg_page_hits";
  const AUTH_HITS_KEY = "wt_bg_auth_hits";

  let dlg = null;
  let currentToken = "";
  let pendingResolvers = [];

  function getPassToken() {
    try {
      const tok = sessionStorage.getItem(PASS_KEY) || "";
      const exp = Number(sessionStorage.getItem(PASS_EXP_KEY) || "0");
      if (tok && exp > Date.now()) return tok;
      if (tok) {
        sessionStorage.removeItem(PASS_KEY);
        sessionStorage.removeItem(PASS_EXP_KEY);
      }
    } catch {}
    return "";
  }
  window.wtGetBotPass = getPassToken;

  function setPassToken(tok, expiresInSec) {
    try {
      sessionStorage.setItem(PASS_KEY, tok);
      sessionStorage.setItem(PASS_EXP_KEY, String(Date.now() + (Number(expiresInSec) || 1800) * 1000));
      sessionStorage.removeItem(PAGE_HITS_KEY);
      sessionStorage.removeItem(AUTH_HITS_KEY);
    } catch {}
  }

  function recordHit(key, windowMs) {
    try {
      const now = Date.now();
      const arr = JSON.parse(sessionStorage.getItem(key) || "[]").filter(t => now - t < windowMs);
      arr.push(now);
      sessionStorage.setItem(key, JSON.stringify(arr));
      return arr.length;
    } catch { return 0; }
  }

  function ensureStyles() {
    if (document.getElementById("wt-bot-css")) return;
    const st = document.createElement("style");
    st.id = "wt-bot-css";
    st.textContent = `
      #wt-bot-dlg{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:18px;border:0;background:rgba(12,10,16,.84);backdrop-filter:blur(10px);z-index:999999;display:none;place-items:center}
      #wt-bot-dlg[open]{display:grid}
      .wt-bot-card{width:min(100%,410px);background:var(--card,#211f26);color:var(--text,#e6e0e9);border-radius:28px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.55);border:1px solid var(--surface,#36343b);font-family:system-ui,-apple-system,sans-serif}
      .wt-bot-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
      .wt-bot-ic{width:42px;height:42px;border-radius:14px;background:var(--primary,#d0bcff);color:var(--on-primary,#381e72);display:grid;place-items:center;flex-shrink:0}
      .wt-bot-head h3{margin:0;font-size:19px;font-weight:800}
      .wt-bot-sub{margin:0 0 16px;font-size:13px;line-height:1.45;color:var(--muted,#cac4d0)}
      .wt-bot-box{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg,#141218);padding:10px;border-radius:18px;margin-bottom:12px}
      .wt-bot-svg{line-height:0;overflow:hidden;border-radius:12px}
      .wt-bot-ref{border:0;border-radius:999px;background:var(--surface,#2b2930);color:var(--text,#e6e0e9);padding:9px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;flex-shrink:0}
      .wt-bot-inp{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1px solid var(--surface,#49454f);background:var(--bg,#141218);color:var(--text,#e6e0e9);font:inherit;font-size:16px;font-weight:700;letter-spacing:4px;text-transform:uppercase;text-align:center;outline:0}
      .wt-bot-inp:focus{border-color:var(--primary,#d0bcff)}
      .wt-bot-btn{width:100%;margin-top:12px;padding:12px;border-radius:999px;border:0;background:var(--primary,#d0bcff);color:var(--on-primary,#381e72);font:inherit;font-size:14px;font-weight:800;cursor:pointer}
      .wt-bot-btn:disabled{opacity:.6;cursor:default}
      .wt-bot-err{margin-top:10px;font-size:13px;color:#f2b8b5;min-height:18px;text-align:center}
    `;
    document.head.appendChild(st);
  }

  async function loadChallenge() {
    const svgBox = document.getElementById("wtBotSvg");
    const errEl = document.getElementById("wtBotErr");
    const inp = document.getElementById("wtBotInp");
    if (errEl) errEl.textContent = "";
    if (inp) inp.value = "";
    if (svgBox) svgBox.innerHTML = '<div style="width:220px;height:74px;display:grid;place-items:center;font-size:12px;color:#aaa">Loading…</div>';
    try {
      const r = await fetch("/api/bot/challenge");
      const j = await r.json();
      if (!r.ok || !j?.data?.challengeToken) throw new Error("Could not load CAPTCHA.");
      currentToken = j.data.challengeToken;
      if (svgBox) svgBox.innerHTML = j.data.svg;
      if (inp) inp.focus();
    } catch (e) {
      if (errEl) errEl.textContent = e.message || "Failed to load challenge.";
    }
  }

  function ensureDialog() {
    if (dlg) return dlg;
    ensureStyles();
    dlg = document.createElement("dialog");
    dlg.id = "wt-bot-dlg";
    dlg.innerHTML = `
      <div class="wt-bot-card">
        <div class="wt-bot-head">
          <div class="wt-bot-ic"><span class="ms">shield_lock</span></div>
          <div><h3>Bot Protection Check</h3></div>
        </div>
        <p class="wt-bot-sub" id="wtBotReason">We noticed unusual activity on this session. Enter the 5 characters below to confirm you're human.</p>
        <div class="wt-bot-box">
          <div class="wt-bot-svg" id="wtBotSvg"></div>
          <button type="button" class="wt-bot-ref" id="wtBotRef"><span class="ms" style="font-size:16px">refresh</span>New code</button>
        </div>
        <form id="wtBotForm">
          <input type="text" class="wt-bot-inp" id="wtBotInp" maxlength="8" autocomplete="off" placeholder="CODE" required>
          <button type="submit" class="wt-bot-btn" id="wtBotSub">Verify I'm Human</button>
          <div class="wt-bot-err" id="wtBotErr"></div>
        </form>
      </div>`;
    document.body.appendChild(dlg);

    dlg.addEventListener("cancel", e => e.preventDefault());
    document.getElementById("wtBotRef").onclick = loadChallenge;
    document.getElementById("wtBotForm").onsubmit = async e => {
      e.preventDefault();
      const btn = document.getElementById("wtBotSub");
      const errEl = document.getElementById("wtBotErr");
      const answer = document.getElementById("wtBotInp").value.trim();
      if (!answer) return;
      btn.disabled = true;
      errEl.textContent = "";
      try {
        const r = await fetch("/api/bot/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeToken: currentToken, answer })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.data?.passToken) {
          throw new Error(j?.error?.message || "Incorrect code. Try again.");
        }
        setPassToken(j.data.passToken, j.data.expiresIn);
        dlg.close();
        const waiters = pendingResolvers.splice(0);
        waiters.forEach(res => res(j.data.passToken));
      } catch (ex) {
        errEl.textContent = ex.message;
        loadChallenge();
      } finally {
        btn.disabled = false;
      }
    };
    return dlg;
  }

  window.wtRequireBotCheck = function (reason) {
    return new Promise(resolve => {
      const existing = getPassToken();
      if (existing && !reason) return resolve(existing);
      pendingResolvers.push(resolve);
      const d = ensureDialog();
      if (reason) {
        const rEl = document.getElementById("wtBotReason");
        if (rEl) rEl.textContent = reason;
      }
      if (!d.open) {
        loadChallenge();
        d.showModal();
      }
    });
  };

  function checkPageBounce() {
    if (getPassToken()) return;
    const hits = recordHit(PAGE_HITS_KEY, 30000);
    if (hits >= 8) {
      window.wtRequireBotCheck("Rapid page switching detected. Please complete the CAPTCHA to continue.");
    }
  }

  function checkAuthBounce() {
    if (getPassToken()) return;
    const hits = recordHit(AUTH_HITS_KEY, 60000);
    if (hits >= 4) {
      window.wtRequireBotCheck("Repeated sign-in or sign-up attempts detected. Please complete the CAPTCHA to continue.");
    }
  }

  function bindWatchers() {
    checkPageBounce();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkPageBounce();
    });
    window.addEventListener("pageshow", e => { if (e.persisted) checkPageBounce(); });
    window.addEventListener("popstate", checkPageBounce);

    // Watch sign-in / sign-up dialog opens, back-outs, and repeated clicks
    document.addEventListener("click", e => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("#openAuth, #authBtn, a[href*='auth'], .auth-tab")) {
        checkAuthBounce();
      }
    }, true);

    const authDlg = document.getElementById("authDlg");
    if (authDlg) {
      authDlg.addEventListener("close", () => {
        const hasSession = !!localStorage.getItem("wt_session");
        if (!hasSession) checkAuthBounce();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindWatchers);
  } else {
    bindWatchers();
  }
})();
