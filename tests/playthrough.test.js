'use strict';
// 以玩家身分逐一走完五個結局的關鍵路線。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, makeGame, mainPath, darkroomPath, vetMainPath, vetDarkroomPath, insertAll, txt } = require('./helpers');

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
  assert.ok(r.messages.some(m => /電話/.test(txt(m))), '帶著底片回到門廳時電話應該響起');
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
  assert.ok(!r.messages.some(m => /電話.*響/.test(txt(m))));
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

/* ================= 資深模式 ================= */
const vet = () => makeGame('veteran');

test('［資深］結局 A：七個房間的主線，只拿三枚徽章離開', () => {
  const P = vet();
  vetMainPath(P);
  P.go('foyer');
  insertAll(P);
  assert.equal(P.solve('exit', 'leave').ending, 'A');
});

test('［資深］結局 B：底片 + 四頁日記（音樂盒裡的一頁取代煙囪那一頁）', () => {
  const P = vet();
  vetMainPath(P);
  assert.ok(P.has('page2'), '日記二藏在音樂盒');
  vetDarkroomPath(P);
  assert.equal(G.countPages(P.s), 4);
  const r = P.go('foyer');
  assert.ok(r.messages.some(m => /電話/.test(txt(m))));
  P.solve('phone', 'refuse');
  insertAll(P);
  assert.equal(P.solve('exit', 'publish').ending, 'B');
});

test('［資深］結局 C：有底片但沒拿晾片繩上的日記四', () => {
  const P = vet();
  vetMainPath(P);
  vetDarkroomPath(P, { dryingLine: false });
  assert.equal(G.countPages(P.s), 3);
  P.go('foyer');
  insertAll(P);
  assert.equal(P.solve('exit', 'publish').ending, 'C');
});

test('［資深］結局 D、E', () => {
  const P = vet();
  vetMainPath(P);
  vetDarkroomPath(P);
  P.go('foyer');
  const before = P.E.clone(P.s);
  assert.equal(P.solve('phone', 'accept').ending, 'D');
  const Q = makeGame('veteran');
  Object.assign(Q.s, before);
  insertAll(Q);
  assert.equal(Q.solve('exit', 'leave_plate').ending, 'E');
});

test('［資深］答錯時只說「不對」，不說錯在哪；前置條件不足（沒有工具）的說明照樣保留', () => {
  const P = vet();
  P.look('f_coat'); P.go('study');
  const trap = P.E.submit(P.s, 'drawer', G.DRAWER_TRAP);
  assert.equal(trap.ok, true);
  assert.equal(trap.solved, false);
  assert.ok(!trap.messages.some(m => /位置/.test(txt(m))), '不點破「數成了位置」');
  assert.equal(P.s.stats.wrong, 1);
  // 新手模式同樣的錯誤會給出具體提示
  const N = makeGame();
  N.go('study');
  assert.ok(N.E.submit(N.s, 'drawer', G.DRAWER_TRAP).messages.some(m => /位置/.test(txt(m))));
  // 前置條件：沒鏟子挖花盆
  vetMainPathTo(P, 'greenhouse');
  const dig = P.E.submit(P.s, 'pots', 'rose');
  assert.ok(dig.messages.some(m => /工具/.test(txt(m))), '沒有工具的說明要保留');
});

// 只走到資深主線的某個房間（給上面的測試用）
function vetMainPathTo(P, room) {
  if (!P.has('flashlight_dead') && !P.has('flashlight')) P.look('f_coat');
  if (P.s.room !== 'study') P.go('study');
  P.solve('drawer', G.DRAWER_CODE);
  P.combine('flashlight_dead', 'battery');
  P.go('foyer');
  P.use('greenhouse_key', 'f_gh_door');
  P.go(room);
}

test('［資深］星盤順序錯、閥門錯、時鐘錯：都只得到不透露原因的回應', () => {
  const R = vet();
  vetMainPathTo(R, 'greenhouse');
  // 直接設定進度旗標，跳到能操作這三個機關的時候
  Object.assign(R.s.flags, { gateOpen: true, eyepieceInstalled: true, wheelInstalled: true });
  R.go('observatory');
  const dial = R.E.submit(R.s, 'dial', G.DIAL_ANSWER.slice().reverse());
  assert.ok(!dial.messages.some(m => /順序/.test(txt(m))), dial.messages.map(txt).join());
  R.go('greenhouse');
  const valves = R.E.submit(R.s, 'valves', { V1: true, V2: true, V3: true, V4: true, V5: true });
  assert.ok(!valves.messages.some(m => /仙人掌|月光花|蕨類/.test(txt(m))), valves.messages.map(txt).join());
  assert.equal(valves.messages.length, 1);
  R.go('foyer');
  const clock = R.E.submit(R.s, 'clock', { h: 2, m: 15 });
  assert.equal(clock.solved, false);
  assert.equal(R.s.stats.wrong, 3);
});

test('［資深］第一階段不開放提示；打開抽屜、修好手電筒後才開放', () => {
  const P = vet();
  assert.equal(P.E.hintsLocked(P.s), true);
  assert.deepEqual(P.E.hintList(P.s), []);
  assert.equal(P.E.revealHint(P.s, 'explore'), false);
  P.look('f_coat'); P.go('study'); P.look('s_drawer');
  P.solve('drawer', G.DRAWER_CODE);
  assert.equal(P.E.hintsLocked(P.s), true, '手電筒還沒修好，仍在第一階段');
  P.combine('flashlight_dead', 'battery');
  assert.equal(P.E.hintsLocked(P.s), false);
  assert.equal(P.E.stage(P.s).id, 'greenhouse');
  assert.ok(P.E.hintList(P.s).length > 0);
  // 新手模式從一開始就有提示
  const N = makeGame();
  assert.equal(N.E.hintsLocked(N.s), false);
  assert.ok(N.E.hintList(N.s).length > 0);
});

test('［資深］階段依序推進：抽屜 → 溫室 → 儲物間 → 閣樓 → 樓梯鐵門 → 三枚徽章 → 大門', () => {
  const P = vet();
  const seen = [P.E.stage(P.s).id];
  for (const k of ['look', 'use', 'combine', 'go', 'solve']) {
    const f = P[k];
    P[k] = (...a) => { const r = f(...a); const id = P.E.stage(P.s).id; if (seen[seen.length - 1] !== id) seen.push(id); return r; };
  }
  vetMainPath(P);
  P.go('foyer');
  insertAll(P);
  assert.deepEqual(seen, G.STAGES.veteran);
});

test('［新手］階段依序推進，且新手模式看不到資深模式的房間與物件', () => {
  const P = makeGame();
  const seen = [P.E.stage(P.s).id];
  for (const k of ['look', 'use', 'combine', 'go', 'solve']) {
    const f = P[k];
    P[k] = (...a) => { const r = f(...a); const id = P.E.stage(P.s).id; if (seen[seen.length - 1] !== id) seen.push(id); return r; };
  }
  mainPath(P);
  P.go('foyer');
  insertAll(P);
  assert.deepEqual(seen, G.STAGES.novice);
  assert.equal(P.s.mode, 'novice');
  assert.ok(!P.E.visibleHotspots(P.s).some(h => h.id === 'f_hatch'));
  assert.equal(P.E.roomShown(P.s, 'attic'), false);
  assert.equal(P.E.roomShown(P.s, 'storeroom'), false);
  assert.equal(P.E.move(P.s, 'attic').ok, false);
});

test('［資深］燈號：沒先呼叫「晴」，周伯不會回應；問「鑰」只會得到線索，問「盆」才會得到句數', () => {
  const P = vet();
  P.look('f_coat'); P.go('study'); P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  P.use('flashlight', 's_fireplace');
  P.go('foyer'); P.use('greenhouse_key', 'f_gh_door'); P.go('greenhouse');
  P.use('storeroom_key', 'g_storedoor'); P.go('storeroom');
  const early = P.E.submit(P.s, 'signal', ['---', '...']);
  assert.equal(early.solved, false);
  assert.ok(!P.s.flags.zhouReplied);
  assert.equal(P.solve('signal', ['.-.']).solved, true);
  const key = P.solve('signal', ['-.-', '...']);
  assert.ok(!P.s.flags.zhouReplied, '問鑰匙不會得到句數');
  assert.ok(key.messages.some(m => txt(m).includes(G.signalText(G.ZHOU_REPLY.key))));
  const wrongBefore = P.s.stats.wrong;
  const bad = P.E.submit(P.s, 'signal', ['.-', '.-']);
  assert.equal(bad.solved, false);
  assert.equal(P.s.stats.wrong, wrongBefore, '周伯看不懂只是溝通失敗，不算錯誤嘗試');
  const pot = P.solve('signal', ['---', '...']);
  assert.ok(P.s.flags.zhouReplied);
  assert.ok(pot.messages.some(m => txt(m).includes(G.signalText(G.ZHOU_REPLY.pot))));
  assert.ok(P.s.notes.includes('zhou_pot'));
  // 沒有手電筒不能打燈號
  P.s.inv = P.s.inv.filter(i => i !== 'flashlight');
  assert.equal(P.E.submit(P.s, 'signal', ['.-.']).ok, false);
});

test('［資深］反光鏡：調整角度本身不會解開；要拉開天窗，照錯算一次錯誤', () => {
  const P = vet();
  vetMainPathTo(P, 'greenhouse');
  P.solve('mirrors', G.MIRROR_SOLUTION_V);
  assert.ok(!P.s.flags.lightOk, '只調好角度還不算');
  const wrong = P.E.submit(P.s, 'skylight', G.MIRROR_GRID_V.initial);
  assert.equal(wrong.solved, false);
  assert.equal(P.s.stats.wrong, 1);
  assert.equal(P.solve('skylight', G.MIRROR_SOLUTION_V).solved, true);
  assert.ok(P.s.flags.lightOk);
});
