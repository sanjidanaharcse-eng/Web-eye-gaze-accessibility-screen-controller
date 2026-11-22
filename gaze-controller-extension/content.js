// Web Eye-Gaze Accessibility Screen Controller - content script
(() => {
  if (window.__gazeCtl) return;
  window.__gazeCtl = true;

  const DEF = { enabled: false, source: 'pointer', dwell: 1200, smooth: 55, scrollSpeed: 7, cursor: 34, snap: true };
  let cfg = { ...DEF };
  const S = { x: -200, y: -200, sx: -200, sy: -200, paused: false, mode: 'click', target: null, start: 0, cool: 0,
              lastPick: 0, pickCache: null, wgOn: false, up: false, down: false };

  const CLICKABLE = 'a[href],button,input,select,textarea,summary,label[for],[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="checkbox"],[role="option"],[onclick],video,[tabindex]:not([tabindex="-1"])';

  /* ---------------- overlay (shadow DOM so page CSS cannot break it) ---------------- */
  const host = document.createElement('div');
  host.id = 'gaze-ctl-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
  <style>
    *{box-sizing:border-box;font-family:"Atkinson Hyperlegible",system-ui,sans-serif}
    #cur{position:fixed;left:0;top:0;border:3px solid #E39B0B;border-radius:50%;background:rgba(227,155,11,.12);will-change:transform}
    #cur::after{content:"";position:absolute;left:50%;top:50%;width:7px;height:7px;margin:-3.5px;border-radius:50%;background:#E39B0B}
    #cur svg{position:absolute;inset:-9px;width:calc(100% + 18px);height:calc(100% + 18px);transform:rotate(-90deg)}
    #cur circle{fill:none;stroke:#0B6E6E;stroke-width:4.5;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100}
    .zone{position:fixed;left:0;right:0;display:grid;place-items:center;font-weight:700;font-size:15px;color:#14232E;background:rgba(66,140,220,.14);opacity:0;transition:opacity .15s}
    .zone.show{opacity:1}
    #zu{top:0;height:38vh;border-bottom:3px solid rgba(66,140,220,.6)} #zd{bottom:0;height:38vh;border-top:3px solid rgba(66,140,220,.6)}
    .zone.hot{background:rgba(227,155,11,.35)}
    #dock{position:fixed;right:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;background:#14232E;padding:8px;border-radius:14px;pointer-events:auto;box-shadow:0 4px 18px rgba(0,0,0,.35)}
    #dock button{font:700 14px/1 inherit;min-width:88px;min-height:46px;border-radius:10px;border:1px solid #3B4D5A;background:#22343F;color:#F4F6F8;cursor:pointer}
    #dock button.on{background:#E39B0B;color:#14232E;border-color:#E39B0B}
    #badge{position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#14232E;color:#fff;font-weight:700;font-size:14px;padding:6px 16px;border-radius:20px;opacity:.92}
    #msg{position:fixed;left:50%;bottom:16vh;transform:translateX(-50%);background:#14232E;color:#fff;padding:10px 18px;border-radius:12px;font-weight:700;display:none;max-width:80vw;text-align:center}
    #cal{position:fixed;inset:0;background:rgba(10,17,23,.94);display:none;color:#fff;pointer-events:auto}
    #cal .t{position:absolute;top:24px;left:0;right:0;text-align:center;font-size:22px;font-weight:700}
    #cal .d{position:absolute;width:34px;height:34px;margin:-17px;border-radius:50%;background:#E39B0B;box-shadow:0 0 0 8px rgba(227,155,11,.3)}
  </style>
  <div id="zu" class="zone">Scroll up</div><div id="zd" class="zone">Scroll down</div>
  <div id="cur"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" pathLength="100"/></svg></div>
  <div id="dock" aria-label="Gaze controls">
    <button data-a="mode">Scroll mode</button><button data-a="pause">Pause</button><button data-a="back">Back</button><button data-a="fwd">Forward</button>
    <button data-a="tprev">Prev tab</button><button data-a="tnext">Next tab</button><button data-a="cal">Calibrate</button><button data-a="off">Turn off</button>
  </div>
  <div id="badge">CLICK MODE</div><div id="msg" role="status"></div><div id="cal"><div class="t" id="calT"></div></div>`;
  const $ = (s) => root.querySelector(s);
  const cur = $('#cur'), ring = cur.querySelector('circle'), zu = $('#zu'), zd = $('#zd'), msgEl = $('#msg');
  const dockBtns = [...root.querySelectorAll('#dock button')];
  const modeBtn = root.querySelector('[data-a="mode"]'), pauseBtn = root.querySelector('[data-a="pause"]'), badge = $('#badge');

  function say(t, ms = 2400) { msgEl.textContent = t; msgEl.style.display = 'block'; clearTimeout(say.t); say.t = setTimeout(() => msgEl.style.display = 'none', ms); }
  const prog = (p) => ring.style.strokeDashoffset = String(100 - p * 100);

  /* ---------------- gaze input ---------------- */
  window.addEventListener('mousemove', (e) => { if (cfg.source === 'pointer') { S.x = e.clientX; S.y = e.clientY; } }, true);

  async function startWebcam() {
    if (S.wgOn) return true;
    const wg = window.webgazer;
    if (!wg || typeof wg.setGazeListener !== 'function') {
      say('Webcam engine missing: add webgazer.js to the lib folder (see README). Using pointer mode.', 5000);
      chrome.storage.sync.set({ source: 'pointer' }); return false;
    }
    try {
      const buf = [];
      wg.setGazeListener((d) => {
        if (!d || cfg.source !== 'webcam') return;
        buf.push([d.x, d.y]); if (buf.length > 8) buf.shift();
        let sx = 0, sy = 0; for (const p of buf) { sx += p[0]; sy += p[1]; }
        S.x = sx / buf.length; S.y = sy / buf.length;
      });
      try { wg.applyKalmanFilter(true); } catch (e) {}
      await wg.begin();
      [['showVideoPreview', true], ['showPredictionPoints', false], ['showFaceOverlay', true], ['showFaceFeedbackBox', true]].forEach(([f, v]) => { try { wg[f](v); } catch (e) {} });
      setTimeout(() => {   // shrink the camera preview into the bottom-left corner so it does not cover the page
        const v = document.getElementById('webgazerVideoContainer');
        if (v) { const st = { position: 'fixed', top: 'auto', left: '8px', bottom: '8px', transform: 'scale(.5)', 'transform-origin': 'bottom left', opacity: '.9', 'pointer-events': 'none', 'z-index': '2147483646' };
          for (const k in st) v.style.setProperty(k, st[k], 'important'); }
      }, 1500);
      S.wgOn = true; calibrate(); return true;
    } catch (e) { say('Camera could not start. Allow camera access for this site.', 5000); chrome.storage.sync.set({ source: 'pointer' }); return false; }
  }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function calibrate() {
    if (!(S.wgOn && window.webgazer)) { say('Calibration is used in webcam mode.'); return; }
    const c = $('#cal'); c.style.display = 'block';
    const pts = [[.5, .5], [.1, .5], [.9, .5], [.5, .88], [.1, .88], [.9, .88], [.5, .12], [.1, .12], [.9, .12], [.2, .035], [.5, .035], [.8, .035]];
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0] * innerWidth, y = pts[i][1] * innerHeight;
      const d = document.createElement('div'); d.className = 'd'; d.style.left = x + 'px'; d.style.top = y + 'px'; c.appendChild(d);
      $('#calT').textContent = `Look at the dot (${i + 1} of ${pts.length})`;
      await sleep(500);
      for (let k = 0; k < 18; k++) { try { window.webgazer.recordScreenPosition(x, y, 'click'); } catch (e) {} await sleep(100); }
      d.remove();
    }
    c.style.display = 'none'; say('Calibration done.');
  }

  /* ---------------- target finding with snapping ---------------- */
  function hitDock(x, y) {
    for (const b of dockBtns) { const r = b.getBoundingClientRect(); if (x > r.left - 10 && x < r.right + 10 && y > r.top - 4 && y < r.bottom + 4) return { kind: 'dock', el: b }; }
    return null;
  }
  function clickableAt(x, y) { const e = document.elementFromPoint(x, y); return e ? e.closest(CLICKABLE) : null; }
  function pagePick(x, y) {
    let el = clickableAt(x, y);
    if (el) return { kind: 'page', el };
    if (!cfg.snap) return null;
    const R = Math.max(60, cfg.cursor * 2); let best = null, bd = 1e9;
    for (const rad of [R * .4, R * .75, R]) for (let a = 0; a < 8; a++) {
      const px = x + rad * Math.cos(a * Math.PI / 4), py = y + rad * Math.sin(a * Math.PI / 4);
      if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) continue;
      const e = clickableAt(px, py); if (!e) continue;
      const r = e.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { kind: 'page', el: best } : null;
  }
  function pick(now) {
    const d = hitDock(S.sx, S.sy); if (d) return d;
    if (now - S.lastPick > 70) { S.lastPick = now; S.pickCache = pagePick(S.sx, S.sy); }
    const c = S.pickCache; return c && c.el.isConnected ? c : null;
  }

  /* ---------------- actions ---------------- */
  function setMode(m) { S.mode = m; modeBtn.textContent = m === 'click' ? 'Scroll mode' : 'Click mode'; modeBtn.classList.toggle('on', m === 'scroll'); badge.textContent = m === 'click' ? 'CLICK MODE: look and hold to click' : 'SCROLL MODE: look up or down to scroll'; say(m === 'click' ? 'Click mode: you can click anywhere.' : 'Scroll mode: look up to scroll up, down to scroll down.'); }
  function togglePause() { S.paused = !S.paused; pauseBtn.classList.toggle('on', S.paused); pauseBtn.textContent = S.paused ? 'Resume' : 'Pause'; say(S.paused ? 'Paused. Nothing will be clicked.' : 'Gaze control resumed.'); }
  function doDock(a) {
    if (a === 'pause') togglePause();
    else if (a === 'mode') setMode(S.mode === 'click' ? 'scroll' : 'click');
    else if (a === 'back') history.back();
    else if (a === 'fwd') history.forward();
    else if (a === 'tprev') chrome.runtime.sendMessage({ type: 'tab', dir: 'prev' });
    else if (a === 'tnext') chrome.runtime.sendMessage({ type: 'tab', dir: 'next' });
    else if (a === 'cal') { if (cfg.source === 'webcam') calibrate(); else say('Calibration is used in webcam mode.'); }
    else if (a === 'off') chrome.storage.sync.set({ enabled: false });
  }
  function activate(t) {
    if (t.kind === 'dock') { doDock(t.el.dataset.a); return; }
    const el = t.el;
    try { if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.focus(); el.click(); } catch (e) {}
  }
  function scroller(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.body && el !== document.documentElement) {
      const o = getComputedStyle(el).overflowY;
      if (/(auto|scroll)/.test(o) && el.scrollHeight > el.clientHeight + 4) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  /* ---------------- main loop ---------------- */
  let running = false, last = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(64, now - (last || now)); last = now;
    let sa;
    if (cfg.source === 'pointer') sa = Math.max(.35, 1 - cfg.smooth / 100) * (dt / 16);
    else {
      sa = (0.25 - (cfg.smooth / 90) * 0.23) * (dt / 16);          // webcam: much stronger smoothing
      if (Math.hypot(S.x - S.sx, S.y - S.sy) < cfg.cursor * 0.8) sa *= 0.3; // small shakes are ignored
    }
    sa = Math.min(1, Math.max(.01, sa));
    S.sx += (S.x - S.sx) * sa; S.sy += (S.y - S.sy) * sa;
    const size = cfg.cursor; cur.style.width = cur.style.height = size + 'px';
    cur.style.transform = `translate(${S.sx - size / 2}px,${S.sy - size / 2}px)`;
    cur.style.display = S.x > -100 ? 'block' : 'none';

    const overDock = !!hitDock(S.sx, S.sy);
    const live = !S.paused && S.x > -100;
    // CLICK mode: dwell-click works on the WHOLE screen (including the top). SCROLL mode: only the dock is clickable.
    const t = (live && (S.mode === 'click' || overDock)) ? pick(now) : null;
    const same = t && S.target && t.el === S.target.el;
    if (!same) { S.target = t; S.start = now; prog(0); }
    if (t && now > S.cool) {
      const p = Math.min(1, (now - S.start) / cfg.dwell); prog(p);
      if (p >= 1) { activate(t); S.cool = now + 900; S.start = now; prog(0); S.pickCache = null; }
    } else if (!t) prog(0);

    // SCROLL mode: the page follows your eyes. Look above the middle band = up, below it = down. Further = faster.
    S.up = S.down = false;
    if (live && S.mode === 'scroll' && !overDock) {
      const mid = innerHeight / 2, dead = innerHeight * 0.12;     // calm middle band: no scrolling
      let off = S.sy - mid;
      if (off < 0) off *= 1.9;                                   // looking up is under-estimated by webcams, so boost it
      if (Math.abs(off) > dead) {
        const depth = Math.min(1.3, (Math.abs(off) - dead) / (mid - dead));
        S.up = off < 0; S.down = off > 0;
        const sc = scroller(Math.min(Math.max(S.sx, 2), innerWidth - 2), Math.min(Math.max(S.sy, 2), innerHeight - 2));
        sc.scrollBy(0, (S.up ? -1 : 1) * cfg.scrollSpeed * (0.3 + depth * 1.4) * (dt / 16));
      }
    }
    if (S.mode === 'scroll' && now - (S.lastBadge || 0) > 250) { S.lastBadge = now; badge.textContent = 'SCROLL MODE: look up or down  |  eye height ' + Math.max(0, Math.round(S.sy / innerHeight * 100)) + '%'; }
    const showZ = live && S.mode === 'scroll';
    zu.classList.toggle('show', showZ); zd.classList.toggle('show', showZ);
    zu.classList.toggle('hot', S.up); zd.classList.toggle('hot', S.down);
    requestAnimationFrame(frame);
  }

  function apply() {
    if (cfg.enabled) {
      if (!host.isConnected) document.documentElement.appendChild(host);
      if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
      if (cfg.source === 'webcam') startWebcam();
      else { try { window.webgazer && S.wgOn && window.webgazer.pause(); } catch (e) {} S.wgOn = false; }
      say(cfg.source === 'webcam' ? 'Gaze control on (webcam).' : 'Gaze control on (pointer test mode).');
    } else {
      running = false; host.remove();
      try { window.webgazer && S.wgOn && window.webgazer.end(); } catch (e) {} S.wgOn = false;
    }
  }

  chrome.storage.sync.get(DEF, (v) => { cfg = { ...DEF, ...v }; apply(); });
  chrome.storage.onChanged.addListener((ch) => {
    let rebuild = false;
    for (const k in ch) { cfg[k] = ch[k].newValue; if (k === 'enabled' || k === 'source') rebuild = true; }
    if (rebuild) apply();
  });
  chrome.runtime.onMessage.addListener((m) => {
    if (!cfg.enabled) return;
    if (m.type === 'toggle-pause') togglePause();
    if (m.type === 'calibrate') { if (cfg.source === 'webcam') calibrate(); else say('Calibration is used in webcam mode.'); }
  });
})();
