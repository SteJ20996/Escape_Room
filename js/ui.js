/*
 * 觀星者之屋 — 介面
 * 只負責顯示與輸入；所有規則判定都交給 engine.js。
 */
(function () {
  'use strict';
  const G = window.GAME_DATA;
  const E = window.EscapeEngine.create(G);
  const Art = window.Art;
  const Store = window.SaveStore;
  const esc = Art.esc;
  const $ = id => document.getElementById(id);

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
  };
  function freshUi() {
    return { locks: {}, dial: ['lamp', 'lamp', 'lamp'], clock: { h: 12, m: 0 }, dev: [], confirm: null, feedback: [], code: '', importText: '', saveNote: '' };
  }

  /* ================= 畫面切換 ================= */
  function show(screen) {
    for (const id of ['title', 'intro', 'game', 'ending']) $(id).hidden = id !== screen;
    app.screen = screen;
    if (screen === 'title') { refreshTitle(); startSky(); } else stopSky();
    window.scrollTo(0, 0);
  }

  function refreshTitle() {
    const auto = Store.read('auto');
    $('btn-continue').disabled = !(auto && auto.state && !auto.state.ending);
    const got = Store.getEndings().length;
    $('title-foot').textContent = got
      ? `已解鎖結局 ${got} / ${G.ENDING_ORDER.length}`
      : '五個房間・十一道謎題・五種結局';
  }

  /* ================= 星空（標題背景） ================= */
  let skyRaf = 0;
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
      stars = Array.from({ length: Math.round(c.clientWidth * c.clientHeight / 2600) }, () => ({ x: r() * c.clientWidth, y: r() * c.clientHeight, s: 0.4 + r() * 1.4, p: r() * 6.28, v: 0.4 + r() * 1.6 }));
    }
    function draw(t) {
      const w = c.clientWidth, h = c.clientHeight;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05070f'); g.addColorStop(1, '#141c38');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const st of stars) {
        const a = reduce ? 0.7 : 0.45 + 0.45 * Math.sin(st.p + t / 1000 * st.v);
        ctx.globalAlpha = a; ctx.fillStyle = '#f3ecd6';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, 6.283); ctx.fill();
      }
      // 一顆緩慢移動的彗星
      const cx = (w * 0.15 + (reduce ? 0 : (t / 90) % (w * 0.9))), cy = h * 0.22 + (cx - w * 0.15) * 0.18;
      const tail = ctx.createLinearGradient(cx, cy, cx - 120, cy - 22);
      tail.addColorStop(0, 'rgba(255,250,232,.8)'); tail.addColorStop(1, 'rgba(255,250,232,0)');
      ctx.globalAlpha = 1; ctx.strokeStyle = tail; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 120, cy - 22); ctx.stroke();
      ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
      if (!reduce && app.screen === 'title') skyRaf = requestAnimationFrame(draw);
    }
    resize();
    window.onresize = () => { if (app.screen === 'title') resize(); };
    cancelAnimationFrame(skyRaf);
    skyRaf = requestAnimationFrame(draw);
  }
  function stopSky() { cancelAnimationFrame(skyRaf); }

  /* ================= 開場 ================= */
  function newGame() {
    app.s = E.newState();
    app.selected = null; app.combining = false;
    app.ui = freshUi();
    app.log = []; app.latest = [];
    app.stack = []; renderModal();
    app.introStep = 0;
    $('intro-text').innerHTML = '';
    show('intro');
    nextIntro();
  }
  function nextIntro() {
    if (app.introStep >= G.intro.length) { beginGame(); return; }
    $('intro-text').insertAdjacentHTML('beforeend', `<p>${esc(G.intro[app.introStep])}</p>`);
    app.introStep++;
    $('btn-intro-next').textContent = app.introStep >= G.intro.length ? '拾起那封信' : '繼續';
    $('btn-intro-next').focus();
  }
  function beginGame() {
    show('game');
    say([{ text: G.rooms[app.s.room].enterText(app.s), kind: 'room' }, { text: '你拾起地毯上的信。（已記入線索筆記）', kind: 'note' }]);
    autosave();
    render();
    openView({ view: 'item', id: 'letter' });
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
    let r;
    try { r = fn(); } catch (e) {
      console.error(e);
      r = { ok: false, messages: [{ text: '出了點意外：' + e.message + '（遊戲狀態沒有改變）', kind: 'bad' }] };
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
    if (pid === 'exit' || (pid === 'phone' && answer === 'accept')) checkpoint();
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

  function render() {
    if (!app.s || app.screen !== 'game') return;
    const s = app.s;
    $('room-name').textContent = G.rooms[s.room].name;
    const p = E.progress(s);
    const stName = { missing: '尚未找到', held: '在身上', inserted: '已嵌回大門' };
    $('progress').innerHTML = p.emblems.map(e => `<span class="emb ${e.state}" title="${esc(G.items[e.id].name)}：${stName[e.state]}" aria-label="${esc(G.items[e.id].name)}：${stName[e.state]}">${e.glyph}</span>`).join('');
    $('chip-pages').textContent = `日記 ${p.pages}/4`;
    $('chip-pages').classList.toggle('on', p.pages === 4);
    $('chip-plate').hidden = !p.plate;
    $('chip-plate').classList.toggle('on', p.plate);
    $('chip-time').textContent = fmtTime(s.stats.playMs);
    document.body.classList.toggle('holding', !!app.selected);
    renderScene();
    renderObjects();
    renderNav();
    renderInventory();
    renderLog();
    $('narration').innerHTML = app.latest.map(m => `<p class="m-${m.kind || 'info'}">${esc(m.text)}</p>`).join('');
  }

  function visible(id) {
    const h = E.hotspot(id);
    return !!h && h.room === app.s.room && (!h.visible || !!h.visible(app.s));
  }
  function renderScene() {
    $('scene').innerHTML = Art.scene(app.s.room, { s: app.s, vis: visible, label: id => E.hotspot(id).name });
    updateTip(null);
  }
  function updateTip(id) {
    const tip = $('scene-tip');
    if (app.selected) {
      tip.hidden = false;
      const item = E.itemName(app.s, app.selected);
      tip.textContent = id ? `使用「${item}」→ ${E.hotspot(id).name}` : `拿著「${item}」：點擊要使用的地方`;
    } else if (id) {
      tip.hidden = false;
      tip.textContent = E.hotspot(id).name;
    } else tip.hidden = true;
  }

  function renderObjects() {
    const hs = E.visibleHotspots(app.s);
    $('objects').innerHTML = `<span class="label">${app.selected ? '用在：' : '查看：'}</span>` +
      hs.map(h => `<button class="btn obj-btn" type="button" data-obj="${h.id}">${esc(h.name)}</button>`).join('');
  }

  function renderNav() {
    const s = app.s;
    $('nav').innerHTML = G.roomOrder.map(r => {
      if (r === 'darkroom' && !s.flags.trapdoorFound) return '';
      const open = E.canEnter(s, r), here = s.room === r;
      return `<button class="btn ${here ? 'here' : ''}" type="button" data-room="${r}" ${!open || here ? 'disabled' : ''} ${here ? 'aria-current="true"' : ''}>${esc(G.rooms[r].name)}${open ? '' : '（鎖著）'}</button>`;
    }).join('');
  }

  function renderInventory() {
    const s = app.s;
    $('inventory').innerHTML = s.inv.length ? s.inv.map(id => {
      const it = G.items[id];
      const cls = ['inv-tile', app.selected === id ? 'sel' : '', app.combining && app.selected !== id ? 'target' : ''].join(' ');
      return `<button class="${cls}" type="button" data-item="${id}" aria-pressed="${app.selected === id}"><span class="seal k-${it.kind}" aria-hidden="true">${it.glyph}</span><span>${esc(E.itemName(s, id))}</span></button>`;
    }).join('') : '<p class="inv-empty">身上什麼也沒有。</p>';
    const d = $('item-detail');
    if (!app.selected) { d.hidden = true; d.innerHTML = ''; return; }
    const it = G.items[app.selected];
    d.hidden = false;
    d.innerHTML = `<h3>${esc(E.itemName(s, app.selected))}</h3><p>${esc(it.desc)}</p>
      <p class="hold-tip">${app.combining ? '再點另一個物品，試著把它們組合起來。' : '點擊場景中的物件來使用它。'}</p>
      <div class="row">
        <button class="btn small" type="button" data-detail="view">查看</button>
        <button class="btn small ${app.combining ? 'primary' : ''}" type="button" data-detail="combine">${app.combining ? '取消組合' : '組合…'}</button>
        <button class="btn small ghost" type="button" data-detail="drop">放下</button>
      </div>`;
  }

  function renderLog() {
    const latest = new Set(app.latest);
    const items = app.log.slice(-40).reverse();
    $('log').innerHTML = items.map(m => `<p class="m-${m.kind || 'info'} ${latest.has(m) ? 'fresh' : 'old'}">${esc(m.text)}</p>`).join('');
  }

  /* ================= 對話框 ================= */
  const fb = () => `<div class="feedback" aria-live="polite">${app.ui.feedback.map(m => `<p class="m-${m.kind || 'info'}">${esc(m.text)}</p>`).join('')}</div>`;
  const paper = (d, extra = '') => `<div class="paper ${d.style || 'plain'}">${extra}${d.body.map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
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
      if (app.lastFocus && document.contains(app.lastFocus)) app.lastFocus.focus();
      return;
    }
    const keep = fresh ? null : focusKey(document.activeElement);
    const V = VIEWS[view.view];
    const out = V ? V(view) : { title: '？', html: '<p>這個畫面不存在。</p>' };
    $('modal-title').textContent = out.title;
    $('modal-body').innerHTML = out.html;
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
    return { title: d.title, html: paper(d) };
  }

  function itemContent(id) {
    const it = G.items[id];
    if (it.doc) return paper(G.docs[it.doc]);
    switch (it.view) {
      case 'grid': return `<div class="art-box narrow">${Art.gridSvg({ digits: true })}</div>`;
      case 'transparency': return `<div class="art-box narrow">${Art.gridSvg({ digits: false, stars: true })}</div>`;
      case 'overlay': return `<div class="art-box narrow">${Art.gridSvg({ digits: true, stars: true })}</div><p class="lead">三個圈起來的星星底下，各有一個數字。</p>`;
      case 'note_left': return `<div class="art-box narrow">${Art.note('left')}</div><p class="lead">只有左半邊，每一行都斷在撕口。</p>`;
      case 'note_right': return `<div class="art-box narrow">${Art.note('right')}</div><p class="lead">只有右半邊，每一行都缺了開頭。</p>`;
      case 'note_full': return `<div class="art-box">${Art.note('full')}</div>` + paper({ style: 'hand', body: [G.NOTE_LINES.map(l => l[0] + l[1]).filter(Boolean).join('')] }, '<h3>謄寫</h3>');
      case 'diary': {
        const pages = app.s.flags.diaryPages || [];
        return pages.map(p => paper(G.docs[p], `<h3>${esc(G.docs[p].title)}</h3>`)).join('') +
          (pages.length < 4 ? `<p class="lead">日記還缺 ${4 - pages.length} 頁。</p>` : '<p class="lead">四頁都齊了。</p>');
      }
      case 'plate': return `<div class="art-box">${Art.plate()}</div>`;
      default: return '';
    }
  }

  const VIEWS = {
    doc: ({ id }) => docView(id),

    item: ({ id }) => {
      const it = G.items[id];
      const held = app.s && app.s.inv.includes(id);
      return {
        title: E.itemName(app.s, id),
        html: `<p class="lead">${esc(it.desc)}</p>${itemContent(id)}
          ${held ? center(`<button class="btn" type="button" data-act="hold">拿在手上</button><button class="btn" type="button" data-act="combine">和其他物品組合…</button>`) : ''}`,
        bind(root) {
          const hold = root.querySelector('[data-act=hold]');
          if (hold) hold.onclick = () => { app.selected = id; app.combining = false; closeAll(); render(); };
          const comb = root.querySelector('[data-act=combine]');
          if (comb) comb.onclick = () => { app.selected = id; app.combining = true; closeAll(); render(); };
        },
      };
    },

    bookshelf: () => ({
      title: '書架',
      html: `<p class="lead">中間那一層排著九卷《星空圖鑑》，書脊下方印著卷數。有幾卷的書脊是彩色的。</p><div class="art-box">${Art.bookshelf()}</div>`,
    }),

    poster: () => ({
      title: '手繪星座圖',
      html: `<p class="lead">陸觀自己命名的八個星座。每個星座旁都註明了它有幾顆星。</p><div class="art-box">${Art.poster()}</div>`,
    }),

    eyepiece: () => {
      const dir = app.s.puz.dome || 'N';
      const name = G.DIRECTIONS.find(d => d.id === dir).name;
      return {
        title: '望遠鏡目鏡',
        html: `<p class="lead">觀測窗朝向：<strong>${name}方</strong>。你湊近目鏡，視野裡有三團明亮的星群。</p>
          <div class="eyepiece">${Art.eyepiece(dir)}</div>
          ${center('<button class="btn" type="button" data-act="dome">轉動穹頂…</button>')}`,
        bind(root) { root.querySelector('[data-act=dome]').onclick = () => { app.stack.pop(); openView({ view: 'dome' }); }; },
      };
    },

    dome: () => {
      const cur = app.s.puz.dome || 'N';
      const grid = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];
      const name = id => G.DIRECTIONS.find(d => d.id === id).name;
      return {
        title: '穹頂轉輪',
        html: `<p class="lead">轉動轉輪，可以把穹頂的觀測窗轉向八個方位。</p>
          <div class="compass" role="group" aria-label="選擇方位">${grid.map(id => id
            ? `<button class="btn ${id === cur ? 'cur' : ''}" type="button" data-dir="${id}" aria-pressed="${id === cur}">${name(id)}</button>`
            : `<div class="center">目前<br>${name(cur)}</div>`).join('')}</div>
          ${center(app.s.flags.eyepieceInstalled ? '<button class="btn primary" type="button" data-act="look">看望遠鏡</button>' : '<span class="lead">（望遠鏡還沒有目鏡。）</span>')}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-dir]').forEach(b => { b.onclick = () => submit('dome', b.dataset.dir, { closeOnSolve: false }); });
          const look = root.querySelector('[data-act=look]');
          if (look) look.onclick = () => { app.stack.pop(); openView({ view: 'eyepiece' }); };
        },
      };
    },

    dial: () => {
      const sel = app.ui.dial, rings = ['外環', '中環', '內環'], order = G.CONSTELLATION_ORDER;
      return {
        title: '星盤',
        html: `<div class="art-box narrow">${Art.dialSvg(sel)}</div>
          ${paper(G.docs.dial_inscription)}
          <div class="picker">${sel.map((id, i) => `<div class="picker-row"><span class="lbl">${rings[i]}</span>
            <button class="btn" type="button" data-prev="${i}" aria-label="${rings[i]}：上一個星座">◀</button>
            <span class="name" aria-live="polite">${G.CONSTELLATIONS[id].name}</span>
            <button class="btn" type="button" data-next="${i}" aria-label="${rings[i]}：下一個星座">▶</button></div>`).join('')}</div>
          ${center('<button class="btn primary" type="button" data-act="turn">轉動到位</button>')}${fb()}`,
        bind(root) {
          const step = (i, d) => { sel[i] = order[(order.indexOf(sel[i]) + d + order.length) % order.length]; app.ui.feedback = []; renderModal(); };
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
        title: P.title,
        html: `<p class="lead">${esc(P.prompt)}</p>
          <div class="lock" role="group" aria-label="${P.digits} 位數字鎖">${cur.map((d, i) => `<div class="wheel">
            <button class="btn" type="button" data-up="${i}" aria-label="第 ${i + 1} 位加一">▲</button>
            <div class="digit" aria-label="第 ${i + 1} 位：${d}">${d}</div>
            <button class="btn" type="button" data-down="${i}" aria-label="第 ${i + 1} 位減一">▼</button></div>`).join('')}</div>
          ${center('<button class="btn primary" type="button" data-act="open" data-autofocus>開鎖</button>')}${fb()}
          <p class="lead" style="font-size:.85rem;text-align:center">也可以直接用鍵盤輸入數字，按 Enter 開鎖。</p>`,
        bind(root) {
          root.querySelectorAll('[data-up]').forEach(b => { b.onclick = () => { cur[+b.dataset.up] = (cur[+b.dataset.up] + 1) % 10; app.ui.feedback = []; renderModal(); }; });
          root.querySelectorAll('[data-down]').forEach(b => { b.onclick = () => { cur[+b.dataset.down] = (cur[+b.dataset.down] + 9) % 10; app.ui.feedback = []; renderModal(); }; });
          root.querySelector('[data-act=open]').onclick = () => submit(id, cur.join(''));
        },
        keys(e) {
          if (/^[0-9]$/.test(e.key)) { cur.shift(); cur.push(+e.key); app.ui.feedback = []; renderModal(); return true; }
          if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { submit(id, cur.join('')); return true; }
          return false;
        },
      };
    },

    pots: () => {
      const trowel = app.s.inv.includes('trowel');
      return {
        title: '花盆架',
        html: paper({ style: 'plain', body: G.docs.pots_rule.body.slice(0, 2) }) +
          `<div class="pots">${G.POTS.map(p => `<div class="pot"><h3>${p.name}盆</h3><q>${esc(p.says)}</q>
            <button class="btn small" type="button" data-pot="${p.id}">挖開這一盆</button></div>`).join('')}</div>
          ${trowel ? '' : '<p class="notice">盆土壓得很實。也許該先找把工具。</p>'}${fb()}`,
        bind(root) { root.querySelectorAll('[data-pot]').forEach(b => { b.onclick = () => submit('pots', b.dataset.pot); }); },
      };
    },

    valves: () => {
      const open = Object.assign({}, app.s.puz.valves);
      const wheel = app.s.flags.wheelInstalled;
      return {
        title: '灌溉系統',
        html: `<p class="lead">點擊閥門切換開關（閥門上方標示著「開」或「關」）。每條管線從哪個桶出發、流進哪一格花床，都畫在圖上。設好之後再轉開總閘。</p>
          <div class="art-box">${Art.valvesSvg(open, app.s.flags.waterOk)}</div>
          ${center(`<button class="btn primary" type="button" data-act="main">${wheel ? '轉開總閘' : '轉動總閘'}</button><button class="btn small" type="button" data-doc="garden_rules">看園丁守則</button>`)}
          ${wheel ? '' : '<p class="notice">總閘上只剩一根光禿禿的閥桿，手輪不見了。</p>'}${fb()}`,
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
      const cfg = Object.assign({}, G.MIRROR_GRID.initial, app.s.puz.mirrors);
      const hit = G.traceBeam(cfg).hit;
      return {
        title: '天窗反光鏡',
        html: `<p class="lead">月光從天窗射下。點擊鏡子可以切換它的斜向（「/」或「\\」），讓光一路折射，照到右下角的月光花。</p>
          <div class="art-box">${Art.mirrorsSvg(cfg)}</div>
          ${hit ? '<p class="m-good" style="margin:0;text-align:center">月光照到了月光花。</p>' : ''}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-mirror]').forEach(g => {
            const flip = () => {
              cfg[g.dataset.mirror] = cfg[g.dataset.mirror] === '/' ? '\\' : '/';
              const r = act(() => E.submit(app.s, 'mirrors', cfg), { noOpen: true });
              app.ui.feedback = r && r.solved && r.messages.length ? r.messages : [];
              renderModal();
            };
            g.addEventListener('click', flip);
            g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
          });
        },
      };
    },

    clock: () => {
      const c = app.ui.clock;
      return {
        title: '落地鐘',
        html: `${paper(G.docs.clock_inscription)}
          <div class="art-box narrow" style="max-width:280px">${Art.clockSvg(c.h, c.m)}</div>
          <div class="picker">
            <div class="picker-row"><span class="lbl">時針</span><button class="btn" type="button" data-h="-1" aria-label="時針往回">◀</button><span class="name" aria-live="polite">${c.h} 點</span><button class="btn" type="button" data-h="1" aria-label="時針往前">▶</button></div>
            <div class="picker-row"><span class="lbl">分針</span><button class="btn" type="button" data-m="-5" aria-label="分針往回五分">◀</button><span class="name" aria-live="polite">${String(c.m).padStart(2, '0')} 分</span><button class="btn" type="button" data-m="5" aria-label="分針往前五分">▶</button></div>
          </div>
          ${center('<button class="btn primary" type="button" data-act="set">就是這一刻</button>')}${fb()}`,
        bind(root) {
          root.querySelectorAll('[data-h]').forEach(b => { b.onclick = () => { c.h = ((c.h - 1 + +b.dataset.h + 12) % 12) + 1; app.ui.feedback = []; renderModal(); }; });
          root.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => { c.m = (c.m + +b.dataset.m + 60) % 60; app.ui.feedback = []; renderModal(); }; });
          root.querySelector('[data-act=set]').onclick = () => submit('clock', { h: c.h, m: c.m });
        },
      };
    },

    develop: () => {
      const seq = app.ui.dev;
      const name = id => G.BOTTLES.find(b => b.id === id).name;
      const hasNote = app.s.inv.includes('note_full');
      return {
        title: '顯影台',
        html: `<p class="lead">三個藥盤和一個清洗槽排成一列，旁邊是封存底片的避光盒。依序選出要倒的藥瓶（四步），再開始沖洗。陸觀留了幾張廢片，可以先試。</p>
          <div class="bottles">${G.BOTTLES.map(b => `<button class="bottle-btn" type="button" data-bottle="${b.id}" ${seq.length >= 4 ? 'disabled' : ''}>${Art.bottleSvg(b)}<span>${b.name}</span></button>`).join('')}</div>
          <div class="slots">${[0, 1, 2, 3].map(i => `<div class="slot ${seq[i] ? 'filled' : ''}">第 ${i + 1} 步<br>${seq[i] ? name(seq[i]) : '—'}</div>`).join('')}</div>
          ${center(`<button class="btn" type="button" data-act="clear">清除</button><button class="btn primary" type="button" data-act="go" ${seq.length < 4 ? 'disabled' : ''}>開始沖洗</button>`)}${fb()}
          ${center(`<button class="btn small" type="button" data-doc="bottle_card">看藥瓶卡片</button>${hasNote ? '<button class="btn small" type="button" data-note="1">看拼好的便條</button>' : ''}`)}`,
        bind(root) {
          root.querySelectorAll('[data-bottle]').forEach(b => { b.onclick = () => { if (seq.length < 4) seq.push(b.dataset.bottle); app.ui.feedback = []; renderModal(); }; });
          root.querySelector('[data-act=clear]').onclick = () => { seq.length = 0; app.ui.feedback = []; renderModal(); };
          root.querySelector('[data-act=go]').onclick = () => { const r = submit('develop', seq.slice()); if (r && !r.solved) seq.length = 0; if (r) renderModal(); };
          root.querySelector('[data-doc]').onclick = () => openView({ view: 'doc', id: 'bottle_card' });
          const n = root.querySelector('[data-note]');
          if (n) n.onclick = () => openView({ view: 'item', id: 'note_full' });
        },
      };
    },

    phone: () => {
      const confirming = app.ui.confirm === 'accept';
      return {
        title: '電話',
        html: `<div class="dialogue">
            <p class="speaker">聽筒裡傳來一個沙啞的男聲</p>
            <p class="line">「……是阿遙吧？我是韓嶽。」</p>
            <p class="line">「我就在門外的車裡。地下室那盞紅燈亮了很久，我都看見了。你找到那張底片了，對不對？」</p>
            <p class="line">「聽著，你老師已經走了。一張舊底片能改變什麼？只會讓兩個老頭子的名聲一起爛掉，還有你的前途——你不是一直想進天文台工作嗎？」</p>
            <p class="line">「把底片從大門的信件口塞出來。這扇門的機關，從外面也能用鑰匙打開——陸觀當年給過我一把。我會放你出去，再給你一張支票，數字隨你填。」</p>
          </div>
          ${confirming
            ? `<div class="confirm"><p style="margin:0">真的要把底片交出去嗎？<strong>這會立刻結束遊戲。</strong></p>
                <div class="row"><button class="btn danger" type="button" data-act="yes">確定，交出底片</button><button class="btn" type="button" data-act="no" data-autofocus>再想想</button></div></div>`
            : `<div class="choices">
                <button class="btn" type="button" data-act="accept">把底片塞出信件口，接受交易</button>
                <button class="btn" type="button" data-act="refuse">「我不會交給你。」——掛斷電話</button>
                <button class="btn ghost" type="button" data-act="later">先不回答，放下聽筒</button></div>`}${fb()}`,
        bind(root) {
          const on = (a, f) => { const b = root.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
          on('accept', () => { app.ui.confirm = 'accept'; renderModal(true); });
          on('no', () => { app.ui.confirm = null; renderModal(true); });
          on('yes', () => submit('phone', 'accept'));
          on('refuse', () => submit('phone', 'refuse'));
          on('later', () => { closeAll(); say([{ text: '你放下了聽筒。電話還在響。', kind: 'info' }]); render(); });
        },
      };
    },

    exit: () => {
      const s = app.s, plate = s.inv.includes('plate'), pages = E.pageCount(s);
      const opts = plate
        ? [['publish', '帶著底片離開，把真相公諸於世'], ['leave_plate', '把底片留在屋裡，獨自離開']]
        : [['leave', '推開大門，離開這棟屋子']];
      const c = app.ui.confirm;
      const label = c && opts.find(o => o[0] === c);
      return {
        title: '大門',
        html: `<p class="lead">三枚徽章都已歸位。沉重的大門只要輕輕一推就會打開。門外，雨後的山路泛著月光。</p>
          <p class="lead">你帶著：日記 ${pages} / 4 頁${plate ? '、玻璃底片' : ''}。</p>
          ${label
            ? `<div class="confirm"><p style="margin:0">「${label[1]}」——離開之後，故事就結束了。確定嗎？</p>
                <div class="row"><button class="btn primary" type="button" data-yes="${c}">確定</button><button class="btn" type="button" data-act="no" data-autofocus>再想想</button></div></div>`
            : `<div class="choices">${opts.map(([id, t]) => `<button class="btn" type="button" data-choice="${id}">${t}</button>`).join('')}
                <button class="btn ghost" type="button" data-act="stay">先不走，我還想在屋裡看看</button></div>`}`,
        bind(root) {
          root.querySelectorAll('[data-choice]').forEach(b => { b.onclick = () => { app.ui.confirm = b.dataset.choice; renderModal(true); }; });
          const yes = root.querySelector('[data-yes]');
          if (yes) yes.onclick = () => submit('exit', yes.dataset.yes);
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
        title: '線索筆記',
        html: `<p class="lead">你讀過、看過的線索都會自動記在這裡，隨時可以重讀。（物品本身請在物品欄「查看」。）</p>
          <div class="list">${notes.map(id => `<button class="btn" type="button" data-note="${id}"><span>${esc(G.docs[id].title)}</span><span aria-hidden="true">›</span></button>`).join('')}</div>`,
        bind(root) {
          root.querySelectorAll('[data-note]').forEach(b => { b.onclick = () => openView(b.dataset.note === 'letter' ? { view: 'item', id: 'letter' } : { view: 'doc', id: b.dataset.note }); });
        },
      };
    },

    hints: () => {
      const list = E.hintList(app.s);
      return {
        title: '提示',
        html: `<p class="lead">每個目標的提示分三段：先給方向，再指出線索在哪，最後才是答案。用過的提示次數會出現在結算畫面上。</p>
          ${list.map(h => `<div class="hint"><h3>${esc(h.title)}</h3>
            ${h.texts.length ? `<ol>${h.texts.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
            <div class="row"><button class="btn small" type="button" data-hint="${h.id}" ${h.level >= h.max ? 'disabled' : ''}>${h.level === 0 ? '給我一點提示' : h.level >= h.max ? '已經是答案了' : `再多一點（${h.level + 1}/${h.max}）`}</button></div></div>`).join('') || '<p>目前沒有可以提示的目標。</p>'}`,
        bind(root) {
          root.querySelectorAll('[data-hint]').forEach(b => { b.onclick = () => { if (E.revealHint(app.s, b.dataset.hint)) autosave(); renderModal(); }; });
        },
      };
    },

    save: () => saveView(true),
    load: () => saveView(false),

    menu: () => ({
      title: '選單',
      html: `<div class="list">
          <button class="btn" type="button" data-go="save">存檔 / 讀檔</button>
          <button class="btn" type="button" data-go="help">遊戲說明</button>
          <button class="btn" type="button" data-go="gallery">結局圖鑑</button>
          ${app.ui.confirm === 'title'
            ? `<div class="confirm"><p style="margin:0">回到標題畫面？目前進度已自動存檔，可以用「繼續遊戲」回來。</p><div class="row"><button class="btn primary" type="button" data-act="title-yes">回到標題</button><button class="btn" type="button" data-act="title-no">取消</button></div></div>`
            : '<button class="btn" type="button" data-act="title">回到標題畫面</button>'}
        </div>`,
      bind(root) {
        root.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => openView({ view: b.dataset.go }); });
        const on = (a, f) => { const b = root.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
        on('title', () => { app.ui.confirm = 'title'; renderModal(); });
        on('title-no', () => { app.ui.confirm = null; renderModal(); });
        on('title-yes', () => { autosave(); closeAll(); show('title'); });
      },
    }),

    help: () => ({
      title: '遊戲說明',
      html: `<div class="paper plain">
        <p><strong>目標</strong>：找回日、月、星三枚徽章，嵌回門廳的大門就能離開。屋裡還藏著另一個秘密，它決定你會看到哪一個結局。</p>
        <p><strong>查看</strong>：點擊場景裡發亮的物件，或點場景下方的物件名稱。</p>
        <p><strong>使用物品</strong>：在右邊的物品欄點一下物品（拿在手上），再點場景裡的物件。</p>
        <p><strong>組合線索</strong>：點選物品後按「組合…」，再點另一個物品。撕開的紙、疊在一起的圖、裝電池……很多線索要合在一起才看得懂。</p>
        <p><strong>線索筆記</strong>：讀過的文件會自動記下，隨時能重讀。</p>
        <p><strong>提示</strong>：卡關時按「提示」，每個目標分三段，從方向到答案。</p>
        <p><strong>存檔</strong>：每個動作後都會自動存檔；也可以手動存到三個欄位，或複製「存檔碼」把進度帶到別的地方。</p>
        <p><strong>公平原則</strong>：所有謎題的答案都在屋子裡，不需要任何外部知識。答錯不會有懲罰，也不會讓遊戲卡死。</p>
        <p><strong>鍵盤</strong>：Tab 移動、Enter 選擇、Esc 關閉視窗或放下手上的物品；數字鎖可以直接打數字。</p></div>`,
    }),

    gallery: () => {
      const got = Store.getEndings();
      return {
        title: '結局圖鑑',
        html: `<p class="lead">已解鎖 ${got.length} / ${G.ENDING_ORDER.length}</p>
          <div class="gallery">${G.ENDING_ORDER.map(id => {
            const e = G.endings[id], ok = got.includes(id);
            return `<div class="gal ${ok ? '' : 'locked'}"><span class="rk">${ok ? e.rank : '？？？'}</span><span>${ok ? '「' + esc(e.title) + '」' + esc(e.text[0].slice(0, 26)) + '……' : '尚未解鎖'}</span></div>`;
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
    if (!rec) return '空的';
    if (rec.corrupt) return '存檔損毀，無法讀取';
    const d = new Date(rec.savedAt);
    const when = isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${when}・${G.rooms[rec.room] ? G.rooms[rec.room].name : '？'}・徽章 ${rec.emblems}/3・日記 ${rec.pages}/4・${fmtTime(rec.state.stats && rec.state.stats.playMs)}`;
  }

  function loadState(state, label) {
    let st;
    try { st = E.normalize(JSON.parse(JSON.stringify(state))); } catch (e) { return '存檔內容無法解讀。'; }
    const errs = E.validate(st);
    if (errs.length) return '這份存檔無法使用：' + errs.join('、') + '。';
    if (st.ending) return '這份存檔的故事已經結束了。';
    app.s = st;
    app.selected = null; app.combining = false;
    app.ui = freshUi();
    app.log = []; app.latest = [];
    app.stack = [];
    renderModal();
    show('game');
    say([{ text: `已讀取：${label}`, kind: 'note' }, { text: G.rooms[st.room].enterText(st), kind: 'room' }]);
    autosave();
    render();
    return null;
  }

  function saveView(inGame) {
    const canSave = inGame && app.s && !app.s.ending;
    const slots = [['auto', '自動存檔'], ['1', '欄位一'], ['2', '欄位二'], ['3', '欄位三'], ['preend', '結局前的存檔']];
    const c = app.ui.confirm;
    return {
      title: inGame ? '存檔 / 讀檔' : '讀取存檔',
      html: `${Store.persistent ? '' : '<p class="notice warn">這個瀏覽器目前無法長期保存資料（例如私密視窗或被封鎖的網站資料）。存檔只會保留到關閉頁面為止——請用下方的存檔碼把進度帶走。</p>'}
        ${app.ui.saveNote ? `<p class="notice">${esc(app.ui.saveNote)}</p>` : ''}
        <div class="list">${slots.map(([id, name]) => {
          const rec = Store.read(id);
          const usable = rec && rec.state && !rec.state.ending;
          const manual = /^[123]$/.test(id);
          if (c === 'over:' + id || c === 'del:' + id) {
            const over = c.startsWith('over');
            return `<div class="slot-card"><strong>${name}</strong><p style="margin:0">${over ? '覆蓋這個欄位的存檔？' : '刪除這個欄位的存檔？'}</p>
              <div class="row"><button class="btn ${over ? 'primary' : 'danger'}" type="button" data-yes="${c}">確定</button><button class="btn" type="button" data-act="cancel">取消</button></div></div>`;
          }
          if (!manual && !rec) return '';
          return `<div class="slot-card"><strong>${name}</strong><span class="meta">${esc(describe(rec))}</span>
            <div class="row">
              ${canSave && manual ? `<button class="btn small" type="button" data-save="${id}">存到這裡</button>` : ''}
              <button class="btn small" type="button" data-load="${id}" ${usable ? '' : 'disabled'}>讀取</button>
              ${manual && rec ? `<button class="btn small danger" type="button" data-del="${id}">刪除</button>` : ''}
            </div></div>`;
        }).join('')}</div>
        ${canSave ? `<div class="slot-card"><strong>匯出存檔碼</strong><span class="meta">複製這段文字保存起來，之後可以在任何瀏覽器貼回來繼續。</span>
          <textarea class="code" id="code-out" readonly>${esc(Store.encode(app.s))}</textarea>
          <div class="row"><button class="btn small" type="button" data-act="copy">複製</button></div></div>` : ''}
        <div class="slot-card"><strong>匯入存檔碼</strong>
          <textarea class="code" id="code-in" placeholder="把 STAR1. 開頭的存檔碼貼在這裡">${esc(app.ui.importText)}</textarea>
          <div class="row"><button class="btn small" type="button" data-act="import">讀取存檔碼</button></div></div>
        ${fb()}`,
      bind(root) {
        const note = msg => { app.ui.saveNote = msg; app.ui.confirm = null; renderModal(); };
        root.querySelectorAll('[data-save]').forEach(b => {
          b.onclick = () => {
            const id = b.dataset.save;
            if (Store.read(id) && app.ui.confirm !== 'over:' + id) { app.ui.confirm = 'over:' + id; renderModal(); return; }
            Store.write(id, record(app.s)); note(`已存到欄位${'一二三'[id - 1]}。`);
          };
        });
        root.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { app.ui.confirm = 'del:' + b.dataset.del; renderModal(); }; });
        const yes = root.querySelector('[data-yes]');
        if (yes) yes.onclick = () => {
          const [kind, id] = yes.dataset.yes.split(':');
          if (kind === 'over') { Store.write(id, record(app.s)); note(`已覆蓋欄位${'一二三'[id - 1]}。`); }
          else { Store.remove(id); note('已刪除。'); }
        };
        const cancel = root.querySelector('[data-act=cancel]');
        if (cancel) cancel.onclick = () => { app.ui.confirm = null; renderModal(); };
        root.querySelectorAll('[data-load]').forEach(b => {
          b.onclick = () => {
            const rec = Store.read(b.dataset.load);
            const err = rec && rec.state ? loadState(rec.state, slots.find(x => x[0] === b.dataset.load)[1]) : '這個欄位是空的。';
            if (err) note(err);
          };
        });
        const copy = root.querySelector('[data-act=copy]');
        if (copy) copy.onclick = () => {
          const ta = $('code-out');
          const fallback = () => { ta.focus(); ta.select(); note('已選取存檔碼，請按 Ctrl+C（或長按）複製。'); };
          try {
            navigator.clipboard.writeText(ta.value).then(() => note('存檔碼已複製。'), fallback);
          } catch (e) { fallback(); }
        };
        const imp = root.querySelector('[data-act=import]');
        imp.onclick = () => {
          app.ui.importText = $('code-in').value;
          let state;
          try { state = Store.decode(app.ui.importText); } catch (e) { note(e.message); return; }
          const err = loadState(state, '存檔碼');
          if (err) note(err); else app.ui.importText = '';
        };
      },
    };
  }

  /* ================= 結局 ================= */
  function finishGame(id) {
    const e = G.endings[id];
    const s = app.s;
    const got = Store.addEnding(id);
    Store.remove('auto');
    app.stack = []; renderModal();
    show('ending');
    const stats = [
      [fmtTime(s.stats.playMs), '遊戲時間'], [s.stats.actions, '行動次數'], [s.stats.wrong, '錯誤嘗試'],
      [s.stats.hints, '使用提示'], [E.pageCount(s) + ' / 4', '日記頁數'],
    ];
    $('ending-card').innerHTML = `
      <p class="ending-rank">${esc(e.rank)}</p>
      <h1 class="ending-title">${esc(e.title)}</h1>
      <div class="ending-text">${e.text.map(t => `<p>${esc(t)}</p>`).join('')}</div>
      <div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <p class="lead">已解鎖結局 ${got.length} / ${G.ENDING_ORDER.length}${got.length < G.ENDING_ORDER.length ? '。換一個選擇，或多找一些東西，也許會看到不同的結局。' : '。你看過了這棟屋子的每一種結局。'}</p>
      <div class="row">
        ${Store.read('preend') ? '<button class="btn primary" type="button" id="btn-preend">回到做出選擇之前</button>' : ''}
        <button class="btn" type="button" id="btn-end-gallery">結局圖鑑</button>
        <button class="btn" type="button" id="btn-end-title">回到標題</button>
      </div>`;
    const pre = $('btn-preend');
    if (pre) pre.onclick = () => { const rec = Store.read('preend'); if (rec && rec.state) loadState(rec.state, '結局前的存檔'); };
    $('btn-end-gallery').onclick = () => openView({ view: 'gallery' });
    $('btn-end-title').onclick = () => show('title');
    ($('btn-preend') || $('btn-end-title')).focus();
  }

  /* ================= 事件繫結 ================= */
  function bindStatic() {
    $('btn-new').onclick = () => {
      const auto = Store.read('auto');
      if (auto && auto.state && !auto.state.ending && !app.confirmNew) {
        app.confirmNew = true;
        $('btn-new').textContent = '確定開始新遊戲？（自動存檔會被覆蓋）';
        return;
      }
      app.confirmNew = false;
      $('btn-new').textContent = '新遊戲';
      newGame();
    };
    $('btn-continue').onclick = () => {
      const rec = Store.read('auto');
      const err = rec && rec.state ? loadState(rec.state, '自動存檔') : '沒有可以繼續的進度。';
      if (err) { $('title-foot').textContent = err; refreshTitle(); }
    };
    $('btn-load').onclick = () => openView({ view: 'load' });
    $('btn-gallery').onclick = () => openView({ view: 'gallery' });
    $('btn-help').onclick = () => openView({ view: 'help' });
    $('btn-intro-next').onclick = nextIntro;
    $('btn-intro-skip').onclick = () => { app.introStep = G.intro.length; beginGame(); };

    $('btn-hints').onclick = () => openView({ view: 'hints' });
    $('btn-notes').onclick = () => openView({ view: 'notes' });
    $('btn-save').onclick = () => { app.ui.saveNote = ''; openView({ view: 'save' }); };
    $('btn-menu').onclick = () => openView({ view: 'menu' });
    $('modal-close').onclick = closeAll;
    $('modal-back-btn').onclick = closeView;
    $('modal-back').addEventListener('click', e => { if (e.target === $('modal-back')) closeAll(); });

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
    $('item-detail').addEventListener('click', e => {
      const b = e.target.closest('[data-detail]');
      if (!b || !app.selected) return;
      if (b.dataset.detail === 'view') openView({ view: 'item', id: app.selected });
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
    show('title');
    if (data && data.state) loadState(data.state, '更新前的進度');
  }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try { hot.snapshot(() => ({ state: app.screen === 'game' ? app.s : null })); } catch (e) { /* 預覽環境以外沒有這個功能 */ }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});

  // 提供給自動化測試的唯讀窺視口（不影響遊戲）
  window.__stargazer = { get state() { return app.s; }, get screen() { return app.screen; } };
}());
