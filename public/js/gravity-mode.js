/* Interactive Gravity Mode: gravifies & rotates every visible part on the page (including Capri & Profile) */
(function () {
  if (window.wtGravity) return;

  let active = false, btn = null, raf = 0, items = [], dragItem = null, lx = 0, ly = 0;

  function getCfg() {
    try { return JSON.parse(localStorage.getItem("wt_capri_cfg") || "{}"); } catch { return {}; }
  }

  function setCapriPose(el, pose) {
    if (el.id !== "wt-capri") return;
    const im = el.querySelector("img");
    const src = `/images/capri_assets/${pose}.webp`;
    if (im && !im.src.endsWith(src)) im.src = src;
  }

  function collectElements() {
    const sel = [
      "h1", "h2", "h3", "p", "a", "button", "input", "select", "textarea", "label", "img", "video", "canvas",
      ".tag", ".legal", ".btn", ".chip", ".fab", ".vid-seek-wrap", ".wt-pill", ".st-pill",
      ".g-card", ".pfp", ".p-names", ".p-stats", ".p-bio", ".tabs .tab", ".vid-tile", ".cmt-card", ".empty-box",
      ".pane", ".ai-box", ".upd-box", ".dev-bar", ".card", ".act-card", ".snd-card",
      ".fl", ".phone", ".chips span", "#sb .it", "#sb .brand", "#sb .srch-wrap", ".fr", ".m-wrap", "#wt-capri"
    ].join(",");
    const raw = [...document.querySelectorAll(sel)].filter(el => {
      if (el.closest("#wt-capri-chat,#wt-grav-btn,dialog") || el.id === "wt-grav-btn") return false;
      if (el.closest("#wt-capri") && el.id !== "wt-capri") return false;
      const r = el.getBoundingClientRect();
      return r.width > 6 && r.height > 6 && r.bottom > -40 && r.top < window.innerHeight + 40;
    });
    return raw.filter(el => !raw.some(other => other !== el && other.contains(el)));
  }

  function resolveCollisions(allowRot) {
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const ax1 = a.r.left + a.dx, ay1 = a.r.top + a.dy, ax2 = ax1 + a.r.width, ay2 = ay1 + a.r.height;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const bx1 = b.r.left + b.dx, by1 = b.r.top + b.dy, bx2 = bx1 + b.r.width, by2 = by1 + b.r.height;
        const ox = Math.min(ax2, bx2) - Math.max(ax1, bx1);
        const oy = Math.min(ay2, by2) - Math.max(ay1, by1);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) {
          const dir = (ax1 + ax2) < (bx1 + bx2) ? -1 : 1;
          const push = ox * 0.5;
          if (!a.dragging) a.dx += dir * push;
          if (!b.dragging) b.dx -= dir * push;
          const avgVx = (a.vx + b.vx) * 0.5;
          if (!a.dragging) { a.vx = avgVx + dir * 0.9; if (allowRot) a.vr += dir * 1.4; }
          if (!b.dragging) { b.vx = avgVx - dir * 0.9; if (allowRot) b.vr -= dir * 1.4; }
        } else {
          const dir = (ay1 + ay2) < (by1 + by2) ? -1 : 1;
          const push = oy * 0.5;
          if (!a.dragging) a.dy += dir * push;
          if (!b.dragging) b.dy -= dir * push;
          const spin = allowRot ? Math.max(-4, Math.min(4, (a.vx - b.vx) * 0.4)) : 0;
          if (dir < 0) {
            if (!a.dragging && a.vy > 0) { a.vy = -a.vy * 0.28; if (allowRot) a.vr += spin; }
            if (!b.dragging && b.vy < 0) { b.vy = -b.vy * 0.28; if (allowRot) b.vr -= spin; }
          } else {
            if (!b.dragging && b.vy > 0) { b.vy = -b.vy * 0.28; if (allowRot) b.vr -= spin; }
            if (!a.dragging && a.vy < 0) { a.vy = -a.vy * 0.28; if (allowRot) a.vr += spin; }
          }
        }
      }
    }
  }

  function activate() {
    if (active) return;
    active = true;
    const allowRot = getCfg().gravityRotate !== false;
    const els = collectElements();
    items = els.map(el => {
      const r = el.getBoundingClientRect();
      const orig = {
        transform: el.style.transform,
        transition: el.style.transition,
        cursor: el.style.cursor,
        userSelect: el.style.userSelect,
        zIndex: el.style.zIndex
      };
      el.style.transition = "none";
      el.style.cursor = "grab";
      el.style.userSelect = "none";
      el.style.zIndex = el.id === "wt-capri" ? "9998" : "900";
      if (el.id === "wt-capri") setCapriPose(el, "tossed");
      const obj = {
        el, orig, r,
        dx: 0, dy: 0,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 2,
        rot: 0, vr: allowRot ? (Math.random() - 0.5) * 3.5 : 0,
        dragging: false
      };
      el._wtGravDown = e => {
        if (!active) return;
        e.preventDefault(); e.stopPropagation();
        dragItem = obj; obj.dragging = true;
        obj.vx = 0; obj.vy = 0; obj.vr = 0;
        lx = e.clientX; ly = e.clientY;
        el.style.cursor = "grabbing";
        el.style.zIndex = "9999";
        if (el.id === "wt-capri") setCapriPose(el, "dangle");
      };
      el.addEventListener("pointerdown", el._wtGravDown);
      return obj;
    });

    document.body.dataset.wtGravity = "1";
    updateBtn();

    (function loop() {
      if (!active) return;
      const W = window.innerWidth, H = window.innerHeight;
      const cfg = getCfg();
      const collide = !!cfg.gravityCollide;
      const rotOn = cfg.gravityRotate !== false;
      for (const it of items) {
        if (!rotOn) { it.rot = 0; it.vr = 0; }
        if (!it.dragging) {
          it.vy += 0.65;
          it.dx += it.vx;
          it.dy += it.vy;
          if (rotOn) {
            it.rot += it.vr;
            it.vr *= 0.985;
          }
          it.vx *= 0.992;

          const curLeft = it.r.left + it.dx, curRight = it.r.right + it.dx;
          const curBottom = it.r.bottom + it.dy, curTop = it.r.top + it.dy;

          if (curLeft < 0) { it.dx -= curLeft; it.vx = Math.abs(it.vx) * 0.55; if (rotOn) it.vr += (Math.random() - 0.5) * 4; }
          if (curRight > W) { it.dx -= (curRight - W); it.vx = -Math.abs(it.vx) * 0.55; if (rotOn) it.vr += (Math.random() - 0.5) * 4; }
          if (curTop < 0) { it.dy -= curTop; it.vy = Math.abs(it.vy) * 0.4; }
          if (curBottom >= H - 4) {
            it.dy -= (curBottom - (H - 4));
            if (Math.abs(it.vy) > 3.2) { it.vy = -it.vy * 0.36; it.vr = rotOn ? (Math.random() - 0.5) * 3.5 : 0; }
            else { it.vy = 0; it.vx *= 0.85; it.vr *= 0.7; }
          }
        }
      }
      if (collide) resolveCollisions(rotOn);
      for (const it of items) {
        if (it.el.id === "wt-capri") {
          const tx = Math.round(it.r.left + it.dx), ty = Math.round(it.r.top + it.dy);
          it.el.style.transform = rotOn
            ? `translate3d(${tx}px,${ty}px,0) rotate(${it.rot.toFixed(1)}deg)`
            : `translate3d(${tx}px,${ty}px,0)`;
        } else {
          it.el.style.transform = rotOn
            ? `translate3d(${it.dx.toFixed(1)}px,${it.dy.toFixed(1)}px,0) rotate(${it.rot.toFixed(1)}deg)`
            : `translate3d(${it.dx.toFixed(1)}px,${it.dy.toFixed(1)}px,0)`;
        }
      }
      raf = requestAnimationFrame(loop);
    })();
  }

  function disable() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    dragItem = null;
    delete document.body.dataset.wtGravity;
    for (const it of items) {
      it.el.removeEventListener("pointerdown", it.el._wtGravDown);
      delete it.el._wtGravDown;
      if (it.el.id === "wt-capri") setCapriPose(it.el, "idle");
      it.el.style.transition = "transform .45s cubic-bezier(.2,.9,.3,1.1)";
      it.el.style.transform = it.orig.transform || "";
      setTimeout(() => {
        it.el.style.transition = it.orig.transition;
        it.el.style.cursor = it.orig.cursor;
        it.el.style.userSelect = it.orig.userSelect;
        it.el.style.zIndex = it.orig.zIndex;
      }, 480);
    }
    items = [];
    updateBtn();
  }

  addEventListener("pointermove", e => {
    if (!active || !dragItem) return;
    const mx = e.clientX - lx, my = e.clientY - ly;
    dragItem.dx += mx; dragItem.dy += my;
    dragItem.vx = Math.max(-22, Math.min(22, mx * 0.85));
    dragItem.vy = Math.max(-22, Math.min(22, my * 0.85));
    dragItem.vr = getCfg().gravityRotate !== false ? Math.max(-14, Math.min(14, mx * 0.5)) : 0;
    lx = e.clientX; ly = e.clientY;
  });
  addEventListener("pointerup", () => {
    if (!dragItem) return;
    dragItem.dragging = false;
    if (dragItem.el.id === "wt-capri") setCapriPose(dragItem.el, "tossed");
    dragItem.el.style.cursor = "grab";
    dragItem.el.style.zIndex = dragItem.el.id === "wt-capri" ? "9998" : "900";
    dragItem = null;
  });

  function updateBtn() {
    if (!btn) return;
    btn.innerHTML = active
      ? '<span class="ms" style="font-size:18px">restart_alt</span>Disable Gravity'
      : '<span class="ms" style="font-size:18px">south</span>Activate Gravity';
    btn.style.background = active ? "var(--bad,#b3261e)" : "var(--primary,#6750a4)";
    btn.style.color = active ? "#fff" : "var(--on-primary,#fff)";
  }

  function sync() {
    const on = !!getCfg().gravityBtn;
    if (on && !btn && document.body) {
      btn = document.createElement("button");
      btn.id = "wt-grav-btn";
      btn.type = "button";
      btn.style.cssText = "position:fixed;bottom:16px;right:18px;z-index:10001;border:0;border-radius:999px;padding:11px 18px;font:700 13px system-ui,sans-serif;display:inline-flex;align-items:center;gap:6px;cursor:pointer;box-shadow:0 8px 24px #0004;transition:transform .15s,background .2s";
      btn.onclick = () => { if (active) disable(); else activate(); };
      document.body.appendChild(btn);
      updateBtn();
    } else if (!on && btn) {
      disable();
      btn.remove();
      btn = null;
    }
  }

  window.wtGravity = { sync, activate, disable, isActive: () => active };
  sync();
})();
