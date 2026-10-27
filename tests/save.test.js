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
