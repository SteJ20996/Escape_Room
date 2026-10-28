'use strict';
// 以玩家身分逐一走完五個結局的關鍵路線。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, makeGame, mainPath, darkroomPath, vetMainPath, vetDarkroomPath, masterMainPath, masterTunnel, insertAll, txt } = require('./helpers');

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
  P.look('s_shelf');
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
  P.look('d_shelf');
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
  P.look('f_coat'); P.go('study'); P.look('s_shelf');
  const trap = P.E.submit(P.s, 'drawer', G.DRAWER_TRAP);
  assert.equal(trap.ok, true);
  assert.equal(trap.solved, false);
  assert.ok(!trap.messages.some(m => /位置/.test(txt(m))), '不點破「數成了位置」');
  assert.equal(P.s.stats.wrong, 1);
  // 新手模式同樣的錯誤會給出具體提示
  const N = makeGame();
  N.go('study'); N.look('s_shelf');
  assert.ok(N.E.submit(N.s, 'drawer', G.DRAWER_TRAP).messages.some(m => /位置/.test(txt(m))));
  // 前置條件：還沒問到周伯就挖花盆——「還沒拿到線索」的說明照樣保留，不換成「不對」，也不算錯誤
  vetMainPathTo(P, 'greenhouse');
  const wrong = P.s.stats.wrong;
  const dig = P.E.submit(P.s, 'pots', 'rose');
  assert.ok(dig.messages.some(m => /周伯/.test(txt(m))), '缺線索的說明要保留');
  assert.equal(P.s.stats.wrong, wrong);
  // 新手：沒鏟子挖花盆，說明照樣保留
  N.go('foyer'); N.look('f_coat'); N.go('study'); N.solve('drawer', G.DRAWER_CODE); N.go('foyer'); N.use('greenhouse_key', 'f_gh_door'); N.look('f_gh_door');
  assert.ok(N.E.submit(N.s, 'pots', 'rose').messages.some(m => /工具/.test(txt(m))), '沒有工具的說明要保留');
});

// 只走到資深主線的某個房間（給上面的測試用）
function vetMainPathTo(P, room) {
  if (!P.has('flashlight_dead') && !P.has('flashlight')) P.look('f_coat');
  if (P.s.room !== 'study') P.go('study');
  P.look('s_shelf');
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
  Object.assign(R.s.flags, { gateOpen: true, eyepieceInstalled: true, wheelInstalled: true, posterRead: true, logBookmark: true, almanacRead: true });
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
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.look('s_drawer');
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
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  P.use('flashlight', 's_fireplace');
  P.go('foyer'); P.use('greenhouse_key', 'f_gh_door'); P.go('greenhouse');
  P.use('storeroom_key', 'g_storedoor'); P.go('storeroom');
  // 還沒拿到燈號卡：連正確的燈號（晴）都打不出去，也不算錯誤
  const noCard = P.E.submit(P.s, 'signal', ['.-.']);
  assert.equal(noCard.ok, false);
  assert.ok(!P.s.flags.zhouCalled && P.s.stats.wrong === 0);
  getCodeCard(P);
  P.go('storeroom');
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

// 從儲物間出發，照正規路線拿到閣樓玩具箱裡的燈號卡（紙鎮、園丁守則 → 種子櫃 → 鉤桿 → 閣樓）
function getCodeCard(P) {
  P.go('study'); P.look('s_desk');
  P.go('greenhouse'); P.look('g_rules');
  P.go('storeroom'); P.solve('seedlock', G.SEED_CODE);
  P.go('foyer'); P.use('hook_pole', 'f_hatch');
  P.go('attic'); P.look('a_chest');
}
// 資深：走到「問過周伯、站在花盆前」
function vetToPots() {
  const P = vet();
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  P.use('flashlight', 's_fireplace');
  P.go('foyer'); P.use('greenhouse_key', 'f_gh_door'); P.look('f_gh_door'); P.look('g_tools');
  P.use('storeroom_key', 'g_storedoor');
  getCodeCard(P);
  P.go('storeroom'); P.solve('signal', ['.-.']); P.solve('signal', ['---', '...']);
  P.go('greenhouse'); P.look('g_pots');
  return P;
}

test('［資深］花盆：挖錯一、兩盆仍可挖對；挖錯第三盆就失敗（F），之後所有動作都被拒絕', () => {
  const setup = vetToPots;
  const misses = P => (P.s.flags.potsDug || []).length;
  // 挖錯兩盆之後挖對：照常拿到鑰匙
  let P = setup();
  P.E.submit(P.s, 'pots', 'mint'); P.E.submit(P.s, 'pots', 'rose');
  assert.equal(misses(P), 2);
  const ok = P.solve('pots', G.POT_ANSWER_V);
  assert.ok(ok.solved && P.has('brass_key'));
  assert.deepEqual(P.E.validate(P.s), []);
  // 挖錯第三盆：失敗
  P = setup();
  const msgs = ['mint', 'rose', 'basil'].map(pot => P.E.submit(P.s, 'pots', pot));
  assert.ok(/還剩 2 次機會/.test(msgs[0].messages.map(txt).join()), '挖錯第一盆：還剩 2 次');
  assert.ok(/最後一次機會/.test(msgs[1].messages.map(txt).join()), '挖錯第二盆：最後一次');
  assert.equal(msgs[0].ending, null); assert.equal(msgs[1].ending, null);
  assert.equal(msgs[2].ending, 'F');
  assert.equal(P.s.ending, 'F');
  assert.ok(G.endings.F.fail && !G.ENDING_ORDER.includes('F'), '失敗不算五種結局之一');
  assert.deepEqual(P.E.validate(P.s), []);
  for (const r of [P.E.submit(P.s, 'pots', G.POT_ANSWER_V), P.E.interact(P.s, 'g_tools'), P.E.move(P.s, 'foyer')]) assert.equal(r.ok, false);
  // 同一盆再挖一次只是確認是空的，不算新的一盆，也不算錯誤嘗試
  P = setup();
  P.E.submit(P.s, 'pots', 'mint');
  const wrong = P.s.stats.wrong;
  for (let i = 0; i < 5; i++) assert.equal(P.E.submit(P.s, 'pots', 'mint').ending, null);
  assert.equal(misses(P), 1);
  assert.equal(P.s.stats.wrong, wrong);
  // 還沒問到周伯：挖哪一盆都不行——包括答案那一盆（背答案沒有用），也不扣機會
  const Q = vet();
  Q.look('f_coat'); Q.go('study'); Q.look('s_shelf'); Q.solve('drawer', G.DRAWER_CODE); Q.go('foyer'); Q.use('greenhouse_key', 'f_gh_door'); Q.look('f_gh_door'); Q.look('g_tools');
  for (const pot of ['mint', 'rose', 'basil', G.POT_ANSWER_V]) assert.equal(Q.E.submit(Q.s, 'pots', pot).ok, false);
  assert.equal(Q.s.flags.potsDug, undefined);
  assert.ok(!Q.has('brass_key') && Q.s.ending === null && Q.s.stats.wrong === 0);
});

test('［新手］花盆沒有次數限制，也不會失敗', () => {
  const P = makeGame('novice');
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.solve('drawer', G.DRAWER_CODE);
  P.go('foyer'); P.use('greenhouse_key', 'f_gh_door'); P.look('f_gh_door'); P.look('g_tools'); P.look('g_pots');
  for (const pot of ['mint', 'lavender', 'sage', 'mint']) assert.equal(P.E.submit(P.s, 'pots', pot).ending, null);
  assert.equal(P.s.flags.potsDug, undefined);
  assert.ok(P.solve('pots', G.POT_ANSWER).solved);
});

test('拿到線索才能作答：沒有線索時，正確答案也被拒絕（回應與答錯時一樣、不改變狀態、不算錯誤）；拿到線索後才有效', () => {
  const { create } = require('./helpers');
  const E = create(G);
  // [難度, 謎題, 所在房間, 讓謎題可以操作的進度, 補上線索, 正確答案, 用來比較的錯誤答案]
  const cases = [
    ['novice', 'drawer', 'study', {}, s => { s.flags.shelfRead = true; }, G.DRAWER_CODE, '0000'],
    ['novice', 'safe', 'study', { flags: { paintingMoved: true } }, s => { s.inv.push('overlay'); }, G.SAFE_CODE, '000'],
    ['novice', 'trapdoor', 'greenhouse', { flags: { greenhouseOpen: true, trapdoorFound: true } }, s => { s.inv.push('note_full'); }, G.TRAPDOOR_CODE, '0000'],
    ['veteran', 'trapdoor', 'greenhouse', { flags: { greenhouseOpen: true, trapdoorFound: true } }, s => { s.inv.push('note_left', 'note_right'); }, G.TRAPDOOR_CODE, '1210'],
    ['novice', 'clock', 'foyer', {}, s => { Object.assign(s.flags, { logBookmark: true, almanacRead: true }); }, G.CLOCK_ANSWER, { h: 2, m: 15 }],
    ['novice', 'dial', 'observatory', { flags: { gateOpen: true, eyepieceInstalled: true } }, s => { s.flags.posterRead = true; }, G.DIAL_ANSWER, G.DIAL_ANSWER.slice().reverse()],
    ['novice', 'develop', 'darkroom', { flags: { trapdoorOpen: true, darkroomLit: true } }, s => { s.inv.push('note_full'); s.flags.bottleCardRead = true; }, G.DEVELOP_ANSWER, G.DEVELOP_ANSWER.slice().reverse()],
    ['veteran', 'develop', 'darkroom', { flags: { trapdoorOpen: true, darkroomLit: true, bottleCardRead: true }, inv: ['note_full'] }, s => { s.flags.chartRead = true; }, G.DEVELOP_ANSWER_V, G.DEVELOP_ANSWER],
    ['veteran', 'pots', 'greenhouse', { flags: { greenhouseOpen: true }, inv: ['trowel'] }, s => { s.flags.zhouReplied = true; }, G.POT_ANSWER_V, 'mint'],
    ['veteran', 'seedlock', 'storeroom', { flags: { greenhouseOpen: true, storeroomOpen: true, rulesRead: true } }, s => { s.inv.push('paperweight'); }, G.SEED_CODE, '473'],
    ['veteran', 'signal', 'storeroom', { flags: { greenhouseOpen: true, storeroomOpen: true }, inv: ['flashlight'] }, s => { s.inv.push('code_card'); }, ['.-.'], ['---', '...']],
    ['veteran', 'musicbox', 'attic', { flags: { atticOpen: true, crankInserted: true }, inv: ['qing_letter'] }, s => { s.flags.posterRead = true; }, G.MUSIC_ANSWER, [1, 2, 3]],
    // 大師：音樂盒的旋律要先解開星盤；水道的鎖要讀過剪報；沒有線索時倒藥也不會用掉廢片（狀態不變）
    ['master', 'musicbox', 'attic', { flags: { atticOpen: true, crankInserted: true, posterRead: true }, inv: ['qing_letter'] }, s => { s.flags.starDialSolved = true; }, G.MUSIC_ANSWER_M, [1, 2, 3]],
    ['master', 'tunnel', 'storeroom', { flags: { greenhouseOpen: true, storeroomOpen: true, tunnelFound: true }, inv: ['page3'] }, s => { s.flags.clippingRead = true; }, G.TUNNEL_CODE, G.TUNNEL_TRAP],
    ['master', 'develop', 'darkroom', { flags: { trapdoorOpen: true, darkroomLit: true, bottleCardRead: true }, inv: ['note_full'] }, s => { s.flags.chartRead = true; }, G.DEVELOP_ANSWER_V, ['blue', 'yellow', 'red', 'white']],
  ];
  for (const [mode, pid, room, pre, addClue, right, wrongAns] of cases) {
    const tag = `${mode}/${pid}`;
    const s = E.newState(mode);
    Object.assign(s.flags, pre.flags || {});
    s.inv.push(...(pre.inv || []));
    s.room = room;
    assert.ok(G.puzzles[pid].available(s) && !G.puzzles[pid].clue(s), `${tag}：測試狀態應該「可以操作、但還沒有線索」`);
    const before = JSON.stringify([s.inv, s.flags]);
    const r1 = E.submit(s, pid, right), r2 = E.submit(s, pid, wrongAns);
    assert.equal(r1.ok, false, `${tag}：沒有線索時正確答案應被拒絕`);
    assert.deepEqual(r1.messages.map(txt), r2.messages.map(txt), `${tag}：答對與答錯的回應必須一樣，不能洩漏答案`);
    assert.ok(r1.messages.map(txt).join() === txt({ text: G.puzzles[pid].needClue }), tag);
    assert.equal(JSON.stringify([s.inv, s.flags]), before, `${tag}：狀態不應改變`);
    assert.equal(s.stats.wrong, 0, `${tag}：不算錯誤嘗試`);
    addClue(s);
    assert.ok(G.puzzles[pid].clue(s), tag);
    assert.equal(E.submit(s, pid, right).solved, true, `${tag}：拿到線索後正確答案有效`);
  }
  // 線索就畫在謎題上的（新手花盆、鏡子、閥門、相框）不設門檻
  for (const pid of ['mirrors', 'skylight', 'valves', 'photos']) assert.equal(G.puzzles[pid].clue, undefined, pid);
  assert.ok(G.puzzles.pots.clue(E.newState('novice')), '新手花盆的線索就是木牌本身');
});

/* ================= 大師模式 ================= */
const master = () => makeGame('master');
// 大師主線＋暗房：沖出底片、收齊四頁日記，回到門廳拒絕交易（停在嵌徽章之前）
function masterReady(P, opts) {
  masterMainPath(P);
  vetDarkroomPath(P, opts);
  P.go('foyer');
  P.solve('phone', 'refuse');
}

test('［大師］結局 B：大門外有人守著，從儲物間的老水道帶著底片和四頁日記離開', () => {
  const P = master();
  masterReady(P);
  assert.equal(G.countPages(P.s), 4);
  // 掛斷電話後，車子沒有開走；從信件口看得見
  assert.ok(P.log.some(l => /作答 phone/.test(l) && /車/.test(l)), '大師：掛斷後車子還在');
  assert.ok(/轎車/.test(P.look('f_mailslot').messages.map(txt).join()));
  // 嵌好最後一枚徽章時，屋子另一頭傳來鐵栓收回的聲音（橋）
  const last = G.EMBLEMS.map(e => P.use(e, 'f_door')).pop();
  assert.ok(last.messages.some(m => /鐵栓/.test(txt(m))));
  masterTunnel(P);
  assert.deepEqual(P.look('t_tunnel').open, { view: 'exit', via: 'tunnel' });
  assert.equal(P.solve('escape', 'publish').ending, 'B');
});

test('［大師］結局 H：沖出底片之後從大門走，不論帶著或留下底片，都會被韓嶽截胡', () => {
  const P = master();
  masterReady(P);
  insertAll(P);
  assert.deepEqual(P.look('f_door').open, { view: 'exit' });
  const before = P.E.clone(P.s);
  assert.equal(P.solve('exit', 'publish').ending, 'H');
  const Q = master();
  Object.assign(Q.s, P.E.clone(before));
  assert.equal(Q.solve('exit', 'leave_plate').ending, 'H');
  assert.ok(!Q.s.inv.includes('plate'));
  // 沒有底片時不能選「公開」；有底片時不能選「直接離開」
  const R = master();
  Object.assign(R.s, P.E.clone(before));
  assert.equal(R.E.submit(R.s, 'exit', 'leave').ending, null);
});

test('［大師］結局 A：沒有底片時，從大門或水道離開都是 A（韓嶽只要底片）', () => {
  const P = master();
  masterMainPath(P);
  P.go('foyer');
  insertAll(P);
  const before = P.E.clone(P.s);
  assert.equal(P.solve('exit', 'leave').ending, 'A');
  const Q = master();
  Object.assign(Q.s, before);
  masterTunnel(Q);
  assert.equal(Q.solve('escape', 'leave').ending, 'A');
});

test('［大師］結局 C、D、E：日記不全從水道公開是 C；接受交易是 D；從水道離開但留下底片是 E', () => {
  const P = master();
  masterMainPath(P);
  vetDarkroomPath(P, { dryingLine: false });
  P.go('foyer');
  const beforePhone = P.E.clone(P.s);
  P.solve('phone', 'refuse');
  masterTunnel(P);
  const atGate = P.E.clone(P.s);
  assert.equal(P.solve('escape', 'publish').ending, 'C');
  const Q = master();
  Object.assign(Q.s, atGate);
  assert.equal(Q.solve('escape', 'leave_plate').ending, 'E');
  const R = master();
  Object.assign(R.s, beforePhone);
  assert.equal(R.solve('phone', 'accept').ending, 'D');
});

test('［大師］沖洗只有三張廢片：倒錯會倒數；第三張試壞就失敗（G），之後所有動作都被拒絕', () => {
  const P = master();
  masterMainPath(P);
  const real = P.solve;
  // 走到暗房、讀過線索，但先不沖洗
  P.solve = (pz, ans) => (pz === 'develop' ? { ok: true, messages: [] } : real(pz, ans));
  vetDarkroomPath(P);
  P.solve = real;
  assert.equal(P.s.room, 'darkroom');
  const fake = ['blue', 'yellow', 'red', 'white'];
  // 不完整的輸入不算一次嘗試
  assert.equal(P.E.submit(P.s, 'develop', ['black', 'red']).ok, false);
  assert.equal(P.s.flags.devMisses, undefined);
  const r1 = P.solve('develop', fake);
  assert.equal(P.s.flags.devMisses, 1);
  assert.ok(r1.messages.some(m => /還剩 2 張/.test(txt(m))), '剩下幾張要說出來（資深以上答錯只說「不對」時也保留）');
  const r2 = P.solve('develop', G.DEVELOP_ANSWER);
  assert.ok(r2.messages.some(m => /最後一張/.test(txt(m))));
  const before = P.E.clone(P.s);
  const r3 = P.solve('develop', fake);
  assert.equal(r3.ending, 'G');
  assert.equal(P.s.stats.wrong, 3);
  assert.ok(G.endings.G.fail);
  assert.equal(P.E.interact(P.s, 'd_tray').ok, false);
  // 用掉兩張之後倒對，照樣沖得出底片
  const Q = master();
  Object.assign(Q.s, before);
  assert.equal(Q.solve('develop', G.DEVELOP_ANSWER_V).solved, true);
  assert.ok(Q.has('plate'));
});

test('［大師］老水道：徽章歸位前架子推不動；歸位後才找得到鐵門；照抄剪報的 −17 打不開', () => {
  const P = master();
  masterMainPath(P);
  P.go('storeroom');
  const shelf = P.look('t_shelf');
  assert.ok(/推不動/.test(shelf.messages.map(txt).join()));
  assert.ok(!P.E.visibleHotspots(P.s).some(h => h.id === 't_tunnel'));
  P.go('foyer');
  insertAll(P);
  P.go('storeroom');
  P.look('t_shelf');
  assert.ok(P.s.flags.tunnelFound);
  P.look('t_tunnel');
  // 還沒讀剪報：連正確密碼也打不開（不透露答案）
  const noClue = P.E.submit(P.s, 'tunnel', G.TUNNEL_CODE);
  assert.equal(noClue.ok, false);
  P.go('study'); P.look('s_clipping'); P.go('storeroom');
  const trap = P.solve('tunnel', G.TUNNEL_TRAP);
  assert.equal(trap.solved, false);
  assert.ok(!P.s.flags.tunnelOpen);
  assert.equal(P.solve('tunnel', G.TUNNEL_CODE).solved, true);
  assert.ok(P.s.flags.tunnelOpen);
});

test('［大師］音樂盒：資深的旋律在大師模式是錯的；要用星盤的答案', () => {
  const P = master();
  let tried = null;
  const real = P.solve;
  P.solve = (pz, ans) => {
    if (pz === 'musicbox') { tried = P.E.submit(P.s, 'musicbox', G.MUSIC_ANSWER); return real(pz, G.MUSIC_ANSWER_M); }
    return real(pz, ans);
  };
  vetMainPath(P);
  assert.equal(tried.solved, false);
  assert.ok(P.s.flags.musicSolved);
});

test('［大師］階段依序推進，最後多一個「另一條路」；資深模式沒有這些東西', () => {
  const P = master();
  const seen = [P.E.stage(P.s).id];
  for (const k of ['look', 'use', 'combine', 'go', 'solve']) {
    const f = P[k];
    P[k] = (...a) => { const r = f(...a); const id = P.E.stage(P.s).id; if (seen[seen.length - 1] !== id) seen.push(id); return r; };
  }
  masterMainPath(P);
  masterTunnel(P);
  assert.deepEqual(seen, G.STAGES.master);
  // 資深：同樣的地方沒有鐵門、沒有第二張卡片，大門照常可以走
  const V = makeGame('veteran');
  vetMainPath(V);
  vetDarkroomPath(V);
  V.go('foyer'); V.solve('phone', 'refuse'); insertAll(V);
  V.go('storeroom'); V.look('t_shelf');
  assert.ok(!V.s.flags.tunnelFound && !V.s.flags.draftNoticed);
  V.go('darkroom');
  assert.ok(!V.E.visibleHotspots(V.s).some(h => h.id === 'd_card2'));
  V.go('foyer');
  assert.equal(V.solve('exit', 'publish').ending, 'B');
});
