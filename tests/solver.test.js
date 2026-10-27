'use strict';
// 窮舉所有可達狀態，證明：無死局、無取不到的物品、無解不開的謎題、謎題線索不循環依賴。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G } = require('./helpers');
const { E, explore, canReach, reachableWithout, inertActions, enter } = require('./solver');

const graph = explore();
const live = graph.states.map(s => !s.ending);

test('窮舉過程沒有任何例外或空白回應', () => {
  assert.ok(graph.states.length > 1000, `狀態數異常地少：${graph.states.length}`);
  assert.deepEqual(graph.errors.slice(0, 3), []);
});

test('五個結局全部可達', () => {
  const seen = new Set(graph.states.filter(s => s.ending).map(s => s.ending));
  assert.deepEqual([...seen].sort(), Object.keys(G.endings).sort());
});

test('無死局：任何尚未結束的狀態都還能走到真結局 B', () => {
  const okB = canReach(graph, s => s.ending === 'B');
  const stuck = graph.states.filter((s, i) => live[i] && !okB[i]);
  assert.equal(stuck.length, 0, '卡死的狀態範例：' + JSON.stringify(stuck[0] && { inv: stuck[0].inv, flags: stuck[0].flags }));
});

test('無死局：任何尚未結束的狀態都至少能走到某個結局', () => {
  const okAny = canReach(graph, s => !!s.ending);
  assert.ok(graph.states.every((s, i) => !live[i] || okAny[i]));
});

test('普通結局 A 在拿到底片前永遠可達（拿到底片後由 B/C/E 取代）', () => {
  const okA = canReach(graph, s => s.ending === 'A');
  const bad = graph.states.filter((s, i) => live[i] && !s.flags.plateDeveloped && !okA[i]);
  assert.equal(bad.length, 0);
});

test('每個物品都取得得到（日記另由裝訂測試涵蓋）', () => {
  const got = new Set();
  for (const s of graph.states) for (const it of s.inv) got.add(it);
  // 嵌入/安裝後就離開物品欄的東西，也算取得過
  const missing = Object.keys(G.items).filter(id => id !== 'diary' && !got.has(id));
  assert.deepEqual(missing, []);
});

test('每個熱點都會在某個狀態中出現', () => {
  const seen = new Set();
  for (const s of graph.states) {
    if (s.ending) continue;
    for (const room of G.roomOrder) {
      if (!E.canEnter(s, room)) continue;
      const c = E.clone(s); c.room = room;
      for (const h of E.visibleHotspots(c)) seen.add(h.id);
    }
  }
  assert.deepEqual(G.hotspots.map(h => h.id).filter(id => !seen.has(id)), []);
});

test('每個謎題都在某個狀態中被解開', () => {
  const solved = new Set();
  graph.edges.forEach(out => out.forEach(([, label]) => label && solved.add(label)));
  const expect = Object.keys(G.puzzles).filter(p => !G.puzzles[p].silent || p === 'mirrors');
  assert.deepEqual(expect.filter(p => !solved.has(p)), []);
});

// 公平性：解謎所需的線索，必須能在「不解開該謎題」的前提下取得（不能有循環依賴）
const CLUES = {
  drawer: { room: 'study', clue: () => true, why: '書架與便條都在書房' },
  pots: { room: 'greenhouse', clue: s => s.inv.includes('trowel'), why: '木牌、花盆證詞與小鏟子' },
  safe: { room: 'study', clue: s => s.inv.includes('overlay') || (s.inv.includes('grid_paper') && s.inv.includes('transparency')), why: '方格紙與星圖膠片' },
  clock: { room: 'foyer', clue: s => E.canEnter(s, 'observatory'), why: '觀測日誌與月落表（天文台）' },
  valves: { room: 'greenhouse', clue: s => !!s.flags.wheelInstalled, why: '園丁守則與已裝上的手輪' },
  mirrors: { room: 'greenhouse', clue: () => true, why: '光路即時可見' },
  dial: { room: 'observatory', clue: s => !!s.flags.eyepieceInstalled, why: '剪報/日記的「東南」、目鏡、倒像便條、星座圖' },
  trapdoor: { room: 'greenhouse', clue: s => s.inv.includes('note_full') || (s.inv.includes('note_left') && s.inv.includes('note_right')), why: '兩半便條' },
  develop: { room: 'darkroom', clue: s => s.inv.includes('note_full') || (s.inv.includes('note_left') && s.inv.includes('note_right')), why: '便條上的順序與藥瓶卡片' },
};
for (const [pid, c] of Object.entries(CLUES)) {
  test(`公平性：謎題「${pid}」的線索（${c.why}）不必先解開它就能取得`, () => {
    const reach = reachableWithout(graph, pid);
    const found = graph.states.some((s, i) => {
      if (!reach[i] || s.ending || !E.canEnter(s, c.room)) return false;
      const x = enter(s, c.room);
      return G.puzzles[pid].available(x) && c.clue(x);
    });
    assert.ok(found);
  });
}

test('被化簡掉的動作（無效用法、無效組合、錯誤答案、純顯示機關）不會改變邏輯狀態，也不會拋錯', () => {
  // 每 7 個狀態取 1 個（含所有結局前一刻的狀態），覆蓋各個進度階段
  const sample = { states: graph.states.filter((s, i) => i % 7 === 0 || G.allInserted(s)) };
  const { problems, tried } = inertActions(sample);
  assert.ok(tried > 10000, `嘗試次數過少：${tried}`);
  assert.deepEqual(problems.slice(0, 3), []);
});
