'use strict';
// 以玩家身分逐一走完五個結局的關鍵路線。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, makeGame, mainPath, darkroomPath, insertAll } = require('./helpers');

test('結局 A「破曉」：只拿三枚徽章離開', () => {
  const P = makeGame();
  mainPath(P);
  P.go('foyer');
  insertAll(P);
  assert.ok(G.allInserted(P.s));
  const r = P.look('f_door');
  assert.deepEqual(r.open, { view: 'exit' });
  assert.equal(P.solve('exit', 'leave').ending, 'A');
  assert.equal(P.s.ending, 'A');
});

test('結局 B「陸觀彗星」：底片 + 四頁日記 + 公開', () => {
  const P = makeGame();
  mainPath(P, { chimney: true });
  darkroomPath(P);
  // 把四頁日記裝訂成冊（組合機制）
  P.combine('page1', 'page2');
  P.combine('diary', 'page3');
  P.combine('page4', 'diary');
  assert.deepEqual(P.s.flags.diaryPages, ['page1', 'page2', 'page3', 'page4']);
  assert.equal(G.countPages(P.s), 4);
  const r = P.go('foyer');
  assert.ok(r.messages.some(m => /電話/.test(m.text)), '帶著底片回到門廳時電話應該響起');
  P.look('f_phone');
  P.solve('phone', 'refuse');
  insertAll(P);
  assert.equal(P.solve('exit', 'publish').ending, 'B');
});

test('結局 B 也接受未裝訂的散頁', () => {
  const P = makeGame();
  mainPath(P, { chimney: true });
  darkroomPath(P);
  P.go('foyer');
  insertAll(P);
  assert.equal(P.solve('exit', 'publish').ending, 'B');
});

test('結局 C「孤證」：有底片但日記不全', () => {
  const P = makeGame();
  mainPath(P); // 沒有搜煙囪
  darkroomPath(P);
  assert.equal(G.countPages(P.s), 3);
  P.go('foyer');
  insertAll(P);
  assert.equal(P.solve('exit', 'publish').ending, 'C');
});

test('結局 D「交易」：接受韓嶽的電話交易', () => {
  const P = makeGame();
  // 壞結局不需要徽章：拿到底片後就能觸發
  P.look('f_coat');
  P.go('study');
  P.solve('drawer', G.DRAWER_CODE);
  P.combine('flashlight_dead', 'battery');
  P.look('s_waste');
  P.go('foyer');
  P.use('greenhouse_key', 'f_gh_door');
  P.go('greenhouse');
  P.look('g_tools');
  P.solve('pots', 'rose');
  P.go('foyer');
  P.use('brass_key', 'f_gate');
  P.go('observatory');
  P.look('o_log');
  P.look('o_lamp');
  P.combine('note_left', 'note_right');
  P.go('greenhouse');
  P.use('flashlight', 'g_bench');
  P.solve('trapdoor', '1208');
  P.go('darkroom');
  P.use('red_bulb', 'd_socket');
  P.solve('develop', G.DEVELOP_ANSWER);
  P.go('foyer');
  assert.equal(P.s.flags.phoneRinging, true);
  assert.equal(P.solve('phone', 'accept').ending, 'D');
  assert.ok(!P.has('plate'));
});

test('結局 E「沉睡的星」：帶著底片卻選擇留下它', () => {
  const P = makeGame();
  mainPath(P);
  darkroomPath(P);
  P.go('foyer');
  insertAll(P);
  assert.equal(P.solve('exit', 'leave_plate').ending, 'E');
});

test('拒絕交易後仍可走到真結局；電話不會再響', () => {
  const P = makeGame();
  mainPath(P, { chimney: true });
  darkroomPath(P);
  P.go('foyer');
  P.solve('phone', 'refuse');
  P.go('study');
  const r = P.go('foyer');
  assert.ok(!r.messages.some(m => /電話.*響/.test(m.text)));
  assert.equal(P.E.submit(P.s, 'phone', 'accept').ok, false, '掛斷後不能再接受交易');
  insertAll(P);
  assert.equal(P.solve('exit', 'publish').ending, 'B');
});

test('結局後所有動作都被拒絕（不會出現結局後的錯誤狀態）', () => {
  const P = makeGame();
  mainPath(P);
  P.go('foyer');
  insertAll(P);
  P.solve('exit', 'leave');
  assert.equal(P.E.interact(P.s, 'f_door').ok, false);
  assert.equal(P.E.move(P.s, 'study').ok, false);
  assert.equal(P.E.submit(P.s, 'exit', 'leave').ok, false);
});
