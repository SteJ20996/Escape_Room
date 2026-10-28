'use strict';
// 雙語完整性：遊戲資料裡每一段雙語文字都有中文與英文，英文裡不混入中文字或全形標點。
// （遊戲過程中動態產生的每一則訊息，另由 solver.test.js 在窮舉所有狀態時逐一檢查。）
const test = require('node:test');
const assert = require('node:assert/strict');
const { G } = require('./helpers');
const { CJK } = require('./solver');

// 走訪資料，收集所有 { zh, en } 物件（函式本身略過；它們的輸出由窮舉測試涵蓋）
function collect(node, path, out, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if ('zh' in node && 'en' in node && Object.keys(node).length === 2) { out.push({ path, t: node }); return; }
  for (const [k, v] of Object.entries(node)) collect(v, path + '.' + k, out, seen);
}

const pairs = [];
collect(G, 'G', pairs);
// 撕開的便條每行刻意有一邊是空的（整行落在撕口一側），由 puzzles.test.js 專門檢查
const checked = pairs.filter(p => p.path !== 'G.NOTE_LINES' && p.path !== 'G.NOTE_LINES_V');

test('遊戲資料中的雙語文字數量合理', () => {
  assert.ok(pairs.length > 250, `只找到 ${pairs.length} 組`);
});

test('每一組雙語文字都兩種語言齊全，英文裡沒有中文', () => {
  const problems = [];
  for (const { path, t } of checked) {
    const both = [t.zh, t.en];
    for (const [lang, v] of [['zh', t.zh], ['en', t.en]]) {
      const list = Array.isArray(v) ? v : [v];
      if (!list.length || list.some(x => typeof x !== 'string' || !x.trim())) problems.push(`${path}.${lang} 空白`);
    }
    if (Array.isArray(both[0]) !== Array.isArray(both[1])) problems.push(`${path} 兩種語言的型別不同`);
    if (Array.isArray(t.zh) && t.zh.length !== t.en.length) problems.push(`${path} 段落數不同（${t.zh.length} vs ${t.en.length}）`);
    const en = Array.isArray(t.en) ? t.en.join('\n') : t.en;
    if (CJK.test(en)) problems.push(`${path}.en 混有中文：${en.slice(0, 40)}`);
  }
  assert.deepEqual(problems, []);
});

test('房間、熱點、物品、謎題標題、結局都有雙語名稱', () => {
  for (const r of Object.values(G.rooms)) assert.ok(r.name.zh && r.name.en);
  for (const h of G.hotspots) assert.ok(h.name.zh && h.name.en, h.id);
  for (const [id, p] of Object.entries(G.puzzles)) if (p.title) assert.ok(p.title.en && p.prompt.en, id);
  for (const e of Object.values(G.endings)) assert.ok(e.title.en && e.rank.en && e.text.en.length === e.text.zh.length);
  for (const c of Object.values(G.CONSTELLATIONS)) assert.ok(c.name.zh && c.name.en);
  assert.equal(G.intro.zh.length, G.intro.en.length);
});

test('英文熱點名稱彼此不重複（同一房間內），玩家才分得清', () => {
  for (const room of G.roomOrder) {
    const names = G.hotspots.filter(h => h.room === room).map(h => h.name.en);
    assert.equal(new Set(names).size, names.length, room);
  }
});

/* ---------- 介面文字（js/i18n.js） ---------- */
const fs = require('fs');
const path = require('path');
const I = require('../js/i18n.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('介面文字：每個項目都兩種語言齊全、英文裡沒有中文、兩種語言的 {變數} 相同', () => {
  const problems = [];
  const vars = s => JSON.stringify(String(s).match(/\{\w+\}/g) || []);
  for (const [key, t] of Object.entries(I.UI)) {
    if (!t || !t.zh || !t.en) { problems.push(`${key} 缺少語言`); continue; }
    const flat = v => (Array.isArray(v) ? v.flat(2).join('\n') : v);
    if (CJK.test(flat(t.en))) problems.push(`${key}.en 混有中文`);
    if (Array.isArray(t.zh) !== Array.isArray(t.en) || (Array.isArray(t.zh) && t.zh.length !== t.en.length)) problems.push(`${key} 兩種語言結構不同`);
    if (typeof t.zh === 'string' && vars(t.zh) !== vars(t.en)) problems.push(`${key} 的變數不一致：${vars(t.zh)} vs ${vars(t.en)}`);
  }
  assert.deepEqual(problems, []);
});

test('介面程式與 index.html 用到的介面文字都存在；字典裡也沒有用不到的項目', () => {
  const ui = read('js/ui.js'), html = read('index.html');
  const used = new Set();
  for (const m of ui.matchAll(/\b(?:T|tx|TL|TH)\('(\w+)'/g)) used.add(m[1]);
  for (const m of ui.matchAll(/I\.UI\.(\w+)/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n(?:-aria|-title)?="(\w+)"/g)) used.add(m[1]);
  const missing = [...used].filter(k => !(k in I.UI));
  assert.deepEqual(missing, [], '程式用到但字典裡沒有');
  // 反向：字典裡的每個項目都要在程式或頁面中出現（以字串形式，例如放在陣列裡的鍵）
  const unused = Object.keys(I.UI).filter(k => !ui.includes(`'${k}'`) && !ui.includes(`UI.${k}`) && !html.includes(`"${k}"`));
  // slot1–3 由 I.UI['slot' + id] 組出
  assert.deepEqual(unused.filter(k => !/^slot[123]$/.test(k)), [], '字典裡用不到的項目');
});

test('美術：英文模式下，所有場景與謎題圖裡都沒有中文；中文模式下圖中文字是中文', () => {
  const prev = global.self;
  global.self = { GAME_DATA: G };
  delete require.cache[require.resolve('../js/art.js')];
  require('../js/art.js');
  const Art = global.self.Art;
  global.self = prev;
  const all = Object.fromEntries(Object.keys({ greenhouseOpen: 1, phoneRinging: 1, trapdoorFound: 1, gateOpen: 1, clockSolved: 1, paintingMoved: 1, safeOpen: 1, lightOk: 1, waterOk: 1, wheelInstalled: 1, trapdoorOpen: 1, darkroomLit: 1, plateDeveloped: 1, inserted_emblem_sun: 1, eyepieceInstalled: 1, eyepieceFound: 1, starDialSolved: 1, bulbTaken: 1, moonTaken: 1, keyDug: 1, drawerOpen: 1 }).map(k => [k, true]));
  Object.assign(all, { storeroomOpen: true, atticOpen: true, cabinetOpen: true, photosSolved: true, photosTaken: true, crankInserted: true, musicSolved: true });
  // 大師：儲物間的鐵門（找到、打開）
  const states = [{}, all, Object.assign({}, all, { tunnelFound: true }), Object.assign({}, all, { tunnelFound: true, tunnelOpen: true })];
  const render = () => {
    const out = [];
    for (const mode of G.MODES) for (const flags of states) {
      for (const room of G.roomOrder) {
        const s = { room, flags, mode, puz: { dome: 'SE' }, inv: [] };
        out.push([`scene ${mode} ${room}`, Art.scene(room, { s, vis: () => true, label: id => G.hotspots.find(h => h.id === id).name[Art.lang] })]);
      }
    }
    for (const p of G.PHOTOS) out.push(['photo ' + p.id, Art.photoSvg(p) + Art.photoSvg(p, { back: true })]);
    out.push(['balance', Art.balanceSvg({ tin_moon: 'L', w2: 'L', w5: 'R' }) + Art.balanceSvg({})], ['musicbox', Art.musicBoxSvg(3)], ['signal', Art.signalSvg()]);
    out.push(['mirrors v', Art.mirrorsSvg(G.MIRROR_SOLUTION_V, { grid: G.MIRROR_GRID_V }) + Art.mirrorsSvg(G.MIRROR_GRID_V.initial, { grid: G.MIRROR_GRID_V, beam: false })]);
    for (const b of G.BOTTLES_V) out.push(['bottle ' + b.id, Art.bottleSvg(b) + Art.bottleSvg(b, { crust: true })]);
    out.push(['poster', Art.poster()], ['bookshelf', Art.bookshelf()], ['plate', Art.plate()]);
    for (const d of G.DIRECTIONS) out.push(['eyepiece ' + d.id, Art.eyepiece(d.id)]);
    for (const o of [{ digits: true }, { digits: false, stars: true }, { digits: true, stars: true }]) out.push(['grid', Art.gridSvg(o)]);
    for (const w of ['left', 'right', 'full']) for (const m of G.MODES) out.push([`note ${w} ${m}`, Art.note(w, m)]);
    out.push(['valves', Art.valvesSvg({ V1: true }, false)], ['mirrors', Art.mirrorsSvg(G.MIRROR_GRID.initial)], ['clock', Art.clockSvg(3, 15)], ['dial', Art.dialSvg(['key', 'boat', 'bird'])]);
    for (const id of Object.keys(G.items)) out.push(['icon ' + id, Art.icon(id)]);
    return out;
  };
  Art.setLang('en');
  const bad = render().filter(([, svg]) => CJK.test(svg) || /undefined|\[object Object\]|NaN/.test(svg)).map(([k, svg]) => `${k}: ${(svg.match(CJK) || svg.match(/undefined|\[object Object\]|NaN/))[0]}`);
  assert.deepEqual(bad, []);
  Art.setLang('zh');
  const zh = render();
  assert.ok(/書房/.test(zh.find(([k]) => k === 'scene novice foyer')[1]), '中文模式的門牌是中文');
  assert.ok(zh.every(([, svg]) => !/undefined|\[object Object\]|NaN/.test(svg)));
  // 每個物品都有圖示
  for (const id of Object.keys(G.items)) assert.ok(/<(path|rect|circle|polygon|g)\b/.test(Art.icon(id)), id + ' 沒有圖示');
});

test('美術：每個難度只畫出這個難度有的物件（例如新手的暗房沒有流程表，資深的暗房沒有第二張卡片）', () => {
  const prev = global.self;
  global.self = { GAME_DATA: G };
  delete require.cache[require.resolve('../js/art.js')];
  require('../js/art.js');
  const Art = global.self.Art;
  global.self = prev;
  const { create } = require('./helpers');
  const E = create(G);
  const flags = { trapdoorOpen: true, darkroomLit: true, storeroomOpen: true, greenhouseOpen: true, tunnelFound: true };
  for (const mode of G.MODES) {
    for (const room of ['darkroom', 'storeroom']) {
      const s = Object.assign(E.newState(mode), { room, flags });
      // 和介面一樣：熱點要符合難度、也要符合自己的可見條件
      const vis = id => { const h = E.hotspot(id); return h.room === room && G.modeOk(mode, h) && (!h.visible || !!h.visible(s)); };
      const svg = Art.scene(room, { s, vis, label: id => E.hotspot(id).name.zh });
      const drawn = [...svg.matchAll(/data-hs="(\w+)"/g)].map(m => m[1]).sort();
      const want = E.visibleHotspots(s).map(h => h.id).sort();
      assert.deepEqual(drawn, want, `${mode} ${room}`);
    }
  }
});
