'use strict';
/*
 * 狀態空間窮舉器（測試玩家的「無死局」證明）
 *
 * 直接窮舉「每個物品 × 每個熱點 × 每個房間 × 每種順序」會有上千萬個狀態，因此採用三個有依據的化簡：
 *
 * 1. 不把「所在房間」當成狀態。房間之間可以自由往返（快速移動），唯一有副作用的是
 *    「帶著底片進入門廳時電話響起」，所以展開每個狀態時，都先「從書房走進」每個已解鎖的房間
 *    （書房沒有進入事件），進入事件因此如實發生。
 * 2. 「無害拾取」立即執行：只會增加物品或發現某物、不移除任何東西、與底片無關的動作
 *    （例如翻大衣口袋、拿起小鏟子）。這類動作隨時都能做、做了也不會關閉任何選項，
 *    所以任何狀態 X 都能走到「已做完所有無害拾取的 X」，只要後者都能通關，前者也能。
 * 3. 只嘗試「有專屬反應」的物品用法與「有配方」的組合；其餘用法、組合、錯誤答案
 *    由 inertActions() 另外窮舉驗證——它們只會印出訊息，絕不改變遊戲邏輯狀態。
 *    日記裝訂（純整理用）也另外以單元測試證明不會遺失頁面。
 */
const { G, create } = require('./helpers');

const E = create(G);
// 窮舉用的狀態複製：只複製影響邏輯的部分（物品、旗標、筆記）。
// 機關角度、統計、走過的房間不影響任何判定（canonical 也不含它們），所以直接共用，省下大量複製時間。
function fastClone(s) {
  const flags = { ...s.flags };
  if (Array.isArray(flags.diaryPages)) flags.diaryPages = flags.diaryPages.slice();
  return { ...s, inv: s.inv.slice(), flags, notes: s.notes.slice() };
}

function canonical(s) {
  // 邏輯狀態＝物品（不計順序）＋為真的旗標＋結局；房間、機關角度、統計都不算
  const keys = Object.keys(s.flags).filter(k => s.flags[k]).sort();
  let f = '';
  for (const k of keys) { const v = s.flags[k]; f += k + (v === true ? '' : '=' + (Array.isArray(v) ? v.join('+') : v)) + ','; }
  return s.inv.slice().sort().join(',') + '|' + f + '|' + (s.ending || '');
}

// 純顯示用的機關：只改變畫面上的角度或擺放，不影響遊戲邏輯
const COSMETIC_PUZZLES = new Set(['dome', 'valves_set', 'balance_set']);
const isCosmetic = (pid, mode) => COSMETIC_PUZZLES.has(pid) || (pid === 'mirrors' && mode === 'veteran'); // 資深模式的鏡子要拉開天窗才判定
const isPagey = id => G.PAGES.includes(id) || id === 'diary';

function correctAnswers(pid, mode = 'novice') {
  const vet = mode === 'veteran';
  switch (pid) {
    case 'drawer': return [G.DRAWER_CODE];
    case 'safe': return [G.SAFE_CODE];
    case 'trapdoor': return [G.TRAPDOOR_CODE];
    case 'pots': return [vet ? G.POT_ANSWER_V : G.POT_ANSWER];
    case 'clock': return [G.CLOCK_ANSWER];
    case 'valves': return [{ V1: false, V2: true, V3: false, V4: true, V5: true }];
    case 'mirrors': return [G.MIRROR_SOLUTIONS[0]];
    case 'skylight': return [G.MIRROR_SOLUTION_V];
    case 'dial': return [G.DIAL_ANSWER];
    case 'develop': return [vet ? G.DEVELOP_ANSWER_V : G.DEVELOP_ANSWER];
    case 'seedlock': return [G.SEED_CODE];
    case 'signal': return [['.-.'], ['---', '...']]; // 先呼叫，再問花盆
    case 'photos': return [G.PHOTO_ORDER];
    case 'musicbox': return [G.MUSIC_ANSWER];
    case 'phone': return ['accept', 'refuse'];
    case 'exit': return ['leave', 'publish', 'leave_plate'];
    default: return [];
  }
}
function wrongAnswers(pid, mode = 'novice') {
  switch (pid) {
    case 'drawer': return [G.DRAWER_TRAP, '0000', '', null, '37519'];
    case 'safe': return ['274', '000', 'abc'];
    case 'trapdoor': return ['0812', '9999'];
    case 'pots': return mode === 'veteran'
      ? G.POTS_V.map(p => p.id).filter(id => id !== G.POT_ANSWER_V).concat(['rose', 'nope'])
      : G.POTS.map(p => p.id).filter(id => id !== G.POT_ANSWER).concat(['nope']);
    case 'clock': return [{ h: 2, m: 15 }, { h: 15, m: 15 }, { h: 3, m: 0 }, null];
    case 'valves': return [{ V1: true, V2: true, V3: true, V4: true, V5: true }, {}, null];
    case 'mirrors': return mode === 'veteran'
      ? [G.MIRROR_GRID_V.initial, {}, null, G.MIRROR_SOLUTION_V, G.MIRROR_SOLUTIONS[0]] // 資深：只記錄角度，連正確角度也不會直接解開
      : [G.MIRROR_GRID.initial, {}, null];
    // 不含 null：null 代表「照目前擺好的鏡子拉開天窗」，若目前正好擺對就是正確答案
    case 'skylight': return [G.MIRROR_GRID_V.initial, {}, G.MIRROR_SOLUTIONS[0], { H: '/' }];
    case 'seedlock': return ['473', '000', '37', 'abcd'];
    case 'balance_set': return [{ tin_moon: 'L', w5: 'R' }, {}, null, { w5: 'L', tin_fern: 'R' }];
    case 'signal': return [['.-'], ['...'], ['-.-', '...'], ['.-.', '.-.'], ['......'], [], null, 'qing', ['x']];
    case 'photos': return [G.PHOTO_ORDER.slice().reverse(), G.PHOTO_ORDER.slice(0, 5), ['ph_a', 'ph_a', 'ph_b', 'ph_c', 'ph_d', 'ph_e'], null];
    case 'musicbox': return [G.MUSIC_ANSWER.slice().reverse(), [1, 2, 3], [0, 11], [], null];
    case 'dial': return [G.DIAL_ANSWER.slice().reverse(), ['lamp', 'lamp', 'lamp'], [], null];
    case 'develop': return mode === 'veteran'
      ? [G.DEVELOP_ANSWER_V.slice().reverse(), G.DEVELOP_ANSWER, ['purple'], null]   // 新手模式的答案在資深模式是錯的
      : [G.DEVELOP_ANSWER.slice().reverse(), ['red'], null, G.DEVELOP_ANSWER_V];
    case 'phone': return ['maybe', null];
    case 'exit': return ['fly', null];
    default: return [];
  }
}

// 無害拾取（room, 動作）
const PICKUPS_COMMON = [
  ['foyer', 'look', 'f_coat'], ['study', 'look', 's_desk'], ['study', 'look', 's_waste'],
  ['study', 'look', 's_painting'], ['greenhouse', 'look', 'g_tools'], ['observatory', 'look', 'o_cabinet'],
  ['observatory', 'look', 'o_lamp'], ['observatory', 'look', 'o_log'], ['greenhouse', 'look', 'g_moonflower'],
  ['greenhouse', 'use', 'g_bench', 'flashlight'], ['observatory', 'use', 'o_under', 'flashlight'],
  ['observatory', 'look', 'o_cabinet'],
  // 注意：日記殘頁（煙囪、晾片繩、音樂盒）「不」在此列——收齊四頁會讓「孤證」結局消失，
  // 它們會改變結局選項，因此必須當成一般動作窮舉。
];
const PICKUPS = {
  novice: PICKUPS_COMMON,
  veteran: PICKUPS_COMMON.concat([
    // 資深模式的煙囪裡是儲物間鑰匙（不是日記），只會增加物品
    ['study', 'use', 's_fireplace', 'flashlight'],
    ['attic', 'look', 'a_chest'], ['attic', 'look', 'a_photobox'],
    ['foyer', 'look', 'f_hatch'], ['greenhouse', 'look', 'g_storedoor'],
  ]),
};

function closure(s) {
  for (let changed = true; changed;) {
    changed = false;
    for (const [room, t, h, item] of PICKUPS[s.mode]) {
      if (!E.canEnter(s, room)) continue;
      // 無害拾取只會「增加」物品或旗標，所以比較數量就能知道有沒有變化
      const before = s.inv.length + Object.keys(s.flags).length;
      const keep = s.room;
      s.room = room;
      const hs = E.hotspot(h);
      if (hs && (!hs.visible || hs.visible(s)) && (t === 'look' || s.inv.includes(item))) {
        if (t === 'look') E.interact(s, h); else E.useItem(s, item, h);
      }
      s.room = keep;
      if (s.inv.length + Object.keys(s.flags).length !== before) changed = true;
    }
  }
  return s;
}

// 走進房間：先站到書房（沒有進入事件），再正常移動，讓進入事件如實觸發
function enter(s, room) {
  const c = fastClone(s);
  c.room = 'study';
  if (room !== 'study') E.move(c, room);
  return c;
}

function stateActions(s) {
  const acts = [];
  for (const h of E.visibleHotspots(s)) {
    acts.push({ t: 'look', h: h.id });
    if (h.use) for (const it of Object.keys(h.use)) if (s.inv.includes(it)) acts.push({ t: 'use', it, h: h.id });
  }
  for (let i = 0; i < s.inv.length; i++) {
    for (let j = i + 1; j < s.inv.length; j++) {
      const a = s.inv[i], b = s.inv[j];
      if (isPagey(a) && isPagey(b)) continue;
      if (E.findRecipe(a, b)) acts.push({ t: 'combine', a, b });
    }
  }
  for (const pid of Object.keys(G.puzzles)) {
    if (isCosmetic(pid, s.mode) || !G.puzzles[pid].available(s)) continue;
    for (const a of correctAnswers(pid, s.mode)) acts.push({ t: 'submit', p: pid, a });
  }
  return acts;
}

// 每則訊息都必須是 { zh, en }：兩種語言都有內容，且英文裡沒有任何中日韓文字或全形標點
const CJK = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
function textProblem(t) {
  if (!t || typeof t !== 'object') return '訊息不是雙語物件：' + JSON.stringify(t);
  if (typeof t.zh !== 'string' || !t.zh.trim()) return '缺少中文：' + JSON.stringify(t);
  if (typeof t.en !== 'string' || !t.en.trim()) return '缺少英文：' + JSON.stringify(t);
  if (CJK.test(t.en)) return '英文裡混有中文：' + t.en;
  return null;
}

function apply(s, a) {
  switch (a.t) {
    case 'look': return E.interact(s, a.h);
    case 'use': return E.useItem(s, a.it, a.h);
    case 'combine': return E.combine(s, a.a, a.b);
    case 'submit': return E.submit(s, a.p, a.a);
  }
  throw new Error('未知動作');
}

/**
 * @param {object} [opts]
 * @param {(a, s) => boolean} [opts.forbid] 不允許的動作（公平性檢查用）
 */
function explore(opts = {}) {
  const mode = opts.mode || 'novice';
  const index = new Map();
  const states = [];
  const edges = [];
  const errors = [];
  const add = s => {
    const k = canonical(s);
    if (index.has(k)) return index.get(k);
    index.set(k, states.length);
    states.push(s);
    edges.push([]);
    return states.length - 1;
  };
  // 無害拾取的閉包只取決於邏輯狀態，所以用「閉包之前」的狀態鍵快取結果
  const closed = new Map();
  const addClosed = s => {
    const pre = canonical(s);
    if (closed.has(pre)) return closed.get(pre);
    const j = add(closure(s));
    closed.set(pre, j);
    return j;
  };
  add(closure(E.newState(mode)));
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (s.ending) continue;
    for (const room of G.roomOrder) {
      if (!E.canEnter(s, room)) continue;
      const base = enter(s, room);
      const jb = addClosed(fastClone(base));
      if (jb !== i) edges[i].push([jb, null]);
      for (const a of stateActions(base)) {
        if (opts.forbid && opts.forbid(a, base)) continue;
        const n = fastClone(base);
        let r;
        try { r = apply(n, a); } catch (e) { errors.push({ state: canonical(s), room, action: a, error: e.stack }); continue; }
        const silent = a.t === 'submit' && G.puzzles[a.p].silent && !(a.p === 'mirrors' && mode === 'veteran');
        const responded = r.messages.length || r.open || r.ending || r.moved || silent;
        if (!responded) errors.push({ state: canonical(s), room, action: a, error: '沒有任何回應' });
        for (const m of r.messages) {
          const bad = textProblem(m.text);
          if (bad) errors.push({ state: canonical(s), room, action: a, error: bad, text: m.text });
        }
        const j = addClosed(n);
        // 邊上標記「解開了哪個謎題」，公平性檢查會用到
        if (j !== i) edges[i].push([j, a.t === 'submit' ? a.p : null]);
      }
    }
  }
  return { states, edges, errors };
}

/** 反向可達：哪些狀態能走到滿足 pred 的狀態 */
function canReach(graph, pred) {
  const { states, edges } = graph;
  const rev = states.map(() => []);
  edges.forEach((out, i) => out.forEach(([j]) => rev[j].push(i)));
  const ok = new Uint8Array(states.length);
  const queue = [];
  states.forEach((s, i) => { if (pred(s)) { ok[i] = 1; queue.push(i); } });
  while (queue.length) {
    const j = queue.pop();
    for (const i of rev[j]) if (!ok[i]) { ok[i] = 1; queue.push(i); }
  }
  return ok;
}

/**
 * 在每個可達狀態、每個可進入的房間，嘗試「所有」被化簡排除的動作：
 * 沒有專屬反應的物品用法、沒有配方的組合、錯誤答案、純顯示用的機關。
 * 回傳任何改變了邏輯狀態或拋出例外的動作。
 */
function inertActions(graph) {
  const problems = [];
  let tried = 0;
  for (const s of graph.states) {
    if (s.ending) continue;
    for (const room of G.roomOrder) {
      if (!E.canEnter(s, room)) continue;
      const base = enter(s, room);
      const key = canonical(base);
      const acts = [];
      for (const h of E.visibleHotspots(base)) {
        for (const it of base.inv) if (!(h.use && h.use[it])) acts.push({ t: 'use', it, h: h.id });
      }
      for (let i = 0; i < base.inv.length; i++) {
        for (let j = 0; j < base.inv.length; j++) {
          const a = base.inv[i], b = base.inv[j];
          if (i !== j && E.findRecipe(a, b)) continue;
          acts.push({ t: 'combine', a, b });
        }
      }
      for (const pid of Object.keys(G.puzzles)) {
        if (!G.puzzles[pid].available(base)) continue;
        for (const a of wrongAnswers(pid, base.mode)) acts.push({ t: 'submit', p: pid, a });
        if (pid === 'dome') for (const d of G.DIRECTIONS) acts.push({ t: 'submit', p: pid, a: d.id });
        if (pid === 'valves_set') acts.push({ t: 'submit', p: pid, a: { V1: true, V3: true } });
      }
      // 不存在或不可見的東西
      acts.push({ t: 'look', h: 'no_such_thing' }, { t: 'use', it: 'plate', h: 'f_door' }, { t: 'combine', a: 'letter', b: 'ghost' });
      for (const a of acts) {
        tried++;
        const n = E.clone(base); // 這裡用完整複製：錯誤答案不能透過共用的機關狀態影響下一個動作
        let r;
        try { r = apply(n, a); } catch (e) { problems.push({ room, action: a, error: e.message }); continue; }
        if (canonical(n) !== key) problems.push({ room, action: a, error: '改變了邏輯狀態', before: key, after: canonical(n) });
        for (const m of r.messages) { const bad = textProblem(m.text); if (bad) problems.push({ room, action: a, error: bad }); }
      }
    }
  }
  return { problems, tried };
}

/** 正向可達（可排除某些謎題的作答邊）：從起點出發、不解開 skip 謎題時能到達的狀態 */
function reachableWithout(graph, skip) {
  const seen = new Uint8Array(graph.states.length);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const i = stack.pop();
    for (const [j, label] of graph.edges[i]) {
      if (label === skip || seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

module.exports = { E, fastClone, explore, canReach, reachableWithout, canonical, closure, enter, inertActions, correctAnswers, wrongAnswers, textProblem, CJK };

if (require.main === module) {
  const t0 = Date.now();
  const g = explore({ mode: process.argv[2] || 'novice' });
  const live = g.states.filter(s => !s.ending).length, edges = g.edges.reduce((n, out) => n + out.length, 0);
  console.log(`可達狀態：${g.states.length}（未結束 ${live}），狀態轉移 ${edges} 條，耗時 ${Date.now() - t0} ms，錯誤 ${g.errors.length}`);
  const endings = {};
  for (const s of g.states) if (s.ending) endings[s.ending] = (endings[s.ending] || 0) + 1;
  console.log('結局狀態數：', endings);
  if (g.errors.length) console.log(g.errors.slice(0, 3));
}
