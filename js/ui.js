/*
 * 觀星者之屋 The Stargazer's House — 介面
 * 只負責顯示與輸入；所有規則判定都交給 engine.js。
 * 語言：所有文字都以 { zh, en } 保存，畫面在繪製時才取出目前語言，所以遊戲中途切換語言不影響進度。
 */
(function () {
  'use strict';
  const G = window.GAME_DATA;
  const E = window.EscapeEngine.create(G);
  const Art = window.Art;
  const Store = window.SaveStore;
  const I = window.I18N;
  const esc = Art.esc;
  const $ = id => document.getElementById(id);

  /* ================= 語言 ================= */
  let LANG = 'zh';
  const tr = x => I.tr(x, LANG);
  // 介面文字：TL 回傳兩種語言（可以存進紀錄，切換語言後重畫）；T 回傳目前語言；tx 已跳脫，可直接放進 HTML
  function TL(key, vars) {
    const src = I.UI[key];
    if (src == null) throw new Error('缺少介面文字：' + key);
    const out = {};
    for (const l of I.LANGS) {
      const v = {};
      for (const k in vars || {}) v[k] = I.tr(vars[k], l);
      const s = I.tr(src, l);
      out[l] = typeof s === 'string' ? I.fmt(s, v) : s;
    }
    return out;
  }
  const T = (key, vars) => tr(TL(key, vars));
  const tx = (key, vars) => esc(T(key, vars));
  // 變數本身是 HTML（例如 <strong>）時用這個：只跳脫範本
  const TH = (key, html) => I.fmt(esc(I.tr(I.UI[key], LANG)), html);
  const cap = s => (LANG === 'en' && s ? s[0].toUpperCase() + s.slice(1) : s);
  // 難度名稱（雙語原文，可以直接當作 T 的變數）
  const MODE_KEY = { novice: 'modeNovice', veteran: 'modeVeteran', master: 'modeMaster' };
  const MODE_DESC = { novice: 'modeNoviceDesc', veteran: 'modeVeteranDesc', master: 'modeMasterDesc' };
  const modeL = m => I.UI[MODE_KEY[m] || 'modeNovice'];
  const modeName = m => tr(modeL(m));
  const joinL = arr => {
    const out = {};
    for (const l of I.LANGS) out[l] = arr.map(x => I.tr(x, l)).join(I.tr(I.UI.listSep, l));
    return out;
  };

  function initialLang() {
    let q = null;
    try { q = new URLSearchParams(window.location.search).get('lang'); } catch (e) { /* 沒有網址參數 */ }
    if (q === 'zh' || q === 'en') return q;
    const saved = Store.getSetting('lang');
    if (saved === 'zh' || saved === 'en') return saved;
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^zh/i.test(nav) ? 'zh' : 'en';
  }

  function setLang(l, { persist = true } = {}) {
    LANG = l === 'en' ? 'en' : 'zh';
    Art.setLang(LANG);
    if (persist) Store.setSetting('lang', LANG);
    document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-Hant';
    document.title = tr(G.title);
    applyStatic();
    if (app.screen === 'title') refreshTitle();
    if (app.screen === 'intro') renderIntro(false);
    if (app.screen === 'game') render();
    if (app.screen === 'ending' && app.endingId) renderEnding(app.endingId);
    if (app.stack.length) renderModal();
  }

  // index.html 裡的固定文字
  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', T(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = T(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-game-title]').forEach(el => { el.textContent = tr(G.title); });
    $('title-sub').textContent = tr(G.subtitle);
    $('btn-new').textContent = T('newGame');
    const other = LANG === 'en' ? 'zh' : 'en';
    const lb = $('btn-lang');
    lb.textContent = other === 'zh' ? '中文' : 'EN';
    lb.lang = other === 'zh' ? 'zh-Hant' : 'en';
    lb.dataset.lang = other;
    syncLangButtons();
  }
  function syncLangButtons() {
    document.querySelectorAll('.lang-switch [data-lang]').forEach(b => {
      const on = b.dataset.lang === LANG;
      b.setAttribute('aria-pressed', on);
      b.classList.toggle('cur', on);
    });
  }
  const langSwitch = () => `<div class="lang-switch" role="group" aria-label="${tx('language')}">
      <button class="btn small" type="button" data-lang="zh" lang="zh-Hant">中文</button><button class="btn small" type="button" data-lang="en" lang="en">English</button></div>`;

  /* ================= 狀態 ================= */
  const app = {
    s: null,
    screen: 'title',
    selected: null,
    combining: false,
    log: [],
    latest: [],
    stack: [],
    lastFocus: null,
    ui: freshUi(),
    introStep: 0,
    endingId: null,
    lastRoom: null,
    tut: null,            // 教學進行到第幾步（null＝沒有在教學）
    tutPending: false,    // 開場的信關上之後才開始教學
    hintPulse: false,     // 完成一個階段後，提示按鈕會亮起來，直到玩家打開它
    modeTut: null,
    handKey: null,        // 「拿在手上」上次畫的內容（沒變就不重畫，保留捲動位置）
    handStripOpen: true,  // 謎題視窗裡「手上的文件」是否展開
  };
  function freshUi() {
    return { locks: {}, dev: [], confirm: null, feedback: [], code: '', importText: '', saveNote: null, photoOrder: null, photoBacks: false, music: [], musicLit: 0, sig: [''], sigReply: null, mirrorReveal: false, musicDone: false, potConfirm: null, hintAsk: null, devConfirm: false };
  }

  /* ================= 畫面切換 ================= */
  function show(screen) {
    for (const id of ['title', 'intro', 'game', 'ending']) $(id).hidden = id !== screen;
    app.screen = screen;
    if (screen === 'title') { refreshTitle(); startSky(); } else stopSky();
    if (screen !== 'game') app.lastRoom = null;
    window.scrollTo(0, 0);
  }

  function refreshTitle() {
    const auto = Store.read('auto');
    $('btn-continue').disabled = !(auto && auto.state && !auto.state.ending);
    const got = Store.getEndings().length;
    $('title-foot').textContent = got ? T('endingsUnlocked', { n: got, total: G.ENDING_ORDER.length }) : T('titleFoot');
  }

  /* ================= 星空與老屋剪影（標題背景） ================= */
  let skyRaf = 0;
  function drawHouse(ctx, w, h) {
    const s = Math.max(0.55, Math.min(w / 1000, h / 640, 1.25));
    const hx = w < 640 ? w * 0.5 : w * 0.8, y0 = h - 34 * s;
    // 山丘
    ctx.fillStyle = '#04060d';
    ctx.beginPath();
    ctx.moveTo(0, h); ctx.lineTo(0, y0 + 30 * s);
    ctx.quadraticCurveTo(hx - 260 * s, y0 - 10 * s, hx - 200 * s, y0);
    ctx.lineTo(hx + 180 * s, y0);
    ctx.quadraticCurveTo(hx + 300 * s, y0 + 6 * s, w, y0 + 40 * s);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // 松樹
    for (const [dx, th] of [[-250, 70], [-226, 96], [-204, 60], [222, 84], [246, 58]]) {
      const x = hx + dx * s, base = y0 + (Math.abs(dx) > 240 ? 8 : 2) * s, tt = th * s;
      ctx.beginPath(); ctx.moveTo(x - tt * 0.22, base); ctx.lineTo(x, base - tt); ctx.lineTo(x + tt * 0.22, base); ctx.fill();
    }
    ctx.fillStyle = '#060912';
    // 天文台塔樓與穹頂
    ctx.fillRect(hx - 160 * s, y0 - 150 * s, 60 * s, 150 * s);
    ctx.beginPath(); ctx.arc(hx - 130 * s, y0 - 150 * s, 34 * s, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(160,175,220,.22)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(hx - 130 * s, y0 - 150 * s, 34 * s, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#0d1430'; ctx.fillRect(hx - 134 * s, y0 - 183 * s, 8 * s, 30 * s);
    // 主屋
    ctx.fillStyle = '#060912';
    ctx.fillRect(hx - 100 * s, y0 - 112 * s, 170 * s, 112 * s);
    ctx.beginPath(); ctx.moveTo(hx - 112 * s, y0 - 110 * s); ctx.lineTo(hx - 15 * s, y0 - 176 * s); ctx.lineTo(hx + 82 * s, y0 - 110 * s); ctx.fill();
    ctx.fillRect(hx + 30 * s, y0 - 172 * s, 16 * s, 42 * s);
    // 溫室
    ctx.fillStyle = 'rgba(70,120,95,.22)';
    ctx.beginPath(); ctx.moveTo(hx + 70 * s, y0); ctx.lineTo(hx + 70 * s, y0 - 64 * s); ctx.lineTo(hx + 105 * s, y0 - 86 * s); ctx.lineTo(hx + 140 * s, y0 - 64 * s); ctx.lineTo(hx + 140 * s, y0); ctx.fill();
    ctx.strokeStyle = 'rgba(140,190,160,.25)';
    ctx.beginPath(); ctx.moveTo(hx + 70 * s, y0 - 64 * s); ctx.lineTo(hx + 105 * s, y0 - 86 * s); ctx.lineTo(hx + 140 * s, y0 - 64 * s); ctx.stroke();
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx + (70 + i * 17.5) * s, y0); ctx.lineTo(hx + (70 + i * 17.5) * s, y0 - 64 * s); ctx.stroke(); }
    // 窗：書房的燈還亮著
    const win = (x, y, lit) => {
      if (lit) { ctx.fillStyle = 'rgba(233,199,122,.18)'; ctx.fillRect(x - 6 * s, y - 6 * s, 26 * s, 34 * s); }
      ctx.fillStyle = lit ? '#e9c77a' : '#10172a';
      ctx.fillRect(x, y, 14 * s, 22 * s);
    };
    win(hx - 80 * s, y0 - 92 * s, false); win(hx - 40 * s, y0 - 92 * s, false); win(hx + 4 * s, y0 - 92 * s, false); win(hx + 40 * s, y0 - 92 * s, false);
    win(hx - 80 * s, y0 - 46 * s, true); win(hx - 40 * s, y0 - 46 * s, false); win(hx + 40 * s, y0 - 46 * s, false);
    ctx.fillStyle = '#2a1a0f'; ctx.fillRect(hx - 6 * s, y0 - 46 * s, 22 * s, 46 * s);
    win(hx - 140 * s, y0 - 120 * s, false);
  }
  function startSky() {
    const c = $('sky');
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars = [];
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let x = 12345;
      const r = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
      stars = Array.from({ length: Math.round(c.clientWidth * c.clientHeight / 2600) }, () => ({ x: r() * c.clientWidth, y: r() * c.clientHeight * 0.92, s: 0.4 + r() * 1.4, p: r() * 6.28, v: 0.4 + r() * 1.6 }));
    }
    function draw(t) {
      const w = c.clientWidth, h = c.clientHeight;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#04060e'); g.addColorStop(0.7, '#111a36'); g.addColorStop(1, '#1d2547');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // 銀河
      const mw = ctx.createLinearGradient(0, h * 0.9, w, 0);
      mw.addColorStop(0.3, 'rgba(160,170,230,0)'); mw.addColorStop(0.5, 'rgba(160,170,230,.07)'); mw.addColorStop(0.7, 'rgba(160,170,230,0)');
      ctx.fillStyle = mw; ctx.fillRect(0, 0, w, h);
      for (const st of stars) {
        const a = reduce ? 0.7 : 0.45 + 0.45 * Math.sin(st.p + t / 1000 * st.v);
        ctx.globalAlpha = a; ctx.fillStyle = '#f3ecd6';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 月亮
      const mx = w * 0.86, my = h * 0.15, mr = Math.max(14, Math.min(w, h) * 0.035);
      const halo = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 4);
      halo.addColorStop(0, 'rgba(240,236,214,.18)'); halo.addColorStop(1, 'rgba(240,236,214,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, mr * 4, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#efe9d2'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.fill();
      // 一顆緩慢移動的彗星
      const cx = (w * 0.15 + (reduce ? w * 0.4 : (t / 90) % (w * 0.9))), cy = h * 0.22 + (cx - w * 0.15) * 0.18;
      const tail = ctx.createLinearGradient(cx, cy, cx - 120, cy - 22);
      tail.addColorStop(0, 'rgba(255,250,232,.8)'); tail.addColorStop(1, 'rgba(255,250,232,0)');
      ctx.strokeStyle = tail; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 120, cy - 22); ctx.stroke();
      ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, 6.283); ctx.fill();
      drawHouse(ctx, w, h);
      if (!reduce && app.screen === 'title') skyRaf = requestAnimationFrame(draw);
    }
    resize();
    window.onresize = () => { if (app.screen === 'title') { resize(); if (reduce) draw(0); } };
    cancelAnimationFrame(skyRaf);
    skyRaf = requestAnimationFrame(draw);
  }
  function stopSky() { cancelAnimationFrame(skyRaf); }

  /* ================= 開場 ================= */
  function newGame(mode, withTutorial) {
    app.s = E.newState(mode);
    app.tut = null;
    app.tutPending = !!withTutorial;
    app.hintPulse = false;
    app.selected = null; app.combining = false;
    app.ui = freshUi();
    app.log = []; app.latest = [];
    app.stack = []; renderModal();
    app.introStep = 0;
    $('intro-text').innerHTML = '';
    show('intro');
    nextIntro();
  }
  function renderIntro(animateLast) {
    const paras = tr(G.intro).slice(0, app.introStep);
    $('intro-text').innerHTML = paras.map((p, i) => `<p class="${animateLast && i === paras.length - 1 ? 'fresh' : ''}">${esc(p)}</p>`).join('');
    $('btn-intro-next').textContent = T(app.introStep >= tr(G.intro).length ? 'pickUpLetter' : 'next');
  }
  function nextIntro() {
    if (app.introStep >= tr(G.intro).length) { beginGame(); return; }
    app.introStep++;
    renderIntro(true);
    $('btn-intro-next').focus();
  }
  function beginGame() {
    show('game');
    say([{ text: G.rooms[app.s.room].enterText(app.s), kind: 'room' }, { text: I.UI.pickedUp, kind: 'note' }]);
    autosave();
    render();
    openView({ view: 'item', id: 'letter' });
  }

  /* ================= 操作教學（可跳過） ================= */
  // 每一步指向畫面上的一個東西；有 until 的步驟要玩家真的做到才會前進
  const TUT = [
    { key: 'tut1', target: () => $('scene').querySelector('[data-hs="f_coat"]'), until: s => !!s.flags.coatSearched },
    { key: 'tut2', target: () => $('inventory') },
    { key: 'tut3', target: () => $('objects') },
    { key: 'tut4', target: () => $('nav') },
    { key: 'tut5', target: () => $('btn-hints') },
    { key: 'tut6', target: () => $('btn-notes') },
  ];
  function startTutorial() { app.tut = 0; renderTutorial(true); }
  function endTutorial() {
    app.tut = null;
    Store.setSetting('tutorialSeen', '1');
    $('tutorial').hidden = true;
  }
  function renderTutorial(scroll) {
    const el = $('tutorial');
    if (app.tut == null || app.screen !== 'game' || !app.s || app.stack.length) { el.hidden = true; return; }
    let step = TUT[app.tut];
    while (step && step.until && step.until(app.s)) { app.tut++; step = TUT[app.tut]; scroll = true; }
    if (!step) { endTutorial(); return; }
    const target = step.target();
    if (!target) { el.hidden = true; return; }
    if (scroll && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
    el.hidden = false;
    $('tut-count').textContent = T('tutStep', { i: app.tut + 1, n: TUT.length });
    $('tut-text').textContent = T(step.key) + (step.key === 'tut5' && G.isAdv(app.s.mode) ? (LANG === 'en' ? ' ' : '') + T('tut5v', { mode: modeL(app.s.mode) }) : '');
    $('tut-next').hidden = !!step.until;
    $('tut-next').textContent = T(app.tut === TUT.length - 1 ? 'tutDone' : 'tutNext');
    $('tut-skip').textContent = T('tutSkip');
    // 圈出目標，把說明框放在目標下方（放不下就放上方），左右不超出畫面
    const r = target.getBoundingClientRect(), pad = 6;
    const ring = $('tut-ring');
    Object.assign(ring.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    const bubble = $('tut-bubble');
    const bw = Math.min(360, window.innerWidth - 32);
    bubble.style.width = bw + 'px';
    const bh = bubble.offsetHeight || 140;
    const below = r.bottom + 14 + bh < window.innerHeight;
    const top = below ? r.bottom + 14 : Math.max(16, r.top - 14 - bh);
    const left = Math.max(16, Math.min(window.innerWidth - bw - 16, r.left + r.width / 2 - bw / 2));
    Object.assign(bubble.style, { left: left + 'px', top: top + 'px' });
  }

  /* ================= 音樂盒的聲音（沒有音效也能玩） ================= */
  let audio = null;
  const TINE_HZ = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5, 1174.66, 1318.51];
  function tone(n, when = 0) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + when;
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'triangle';
      o.frequency.value = TINE_HZ[n - 1];
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
      o.connect(g); g.connect(audio.destination);
      o.start(t0); o.stop(t0 + 1.3);
    } catch (e) { /* 瀏覽器不支援或被禁止播放聲音 */ }
  }
  const melody = seq => seq.forEach((n, i) => tone(n, i * 0.34));

  // 周伯的燈號動畫：· 亮 0.3 秒、— 亮 0.9 秒，字與字之間暗 0.8 秒；尊重「減少動態效果」
  let flashTimers = [];
  function flashReply(root, codes) {
    flashTimers.forEach(clearTimeout); flashTimers = [];
    const house = root.querySelector('.zhou-house');
    if (!house || !codes || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    let t = 500;
    const set = on => () => house.classList.toggle('dark', !on);
    flashTimers.push(setTimeout(set(false), 0));
    for (const code of codes) {
      for (const ch of code) {
        flashTimers.push(setTimeout(set(true), t));
        t += ch === '-' ? 900 : 300;
        flashTimers.push(setTimeout(set(false), t));
        t += 300;
      }
      t += 500;
    }
    flashTimers.push(setTimeout(set(true), t));
  }

  /* ================= 動作 ================= */
  function say(msgs) {
    if (!msgs || !msgs.length) return;
    app.latest = msgs.slice();
    for (const m of msgs) app.log.push(m);
    if (app.log.length > 120) app.log.splice(0, app.log.length - 120);
  }

  function act(fn, opts = {}) {
    if (!app.s || app.s.ending) return null;
    const before = E.stage(app.s).index, sideBefore = G.SIDE_STAGE.done(app.s);
    let r;
    try { r = fn(); } catch (e) {
      console.error(e);
      r = { ok: false, messages: [{ text: TL('errorAction', { msg: e.message }), kind: 'bad' }] };
    }
    if (!r.ending && app.s) {
      // 完成一個階段：告訴玩家下一個階段的目標，提示按鈕亮起來
      const st = E.stage(app.s);
      if (st.index > before) {
        const done = G.STAGE_DEFS[st.ids[st.index - 1]];
        r.messages = r.messages.concat([{ text: TL('stageDone', { done: done.title, next: st.stage.title, goal: st.stage.goal }), kind: 'stage' }]);
        app.hintPulse = true;
      }
      if (!sideBefore && G.SIDE_STAGE.done(app.s)) r.messages = r.messages.concat([{ text: TL('stageSide', { done: G.SIDE_STAGE.title }), kind: 'stage' }]);
    }
    say(r.messages);
    if (r.ending) { finishGame(r.ending); return r; }
    if (r.ok) autosave();
    if (app.selected && !app.s.inv.includes(app.selected)) { app.selected = null; app.combining = false; }
    if (r.open && !opts.noOpen) openView(r.open);
    render();
    return r;
  }

  function onHotspot(id) {
    if (app.selected) {
      const item = app.selected;
      app.selected = null; app.combining = false;
      act(() => E.useItem(app.s, item, id));
    } else {
      act(() => E.interact(app.s, id));
    }
  }

  function onItem(id) {
    if (app.combining && app.selected === id) {
      say([{ text: TL('combineSelf', { item: E.itemName(app.s, id) }), kind: 'note' }]);
      render();
      return;
    }
    if (app.combining && app.selected && app.selected !== id) {
      const a = app.selected;
      app.selected = null; app.combining = false;
      act(() => E.combine(app.s, a, id));
      return;
    }
    if (app.selected === id) { app.selected = null; app.combining = false; }
    else { app.selected = id; app.combining = false; }
    render();
  }

  function submit(pid, answer, { closeOnSolve = true } = {}) {
    if (pid === 'exit' || pid === 'escape' || (pid === 'phone' && answer === 'accept')) checkpoint();
    const r = act(() => E.submit(app.s, pid, answer), { noOpen: true });
    if (!r || r.ending) return r;
    app.ui.confirm = null;
    if (r.solved && closeOnSolve) closeAll();
    else { app.ui.feedback = r.messages; renderModal(); }
    return r;
  }

  /* ================= 主畫面繪製 ================= */
  function fmtTime(ms) {
    const t = Math.floor((ms || 0) / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  }
  const msgHtml = (m, cls = '') => `<p class="m-${m.kind || 'info'} ${cls}">${esc(tr(m.text))}</p>`;

  function render() {
    if (!app.s || app.screen !== 'game') return;
    const s = app.s;
    $('room-name').textContent = tr(G.rooms[s.room].name);
    const p = E.progress(s);
    const stName = { missing: 'emblemMissing', held: 'emblemHeld', inserted: 'emblemInserted' };
    $('progress').innerHTML = p.emblems.map(e => {
      const label = esc(`${tr(G.items[e.id].name)}: ${T(stName[e.state])}`);
      return `<span class="emb ${e.state}" role="img" title="${label}" aria-label="${label}">${Art.emblemChip(e.id, e.state)}</span>`;
    }).join('');
    $('chip-pages').textContent = T('diaryChip', { n: p.pages });
    $('chip-pages').classList.toggle('on', p.pages === 4);
    $('chip-plate').hidden = !p.plate;
    $('chip-plate').classList.toggle('on', p.plate);
    $('chip-time').textContent = fmtTime(s.stats.playMs);
    $('chip-mode').textContent = modeName(s.mode);
    $('chip-mode').title = T('modeChip', { mode: modeL(s.mode) });
    $('chip-mode').classList.toggle('vet', s.mode === 'veteran');
    $('chip-mode').classList.toggle('master', s.mode === 'master');
    const st = E.stage(s), locked = E.hintsLocked(s);
    $('hint-label').textContent = locked ? T('hintsBtnLocked') : T('hintsBtn', { n: st.index + 1, total: st.total });
    $('btn-hints').classList.toggle('locked', locked);
    $('btn-hints').classList.toggle('pulse', app.hintPulse && !locked);
    document.body.classList.toggle('holding', !!app.selected);
    renderScene();
    renderObjects();
    renderNav();
    renderInventory();
    renderLog();
    renderHand();
    $('narration').innerHTML = app.latest.map(m => msgHtml(m)).join('');
    renderTutorial();
  }

  function visible(id) {
    const h = E.hotspot(id);
    return !!h && h.room === app.s.room && G.modeOk(app.s.mode, h) && (!h.visible || !!h.visible(app.s));
  }
  function renderScene() {
    const wrap = $('scene').parentElement;
    if (app.lastRoom !== app.s.room) {
      // 換房間時淡入
      wrap.classList.remove('enter');
      void wrap.offsetWidth;
      wrap.classList.add('enter');
      wrap.dataset.room = app.s.room;
      app.lastRoom = app.s.room;
    }
    $('scene').innerHTML = Art.scene(app.s.room, { s: app.s, vis: visible, label: id => tr(E.hotspot(id).name) });
    updateTip(null);
  }
  function updateTip(id) {
    const tip = $('scene-tip');
    if (app.selected) {
      tip.hidden = false;
      const item = E.itemName(app.s, app.selected);
      tip.textContent = id ? T('tipUse', { item, target: E.hotspot(id).name }) : T('tipHolding', { item });
    } else if (id) {
      tip.hidden = false;
      tip.textContent = tr(E.hotspot(id).name);
    } else tip.hidden = true;
  }

  function renderObjects() {
    const hs = E.visibleHotspots(app.s);
    $('objects').innerHTML = `<span class="label ${app.selected ? 'holding-label' : ''}">${app.selected ? tx('useOn', { item: E.itemName(app.s, app.selected) }) : tx('lookAt')}</span>` +
      hs.map(h => `<button class="btn obj-btn" type="button" data-obj="${h.id}">${esc(tr(h.name))}</button>`).join('');
  }

  function renderNav() {
    const s = app.s;
    $('nav').innerHTML = G.roomOrder.map(r => {
      if (!E.roomShown(s, r)) return '';
      const open = E.canEnter(s, r), here = s.room === r;
      return `<button class="btn ${here ? 'here' : ''}" type="button" data-room="${r}" ${!open || here ? 'disabled' : ''} ${here ? 'aria-current="true"' : ''}>${esc(tr(G.rooms[r].name))}${open ? '' : tx('lockedRoom')}</button>`;
    }).join('');
  }

  function renderInventory() {
    const s = app.s;
    $('inventory').innerHTML = s.inv.length ? s.inv.map(id => {
      const it = G.items[id];
      const cls = ['inv-tile', app.selected === id ? 'sel' : '', app.combining && app.selected !== id ? 'target' : ''].join(' ');
      return `<button class="${cls}" type="button" data-item="${id}" aria-pressed="${app.selected === id}"><span class="icon-wrap k-${it.kind}">${Art.icon(id)}</span><span class="inv-name">${esc(tr(E.itemName(s, id)))}</span></button>`;
    }).join('') : `<p class="inv-empty">${tx('invEmpty')}</p>`;
    const d = $('item-detail');
    if (!app.selected) { d.hidden = true; d.innerHTML = ''; return; }
    const it = G.items[app.selected];
    d.hidden = false;
    d.innerHTML = `<div class="detail-head"><span class="icon-wrap k-${it.kind}">${Art.icon(app.selected)}</span><h3>${esc(tr(E.itemName(s, app.selected)))}</h3></div><p>${esc(tr(it.desc))}</p>
      <p class="hold-tip">${tx(app.combining ? 'holdTipCombine' : 'holdTipUse')}</p>
      <div class="row">
        <button class="btn small" type="button" data-detail="view">${tx('examine')}</button>
        <button class="btn small ${app.combining ? 'primary' : ''}" type="button" data-detail="combine">${tx(app.combining ? 'cancelCombine' : 'combine')}</button>
        <button class="btn small ghost" type="button" data-detail="drop">${tx('putAway')}</button>
      </div>`;
  }

  function renderLog() {
    const latest = new Set(app.latest);
    const items = app.log.slice(-40).reverse();
    $('log').innerHTML = items.map(m => msgHtml(m, latest.has(m) ? 'fresh' : 'old')).join('');
  }

  /* ================= 對話框 ================= */
  const fb = () => `<div class="feedback" aria-live="polite">${app.ui.feedback.map(m => msgHtml(m)).join('')}</div>`;
  const paper = (d, extra = '') => `<div class="paper ${d.style || 'plain'}">${extra}${tr(G.docBody(d, app.s && app.s.mode)).map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
  const center = html => `<div class="row" style="justify-content:center">${html}</div>`;

  function openView(view) {
    if (!app.stack.length) app.lastFocus = document.activeElement;
    app.stack.push(view);
    app.ui.feedback = []; app.ui.confirm = null;
    renderModal(true);
  }
  function closeView() {
    app.stack.pop();
    app.ui.feedback = []; app.ui.confirm = null;
    renderModal(true);
  }
  function closeAll() {
    app.stack = [];
    app.ui.feedback = []; app.ui.confirm = null;
    renderModal(true);
  }

  function focusKey(el) {
    if (!el || !el.closest || !el.closest('#modal-body')) return null;
    for (const a of el.attributes) if (a.name.startsWith('data-')) return `[${a.name}="${CSS.escape(a.value)}"]`;
    return null;
  }

  function renderModal(fresh) {
    const view = app.stack[app.stack.length - 1];
    const back = $('modal-back');
    if (!view) {
      back.hidden = true;
      $('modal-body').innerHTML = '';
      const lf = app.lastFocus;
      // 原本的焦點若已隱藏（例如開場按鈕），改把焦點交給房間裡的第一個物件
      if (lf && document.contains(lf) && lf !== document.body && lf.offsetParent !== null) lf.focus();
      else if (app.screen === 'game') { const first = $('objects').querySelector('button'); if (first) first.focus(); }
      if (app.tutPending && app.screen === 'game') { app.tutPending = false; startTutorial(); }
      renderTutorial();
      return;
    }
    $('tutorial').hidden = true;
    const keep = fresh ? null : focusKey(document.activeElement);
    const V = VIEWS[view.view];
    const out = V ? V(view) : { title: '?', html: `<p>${tx('missingView')}</p>` };
    $('modal-title').textContent = out.title;
    keepScroll($('modal-body'), () => { $('modal-body').innerHTML = out.html + handStrip(view.view); });
    const strip = $('modal-body').querySelector('.hand-strip');
    if (strip) strip.addEventListener('toggle', () => { app.handStripOpen = strip.open; Store.setSetting('handStrip', strip.open ? '1' : '0'); });
    $('modal-body').querySelectorAll('[data-hold]').forEach(b => { b.onclick = () => toggleHand(b.dataset.hold); });
    $('modal-body').querySelectorAll('[data-unhold]').forEach(b => { b.onclick = () => toggleHand(b.dataset.unhold); });
    $('modal').dataset.view = view.view;
    $('modal-back-btn').hidden = app.stack.length < 2;
    back.hidden = false;
    app.viewKeys = out.keys || null;
    if (out.bind) out.bind($('modal-body'));
    const target = (keep && $('modal-body').querySelector(keep)) || (fresh ? ($('modal-body').querySelector('[data-autofocus]') || $('modal-close')) : null);
    if (target) target.focus();
  }

  function docView(id) {
    const d = G.docs[id];
    if (d.view) return VIEWS[d.view]({});
    return { title: tr(d.title), html: paper(d) + holdButton(id) };
  }

  /* ================= 拿在手上 ================= */
  // 最多三份文件攤在畫面最下方；解謎的視窗裡也看得到（不必在筆記和謎題之間來回切換）
  function noteTranscript(head = '') {
    const all = G.noteLines(app.s.mode), lines = (all[LANG] || all.zh).map(l => l[0] + l[1]).filter(Boolean);
    return `<div class="paper hand">${head}<p>${lines.map(esc).join('<br>')}</p></div>`;
  }
  const handTitle = id => tr(id === 'note_full' ? E.itemName(app.s, id) : G.docs[id].title);
  const handBody = id => {
    const d = G.docs[id];
    if (!d) return noteTranscript();
    return d.view ? `<div class="art-box">${Art[d.view]()}</div>` : paper(d);
  };
  const handCard = id => `<article class="hand-card"><header><h3>${esc(handTitle(id))}</h3><button class="btn small ghost" type="button" data-unhold="${id}" aria-label="${tx('handDropAria', { doc: handTitle(id) })}">${tx('handDropShort')}</button></header>
    <div class="hand-body" data-hand-id="${id}" tabindex="0" role="region" aria-label="${esc(handTitle(id))}">${handBody(id)}</div></article>`;
  function holdButton(id) {
    if (!app.s || app.screen !== 'game' || !G.holdable(id)) return '';
    const held = app.s.hand.includes(id), full = !held && app.s.hand.length >= E.HAND_MAX;
    const label = held ? T('handDrop') : full ? T('handHoldSwap', { doc: handTitle(app.s.hand[0]) }) : T('handHold');
    return center(`<button class="btn small hold" type="button" data-hold="${id}" aria-pressed="${held}">${esc(label)}</button>`);
  }
  function toggleHand(id) {
    E.toggleHand(app.s, id);
    autosave();
    renderHand();
    if (app.stack.length) renderModal();
  }
  // 重畫時保留每份文件捲動到的位置（長的日誌常常要捲到中間才看得到重點）
  function keepScroll(root, draw) {
    const pos = {};
    root.querySelectorAll('[data-hand-id]').forEach(el => { pos[el.dataset.handId] = el.scrollTop; });
    draw();
    root.querySelectorAll('[data-hand-id]').forEach(el => { if (pos[el.dataset.handId]) el.scrollTop = pos[el.dataset.handId]; });
  }
  function renderHand() {
    if (!app.s) return;
    const hand = app.s.hand, key = [LANG, app.s.mode, ...hand].join('|');
    if (app.handKey === key) return;
    app.handKey = key;
    $('hand').classList.toggle('empty', !hand.length);
    keepScroll($('hand'), () => {
      $('hand-cards').innerHTML = hand.length ? hand.map(handCard).join('') : `<p class="hand-empty">${tx('handEmpty')}</p>`;
    });
  }
  // 謎題視窗底部的「手上的文件」（讀文件、看物品、選單之類的視窗不需要）
  const NO_HAND_STRIP = new Set(['doc', 'item', 'notes', 'hints', 'menu', 'save', 'load', 'help', 'gallery', 'mode', 'exit', 'phone']);
  function handStrip(view) {
    if (!app.s || app.screen !== 'game' || NO_HAND_STRIP.has(view) || !app.s.hand.length) return '';
    return `<details class="hand-strip" ${app.handStripOpen ? 'open' : ''}><summary>${tx('handStrip', { n: app.s.hand.length })}</summary><div class="hand-cards">${app.s.hand.map(handCard).join('')}</div></details>`;
  }

  function itemContent(id) {
    const it = G.items[id];
    if (it.doc) return paper(G.docs[it.doc]);
    switch (it.view) {
      case 'grid': return `<div class="art-box narrow">${Art.gridSvg({ digits: true })}</div>`;
      case 'transparency': return `<div class="art-box narrow">${Art.gridSvg({ digits: false, stars: true })}</div>`;
      case 'overlay': return `<div class="art-box narrow">${Art.gridSvg({ digits: true, stars: true })}</div><p class="lead">${tx('overlayLead')}</p>`;
      case 'note_left': return `<div class="art-box narrow">${Art.note('left', app.s.mode)}</div><p class="lead">${tx('noteLeftLead')}</p>`;
      case 'note_right': return `<div class="art-box narrow">${Art.note('right', app.s.mode)}</div><p class="lead">${tx('noteRightLead')}</p>`;
      case 'note_full': return `<div class="art-box">${Art.note('full', app.s.mode)}</div>${noteTranscript(`<h3>${tx('transcript')}</h3>`)}`;
      case 'diary': {
        const pages = app.s.flags.diaryPages || [];
        return pages.map(p => paper(G.docs[p], `<h3>${esc(tr(G.docs[p].title))}</h3>`) + holdButton(p)).join('') +
          `<p class="lead">${pages.length < 4 ? tx('diaryMissing', { n: 4 - pages.length }) : tx('diaryComplete')}</p>`;
      }
      case 'plate': return `<div class="art-box narrow" style="max-width:440px">${Art.plate()}</div><p class="lead">${tx('plateLead')}</p>`;
      case 'photos':
      case 'photo_comet': {
        const ids = it.view === 'photos' ? G.PHOTOS_IN_BOX : ['ph_e'];
        return `<div class="photo-pairs">${ids.map(id => { const p = G.PHOTOS.find(x => x.id === id), label = T('photoCard', { desc: id.slice(3).toUpperCase() }); return `<figure class="photo-pair"><figcaption>${esc(label)}</figcaption>${Art.photoSvg(p, { label: label + ' — ' + T('photoFront') })}${Art.photoSvg(p, { back: true, label: label + ' — ' + T('photoBack') })}</figure>`; }).join('')}</div>`;
      }
      default: return `<div class="item-hero k-${it.kind}">${Art.icon(id)}</div>`;
    }
  }

  const VIEWS = {
    doc: ({ id }) => docView(id),

    item: ({ id }) => {
      const it = G.items[id];
      const held = app.s && app.s.inv.includes(id);
      return {
        title: tr(E.itemName(app.s, id)),
        html: `<p class="lead">${esc(tr(it.desc))}</p>${itemContent(id)}${holdButton(it.doc || id)}
          ${held ? center(`<button class="btn" type="button" data-act="hold">${tx('holdIt')}</button><button class="btn" type="button" data-act="combine">${tx('combineWith')}</button>`) : ''}`,
        bind(root) {
          const hold = root.querySelector('[data-act=hold]');
          if (hold) hold.onclick = () => { app.selected = id; app.combining = false; closeAll(); render(); };
          const comb = root.querySelector('[data-act=combine]');
          if (comb) comb.onclick = () => { app.selected = id; app.combining = true; closeAll(); render(); };
        },
      };
    },

    bookshelf: () => ({
      title: T('shelfTitle'),
      html: `<p class="lead">${tx('shelfLead')}</p><div class="art-box">${Art.bookshelf()}</div>${holdButton('bookshelf')}`,
    }),

    poster: () => ({
      title: tr(G.docs.poster.title),
      html: `<p class="lead">${tx('posterLead')}</p><div class="art-box">${Art.poster()}</div>${holdButton('poster')}`,
    }),

    eyepiece: () => {
      const dir = app.s.puz.dome || 'N';
      const name = tr(G.DIRECTIONS.find(d => d.id === dir).name);
      return {
        title: T('eyeTitle'),
        html: `<p class="lead">${TH('eyeLead', { dir: `<strong>${esc(name)}</strong>` })}</p>
          <div class="eyepiece">${Art.eyepiece(dir)}</div>
          ${center(`<button class="btn" type="button" data-act="dome">${tx('turnDome')}</button>`)}`,
        bind(root) { root.querySelector('[data-act=dome]').onclick = () => { app.stack.pop(); openView({ view: 'dome' }); }; },
      };
    },

    dome: () => {
      const cur = app.s.puz.dome || 'N';
      const grid = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];
      const name = id => cap(tr(G.DIRECTIONS.find(d => d.id === id).name));
      return {
        title: T('domeTitle'),
        html: `<p class="lead">${tx('domeLead')}</p>
          <div class="compass" role="group" aria-label="${tx('domeAria')}">${grid.map(id => id
            ? `<button class="btn ${id === cur ? 'cur' : ''}" type="button" data-dir="${id}" aria-pressed="${id === cur}">${esc(name(id))}</button>`
            : `<div class="center">${tx('domeNow')}<br>${esc(name(cur))}</div>`).join('')}</div>
          ${center(app.s.flags.eyepieceInstalled ? `<button class="btn primary" type="button" data-act="look">${tx('lookThrough')}</button>` : `<span class="lead">${tx('noEyepiece')}</span>`)}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-dir]').forEach(b => { b.onclick = () => submit('dome', b.dataset.dir, { closeOnSolve: false }); });
          const look = root.querySelector('[data-act=look]');
          if (look) look.onclick = () => { app.stack.pop(); openView({ view: 'eyepiece' }); };
        },
      };
    },

    dial: () => {
      const sel = app.s.puz.dial, order = G.CONSTELLATION_ORDER;
      const rings = ['ringOuter', 'ringMiddle', 'ringInner'], heights = ['heightHigh', 'heightMid', 'heightLow'];
      return {
        title: T('dialTitle'),
        html: `<div class="split"><div class="art-box narrow">${Art.dialSvg(sel)}</div><div class="stack">
          ${paper(G.docs.dial_inscription)}
          <div class="picker">${sel.map((id, i) => `<div class="picker-row"><span class="lbl">${tx(rings[i])}<small>${tx(heights[i])}</small></span>
            <button class="btn" type="button" data-prev="${i}" aria-label="${tx('prevConst', { ring: T(rings[i]) })}">◀</button>
            <span class="name" aria-live="polite">${esc(tr(G.CONSTELLATIONS[id].name))}</span>
            <button class="btn" type="button" data-next="${i}" aria-label="${tx('nextConst', { ring: T(rings[i]) })}">▶</button></div>`).join('')}</div>
          ${center(`<button class="btn primary" type="button" data-act="turn">${tx('setRings')}</button>`)}${fb()}</div></div>`,
        bind(root) {
          const step = (i, d) => { sel[i] = order[(order.indexOf(sel[i]) + d + order.length) % order.length]; app.ui.feedback = []; autosave(); renderModal(); };
          root.querySelectorAll('[data-prev]').forEach(b => { b.onclick = () => step(+b.dataset.prev, -1); });
          root.querySelectorAll('[data-next]').forEach(b => { b.onclick = () => step(+b.dataset.next, 1); });
          root.querySelector('[data-act=turn]').onclick = () => submit('dial', sel.slice());
        },
      };
    },

    lock: ({ id }) => {
      const P = G.puzzles[id];
      const cur = app.ui.locks[id] || (app.ui.locks[id] = Array(P.digits).fill(0));
      return {
        title: tr(P.title),
        html: `<p class="lead">${esc(tr(P.prompt))}</p>
          <div class="lock" role="group" aria-label="${tx('lockAria', { n: P.digits })}">${cur.map((d, i) => `<div class="wheel">
            <button class="btn" type="button" data-up="${i}" aria-label="${tx('digitUp', { i: i + 1 })}">▲</button>
            <div class="digit" aria-label="${tx('digitLabel', { i: i + 1, d })}">${d}</div>
            <button class="btn" type="button" data-down="${i}" aria-label="${tx('digitDown', { i: i + 1 })}">▼</button></div>`).join('')}</div>
          ${center(`<button class="btn primary" type="button" data-act="open" data-autofocus>${tx('unlock')}</button>`)}${fb()}
          <p class="lead" style="font-size:.85rem;text-align:center">${tx('lockKeys')}</p>`,
        bind(root) {
          root.querySelectorAll('[data-up]').forEach(b => { b.onclick = () => { cur[+b.dataset.up] = (cur[+b.dataset.up] + 1) % 10; app.ui.feedback = []; renderModal(); }; });
          root.querySelectorAll('[data-down]').forEach(b => { b.onclick = () => { cur[+b.dataset.down] = (cur[+b.dataset.down] + 9) % 10; app.ui.feedback = []; renderModal(); }; });
          root.querySelector('[data-act=open]').onclick = () => submit(id, cur.join(''));
        },
        keys(e) {
          if (/^[0-9]$/.test(e.key)) { cur.shift(); cur.push(+e.key); app.ui.feedback = []; renderModal(); return true; }
          // 焦點在按鈕或「手上的文件」上時，Enter 照常按下它們
          if (e.key === 'Enter' && !(e.target && /^(BUTTON|SUMMARY)$/.test(e.target.tagName))) { submit(id, cur.join('')); return true; }
          return false;
        },
      };
    },

    pots: () => {
      const trowel = app.s.inv.includes('trowel');
      const vet = G.isAdv(app.s.mode);
      const rule = G.docs[vet ? 'pots_rule_v' : 'pots_rule'], ruleBody = G.docBody(rule, app.s.mode);
      const head = vet ? 3 : 2; // 資深模式多一行：挖錯三盆就失敗
      // 資深模式：剩下幾次機會；最後一次要再確認一次，避免手滑
      const dug = app.s.flags.potsDug || [];
      const left = G.POT_MISS_LIMIT - dug.length;
      const confirm = vet && app.ui.potConfirm;
      const potName = id => cap(tr(G.variant(app.s).pots.find(p => p.id === id).name));
      return {
        title: T('potsTitle'),
        html: paper({ style: 'plain', body: { zh: ruleBody.zh.slice(0, head), en: ruleBody.en.slice(0, head) } }) +
          (vet ? `<p class="notice ${left === 1 ? 'warn' : ''}" role="status">${tx(left === 1 ? 'potsLastChance' : 'potsChances', { n: left, total: G.POT_MISS_LIMIT })}</p>` : '') +
          (confirm ? `<div class="confirm"><p style="margin:0">${tx('potConfirm', { pot: potName(confirm) })}</p>
            <div class="row"><button class="btn danger" type="button" data-act="dig-yes">${tx('potConfirmYes')}</button><button class="btn" type="button" data-act="dig-no" data-autofocus>${tx('thinkAgain')}</button></div></div>` : '') +
          // 花架示意：八盆其實排成一排，下面的卡片只是換行排列
          (vet ? `<div class="pot-row" role="img" aria-label="${esc(T('potsRowLabel'))}"><span>${tx('potsLeftEnd')}</span>${G.variant(app.s).pots.map(p => `<b class="${dug.includes(p.id) ? 'dug' : ''}">${p.n}</b>`).join('')}<span>${tx('potsRightEnd')}</span></div>` : '') +
          `<div class="pots ${vet ? 'eight' : ''}">${G.variant(app.s).pots.map(p => `<div class="pot pot-${p.id}"><h3>${vet ? tx('potNum', { n: p.n, name: cap(tr(p.name)) }) : tx('potName', { name: cap(tr(p.name)) })}</h3><q>${esc(tr(p.says))}</q>
            <button class="btn small" type="button" data-pot="${p.id}" ${confirm || dug.includes(p.id) ? 'disabled' : ''}>${tx(dug.includes(p.id) ? 'potDug' : 'digHere')}</button></div>`).join('')}</div>
          ${trowel ? '' : `<p class="notice">${tx('needTool')}</p>`}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-pot]').forEach(b => {
            b.onclick = () => {
              if (vet && trowel && left === 1) { app.ui.potConfirm = b.dataset.pot; app.ui.feedback = []; renderModal(); return; }
              submit('pots', b.dataset.pot);
            };
          });
          const yes = root.querySelector('[data-act=dig-yes]'), no = root.querySelector('[data-act=dig-no]');
          if (yes) yes.onclick = () => { const id = app.ui.potConfirm; app.ui.potConfirm = null; submit('pots', id); };
          if (no) no.onclick = () => { app.ui.potConfirm = null; renderModal(); };
        },
      };
    },

    valves: () => {
      const open = Object.assign({}, app.s.puz.valves);
      const wheel = app.s.flags.wheelInstalled;
      return {
        title: T('valvesTitle'),
        html: `<p class="lead">${tx('valvesLead')}</p>
          <div class="art-box">${Art.valvesSvg(open, app.s.flags.waterOk)}</div>
          ${center(`<button class="btn primary" type="button" data-act="main">${tx(wheel ? 'openMain' : 'turnMain')}</button><button class="btn small" type="button" data-doc="garden_rules">${tx('readRules')}</button>`)}
          ${wheel ? '' : `<p class="notice">${tx('noWheel')}</p>`}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-valve]').forEach(g => {
            const flip = () => { open[g.dataset.valve] = !open[g.dataset.valve]; E.submit(app.s, 'valves_set', open); app.ui.feedback = []; autosave(); renderModal(); };
            g.addEventListener('click', flip);
            g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
          });
          root.querySelector('[data-act=main]').onclick = () => submit('valves', open);
          root.querySelector('[data-doc]').onclick = () => openView({ view: 'doc', id: 'garden_rules' });
        },
      };
    },

    mirrors: () => {
      const vet = G.isAdv(app.s.mode);
      const grid = vet ? G.MIRROR_GRID_V : G.MIRROR_GRID;
      const cfg = Object.assign({}, grid.initial, app.s.puz.mirrors);
      const hit = G.traceBeam(cfg, grid).hit;
      const lit = !!app.s.flags.lightOk;
      const showBeam = !vet || !!app.ui.mirrorReveal || !!lit;
      return {
        title: T('mirrorsTitle'),
        html: `<p class="lead">${tx(vet ? 'mirrorsLeadV' : 'mirrorsLead')}</p>
          <div class="art-box">${Art.mirrorsSvg(cfg, { grid, beam: showBeam })}</div>
          ${(!vet && hit) || lit ? `<p class="m-good" style="margin:0;text-align:center">${tx('mirrorsLit')}</p>` : ''}
          ${vet && !lit ? center(`<button class="btn primary" type="button" data-act="skylight">${tx('skylightOpen')}</button>`) + (app.ui.mirrorReveal ? `<p class="lead" style="text-align:center;font-size:.88rem">${tx('mirrorsShown')}</p>` : '') : ''}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-mirror]').forEach(g => {
            const flip = () => {
              if (lit) return;
              cfg[g.dataset.mirror] = cfg[g.dataset.mirror] === '/' ? '\\' : '/';
              app.ui.mirrorReveal = false;
              const r = act(() => E.submit(app.s, 'mirrors', cfg), { noOpen: true });
              app.ui.feedback = r && r.solved && r.messages.length ? r.messages : [];
              renderModal();
            };
            g.addEventListener('click', flip);
            g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
          });
          const sky = root.querySelector('[data-act=skylight]');
          if (sky) sky.onclick = () => {
            const r = submit('skylight', cfg);
            if (r && !r.solved && !r.ending) { app.ui.mirrorReveal = true; renderModal(); }
          };
        },
      };
    },

    clock: () => {
      const c = app.s.puz.clock;
      return {
        title: T('clockTitle'),
        html: `<div class="split"><div class="art-box narrow" style="max-width:280px">${Art.clockSvg(c.h, c.m)}</div><div class="stack">
          ${paper(G.docs.clock_inscription)}
          <div class="picker">
            <div class="picker-row"><span class="lbl">${tx('hourHand')}</span><button class="btn" type="button" data-h="-1" aria-label="${tx('hourBack')}">◀</button><span class="name" aria-live="polite">${tx('hourVal', { h: c.h })}</span><button class="btn" type="button" data-h="1" aria-label="${tx('hourFwd')}">▶</button></div>
            <div class="picker-row"><span class="lbl">${tx('minuteHand')}</span><button class="btn" type="button" data-m="-5" aria-label="${tx('minBack')}">◀</button><span class="name" aria-live="polite">${tx('minVal', { m: String(c.m).padStart(2, '0') })}</span><button class="btn" type="button" data-m="5" aria-label="${tx('minFwd')}">▶</button></div>
          </div>
          ${center(`<button class="btn primary" type="button" data-act="set">${tx('thisMoment')}</button>`)}${fb()}</div></div>`,
        bind(root) {
          root.querySelectorAll('[data-h]').forEach(b => { b.onclick = () => { c.h = ((c.h - 1 + +b.dataset.h + 12) % 12) + 1; app.ui.feedback = []; autosave(); renderModal(); }; });
          root.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => { c.m = (c.m + +b.dataset.m + 60) % 60; app.ui.feedback = []; autosave(); renderModal(); }; });
          root.querySelector('[data-act=set]').onclick = () => submit('clock', { h: c.h, m: c.m });
        },
      };
    },

    develop: () => {
      const seq = app.ui.dev;
      const V = G.variant(app.s), steps = V.developAnswer.length;
      const name = id => tr(V.bottles.find(b => b.id === id).name);
      const hasNote = app.s.inv.includes('note_full');
      const adv = G.isAdv(app.s.mode), master = app.s.mode === 'master';
      // 大師：避光盒裡只有三張廢片；倒數顯示在畫面上，最後一張要再確認一次
      const left = G.DEV_MISS_LIMIT - (app.s.flags.devMisses || 0);
      const confirm = master && app.ui.devConfirm && seq.length >= steps;
      return {
        title: T('devTitle'),
        html: `<p class="lead">${tx(V.bottles.length > steps ? 'devLeadV' : 'devLead')}</p>
          ${master ? `<p class="notice ${left === 1 ? 'warn' : ''}" role="status">${tx(left === 1 ? 'devFilmsLast' : 'devFilms', { n: left, total: G.DEV_MISS_LIMIT })}</p>` : ''}
          <div class="bottles ${V.bottles.length > 4 ? 'six' : ''}">${V.bottles.map(b => `<button class="bottle-btn" type="button" data-bottle="${b.id}" ${seq.length >= steps ? 'disabled' : ''}>${Art.bottleSvg(b, { crust: master && b.id === 'black' })}<span>${esc(tr(b.name))}</span></button>`).join('')}</div>
          <div class="slots">${[...Array(steps).keys()].map(i => `<div class="slot ${seq[i] ? 'filled' : ''}">${tx('stepN', { i: i + 1 })}<br>${seq[i] ? esc(name(seq[i])) : '—'}</div>`).join('')}</div>
          ${confirm
            ? `<div class="confirm"><p style="margin:0"><strong>${tx('devConfirm')}</strong></p>
                <div class="row"><button class="btn danger" type="button" data-act="dev-yes">${tx('devConfirmYes')}</button><button class="btn" type="button" data-act="dev-no" data-autofocus>${tx('thinkAgain')}</button></div></div>`
            : center(`<button class="btn" type="button" data-act="clear">${tx('clear')}</button><button class="btn primary" type="button" data-act="go" ${seq.length < steps ? 'disabled' : ''}>${tx('develop')}</button>`)}${fb()}
          ${center(`<button class="btn small" type="button" data-doc="bottle_card">${tx('readCard')}</button>${master ? `<button class="btn small" type="button" data-card2="1">${tx('readCard2')}</button>` : ''}${hasNote ? `<button class="btn small" type="button" data-note="1">${tx('readNote')}</button>` : ''}${adv ? `<button class="btn small" type="button" data-chart="1">${tx('readChart')}</button>` : ''}`)}`,
        bind(root) {
          const go = () => { app.ui.devConfirm = false; const r = submit('develop', seq.slice()); if (r && !r.solved) seq.length = 0; if (r && !r.ending) renderModal(); };
          root.querySelectorAll('[data-bottle]').forEach(b => { b.onclick = () => { if (seq.length < steps) seq.push(b.dataset.bottle); app.ui.feedback = []; renderModal(); }; });
          const on = (sel, f) => { const b = root.querySelector(sel); if (b) b.onclick = f; };
          on('[data-act=clear]', () => { seq.length = 0; app.ui.feedback = []; renderModal(); });
          on('[data-act=go]', () => { if (master && left === 1) { app.ui.devConfirm = true; app.ui.feedback = []; renderModal(true); } else go(); });
          on('[data-act=dev-yes]', go);
          on('[data-act=dev-no]', () => { app.ui.devConfirm = false; renderModal(true); });
          // 透過「查看藥瓶架」讀卡片，遊戲才會記得你讀過（沖洗台要讀過卡片才能作答）
          on('[data-doc]', () => act(() => E.interact(app.s, 'd_shelf')));
          on('[data-card2]', () => act(() => E.interact(app.s, 'd_card2')));
          on('[data-chart]', () => act(() => E.interact(app.s, 'd_chart')));
          on('[data-note]', () => openView({ view: 'item', id: 'note_full' }));
        },
      };
    },

    phone: () => {
      const confirming = app.ui.confirm === 'accept';
      return {
        title: T('phoneTitle'),
        html: `<div class="dialogue">
            <p class="speaker">${tx('phoneSpeaker')}</p>
            ${T('phoneLines').map(l => `<p class="line">${esc(l)}</p>`).join('')}
          </div>
          ${confirming
            ? `<div class="confirm"><p style="margin:0"><strong>${tx('phoneConfirm')}</strong></p>
                <div class="row"><button class="btn danger" type="button" data-act="yes">${tx('phoneYes')}</button><button class="btn" type="button" data-act="no" data-autofocus>${tx('thinkAgain')}</button></div></div>`
            : `<div class="choices">
                <button class="btn" type="button" data-act="accept">${tx('phoneAccept')}</button>
                <button class="btn" type="button" data-act="refuse">${tx('phoneRefuse')}</button>
                <button class="btn ghost" type="button" data-act="later">${tx('phoneLater')}</button></div>`}${fb()}`,
        bind(root) {
          const on = (a, f) => { const b = root.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
          on('accept', () => { app.ui.confirm = 'accept'; renderModal(true); });
          on('no', () => { app.ui.confirm = null; renderModal(true); });
          on('yes', () => submit('phone', 'accept'));
          on('refuse', () => submit('phone', 'refuse'));
          on('later', () => { closeAll(); say([{ text: I.UI.phoneLaterSaid, kind: 'info' }]); render(); });
        },
      };
    },

    // 大門；大師模式的老水道也用這個畫面（via: 'tunnel'），送出的謎題是 escape
    exit: ({ via }) => {
      const s = app.s, plate = s.inv.includes('plate'), pages = E.pageCount(s);
      const tunnel = via === 'tunnel';
      const opts = plate ? [['publish', 'exitPublish'], ['leave_plate', 'exitLeavePlate']] : [['leave', tunnel ? 'tunnelLeave' : 'exitLeave']];
      const c = app.ui.confirm;
      const label = c && opts.find(o => o[0] === c);
      // 大師：韓嶽的車一直停在門外（沖出底片或接過電話之後，從大門縫看得見）
      const lead = tunnel ? 'tunnelLead' : s.mode === 'master' && (plate || s.flags.phoneDone) ? 'exitLeadM' : 'exitLead';
      return {
        title: T(tunnel ? 'tunnelTitle' : 'exitTitle'),
        html: `<p class="lead">${tx(lead)}</p>
          <p class="lead">${tx('exitCarrying', { n: pages, plate: plate ? T('exitCarryingPlate') : '' })}</p>
          ${label
            ? `<div class="confirm"><p style="margin:0">${tx('exitConfirm', { choice: T(label[1]) })}</p>
                <div class="row"><button class="btn primary" type="button" data-yes="${c}">${tx('yes')}</button><button class="btn" type="button" data-act="no" data-autofocus>${tx('thinkAgain')}</button></div></div>`
            : `<div class="choices">${opts.map(([id, key]) => `<button class="btn" type="button" data-choice="${id}">${tx(key)}</button>`).join('')}
                <button class="btn ghost" type="button" data-act="stay">${tx('exitStay')}</button></div>`}`,
        bind(root) {
          root.querySelectorAll('[data-choice]').forEach(b => { b.onclick = () => { app.ui.confirm = b.dataset.choice; renderModal(true); }; });
          const yes = root.querySelector('[data-yes]');
          if (yes) yes.onclick = () => submit(tunnel ? 'escape' : 'exit', yes.dataset.yes);
          const no = root.querySelector('[data-act=no]');
          if (no) no.onclick = () => { app.ui.confirm = null; renderModal(true); };
          const stay = root.querySelector('[data-act=stay]');
          if (stay) stay.onclick = () => closeAll();
        },
      };
    },

    notes: () => {
      const notes = app.s.notes;
      return {
        title: T('notesTitle'),
        html: `<p class="lead">${tx('notesLead')}</p>
          <div class="list">${notes.map(id => `<button class="btn" type="button" data-note="${id}"><span>${esc(tr(G.docs[id].title))}</span>${app.s.hand.includes(id) ? `<span class="tag-hand">${tx('handHeld')}</span>` : ''}<span aria-hidden="true">›</span></button>`).join('')}</div>`,
        bind(root) {
          root.querySelectorAll('[data-note]').forEach(b => { b.onclick = () => openView(b.dataset.note === 'letter' ? { view: 'item', id: 'letter' } : { view: 'doc', id: b.dataset.note }); });
        },
      };
    },

    hints: () => {
      const st = E.stage(app.s);
      const head = `<div class="stage-head"><p class="stage-n">${tx('hintsStage', { n: st.index + 1, total: st.total, title: st.stage.title })}</p>
        <p class="stage-goal">${tx('hintsGoal', { goal: st.stage.goal })}</p>
        <div class="stage-bar" aria-hidden="true">${st.ids.map((id, i) => `<span class="${i < st.index ? 'done' : i === st.index ? 'cur' : ''}"></span>`).join('')}</div></div>`;
      if (E.hintsLocked(app.s)) return { title: T('hintsTitle'), html: head + `<p class="notice warn">${tx('hintsLocked', { mode: modeL(app.s.mode) })}</p>` };
      const list = E.hintList(app.s);
      // 每一段提示都要先確認；下一段會公布答案時，確認框是閃動的紅色
      const ask = app.ui.hintAsk && list.find(h => h.id === app.ui.hintAsk && h.level < h.max);
      const confirmBox = h => {
        const spoil = h.level + 1 >= h.answerAt;
        return `<div class="confirm hint-ask ${spoil ? 'spoiler' : ''}" role="alertdialog" aria-label="${esc(T(spoil ? 'hintAskAnswer' : 'hintAsk', { n: h.level + 1, max: h.max }))}">
          <p>${tx(spoil ? 'hintAskAnswer' : 'hintAsk', { n: h.level + 1, max: h.max })}</p>
          <div class="row"><button class="btn ${spoil ? 'danger' : 'primary'}" type="button" data-hint-yes="${h.id}">${tx(spoil ? 'hintAskAnswerYes' : 'hintAskYes')}</button><button class="btn" type="button" data-hint-no="${h.id}">${tx('hintAskNo')}</button></div></div>`;
      };
      const button = h => `<div class="row"><button class="btn small" type="button" data-hint="${h.id}" ${h.level >= h.max ? 'disabled' : ''}>${h.level === 0 ? tx('hintFirst') : h.level >= h.max ? tx('hintDone') : tx('hintMore', { n: h.level + 1, max: h.max })}</button></div>`;
      const card = h => `<div class="hint ${h.group}"><h4>${esc(tr(h.title))}</h4>
        ${h.texts.length ? `<ol>${h.texts.map(t => `<li>${esc(tr(t))}</li>`).join('')}</ol>` : ''}
        ${ask && ask.id === h.id ? confirmBox(h) : button(h)}</div>`;
      const groups = [['current', 'hintGroupCurrent'], ['earlier', 'hintGroupEarlier'], ['explore', 'hintGroupExplore'], ['side', 'hintGroupSide'], ['other', 'hintGroupOther']];
      const body = groups.map(([g, key]) => { const hs = list.filter(h => h.group === g); return hs.length ? `<h3 class="hint-group">${tx(key)}</h3>${hs.map(card).join('')}` : ''; }).join('');
      return {
        title: T('hintsTitle'),
        html: `${head}<p class="lead">${tx('hintsLead')}</p>${body || `<p>${tx('hintNone')}</p>`}`,
        bind(root) {
          root.querySelectorAll('[data-hint]').forEach(b => { b.onclick = () => { app.ui.hintAsk = b.dataset.hint; renderModal(); }; });
          const yes = root.querySelector('[data-hint-yes]'), no = root.querySelector('[data-hint-no]');
          const back = id => { app.ui.hintAsk = null; renderModal(); const b = $('modal-body').querySelector(`[data-hint="${CSS.escape(id)}"]`); if (b && !b.disabled) b.focus(); };
          if (yes) yes.onclick = () => { const id = yes.dataset.hintYes; if (E.revealHint(app.s, id)) autosave(); back(id); };
          if (no) no.onclick = () => back(no.dataset.hintNo);
          // 確認框出現時把焦點放上去：一般提示放在「給我提示」，會公布答案時放在「先不用」，避免連按 Enter 就看到答案
          if (ask) (ask.level + 1 >= ask.answerAt ? no : yes).focus();
          else {
            const first = root.querySelector('.hint.current [data-hint]:not([disabled])');
            if (first && !root.contains(document.activeElement)) first.setAttribute('data-autofocus', '');
          }
        },
      };
    },

    // 選擇難度（標題畫面「新遊戲」）
    mode: () => {
      const auto = Store.read('auto');
      const live = auto && auto.state && !auto.state.ending;
      const tut = app.modeTut != null ? app.modeTut : Store.getSetting('tutorialSeen') !== '1';
      const card = m => `<div class="mode-card mode-${m}"><h3>${esc(modeName(m))}</h3><p>${tx(MODE_DESC[m])}</p>
        <button class="btn ${m === 'novice' ? 'primary' : m === 'master' ? 'master' : 'vet'}" type="button" data-mode="${m}" ${m === 'novice' ? 'data-autofocus' : ''}>${tx('modeStart', { mode: modeL(m) })}</button></div>`;
      return {
        title: T('modeTitle'),
        html: `<div class="modes">${G.MODES.map(card).join('')}</div>
          <label class="check"><input type="checkbox" id="tut-toggle" ${tut ? 'checked' : ''}> ${tx('tutorialToggle')}</label>
          ${live ? `<p class="notice warn">${tx('confirmNew')}</p>` : ''}`,
        bind(root) {
          const box = root.querySelector('#tut-toggle');
          box.onchange = () => { app.modeTut = box.checked; };
          root.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { const withTut = box.checked; closeAll(); newGame(b.dataset.mode, withTut); }; });
        },
      };
    },

    // 資深・天平
    balance: () => {
      const place = Object.assign({}, app.s.puz.balance);
      const things = G.BALANCE_THINGS.filter(th => !th.item || app.s.inv.includes(th.item));
      const sideOf = id => place[id] || '';
      // 圖之外也用文字說出結果（只說哪邊重，和真的天平一樣）
      const sum = side => G.BALANCE_THINGS.reduce((n, th) => n + (place[th.id] === side ? th.w : 0), 0);
      const l = sum('L'), r = sum('R');
      const read = !l && !r ? 'balanceReadNone' : l > r ? 'balanceReadL' : r > l ? 'balanceReadR' : 'balanceReadEven';
      return {
        title: T('balanceTitle'),
        html: `<p class="lead">${tx('balanceLead')}</p><div class="art-box">${Art.balanceSvg(place)}</div>
          <p class="balance-read" aria-live="polite">${tx(read)}</p>
          <div class="pan-list">${things.map(th => `<div class="pan-row"><span class="pan-name">${esc(cap(tr(th.name)))}</span><div class="seg" role="group" aria-label="${esc(cap(tr(th.name)))}">${['L', '', 'R'].map(side => `<button class="btn small ${sideOf(th.id) === side ? 'cur' : ''}" type="button" data-pan="${th.id}:${side}" aria-pressed="${sideOf(th.id) === side}">${tx(side === 'L' ? 'panLeft' : side === 'R' ? 'panRight' : 'panOff')}</button>`).join('')}</div></div>`).join('')}</div>
          ${app.s.inv.includes('paperweight') ? '' : `<p class="notice">${tx('w5Missing')}</p>`}
          ${center(`<button class="btn small" type="button" data-act="clear">${tx('balanceEmpty')}</button>${app.s.flags.cabinetOpen ? '' : `<button class="btn small" type="button" data-act="cabinet">${tx('openCabinet')}</button>`}<button class="btn small" type="button" data-doc="weight_box">${tx('readWeightBox')}</button>`)}`,
        bind(root) {
          root.querySelectorAll('[data-pan]').forEach(b => {
            b.onclick = () => {
              const [id, side] = b.dataset.pan.split(':');
              if (side) place[id] = side; else delete place[id];
              E.submit(app.s, 'balance_set', place); autosave(); renderModal();
            };
          });
          root.querySelector('[data-act=clear]').onclick = () => { E.submit(app.s, 'balance_set', {}); autosave(); renderModal(); };
          const cab = root.querySelector('[data-act=cabinet]');
          if (cab) cab.onclick = () => openView({ view: 'lock', id: 'seedlock' });
          root.querySelector('[data-doc]').onclick = () => openView({ view: 'doc', id: 'weight_box' });
        },
      };
    },

    // 資深・相框牆
    photos: () => {
      const s = app.s;
      const have = (s.inv.includes('photos') ? G.PHOTOS_IN_BOX : []).concat(s.inv.includes('photo_comet') ? ['ph_e'] : []);
      const order = app.ui.photoOrder = (app.ui.photoOrder || Array(6).fill(null)).map(id => (have.includes(id) ? id : null));
      const tray = have.filter(id => !order.includes(id));
      const ready = have.length === 6;
      const backs = app.ui.photoBacks;
      const photo = id => G.PHOTOS.find(p => p.id === id);
      const label = id => T('photoCard', { desc: id.slice(3).toUpperCase() });
      return {
        title: T('photosTitle'),
        html: `<p class="lead">${tx('photosLead')}</p>
          <div class="frames">${order.map((id, i) => `<button class="frame ${id ? 'filled' : ''}" type="button" data-slot="${i}" aria-label="${esc(T('photoSlot', { i: i + 1 }) + (id ? (LANG === 'en' ? ': ' : '：') + label(id) : ''))}">${id ? Art.photoSvg(photo(id), { back: backs, label: label(id) }) : `<span>${i + 1}</span>`}</button>`).join('')}</div>
          <p class="frames-axis">${tx('photosAxis')}</p>
          <div class="tray">${tray.map(id => `<button class="photo-card" type="button" data-photo="${id}" aria-label="${esc(label(id))}">${Art.photoSvg(photo(id), { back: backs, label: label(id) })}<span>${esc(id.slice(3).toUpperCase())}</span></button>`).join('')}</div>
          ${ready ? '' : `<p class="notice">${tx('photosNeed')}</p>`}
          ${center(`<button class="btn small" type="button" data-act="flip">${tx(backs ? 'photosFront' : 'photosFlip')}</button><button class="btn small" type="button" data-act="clear">${tx('photosClear')}</button><button class="btn primary" type="button" data-act="hang" ${ready && order.every(Boolean) ? '' : 'disabled'}>${tx('photosHang')}</button>`)}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-slot]').forEach(b => { b.onclick = () => { order[+b.dataset.slot] = null; app.ui.feedback = []; renderModal(); }; });
          root.querySelectorAll('[data-photo]').forEach(b => { b.onclick = () => { const i = order.indexOf(null); if (i >= 0) order[i] = b.dataset.photo; app.ui.feedback = []; renderModal(); }; });
          root.querySelector('[data-act=flip]').onclick = () => { app.ui.photoBacks = !backs; renderModal(); };
          root.querySelector('[data-act=clear]').onclick = () => { app.ui.photoOrder = null; app.ui.feedback = []; renderModal(); };
          root.querySelector('[data-act=hang]').onclick = () => submit('photos', order.slice());
        },
      };
    },

    // 資深・音樂盒
    musicbox: () => {
      const seq = app.ui.music;
      // 奏完一遍之後，畫面保留剛才的音，直到撥下一個音時才重新開始一段
      const fresh = () => { if (app.ui.musicDone) { seq.length = 0; app.ui.musicDone = false; } };
      const hasLetter = app.s.inv.includes('qing_letter');
      return {
        title: T('musicTitle'),
        html: `<p class="lead">${tx('musicLead')}</p><div class="art-box">${Art.musicBoxSvg(app.ui.musicLit)}</div>
          <p class="played">${tx('musicPlayed')} <strong>${seq.length ? seq.join(' · ') : tx('musicNone')}</strong></p>
          ${center(`<button class="btn small" type="button" data-act="clear">${tx('musicClear')}</button><button class="btn primary" type="button" data-act="play" ${seq.length ? '' : 'disabled'}>${tx('musicPlay')}</button>${hasLetter ? `<button class="btn small" type="button" data-act="letter">${tx('readLetter')}</button>` : ''}`)}${fb()}`,
        bind(root) {
          const pluck = n => { fresh(); if (seq.length >= 16) seq.shift(); seq.push(n); tone(n); app.ui.musicLit = n; app.ui.feedback = []; renderModal(); };
          root.querySelectorAll('[data-tine]').forEach(g => {
            g.addEventListener('click', () => pluck(+g.dataset.tine));
            g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pluck(+g.dataset.tine); } });
          });
          root.querySelector('[data-act=clear]').onclick = () => { seq.length = 0; app.ui.musicLit = 0; app.ui.feedback = []; renderModal(); };
          root.querySelector('[data-act=play]').onclick = () => { melody(seq); app.ui.musicLit = 0; app.ui.musicDone = true; submit('musicbox', seq.slice()); };
          const letter = root.querySelector('[data-act=letter]');
          if (letter) letter.onclick = () => openView({ view: 'doc', id: 'qing_letter' });
        },
        keys(e) {
          if (/^[0-9]$/.test(e.key) && !(e.target && e.target.tagName === 'INPUT')) {
            const n = e.key === '0' ? 10 : +e.key;
            fresh();
            if (seq.length >= 16) seq.shift();
            seq.push(n); tone(n); app.ui.musicLit = n; renderModal(); return true;
          }
          return false;
        },
      };
    },

    // 資深・小窗的燈號
    signal: () => {
      const toks = app.ui.sig;
      const show = code => code.replace(/\./g, '·').replace(/-/g, '—');
      const composed = toks.filter(Boolean).length ? toks.map(c => c ? show(c) : '…').join(' / ') : null;
      const reply = app.ui.sigReply;
      const hasCard = app.s.inv.includes('code_card');
      return {
        title: T('signalTitle'),
        html: `<p class="lead">${tx('signalLead')}</p><div class="art-box">${Art.signalSvg()}</div>
          <p class="sig-line">${tx('sigYours')} ${composed ? `<strong class="sig-code">${esc(composed)}</strong>` : `<strong>${tx('sigNone')}</strong>`}</p>
          ${center(`<button class="btn" type="button" data-sig="." ${toks[toks.length - 1].length >= 6 ? 'disabled' : ''}>${tx('sigShort')}</button><button class="btn" type="button" data-sig="-" ${toks[toks.length - 1].length >= 6 ? 'disabled' : ''}>${tx('sigLong')}</button><button class="btn" type="button" data-act="next" ${toks[toks.length - 1] ? '' : 'disabled'}>${tx('sigNext')}</button>`)}
          ${center(`<button class="btn small" type="button" data-act="clear">${tx('sigClear')}</button><button class="btn primary" type="button" data-act="send" ${toks.some(Boolean) ? '' : 'disabled'}>${tx('sigSend')}</button>${hasCard ? `<button class="btn small" type="button" data-act="card">${tx('readCodeCard')}</button>` : ''}`)}
          ${reply ? `<p class="sig-line reply">${tx('sigReply')} <strong class="sig-code">${esc(reply.map(show).join(' / '))}</strong></p>` : ''}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-sig]').forEach(b => { b.onclick = () => { toks[toks.length - 1] += b.dataset.sig; app.ui.feedback = []; renderModal(); }; });
          root.querySelector('[data-act=next]').onclick = () => { if (toks[toks.length - 1]) toks.push(''); renderModal(); };
          root.querySelector('[data-act=clear]').onclick = () => { app.ui.sig = ['']; app.ui.feedback = []; renderModal(); };
          root.querySelector('[data-act=send]').onclick = () => {
            const words = toks.filter(Boolean);
            app.ui.sig = [''];
            const r = submit('signal', words, { closeOnSolve: false });
            const m = r && r.messages && r.messages.find(x => x.signal);
            app.ui.sigReply = m ? m.signal : null;
            renderModal();
            if (m) flashReply($('modal-body'), m.signal);
          };
          const card = root.querySelector('[data-act=card]');
          if (card) card.onclick = () => openView({ view: 'doc', id: 'code_card' });
        },
      };
    },

    save: () => saveView(true),
    load: () => saveView(false),

    menu: () => ({
      title: T('menuTitle'),
      html: `<div class="list">
          <div class="lang-row"><span>${tx('language')}</span>${langSwitch()}</div>
          <button class="btn" type="button" data-go="save">${tx('saveLoad')}</button>
          <button class="btn" type="button" data-go="help">${tx('helpTitle')}</button>
          <button class="btn" type="button" data-go="gallery">${tx('galleryTitle')}</button>
          ${app.screen === 'game' ? `<button class="btn" type="button" data-act="tutorial">${tx('replayTutorial')}</button>` : ''}
          ${app.ui.confirm === 'title'
            ? `<div class="confirm"><p style="margin:0">${tx('toTitleConfirm')}</p><div class="row"><button class="btn primary" type="button" data-act="title-yes">${tx('toTitleYes')}</button><button class="btn" type="button" data-act="title-no">${tx('cancel')}</button></div></div>`
            : `<button class="btn" type="button" data-act="title">${tx('toTitle')}</button>`}
        </div>`,
      bind(root) {
        syncLangButtons();
        root.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => openView({ view: b.dataset.go }); });
        const on = (a, f) => { const b = root.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
        on('title', () => { app.ui.confirm = 'title'; renderModal(); });
        on('tutorial', () => { closeAll(); startTutorial(); });
        on('title-no', () => { app.ui.confirm = null; renderModal(); });
        on('title-yes', () => { autosave(); closeAll(); show('title'); });
      },
    }),

    help: () => ({
      title: T('helpTitle'),
      html: `<div class="paper plain help">${T('help').map(([k, v]) => `<p><strong>${esc(k)}</strong>${LANG === 'en' ? '. ' : '：'}${esc(v)}</p>`).join('')}</div>`,
    }),

    gallery: () => {
      const got = Store.getEndings();
      const vet = Store.getEndings('veteran'), mas = Store.getEndings('master');
      const excerpt = s => {
        if (LANG !== 'en') return s.slice(0, 26) + '……';
        if (s.length <= 90) return s;
        const cut = s.slice(0, 90);
        return cut.slice(0, cut.lastIndexOf(' ')) + '…';
      };
      return {
        title: T('galleryTitle'),
        html: `<p class="lead">${tx('galleryCount', { n: got.length, total: G.ENDING_ORDER.length })}</p>
          <div class="gallery">${G.ENDING_ORDER.map(id => {
            const e = G.endings[id], ok = got.includes(id);
            // 只在大師模式出現的結局：未解鎖時就先標明，免得玩家在別的難度裡白找
            const only = e.mode === 'master';
            const badges = (vet.includes(id) && !only ? `<span class="badge-vet" title="${tx('galleryVeteranTip')}">${tx('galleryVeteran')}</span>` : '') +
              (mas.includes(id) ? `<span class="badge-vet badge-master" title="${tx('galleryMasterTip')}">${tx('galleryMaster')}</span>` : '');
            return `<div class="gal ${ok ? '' : 'locked'}"><span class="rk">${ok ? esc(tr(e.rank)) : tx('galleryUnknown')}</span><span>${ok ? `<strong>${esc(tr(e.title))}</strong> — ${esc(excerpt(tr(G.endingText(e, only ? 'master' : 'novice'))[0]))}` : tx(only ? 'galleryMasterOnly' : 'galleryLocked')}</span>${badges}</div>`;
          }).join('')}</div>`,
      };
    },
  };

  /* ================= 存檔 ================= */
  function record(state) {
    const p = E.progress(state);
    return { state, savedAt: new Date().toISOString(), room: state.room, emblems: p.emblems.filter(e => e.state !== 'missing').length, pages: p.pages };
  }
  function autosave() {
    if (!app.s || app.s.ending) return;
    Store.write('auto', record(app.s));
  }
  function checkpoint() { if (app.s && !app.s.ending) Store.write('preend', record(app.s)); }

  function describe(rec) {
    if (!rec) return T('slotEmptyDesc');
    if (rec.corrupt) return T('slotCorrupt');
    const d = new Date(rec.savedAt);
    const when = isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return T('slotDesc', { when, room: G.rooms[rec.room] ? G.rooms[rec.room].name : '?', e: rec.emblems, p: rec.pages, time: fmtTime(rec.state.stats && rec.state.stats.playMs) });
  }

  // 成功時回傳 null，失敗時回傳雙語錯誤訊息
  function loadState(state, label) {
    let st;
    try { st = E.normalize(JSON.parse(JSON.stringify(state))); } catch (e) { return I.UI.saveUnreadable; }
    const errs = E.validate(st);
    if (errs.length) return TL('saveUnusable', { errs: joinL(errs) });
    if (st.ending) return I.UI.saveEnded;
    app.s = st;
    app.selected = null; app.combining = false;
    app.ui = freshUi();
    app.log = []; app.latest = [];
    app.stack = [];
    renderModal();
    show('game');
    say([{ text: TL('loaded', { label }), kind: 'note' }, { text: G.rooms[st.room].enterText(st), kind: 'room' }]);
    autosave();
    render();
    return null;
  }

  function saveView(inGame) {
    const canSave = inGame && app.s && !app.s.ending;
    const slots = [['auto', 'slotAuto'], ['1', 'slot1'], ['2', 'slot2'], ['3', 'slot3'], ['preend', 'slotPreend']];
    const c = app.ui.confirm;
    return {
      title: T(inGame ? 'saveTitle' : 'loadTitle'),
      html: `${Store.persistent ? '' : `<p class="notice warn">${tx('noStorage')}</p>`}
        ${app.ui.saveNote ? `<p class="notice">${esc(tr(app.ui.saveNote))}</p>` : ''}
        <div class="list">${slots.map(([id, key]) => {
          const rec = Store.read(id);
          const usable = rec && rec.state && !rec.state.ending;
          const manual = /^[123]$/.test(id);
          if (c === 'over:' + id || c === 'del:' + id) {
            const over = c.startsWith('over');
            return `<div class="slot-card"><strong>${tx(key)}</strong><p style="margin:0">${tx(over ? 'confirmOverwrite' : 'confirmDelete')}</p>
              <div class="row"><button class="btn ${over ? 'primary' : 'danger'}" type="button" data-yes="${c}">${tx('yes')}</button><button class="btn" type="button" data-act="cancel">${tx('cancel')}</button></div></div>`;
          }
          if (!manual && !rec) return '';
          return `<div class="slot-card"><strong>${tx(key)}</strong><span class="meta">${esc(describe(rec))}</span>
            <div class="row">
              ${canSave && manual ? `<button class="btn small" type="button" data-save="${id}">${tx('saveHere')}</button>` : ''}
              <button class="btn small" type="button" data-load="${id}" ${usable ? '' : 'disabled'}>${tx('loadBtn')}</button>
              ${manual && rec ? `<button class="btn small danger" type="button" data-del="${id}">${tx('deleteBtn')}</button>` : ''}
            </div></div>`;
        }).join('')}</div>
        ${canSave ? `<div class="slot-card"><strong>${tx('exportTitle')}</strong><span class="meta">${tx('exportLead')}</span>
          <textarea class="code" id="code-out" readonly>${esc(Store.encode(app.s))}</textarea>
          <div class="row"><button class="btn small" type="button" data-act="copy">${tx('copy')}</button></div></div>` : ''}
        <div class="slot-card"><strong>${tx('importTitle')}</strong>
          <textarea class="code" id="code-in" placeholder="${tx('importPlaceholder')}">${esc(app.ui.importText)}</textarea>
          <div class="row"><button class="btn small" type="button" data-act="import">${tx('importBtn')}</button></div></div>
        ${fb()}`,
      bind(root) {
        const note = msg => { app.ui.saveNote = msg; app.ui.confirm = null; renderModal(); };
        const slotName = id => I.UI['slot' + id];
        root.querySelectorAll('[data-save]').forEach(b => {
          b.onclick = () => {
            const id = b.dataset.save;
            if (Store.read(id) && app.ui.confirm !== 'over:' + id) { app.ui.confirm = 'over:' + id; renderModal(); return; }
            Store.write(id, record(app.s)); note(TL('savedTo', { slot: slotName(id) }));
          };
        });
        root.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { app.ui.confirm = 'del:' + b.dataset.del; renderModal(); }; });
        const yes = root.querySelector('[data-yes]');
        if (yes) yes.onclick = () => {
          const [kind, id] = yes.dataset.yes.split(':');
          if (kind === 'over') { Store.write(id, record(app.s)); note(TL('overwritten', { slot: slotName(id) })); }
          else { Store.remove(id); note(I.UI.deleted); }
        };
        const cancel = root.querySelector('[data-act=cancel]');
        if (cancel) cancel.onclick = () => { app.ui.confirm = null; renderModal(); };
        root.querySelectorAll('[data-load]').forEach(b => {
          b.onclick = () => {
            const rec = Store.read(b.dataset.load);
            const key = slots.find(x => x[0] === b.dataset.load)[1];
            const err = rec && rec.state ? loadState(rec.state, I.UI[key]) : I.UI.slotEmpty;
            if (err) note(err);
          };
        });
        const copy = root.querySelector('[data-act=copy]');
        if (copy) copy.onclick = () => {
          const ta = $('code-out');
          const fallback = () => { ta.focus(); ta.select(); note(I.UI.copyFallback); };
          try {
            navigator.clipboard.writeText(ta.value).then(() => note(I.UI.copied), fallback);
          } catch (e) { fallback(); }
        };
        const imp = root.querySelector('[data-act=import]');
        imp.onclick = () => {
          app.ui.importText = $('code-in').value;
          let state;
          try { state = Store.decode(app.ui.importText); } catch (e) { note(e.text || e.message); return; }
          const err = loadState(state, I.UI.fromCode);
          if (err) note(err); else app.ui.importText = '';
        };
      },
    };
  }

  /* ================= 結局 ================= */
  function finishGame(id) {
    // 失敗不算結局、不進圖鑑；整局作廢（自動存檔與結局前存檔一併清除）
    if (G.endings[id].fail) Store.remove('preend'); else Store.addEnding(id, app.s.mode);
    app.tut = null; $('tutorial').hidden = true;
    Store.remove('auto');
    app.stack = []; renderModal();
    app.endingId = id;
    show('ending');
    renderEnding(id);
    ($('btn-preend') || $('btn-end-title')).focus();
  }
  function renderEnding(id) {
    const e = G.endings[id];
    const s = app.s;
    const got = Store.getEndings();
    const stats = [
      [fmtTime(s.stats.playMs), 'statTime'], [s.stats.actions, 'statActions'], [s.stats.wrong, 'statWrong'],
      [s.stats.hints, 'statHints'], [E.pageCount(s) + ' / 4', 'statPages'], [esc(modeName(s.mode)), 'statMode'],
    ];
    $('ending-card').classList.toggle('fail', !!e.fail);
    $('ending-card').innerHTML = `
      <p class="ending-rank">${esc(tr(e.rank))}</p>
      <h1 class="ending-title">${esc(tr(e.title))}</h1>
      <div class="ending-text">${tr(G.endingText(e, s.mode)).map(t => `<p>${esc(t)}</p>`).join('')}</div>
      <div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${tx(l)}</span></div>`).join('')}</div>
      <p class="lead">${e.fail ? tx('failLead') : tx('endUnlocked', { n: got.length, total: G.ENDING_ORDER.length }) + tx(got.length < G.ENDING_ORDER.length ? 'endMore' : 'endAll')}</p>
      <div class="row">
        ${!e.fail && Store.read('preend') ? `<button class="btn primary" type="button" id="btn-preend">${tx('backBefore')}</button>` : ''}
        <button class="btn" type="button" id="btn-end-gallery">${tx('galleryTitle')}</button>
        <button class="btn" type="button" id="btn-end-title">${tx('titleScreen')}</button>
        ${langSwitch()}
      </div>`;
    syncLangButtons();
    const pre = $('btn-preend');
    if (pre) pre.onclick = () => { const rec = Store.read('preend'); if (rec && rec.state) { app.endingId = null; loadState(rec.state, I.UI.slotPreend); } };
    $('btn-end-gallery').onclick = () => openView({ view: 'gallery' });
    $('btn-end-title').onclick = () => { app.endingId = null; show('title'); };
  }

  /* ================= 事件繫結 ================= */
  function bindStatic() {
    $('btn-new').onclick = () => openView({ view: 'mode' });
    $('btn-continue').onclick = () => {
      const rec = Store.read('auto');
      const err = rec && rec.state ? loadState(rec.state, I.UI.slotAuto) : I.UI.noContinue;
      if (err) { refreshTitle(); $('title-foot').textContent = tr(err); }
    };
    $('btn-load').onclick = () => openView({ view: 'load' });
    $('btn-gallery').onclick = () => openView({ view: 'gallery' });
    $('btn-help').onclick = () => openView({ view: 'help' });
    $('btn-intro-next').onclick = nextIntro;
    $('btn-intro-skip').onclick = () => { app.introStep = tr(G.intro).length; beginGame(); };

    $('btn-hints').onclick = () => { app.hintPulse = false; app.ui.hintAsk = null; render(); openView({ view: 'hints' }); };
    $('tut-next').onclick = () => { if (app.tut == null) return; app.tut++; if (app.tut >= TUT.length) endTutorial(); else renderTutorial(true); };
    $('tut-skip').onclick = () => endTutorial();
    window.addEventListener('resize', () => renderTutorial());
    window.addEventListener('scroll', () => renderTutorial(), { passive: true });
    $('btn-notes').onclick = () => openView({ view: 'notes' });
    $('btn-save').onclick = () => { app.ui.saveNote = null; openView({ view: 'save' }); };
    $('btn-menu').onclick = () => openView({ view: 'menu' });
    $('modal-close').onclick = closeAll;
    $('modal-back-btn').onclick = closeView;
    $('modal-back').addEventListener('click', e => { if (e.target === $('modal-back')) closeAll(); });

    // 語言切換（標題畫面、選單、結局畫面、上方狀態列）
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-lang]');
      if (b && b.dataset.lang !== LANG) setLang(b.dataset.lang);
    });

    const scene = $('scene');
    scene.addEventListener('click', e => { const g = e.target.closest('.hs'); if (g) onHotspot(g.dataset.hs); });
    scene.addEventListener('keydown', e => {
      const g = e.target.closest && e.target.closest('.hs');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onHotspot(g.dataset.hs); }
    });
    scene.addEventListener('mouseover', e => { const g = e.target.closest('.hs'); updateTip(g ? g.dataset.hs : null); });
    scene.addEventListener('focusin', e => { const g = e.target.closest('.hs'); updateTip(g ? g.dataset.hs : null); });
    scene.addEventListener('mouseleave', () => updateTip(null));

    $('objects').addEventListener('click', e => { const b = e.target.closest('[data-obj]'); if (b) onHotspot(b.dataset.obj); });
    $('objects').addEventListener('mouseover', e => {
      const b = e.target.closest('[data-obj]');
      document.querySelectorAll('.hs.flash').forEach(x => x.classList.remove('flash'));
      if (b) { const g = $('scene').querySelector(`[data-hs="${b.dataset.obj}"]`); if (g) g.classList.add('flash'); }
    });
    $('nav').addEventListener('click', e => {
      const b = e.target.closest('[data-room]');
      if (b && !b.disabled) { app.selected = null; app.combining = false; act(() => E.move(app.s, b.dataset.room)); }
    });
    $('inventory').addEventListener('click', e => { const b = e.target.closest('[data-item]'); if (b) onItem(b.dataset.item); });
    $('hand').addEventListener('click', e => { const b = e.target.closest('[data-unhold]'); if (b && app.s) toggleHand(b.dataset.unhold); });
    $('item-detail').addEventListener('click', e => {
      const b = e.target.closest('[data-detail]');
      if (!b || !app.selected) return;
      if (b.dataset.detail === 'view') {
        // 查看完就放下，避免下一次點擊變成「使用」
        const id = app.selected;
        app.selected = null; app.combining = false;
        render();
        openView({ view: 'item', id });
      }
      if (b.dataset.detail === 'combine') { app.combining = !app.combining; render(); }
      if (b.dataset.detail === 'drop') { app.selected = null; app.combining = false; render(); }
    });

    document.addEventListener('keydown', e => {
      if (!$('modal-back').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeView(); return; }
        if (app.viewKeys && app.viewKeys(e)) e.preventDefault();
        return;
      }
      if (e.key === 'Escape' && app.selected) { app.selected = null; app.combining = false; render(); }
    });

    // 遊戲時間與定時存檔
    let last = Date.now(), sinceSave = 0;
    setInterval(() => {
      const now = Date.now(), dt = Math.min(now - last, 5000);
      last = now;
      if (app.screen === 'game' && app.s && !app.s.ending && !document.hidden) {
        app.s.stats.playMs += dt;
        sinceSave += dt;
        $('chip-time').textContent = fmtTime(app.s.stats.playMs);
        if (sinceSave > 15000) { sinceSave = 0; autosave(); }
      }
    }, 1000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
    window.addEventListener('pagehide', autosave);
  }

  /* ================= 啟動 ================= */
  function start(data) {
    bindStatic();
    app.handStripOpen = Store.getSetting('handStrip') !== '0';
    setLang(initialLang(), { persist: false });
    show('title');
    if (data && data.state) loadState(data.state, I.UI.beforeUpdate);
  }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try { hot.snapshot(() => ({ state: app.screen === 'game' ? app.s : null })); } catch (e) { /* 預覽環境以外沒有這個功能 */ }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});

  // 提供給自動化測試的唯讀窺視口（不影響遊戲）
  window.__stargazer = { get state() { return app.s; }, get screen() { return app.screen; }, get lang() { return LANG; } };
}());
