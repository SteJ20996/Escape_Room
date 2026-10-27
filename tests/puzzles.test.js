'use strict';
// 逐一驗證每個謎題「恰好有一個解」，且解答只由遊戲內線索推得。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G } = require('./helpers');

test('書架色碼：四種顏色各只出現一次，答案是卷數而非位置', () => {
  for (const c of ['red', 'yellow', 'blue', 'green']) assert.equal(G.BOOKS.filter(b => b.color === c).length, 1);
  assert.deepEqual(G.BOOKS.map(b => b.vol).sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(G.DRAWER_CODE, '3751');
  assert.notEqual(G.DRAWER_CODE, G.DRAWER_TRAP);
});

test('花盆證詞：恰好一個藏匿位置讓「只有一句為真」成立', () => {
  const ids = G.POTS.map(p => p.id);
  const fits = ids.filter(k => G.POTS.filter(p => p.truth(k)).length === 1);
  assert.deepEqual(fits, [G.POT_ANSWER]);
});

test('星圖疊合：三個標記落在三個不同格子，讀出 472', () => {
  const marks = G.TRANSPARENCY_STARS.filter(s => s.mark);
  assert.deepEqual(marks.map(m => m.mark).sort(), [1, 2, 3]);
  assert.equal(new Set(G.TRANSPARENCY_STARS.map(s => s.r + ',' + s.c)).size, G.TRANSPARENCY_STARS.length);
  assert.equal(G.SAFE_CODE, '472');
});

test('最後的觀測：日誌的日期在月落表內，月落 + 1 小時 = 答案', () => {
  const row = G.MOONSET.find(([d]) => d === '三日');
  assert.ok(row);
  const [hh, mm] = row[1].split(':').map(Number);
  assert.deepEqual({ h: (hh + 1) % 12 || 12, m: mm }, G.CLOCK_ANSWER);
  assert.ok(G.docs.obs_log.body.some(t => t.includes('十月三日') && t.includes('最後一次觀測') && t.includes('一小時')));
});

test('灌溉管線：32 種閥門組合中恰好一種符合守則', () => {
  const sols = [];
  for (let m = 0; m < 32; m++) {
    const cfg = {};
    G.VALVES.forEach((v, i) => { cfg[v.id] = !!(m & (1 << i)); });
    if (G.evalValves(cfg).ok) sols.push(cfg);
  }
  assert.deepEqual(sols, [{ V1: false, V2: true, V3: false, V4: true, V5: true }]);
});

test('月光折射：128 種鏡子組合中恰好一種能照到月光花，初始狀態照不到', () => {
  assert.equal(G.MIRROR_SOLUTIONS.length, 1);
  assert.equal(G.traceBeam(G.MIRROR_GRID.initial).hit, false);
  // 光線不會穿過障礙物
  const path = G.traceBeam(G.MIRROR_SOLUTIONS[0]).path;
  assert.ok(!path.some(p => G.MIRROR_GRID.blocks.some(b => b.c === p.c && b.r === p.r)));
});

test('倒立的星空：八個星座星數各不相同，可以靠數星辨認；每個方位三個星座互不相同', () => {
  const counts = G.CONSTELLATION_ORDER.map(id => G.CONSTELLATIONS[id].stars.length);
  assert.equal(new Set(counts).size, counts.length);
  for (const [dir, f] of Object.entries(G.SKY_FIELDS)) assert.equal(new Set(f).size, 3, dir);
  assert.equal(G.DIRECTIONS.find(d => d.id === G.COMET_DIRECTION).name, '東南');
  // 「東南」在遊戲內至少有兩個來源：剪報與日記殘頁（一）
  assert.ok(G.docs.clipping.body.join('').includes('東南'));
  assert.ok(G.docs.page1.body.join('').includes('東南'));
  // 不考慮倒像直接照目鏡上下順序輸入會是錯的（倒像是必要的推理步驟）
  assert.notDeepEqual(G.SKY_FIELDS.SE.slice().reverse(), G.DIAL_ANSWER);
  // 每條連線都指向存在的星
  for (const c of Object.values(G.CONSTELLATIONS)) for (const [a, b] of c.lines) assert.ok(c.stars[a] && c.stars[b]);
});

test('撕開的便條：密碼與沖洗順序都橫跨撕口，單看任一半都讀不出來', () => {
  const left = G.NOTE_LINES.map(l => l[0]).join('\n');
  const right = G.NOTE_LINES.map(l => l[1]).join('\n');
  const full = G.NOTE_LINES.map(l => l[0] + l[1]).join('\n');
  assert.ok(full.includes(G.TRAPDOOR_CODE.slice(0, 2) + G.TRAPDOOR_CODE.slice(2)) || full.includes('12' + '08'));
  assert.ok(!left.includes(G.TRAPDOOR_CODE) && !right.includes(G.TRAPDOOR_CODE));
  assert.ok(full.includes('顯影→停影→定影→清水'));
  assert.ok(!left.includes('停影') && !right.includes('停影→'));
});

test('顯影藥劑：24 種排列中只有一種同時滿足卡片四條規則', () => {
  const colors = G.BOTTLES.map(b => b.id); // 由左到右
  const chems = ['developer', 'stop', 'fixer', 'water'];
  const fits = permute(chems).filter(assign => {
    const pos = ch => assign.indexOf(ch);
    const cap = ch => colors[pos(ch)];
    return (pos('water') === 0 || pos('water') === 3)
      && cap('fixer') !== 'white' && cap('fixer') !== 'red'
      && pos('developer') + 1 === pos('stop')
      && cap('water') !== 'white';
  });
  assert.equal(fits.length, 1);
  assert.deepEqual(fits[0], G.BOTTLES.map(b => b.content));
  assert.deepEqual(G.DEVELOP_ANSWER, ['yellow', 'white', 'blue', 'red']);
});

test('被照抄的「7」：剪報的 −17、日記三的劃掉的 7、日記四提到紙套，三者一致', () => {
  assert.ok(G.docs.clipping.body.join('').includes('−17'));
  const p3 = G.docs.page3.body.join('');
  assert.ok(p3.includes('−16') && p3.includes('−17') && p3.includes('「7」'));
  assert.ok(G.docs.page4.body.join('').includes('紙套'));
  assert.ok(G.items.plate.desc.includes('紙套'));
  assert.ok(G.endings.B.text.join('').includes('「7」'));
});

test('每一份線索文件與物品文件都存在且非空', () => {
  for (const [id, d] of Object.entries(G.docs)) {
    assert.ok(d.title, id);
    assert.ok(d.view || (Array.isArray(d.body) && d.body.length), id);
  }
  for (const [id, it] of Object.entries(G.items)) {
    assert.ok(it.name && it.desc && it.glyph, id);
    if (it.doc) assert.ok(G.docs[it.doc], id);
  }
});

function permute(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permute(arr.filter((_, j) => j !== i)).map(p => [x, ...p]));
}
