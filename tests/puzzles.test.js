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
  const row = G.MOONSET.find(([d]) => d.zh === '三日');
  assert.ok(row && row[0].en === 'Oct 3');
  const [hh, mm] = row[1].split(':').map(Number);
  assert.deepEqual({ h: (hh + 1) % 12 || 12, m: mm }, G.CLOCK_ANSWER);
  assert.ok(G.docs.obs_log.body.zh.some(t => t.includes('十月三日') && t.includes('最後一次觀測') && t.includes('一小時')));
  assert.ok(G.docs.obs_log.body.en.some(t => t.includes('3 October') && t.includes('Last observation') && t.includes('one full hour')));
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
  assert.deepEqual(G.DIRECTIONS.find(d => d.id === G.COMET_DIRECTION).name, { zh: '東南', en: 'southeast' });
  // 「東南」在遊戲內至少有兩個來源：剪報與日記殘頁（一）——兩種語言都要
  for (const id of ['clipping', 'page1']) {
    assert.ok(G.docs[id].body.zh.join('').includes('東南'), id);
    assert.ok(/southeast/i.test(G.docs[id].body.en.join('')), id);
  }
  // 不考慮倒像直接照目鏡上下順序輸入會是錯的（倒像是必要的推理步驟）
  assert.notDeepEqual(G.SKY_FIELDS.SE.slice().reverse(), G.DIAL_ANSWER);
  // 每條連線都指向存在的星
  for (const c of Object.values(G.CONSTELLATIONS)) for (const [a, b] of c.lines) assert.ok(c.stars[a] && c.stars[b]);
});

test('目鏡畫面：八個方位的星都在視野內、不被地平線遮住，三個星群分屬上中下三個高度帶', () => {
  const prev = global.self;
  global.self = { GAME_DATA: G };
  delete require.cache[require.resolve('../js/art.js')];
  require('../js/art.js');
  const Art = global.self.Art;
  global.self = prev;
  for (const d of G.DIRECTIONS) {
    const stars = Art.eyepieceStars(d.id);
    assert.equal(stars.length, G.SKY_FIELDS[d.id].reduce((n, id) => n + G.CONSTELLATIONS[id].stars.length, 0));
    for (const st of stars) {
      assert.ok(Math.hypot(st.x - 200, st.y - 200) < 172, `${d.name}：星落在目鏡邊緣外`);
      assert.ok(st.realY + 7 < Art.EYE_GROUND_CLEAR, `${d.name}：星被地平線遮住`);
    }
    // 真實天空最高的（rank 0）倒像後在最下方；三個高度帶之間至少隔 30px，不會混在一起
    const band = r => { const ys = stars.filter(st => st.rank === r).map(st => st.y); return [Math.min(...ys), Math.max(...ys)]; };
    const [hi, mid, lo] = [band(0), band(1), band(2)];
    assert.ok(hi[0] - mid[1] >= 30 && mid[0] - lo[1] >= 30, `${d.name}：星群高度帶太接近`);
  }
});

for (const lang of ['zh', 'en']) {
  test(`撕開的便條（${lang}）：密碼與沖洗順序都橫跨撕口，單看任一半都讀不出來`, () => {
    const lines = G.NOTE_LINES[lang];
    assert.equal(lines.length, G.NOTE_LINES.zh.length, '兩種語言的行數相同');
    const left = lines.map(l => l[0]).join('\n');
    const right = lines.map(l => l[1]).join('\n');
    const full = lines.map(l => l[0] + l[1]).join('\n');
    assert.ok(full.includes(G.TRAPDOOR_CODE), '拼起來能讀到密碼');
    assert.ok(!left.includes(G.TRAPDOOR_CODE) && !right.includes(G.TRAPDOOR_CODE), '任一半都讀不到完整密碼');
    const order = G.NOTE_ORDER_TEXT[lang];
    assert.ok(full.includes(order), '拼起來能讀到完整沖洗順序');
    assert.ok(!left.includes(order) && !right.includes(order), '任一半都讀不到完整順序');
    // 每一半都只看得到順序的片段：左半缺結尾、右半缺開頭
    const words = lang === 'zh' ? ['停影', '定影'] : ['stop bath', 'fixer'];
    assert.ok(!left.includes(words[0]) || !left.includes(words[1]));
    assert.ok(!right.includes(lang === 'zh' ? '顯影→' : 'developer'));
  });
}

test('資深・撕開的便條：不寫出密碼，只說「那個冬夜的月和日」；日期在資深模式至少有兩個獨立來源', () => {
  for (const lang of ['zh', 'en']) {
    const v = G.NOTE_LINES_V[lang], n = G.NOTE_LINES[lang];
    assert.equal(v.length, n.length);
    const full = v.map(l => l[0] + l[1]).join('\n');
    assert.ok(!/\d{3,}/.test(full) && !full.includes('08'), `資深便條不應出現密碼數字（${lang}）`);
    assert.ok(lang === 'zh' ? /冬夜的月和日/.test(full) : /month and day of that winter night/.test(full));
    assert.ok(full.includes(G.NOTE_ORDER_TEXT[lang]), '沖洗順序照樣橫跨撕口、拼起來讀得到');
    // 只有密碼那一行不同
    v.forEach((l, i) => { if (i !== 2) assert.deepEqual(l, n[i]); });
  }
  // 日期 1999-12-08 的來源：日記一（抽屜）與窗邊的照片背面（抽屜，資深專屬）
  const page1 = G.docs.page1.body.zh.join(''), photo = G.PHOTOS.find(p => p.id === 'ph_e').back.zh;
  assert.ok(/12 月 8 日/.test(page1), '日記一寫著 12 月 8 日');
  assert.ok(/1999\.12\.8/.test(photo) && /彗星/.test(photo), '照片背面寫著 1999.12.8 爸爸的彗星');
  assert.equal(G.TRAPDOOR_CODE, '1208');
  assert.equal(G.noteLines('veteran'), G.NOTE_LINES_V);
  assert.equal(G.noteLines('novice'), G.NOTE_LINES);
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

test('被照抄的「7」：剪報的 −17、日記三的劃掉的 7、日記四提到紙套，三者一致（兩種語言）', () => {
  for (const lang of ['zh', 'en']) {
    assert.ok(G.docs.clipping.body[lang].join('').includes('−17'), lang);
    const p3 = G.docs.page3.body[lang].join('');
    assert.ok(p3.includes('−16') && p3.includes('−17'), lang);
  }
  assert.ok(G.docs.page3.body.zh.join('').includes('「7」') && G.docs.page3.body.en.join('').includes('"7"'));
  assert.ok(G.docs.page4.body.zh.join('').includes('紙套') && G.docs.page4.body.en.join('').includes('sleeve'));
  assert.ok(G.items.plate.desc.zh.includes('紙套') && G.items.plate.desc.en.includes('sleeve'));
  assert.ok(G.endings.B.text.zh.join('').includes('「7」') && G.endings.B.text.en.join('').includes('"7"'));
});

test('每一份線索文件與物品文件都存在且非空', () => {
  for (const [id, d] of Object.entries(G.docs)) {
    assert.ok(d.title && d.title.zh && d.title.en, id);
    assert.ok(d.view || (d.body.zh.length && d.body.zh.length === d.body.en.length), id + '：兩種語言的段落數應相同');
  }
  for (const [id, it] of Object.entries(G.items)) {
    assert.ok(it.name.zh && it.name.en && it.desc.zh && it.desc.en && it.kind, id);
    if (it.doc) assert.ok(G.docs[it.doc], id);
  }
});

function permute(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permute(arr.filter((_, j) => j !== i)).map(p => [x, ...p]));
}

/* ================= 資深模式 ================= */

test('資深・八盆證詞：周伯說「兩句為真」時答案唯一；不問周伯則無法確定', () => {
  const count = k => G.POTS_V.filter(p => p.truth(k)).length;
  const byCount = {};
  for (let k = 1; k <= 8; k++) (byCount[count(k)] = byCount[count(k)] || []).push(k);
  const answer = G.POTS_V.find(p => p.id === G.POT_ANSWER_V).n;
  assert.deepEqual(byCount[G.POT_TRUE_COUNT_V], [answer]);
  // 若不知道句數：至少還有兩種句數各自指向另一個盆，所以必須先問周伯
  const otherSingles = Object.entries(byCount).filter(([c, ks]) => +c !== G.POT_TRUE_COUNT_V && ks.length === 1);
  assert.ok(otherSingles.length >= 2, JSON.stringify(byCount));
  // 盆的編號 1～8 依序排列
  assert.deepEqual(G.POTS_V.map(p => p.n), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('資深・花盆木牌：事先寫明三次限制與排列方向；容易有兩種讀法的句子改成編號相差', () => {
  const sign = G.docs.pots_rule_v.body;
  // 介面在花盆旁顯示木牌的前三行：排列方向、只有周伯知道句數、挖錯三盆就失敗
  assert.ok(/排成一排/.test(sign.zh[0]) && /由左到右/.test(sign.zh[0]) && /single row/.test(sign.en[0]) && /left to right/.test(sign.en[0]));
  assert.ok(/挖錯三盆/.test(sign.zh[2]) && /three wrong pots/i.test(sign.en[2]));
  assert.equal(G.POT_MISS_LIMIT, 3);
  // 「至少隔著兩盆」可以讀成相差 2 或相差 3；改成直接比編號，兩種語言都一樣
  const thyme = G.POTS_V.find(p => p.id === 'thyme');
  assert.ok(/相差 3 以上/.test(thyme.says.zh) && /differs from mine by 3 or more/.test(thyme.says.en));
  for (let k = 1; k <= 8; k++) assert.equal(thyme.truth(k), Math.abs(k - 5) >= 3);
  // 每一句都不再出現「隔著」這種要數中間幾盆的說法
  assert.ok(G.POTS_V.every(p => !/隔著/.test(p.says.zh) && !/between/.test(p.says.en)));
});

test('資深・燈號：每個燈號只代表一個字；周伯的回覆解讀為「盆、真、2、句」，與花盆的真話句數一致', () => {
  const codes = Object.keys(G.SIGNAL_CODE);
  assert.equal(new Set(Object.values(G.SIGNAL_CODE)).size, codes.length);
  assert.ok(codes.every(c => /^[.-]+$/.test(c)));
  assert.deepEqual(G.ZHOU_REPLY.pot, ['pot', 'true', String(G.POT_TRUE_COUNT_V), 'sayings']);
  // 燈號卡上列出了回覆裡出現的每一個字與數字（兩種語言）
  for (const lang of ['zh', 'en']) {
    const card = G.docs.code_card.body[lang].join('\n');
    for (const w of [...G.ZHOU_REPLY.pot, ...G.ZHOU_REPLY.call, 'qing', 'ask']) assert.ok(card.includes(G.signalText([w])), `${lang}：卡片缺少 ${w}`);
    assert.ok(card.includes(lang === 'zh' ? '儲物間' : 'storeroom'), '卡片指出要從儲物間的窗打燈號');
  }
});

test('資深・十六面鏡子：65536 種組合中，照得到月光花的光路只有一條（經過 13 面鏡子，另 3 面是干擾）', () => {
  const g = G.MIRROR_GRID_V;
  assert.equal(g.mirrors.length, 16);
  const ids = g.mirrors.map(m => m.id);
  const hits = [];
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const cfg = {};
    ids.forEach((id, i) => { cfg[id] = (mask >> i) & 1 ? '\\' : '/'; });
    if (G.traceBeam(cfg, g).hit) hits.push(cfg);
  }
  const path = G.MIRROR_PATH_V;
  assert.equal(Object.keys(path).length, 13);
  assert.equal(hits.length, 2 ** (16 - 13), '干擾鏡怎麼擺都可以，其餘必須唯一');
  for (const cfg of hits) for (const id of Object.keys(path)) assert.equal(cfg[id], path[id]);
  assert.equal(G.traceBeam(g.initial, g).hit, false, '初始狀態照不到');
  const beam = G.traceBeam(G.MIRROR_SOLUTION_V, g).path;
  assert.ok(!beam.some(p => g.blocks.some(b => b.c === p.c && b.r === p.r)));
});

function permute(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permute(arr.filter((_, j) => j !== i)).map(p => [x, ...p]));
}

const CHEMS_V = ['developer', 'stop', 'fixer', 'water', 'toner', 'hypo'];
function bottleRuleHolds(r, P) {
  const caps = G.BOTTLES_V.map(b => b.id);
  const pos = ch => P.indexOf(ch);
  switch (r.k) {
    case 'end': return pos(r.a) === 0 || pos(r.a) === P.length - 1;
    case 'caps': return r.caps.includes(caps[pos(r.a)]);
    case 'notCaps': return !r.caps.includes(caps[pos(r.a)]);
    case 'adjacent': return Math.abs(pos(r.a) - pos(r.b)) === 1;
    case 'notAdjacent': return Math.abs(pos(r.a) - pos(r.b)) > 1;
    case 'immLeft': return pos(r.a) + 1 === pos(r.b);
    case 'leftOf': return pos(r.a) < pos(r.b);
    case 'gap': return Math.abs(pos(r.a) - pos(r.b)) === r.between + 1;
  }
  throw new Error(r.k);
}

test('資深・六瓶藥劑：720 種擺法中只有一種符合卡片的五條規則；少了任何一條，該用哪四瓶、怎麼倒就不再唯一', () => {
  assert.equal(G.BOTTLES_V.length, 6);
  const all = permute(CHEMS_V);
  assert.equal(all.length, 720);
  const fits = rules => all.filter(P => rules.every(r => bottleRuleHolds(r, P)));
  // 玩家真正要倒的：便條四步各用哪一瓶
  const answerOf = P => G.DEVELOP_SEQUENCE_V.map(c => G.BOTTLES_V[P.indexOf(c)].id).join();
  const sol = fits(G.BOTTLE_RULES_V);
  assert.equal(sol.length, 1);
  assert.deepEqual(sol[0], G.BOTTLES_V.map(b => b.content));
  G.BOTTLE_RULES_V.forEach((r, i) => {
    const rest = fits(G.BOTTLE_RULES_V.filter((_, j) => j !== i));
    assert.ok(new Set(rest.map(answerOf)).size > 1, `第 ${i + 1} 條規則是多餘的：少了它，答案仍然唯一`);
  });
  // 用不到的兩瓶也必須拿來推理：卡片上有規則提到它們
  for (const c of G.UNUSED_CHEMS_V) assert.ok(G.BOTTLE_RULES_V.some(r => r.a === c || r.b === c), `卡片沒有提到 ${c}`);
  assert.equal(G.docs.bottle_card_v.body.zh.length, 1 + G.BOTTLE_RULES_V.length);
});

test('資深・沖洗順序：只倒四步，就是便條上的順序；流程表寫明另外兩瓶用不到', () => {
  assert.deepEqual(G.DEVELOP_SEQUENCE_V, G.DEVELOP_SEQUENCE);
  assert.deepEqual(G.DEVELOP_SEQUENCE_V.concat(G.UNUSED_CHEMS_V).sort(), CHEMS_V.slice().sort(), '六瓶＝四種要用的＋兩種用不到的');
  assert.deepEqual(G.DEVELOP_ANSWER_V, G.DEVELOP_SEQUENCE_V.map(c => G.BOTTLES_V.find(b => b.content === c).id));
  assert.notDeepEqual(G.DEVELOP_ANSWER_V, G.DEVELOP_ANSWER, '資深模式的答案和新手不同');
  const chart = G.docs.process_chart.body;
  for (const c of G.UNUSED_CHEMS_V) {
    assert.ok(chart.zh.join('').includes(G.CHEM_NAMES[c].zh) && chart.en.join('').includes(G.CHEM_NAMES[c].en), `流程表沒有寫到 ${c}`);
  }
  assert.ok(/用不到/.test(chart.zh.join('')) && /won't need/.test(chart.en.join('')));
});

test('資深・天平：有了 5 兩紙鎮，三罐的重量才能唯一確定；密碼照園丁守則的順序', () => {
  // 觀察：天平兩邊任意擺放（每樣東西放左、放右或不放），記下每次的傾向。
  const truth = Object.fromEntries(G.TINS.map(t => [t.id, t.w]));
  function signature(w, things) {
    const out = [];
    const n = things.length;
    for (let m = 0; m < 3 ** n; m++) {
      let d = 0, x = m;
      for (const t of things) { const side = x % 3; x = Math.floor(x / 3); const wt = t.w != null && !t.id.startsWith('tin') ? t.w : w[t.id]; if (side === 1) d += wt; if (side === 2) d -= wt; }
      out.push(Math.sign(d));
    }
    return out.join('');
  }
  const consistent = things => {
    const want = signature(truth, things);
    let n = 0;
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
      if (signature({ tin_moon: a, tin_fern: b, tin_cactus: c }, things) === want) n++;
    }
    return n;
  };
  assert.equal(consistent(G.BALANCE_THINGS), 1, '有紙鎮：唯一');
  assert.ok(consistent(G.BALANCE_THINGS.filter(t => t.id !== 'w5')) > 1, '沒有紙鎮：無法確定');
  assert.equal(G.SEED_CODE, ['moon', 'fern', 'cactus'].map(b => G.TINS.find(t => t.bed === b).w).join(''));
  assert.deepEqual(Object.keys(G.BEDS), ['moon', 'fern', 'cactus']);
  for (const lang of ['zh', 'en']) assert.ok(G.docs.garden_rules.body[lang].join('').length > 0);
});

test('資深・相框：720 種掛法中，只有一種符合照片裡看得出的時間線索', () => {
  const P = Object.fromEntries(G.PHOTOS.map(p => [p.id, p]));
  const ok = order => {
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      const a = P[order[i]], b = P[order[j]];
      for (const k of ['dome', 'gh', 'pine']) if (a[k] != null && b[k] != null && a[k] > b[k]) return false;
      if (a.pine != null && b.pine != null && a.pine === b.pine) return false; // 松樹一直在長
      for (const k of ['age', 'year']) if (a[k] != null && b[k] != null && a[k] >= b[k]) return false;
    }
    return true;
  };
  const fits = permute(G.PHOTOS.map(p => p.id)).filter(ok);
  assert.deepEqual(fits, [G.PHOTO_ORDER]);
  // 背面寫的年紀與照片資料一致
  assert.ok(P.ph_b.back.zh.includes('七歲') && P.ph_e.back.zh.includes('九歲') && P.ph_e.back.en.includes('age 9'));
  assert.deepEqual([...G.PHOTOS_IN_BOX, 'ph_e'].sort(), G.PHOTOS.map(p => p.id).sort());
});

test('資深・音樂盒：晴的星星譜照星座的星數換成音齒號碼', () => {
  assert.deepEqual(G.MUSIC_ANSWER, G.MUSIC_SCORE.map(id => G.CONSTELLATIONS[id].stars.length));
  assert.ok(G.MUSIC_ANSWER.every(n => n >= 1 && n <= G.MUSIC_TINES));
  for (const lang of ['zh', 'en']) {
    const letter = G.docs.qing_letter.body[lang].join('\n');
    for (const id of G.MUSIC_SCORE) assert.ok(letter.includes(G.CONSTELLATIONS[id].name[lang]), id);
  }
});

/* ---------------- 大師模式 ---------------- */
test('大師・假卡片：牆上那張自成一套、也只有一種擺法，但倒出來的順序是錯的；兩個實物證據都能拆穿它', () => {
  const all = permute(CHEMS_V);
  const fits = rules => all.filter(P => rules.every(r => bottleRuleHolds(r, P)));
  const answerOf = P => G.DEVELOP_SEQUENCE_V.map(c => G.BOTTLES_V[P.indexOf(c)].id);
  // 假卡片看起來和真的一樣可信：規則彼此不矛盾、答案唯一
  const fake = fits(G.FAKE_BOTTLE_RULES);
  assert.equal(fake.length, 1, '假卡片也只有一種擺法');
  assert.deepEqual(answerOf(fake[0]), ['blue', 'yellow', 'red', 'white']);
  assert.notDeepEqual(answerOf(fake[0]), G.DEVELOP_ANSWER_V, '照假卡片倒是錯的');
  const real = fits(G.BOTTLE_RULES_V)[0];
  // 證據一：流程表說只有顯影液的瓶口會結晶；暗房裡結晶的是黑蓋瓶。真卡片的黑蓋是顯影液，假卡片不是
  const black = G.BOTTLES_V.findIndex(b => b.id === 'black');
  assert.equal(real[black], 'developer');
  assert.notEqual(fake[0][black], 'developer');
  const chart = G.docBody(G.docs.process_chart, 'master');
  assert.ok(chart.zh.join('').includes('褐色的結晶') && /brown crystals/.test(chart.en.join('')));
  assert.ok(!G.docBody(G.docs.process_chart, 'veteran').zh.join('').includes('結晶'), '結晶這條線索只在大師模式出現');
  // 證據二：假卡片寫在今年 10 月 17 日撕下的日曆紙上；周伯的日誌寫著陸觀 10 日就過世了，17 日韓嶽進過暗房
  assert.ok(G.HAN_VISIT_DAY > G.DEATH_DAY);
  for (const lang of ['zh', 'en']) {
    assert.ok(G.docs.bottle_card_fake.body[lang].join('').includes(String(G.HAN_VISIT_DAY)), lang);
    const log = G.docBody(G.docs.zhou_log, 'master')[lang].join('\n');
    assert.ok(log.includes(String(G.DEATH_DAY)) && log.includes(String(G.HAN_VISIT_DAY)), lang);
  }
  // 兩張卡片的開頭一模一樣（筆跡很像），只有規則不同
  assert.equal(G.docs.bottle_card_fake.body.zh[0], G.docs.bottle_card_v.body.zh[0]);
});

test('大師・音樂盒：旋律藏在星盤的答案裡（信裡不寫出星座名稱），由外到內每個兩下、再回到最高的那一個', () => {
  const n = id => G.CONSTELLATIONS[id].stars.length;
  assert.deepEqual(G.MUSIC_ANSWER_M, [...G.DIAL_ANSWER.flatMap(id => [n(id), n(id)]), n(G.DIAL_ANSWER[0])]);
  assert.notDeepEqual(G.MUSIC_ANSWER_M, G.MUSIC_ANSWER);
  assert.ok(G.MUSIC_ANSWER_M.every(x => x >= 1 && x <= G.MUSIC_TINES));
  for (const lang of ['zh', 'en']) {
    const letter = G.docBody(G.docs.qing_letter, 'master')[lang].join('\n');
    for (const id of Object.keys(G.CONSTELLATIONS)) assert.ok(!letter.includes(G.CONSTELLATIONS[id].name[lang]), `大師的信不應寫出星座名稱：${id}`);
  }
});

test('大師・老水道的鎖：「那顆彗星真正的位置」＝剪報的赤經＋改正後的赤緯；照抄剪報的 −17 是陷阱', () => {
  const ra = G.docs.clipping.body.en.join('').match(/right ascension (\d+)h (\d+)m/);
  assert.ok(ra, '剪報寫有赤經');
  assert.ok(G.docs.clipping.body.zh.join('').includes(`赤經 ${ra[1]} 時 ${ra[2]} 分`));
  // 剪報寫 −17；日記三與底片紙套都說 7 是誤寫，真的是 −16
  assert.equal(G.TUNNEL_TRAP, ra[1] + ra[2] + '17');
  assert.equal(G.TUNNEL_CODE, ra[1] + ra[2] + '16');
  for (const lang of ['zh', 'en']) assert.ok(G.docs.tunnel_lock.body[lang].join('').length > 0);
});

test('大師・門外有人：周伯的日誌交代了老水道；被截胡（H）是結局、三張廢片用完（G）是失敗', () => {
  const log = G.docBody(G.docs.zhou_log, 'master');
  assert.ok(log.zh.join('').includes('大門外') && log.zh.join('').includes('老水道'));
  assert.ok(/front door/.test(log.en.join('')) && /water channel/.test(log.en.join('')));
  assert.equal(G.endings.H.mode, 'master');
  assert.ok(!G.endings.H.fail, '被截胡是結局，不是失敗');
  assert.ok(G.endings.G.fail, '三張廢片用完是失敗');
});
