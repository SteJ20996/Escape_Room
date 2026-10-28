'use strict';
// 存檔系統：存檔碼來回、竄改偵測、壞掉或被改動的存檔都會被拒絕或修正，不會進入錯誤狀態。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, create, makeGame, mainPath } = require('./helpers');
const Store = require('../js/storage.js');

const E = create(G);
const load = st => { const s = E.normalize(JSON.parse(JSON.stringify(st))); return { s, errs: E.validate(s) }; };

test('存檔碼來回：中途進度匯出再匯入，邏輯狀態完全相同、可以繼續玩', () => {
  const P = makeGame();
  mainPath(P);
  const code = Store.encode(P.s);
  assert.match(code, /^STAR1\./);
  const back = Store.decode(code);
  assert.deepEqual(back, P.s);
  const { s, errs } = load(back);
  assert.deepEqual(errs, []);
  assert.equal(E.move(s, 'foyer').ok, true);
  for (const e of G.EMBLEMS) assert.equal(E.useItem(s, e, 'f_door').ok, true);
  assert.equal(E.submit(s, 'exit', 'leave').ending, 'A');
});

test('存檔碼含中文與空白換行也能正確解讀', () => {
  const s = E.newState();
  const code = Store.encode(s);
  const wrapped = code.replace(/(.{20})/g, '$1\n  ');
  assert.deepEqual(Store.decode(wrapped), s);
});

test('被竄改、截斷或不是本遊戲的存檔碼都會被拒絕，並給出可理解的原因', () => {
  const code = Store.encode(E.newState());
  const parts = code.split('.');
  assert.throws(() => Store.decode(code.slice(0, -2)), /校驗|損毀/);
  assert.throws(() => Store.decode(parts[0] + '.' + parts[1].slice(0, -4) + 'AAAA.' + parts[2]), /校驗|損毀/);
  assert.throws(() => Store.decode('hello world'), /不是/);
  assert.throws(() => Store.decode(''), /不是/);
  assert.throws(() => Store.decode('STAR1.!!!.abc'), /校驗|損毀/);
});

test('結構不合法的存檔會被拒絕', () => {
  const base = E.newState();
  const bad = [
    Object.assign(E.clone(base), { v: 99 }),
    Object.assign(E.clone(base), { room: 'attic' }),
    Object.assign(E.clone(base), { room: 'greenhouse' }),             // 溫室還沒解鎖
    Object.assign(E.clone(base), { inv: ['letter', 'excalibur'] }),
    Object.assign(E.clone(base), { inv: ['letter', 'letter'] }),
    Object.assign(E.clone(base), { notes: ['letter', 'secret'] }),
    Object.assign(E.clone(base), { flags: { diaryPages: 'page1page2' } }),
    Object.assign(E.clone(base), { flags: { diaryPages: ['page1', 'page9'] } }),
    Object.assign(E.clone(base), { ending: 'Z' }),
    null, 42, 'save',
  ];
  for (const st of bad) {
    const s = st && typeof st === 'object' ? E.normalize(E.clone(st)) : st;
    assert.ok(E.validate(s).length > 0, '應被拒絕：' + JSON.stringify(st));
  }
});

test('純顯示用欄位壞掉時會被修正，而不是讓畫面崩潰', () => {
  const st = E.newState();
  st.puz = { dome: 'UP', valves: 'open', mirrors: { A: 'x', B: '/' } };
  st.stats = { playMs: 'soon', wrong: -3 };
  st.hints = null;
  delete st.visited;
  const { s, errs } = load(st);
  assert.deepEqual(errs, []);
  assert.equal(s.puz.dome, 'N');
  assert.equal(s.puz.mirrors.A, G.MIRROR_GRID.initial.A);
  assert.equal(s.puz.mirrors.B, '/');
  assert.equal(typeof s.puz.valves.V1, 'boolean');
  assert.deepEqual(s.stats, { actions: 0, wrong: 0, hints: 0, playMs: 0 });
  assert.deepEqual(s.hints, {});
  assert.equal(E.interact(s, 'f_door').ok, true);
});

test('本機儲存不可用時退回記憶體，讀寫與結局圖鑑仍可運作', () => {
  // Node 環境沒有 localStorage，正好模擬私密視窗
  Store._reset();
  assert.equal(Store.persistent, false);
  assert.equal(Store.read('1'), null);
  Store.write('1', { state: E.newState(), savedAt: 'x', room: 'foyer', emblems: 0, pages: 0 });
  assert.equal(Store.read('1').state.room, 'foyer');
  Store.remove('1');
  assert.equal(Store.read('1'), null);
  assert.deepEqual(Store.addEnding('A'), ['A']);
  assert.deepEqual(Store.addEnding('A'), ['A']);
  assert.deepEqual(Store.addEnding('B'), ['A', 'B']);
});

test('難度跟著存檔走：資深模式的進度匯出再匯入仍是資深模式，可以繼續玩到結局', () => {
  const { vetMainPath } = require('./helpers');
  const P = makeGame('veteran');
  vetMainPath(P);
  const back = Store.decode(Store.encode(P.s));
  const { s, errs } = load(back);
  assert.deepEqual(errs, []);
  assert.equal(s.mode, 'veteran');
  assert.ok(E.visibleHotspots(Object.assign(E.clone(s), { room: 'foyer' })).some(h => h.id === 'f_hatch'));
  assert.equal(E.move(s, 'foyer').ok, true);
  for (const e of G.EMBLEMS) assert.equal(E.useItem(s, e, 'f_door').ok, true);
  assert.equal(E.submit(s, 'exit', 'leave').ending, 'A');
});

test('加入難度之前的舊存檔（沒有 mode 欄位）一律以新手模式讀取', () => {
  const old = E.newState();
  delete old.mode;
  delete old.puz.balance;
  const { s, errs } = load(old);
  assert.deepEqual(errs, []);
  assert.equal(s.mode, 'novice');
  assert.deepEqual(Object.keys(s.puz.mirrors).sort(), G.MIRROR_GRID.mirrors.map(m => m.id).sort());
});

test('不存在的難度、或新手存檔裡出現資深房間，都會被拒絕', () => {
  const a = Object.assign(E.newState(), { mode: 'nightmare' });
  assert.ok(E.validate(E.normalize(a)).length > 0);
  const b = Object.assign(E.newState('novice'), { room: 'storeroom' });
  b.flags.storeroomOpen = true;
  assert.ok(E.validate(E.normalize(b)).length > 0, '新手模式進不了儲物間');
  const c = E.newState('veteran');
  assert.equal(c.mode, 'veteran');
  assert.deepEqual(Object.keys(c.puz.mirrors).length, 16);
  assert.deepEqual(E.validate(c), []);
});

test('資深模式的花盆紀錄：挖錯一、兩盆可以存讀；失敗只能伴隨三盆；新手存檔不會有花盆紀錄', () => {
  const v = () => E.newState('veteran');
  const a = v(); a.flags.potsDug = ['mint', 'rose'];
  assert.deepEqual(load(a).errs, [], '挖錯兩盆的資深存檔是合法的');
  const bad = [
    Object.assign(v(), { flags: { potsDug: ['mint', 'rose', 'basil'] } }),        // 三盆卻沒有失敗
    Object.assign(v(), { ending: 'F' }),                                          // 失敗卻沒有挖錯紀錄
    Object.assign(v(), { flags: { potsDug: ['mint', 'mint'] } }),                // 重複
    Object.assign(v(), { flags: { potsDug: [G.POT_ANSWER_V] } }),                // 答案那一盆不可能「挖錯」
    Object.assign(v(), { flags: { potsDug: 'mint' } }),                           // 型別錯誤
    Object.assign(E.newState('novice'), { flags: { potsDug: ['mint'] } }),        // 新手沒有次數限制
  ];
  for (const st of bad) assert.ok(load(st).errs.length > 0, JSON.stringify(st.flags) + ' ' + st.ending);
  const f = Object.assign(v(), { ending: 'F', flags: { potsDug: ['mint', 'rose', 'basil'] } });
  assert.deepEqual(load(f).errs, []);
});

test('大師模式跟著存檔走：匯出再匯入仍是大師，可以接著打開老水道離開', () => {
  const { masterMainPath, masterTunnel } = require('./helpers');
  const P = makeGame('master');
  masterMainPath(P);
  const { s, errs } = load(Store.decode(Store.encode(P.s)));
  assert.deepEqual(errs, []);
  assert.equal(s.mode, 'master');
  const Q = makeGame('master');
  Object.assign(Q.s, s);
  masterTunnel(Q);
  assert.ok(Q.s.flags.tunnelOpen);
  assert.equal(Q.solve('escape', 'leave').ending, 'A');
});

test('大師模式的廢片紀錄：用掉一、兩張可以存讀；失敗（G）只能伴隨三張；其他難度不會有這項紀錄', () => {
  const m = () => E.newState('master');
  for (const n of [1, 2]) assert.deepEqual(load(Object.assign(m(), { flags: { devMisses: n } })).errs, [], `用掉 ${n} 張`);
  const bad = [
    Object.assign(m(), { flags: { devMisses: 3 } }),                       // 三張卻沒有失敗
    Object.assign(m(), { ending: 'G' }),                                   // 失敗卻沒有紀錄
    Object.assign(m(), { ending: 'G', flags: { devMisses: 2 } }),
    Object.assign(m(), { flags: { devMisses: 0 } }),
    Object.assign(m(), { flags: { devMisses: 1.5 } }),
    Object.assign(m(), { flags: { devMisses: '1' } }),
    Object.assign(E.newState('veteran'), { flags: { devMisses: 1 } }),     // 資深沒有廢片限制
    Object.assign(E.newState('veteran'), { ending: 'H' }),                 // 被截胡只發生在大師模式
  ];
  for (const st of bad) assert.ok(load(st).errs.length > 0, JSON.stringify(st.flags) + ' ' + st.ending);
  assert.deepEqual(load(Object.assign(m(), { ending: 'G', flags: { devMisses: 3 } })).errs, []);
  assert.deepEqual(load(Object.assign(m(), { ending: 'H' })).errs, []);
});

test('拿在手上：最多三份，第四份換掉最早的那份；再按一次就放下；讀檔時清掉不存在或重複的項目', () => {
  const s = E.newState('master');
  assert.deepEqual(s.hand, []);
  for (const id of ['letter', 'clipping', 'zhou_log']) assert.equal(E.toggleHand(s, id), true);
  assert.equal(E.toggleHand(s, 'note_full'), true);
  assert.deepEqual(s.hand, ['clipping', 'zhou_log', 'note_full']);
  assert.equal(E.toggleHand(s, 'zhou_log'), false);
  assert.deepEqual(s.hand, ['clipping', 'note_full']);
  assert.equal(E.toggleHand(s, 'no_such_doc'), false);
  assert.equal(E.toggleHand(s, 'plate'), false, '物品本身不能攤在手上（拼好的便條例外，顯示抄本）');
  assert.ok(G.holdable('poster') && G.holdable('bookshelf'), '圖像類的線索也能拿在手上');
  // 純顯示欄位：不影響驗證；舊存檔沒有這個欄位
  const old = E.newState();
  delete old.hand;
  assert.deepEqual(load(old).s.hand, []);
  const messy = Object.assign(E.newState(), { hand: ['letter', 'letter', 'ghost', 7, 'clipping', 'poster', 'calendar'] });
  const { s: fixed, errs } = load(messy);
  assert.deepEqual(errs, []);
  assert.deepEqual(fixed.hand, ['clipping', 'poster', 'calendar']);
  assert.deepEqual(load(Object.assign(E.newState(), { hand: 'letter' })).s.hand, []);
});

test('結局圖鑑分難度記錄：大師達成的結局同時記在總表與大師表', () => {
  Store.addEnding('H', 'master');
  Store.addEnding('B', 'master');
  Store.addEnding('B', 'veteran');
  assert.ok(Store.getEndings().includes('H'));
  assert.deepEqual(Store.getEndings('master').filter(x => x === 'H' || x === 'B').sort(), ['B', 'H']);
  assert.ok(!Store.getEndings('veteran').includes('H'));
});
