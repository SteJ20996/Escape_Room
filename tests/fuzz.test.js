'use strict';
/*
 * 不化簡的隨機遊走：在「完整」動作空間（所有物品 × 所有熱點、所有物品兩兩組合、所有房間、
 * 所有謎題的對錯答案、日記裝訂、純顯示機關）裡亂走，然後交給「通關者」從當下狀態一路打到真結局。
 * 這是對窮舉化簡的獨立交叉驗證：亂走到任何地方，都不應該卡住。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, create, VALVE_SOLUTION } = require('./helpers');

const E = create(G);

// 可重現的亂數
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

function allActions(s) {
  const vet = G.isAdv(s.mode), master = s.mode === 'master';
  const acts = [];
  for (const h of E.visibleHotspots(s)) {
    acts.push(() => E.interact(s, h.id));
    for (const it of s.inv) acts.push(() => E.useItem(s, it, h.id));
  }
  for (const a of s.inv) for (const b of s.inv) acts.push(() => E.combine(s, a, b));
  for (const r of G.roomOrder) acts.push(() => E.move(s, r));
  const answers = {
    drawer: [G.DRAWER_CODE, G.DRAWER_TRAP, '1234'], safe: [G.SAFE_CODE, '999'], trapdoor: [G.TRAPDOOR_CODE, '0000'],
    // 資深模式挖錯第三盆會直接失敗（另有測試）；亂走時挖錯兩盆之後只會挖對的那一盆，好讓亂走繼續下去
    pots: vet && (s.flags.potsDug || []).length >= G.POT_MISS_LIMIT - 1 ? [G.variant(s).potAnswer] : G.variant(s).pots.map(p => p.id),
    clock: [G.CLOCK_ANSWER, { h: 2, m: 15 }],
    valves: [VALVE_SOLUTION, { V1: true }], valves_set: [{ V2: true }, {}],
    mirrors: vet ? [G.MIRROR_SOLUTION_V, G.MIRROR_GRID_V.initial] : [G.MIRROR_SOLUTIONS[0], G.MIRROR_GRID.initial, { A: '\\' }],
    skylight: [G.MIRROR_SOLUTION_V, G.MIRROR_GRID_V.initial, null],
    dome: G.DIRECTIONS.map(d => d.id), dial: [G.DIAL_ANSWER, G.DIAL_ANSWER.slice().reverse()],
    // 大師模式第三張廢片試壞就失敗（另有測試）；用掉兩張之後只會倒對的順序。假卡片的順序也在亂走範圍內
    develop: master && (s.flags.devMisses || 0) >= G.DEV_MISS_LIMIT - 1 ? [G.DEVELOP_ANSWER_V]
      : vet ? [G.DEVELOP_ANSWER_V, G.DEVELOP_ANSWER, ['blue', 'yellow', 'red', 'white'], ['black', 'red']] : [G.DEVELOP_ANSWER, ['red', 'blue', 'yellow', 'white']],
    seedlock: [G.SEED_CODE, '473'], balance_set: [{ tin_moon: 'L', w2: 'L', w5: 'R' }, {}],
    signal: [['.-.'], ['---', '...'], ['-.-', '...'], ['.-'], ['...']],
    photos: [G.PHOTO_ORDER, G.PHOTO_ORDER.slice().reverse()], musicbox: [G.MUSIC_ANSWER, G.MUSIC_ANSWER_M, [1, 2, 3]],
    tunnel: [G.TUNNEL_CODE, G.TUNNEL_TRAP, '00000'],
    phone: ['refuse'], // 接受交易會直接結束遊戲，不在亂走範圍內
    exit: [],          // 離開也會結束遊戲
    escape: [],
  };
  for (const pid of Object.keys(G.puzzles)) for (const a of answers[pid]) acts.push(() => E.submit(s, pid, a));
  return acts;
}

// 通關者：從任意狀態出發，依序完成尚未完成的步驟，直到真結局。
const F = (s, k) => !!s.flags[k];
const has = (s, id) => s.inv.includes(id);
const COMMON_HEAD = [
  [s => !F(s, 'coatSearched'), 'foyer', s => E.interact(s, 'f_coat')],
  [s => !F(s, 'shelfRead'), 'study', s => E.interact(s, 's_shelf')],
  [s => !F(s, 'drawerOpen'), 'study', s => E.submit(s, 'drawer', G.DRAWER_CODE)],
  [s => has(s, 'flashlight_dead') && has(s, 'battery'), null, s => E.combine(s, 'flashlight_dead', 'battery')],
  [s => !F(s, 'gridTaken'), 'study', s => E.interact(s, 's_desk')],
  [s => !F(s, 'paintingMoved'), 'study', s => E.interact(s, 's_painting')],
  [s => !F(s, 'wasteSearched'), 'study', s => E.interact(s, 's_waste')],
  [s => !F(s, 'chimneySearched') && has(s, 'flashlight'), 'study', s => E.useItem(s, 'flashlight', 's_fireplace')],
  [s => has(s, 'greenhouse_key'), 'foyer', s => E.useItem(s, 'greenhouse_key', 'f_gh_door')],
  [s => !F(s, 'trowelTaken'), 'greenhouse', s => E.interact(s, 'g_tools')],
  [s => !F(s, 'rulesRead') && F(s, 'greenhouseOpen'), 'greenhouse', s => E.interact(s, 'g_rules')],
];
const VETERAN_MIDDLE = [
  [s => has(s, 'storeroom_key'), 'greenhouse', s => E.useItem(s, 'storeroom_key', 'g_storedoor')],
  [s => !F(s, 'cabinetOpen') && has(s, 'paperweight') && F(s, 'rulesRead'), 'storeroom', s => E.submit(s, 'seedlock', G.SEED_CODE)],
  [s => has(s, 'hook_pole'), 'foyer', s => E.useItem(s, 'hook_pole', 'f_hatch')],
  [s => !F(s, 'cardTaken') && F(s, 'atticOpen'), 'attic', s => E.interact(s, 'a_chest')],
  [s => !F(s, 'photosTaken') && F(s, 'atticOpen'), 'attic', s => E.interact(s, 'a_photobox')],
  [s => has(s, 'photos') && has(s, 'photo_comet'), 'attic', s => E.submit(s, 'photos', G.PHOTO_ORDER)],
  [s => has(s, 'crank'), 'attic', s => E.useItem(s, 'crank', 'a_musicbox')],
  [s => !F(s, 'zhouCalled') && F(s, 'storeroomOpen') && has(s, 'flashlight') && has(s, 'code_card'), 'storeroom', s => E.submit(s, 'signal', ['.-.'])],
  [s => F(s, 'zhouCalled') && !F(s, 'zhouReplied') && has(s, 'flashlight'), 'storeroom', s => E.submit(s, 'signal', ['---', '...'])],
  [s => F(s, 'zhouReplied') && !F(s, 'keyDug'), 'greenhouse', s => E.submit(s, 'pots', G.variant(s).potAnswer)],
  [s => !F(s, 'lightOk'), 'greenhouse', s => E.submit(s, 'skylight', G.MIRROR_SOLUTION_V)],
  // 大師：旋律藏在星盤的答案裡，要先解開星盤
  [s => F(s, 'crankInserted') && !F(s, 'musicSolved') && F(s, 'posterRead') && (s.mode !== 'master' || F(s, 'starDialSolved')), 'attic',
    s => E.submit(s, 'musicbox', s.mode === 'master' ? G.MUSIC_ANSWER_M : G.MUSIC_ANSWER)],
];
const NOVICE_MIDDLE = [
  [s => !F(s, 'keyDug'), 'greenhouse', s => E.submit(s, 'pots', G.POT_ANSWER)],
  [s => !F(s, 'lightOk'), 'greenhouse', s => E.submit(s, 'mirrors', G.MIRROR_SOLUTIONS[0])],
];
const COMMON_TAIL = [
  [s => !F(s, 'trapdoorFound') && has(s, 'flashlight'), 'greenhouse', s => E.useItem(s, 'flashlight', 'g_bench')],
  [s => has(s, 'brass_key'), 'foyer', s => E.useItem(s, 'brass_key', 'f_gate')],
  [s => !F(s, 'eyepieceFound') && has(s, 'flashlight') && F(s, 'gateOpen'), 'observatory', s => E.useItem(s, 'flashlight', 'o_under')],
  [s => has(s, 'eyepiece'), 'observatory', s => E.useItem(s, 'eyepiece', 'o_telescope')],
  [s => !F(s, 'posterRead') && F(s, 'gateOpen'), 'observatory', s => E.interact(s, 'o_poster')],
  [s => !F(s, 'almanacRead') && F(s, 'gateOpen'), 'observatory', s => E.interact(s, 'o_almanac')],
  [s => F(s, 'eyepieceInstalled') && !F(s, 'starDialSolved') && F(s, 'posterRead'), 'observatory', s => E.submit(s, 'dial', G.DIAL_ANSWER)],
  [s => !F(s, 'cabinetSearched') && F(s, 'gateOpen'), 'observatory', s => E.interact(s, 'o_cabinet')],
  [s => !F(s, 'logBookmark') && F(s, 'gateOpen'), 'observatory', s => E.interact(s, 'o_log')],
  [s => !F(s, 'bulbTaken') && F(s, 'gateOpen'), 'observatory', s => E.interact(s, 'o_lamp')],
  [s => has(s, 'grid_paper') && has(s, 'transparency'), null, s => E.combine(s, 'grid_paper', 'transparency')],
  [s => has(s, 'note_left') && has(s, 'note_right'), null, s => E.combine(s, 'note_left', 'note_right')],
  [s => !F(s, 'clockSolved'), 'foyer', s => E.submit(s, 'clock', G.CLOCK_ANSWER)],
  [s => has(s, 'overlay') && !F(s, 'safeOpen'), 'study', s => E.submit(s, 'safe', G.SAFE_CODE)],
  [s => has(s, 'valve_wheel'), 'greenhouse', s => E.useItem(s, 'valve_wheel', 'g_valves')],
  [s => F(s, 'wheelInstalled') && !F(s, 'waterOk'), 'greenhouse', s => E.submit(s, 'valves', VALVE_SOLUTION)],
  [s => F(s, 'waterOk') && F(s, 'lightOk') && !F(s, 'moonTaken'), 'greenhouse', s => E.interact(s, 'g_moonflower')],
  [s => F(s, 'trapdoorFound') && !F(s, 'trapdoorOpen'), 'greenhouse', s => E.submit(s, 'trapdoor', G.TRAPDOOR_CODE)],
  [s => has(s, 'red_bulb') && F(s, 'trapdoorOpen'), 'darkroom', s => E.useItem(s, 'red_bulb', 'd_socket')],
  [s => F(s, 'darkroomLit') && !F(s, 'p4Taken'), 'darkroom', s => E.interact(s, 'd_line')],
  [s => F(s, 'darkroomLit') && !F(s, 'bottleCardRead'), 'darkroom', s => E.interact(s, 'd_shelf')],
  [s => F(s, 'darkroomLit') && G.isAdv(s.mode) && !F(s, 'chartRead'), 'darkroom', s => E.interact(s, 'd_chart')],
  [s => F(s, 'darkroomLit') && !F(s, 'plateDeveloped'), 'darkroom', s => E.submit(s, 'develop', G.isAdv(s.mode) ? G.DEVELOP_ANSWER_V : G.DEVELOP_ANSWER)],
  ...G.EMBLEMS.map(e => [s => has(s, e), 'foyer', s => E.useItem(s, e, 'f_door')]),
  [s => F(s, 'phoneRinging'), 'foyer', s => E.submit(s, 'phone', 'refuse')],
];
const LEAVE_BY_DOOR = [
  [s => G.allInserted(s) && has(s, 'plate') && G.countPages(s) === 4, 'foyer', s => E.submit(s, 'exit', 'publish')],
];
// 大師：大門外有人守著，要從儲物間的老水道離開
const MASTER_ESCAPE = [
  [s => !F(s, 'clippingRead'), 'study', s => E.interact(s, 's_clipping')],
  [s => G.allInserted(s) && !F(s, 'tunnelFound'), 'storeroom', s => E.interact(s, 't_shelf')],
  [s => F(s, 'tunnelFound') && !F(s, 'tunnelOpen'), 'storeroom', s => E.submit(s, 'tunnel', G.TUNNEL_CODE)],
  [s => F(s, 'tunnelOpen') && has(s, 'plate') && G.countPages(s) === 4, 'storeroom', s => E.submit(s, 'escape', 'publish')],
];
const STEPS = {
  novice: [...COMMON_HEAD, ...NOVICE_MIDDLE, ...COMMON_TAIL, ...LEAVE_BY_DOOR],
  veteran: [...COMMON_HEAD, ...VETERAN_MIDDLE, ...COMMON_TAIL, ...LEAVE_BY_DOOR],
  master: [...COMMON_HEAD, ...VETERAN_MIDDLE, ...COMMON_TAIL, ...MASTER_ESCAPE],
};

function finish(s) {
  for (let guard = 0; guard < 300 && !s.ending; guard++) {
    const step = STEPS[s.mode].find(([cond]) => cond(s));
    if (!step) return { ok: false, why: '沒有可執行的下一步', s };
    const [, room, act] = step;
    if (room && s.room !== room) {
      const m = E.move(s, room);
      if (!m.ok) return { ok: false, why: '進不去 ' + room, s };
      continue; // 進入門廳可能讓電話響起，重新評估
    }
    const r = act(s);
    if (!r.ok) return { ok: false, why: r.messages.map(m => m.text.zh || m.text).join(' / '), s };
  }
  return { ok: s.ending === 'B', why: '結局：' + s.ending, s };
}

const TAG = { novice: '［新手］', veteran: '［資深］', master: '［大師］' };
for (const mode of G.MODES) {
  const tag = TAG[mode];
  test(`${tag}從新遊戲直接交給通關者，會走到真結局 B`, () => {
    const r = finish(E.newState(mode));
    assert.ok(r.ok, r.why);
  });

  test(`${tag}隨機亂走 400 次（每次最多 300 步）後，通關者都能打到真結局 B，且過程沒有任何例外`, () => {
    let totalSteps = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed * 7919 + G.RANK[mode] * 13);
      const s = E.newState(mode);
      const len = 1 + Math.floor(r() * 300);
      for (let i = 0; i < len; i++) {
        const acts = allActions(s);
        let res;
        try { res = pick(r, acts)(); } catch (e) { assert.fail(`種子 ${seed} 第 ${i} 步拋出例外：${e.stack}`); }
        assert.ok(res && Array.isArray(res.messages), '回傳格式錯誤');
        const errs = E.validate(s);
        assert.deepEqual(errs, [], `種子 ${seed} 第 ${i} 步後狀態不合法`);
        totalSteps++;
      }
      const done = finish(s);
      assert.ok(done.ok, `種子 ${seed}：亂走 ${len} 步後無法通關（${done.why}）\n物品：${s.inv}\n旗標：${JSON.stringify(s.flags)}`);
    }
    assert.ok(totalSteps > 20000);
  });
}

test('日記裝訂：任何殘頁組合、任何裝訂順序都不會遺失頁面', () => {
  const pages = G.PAGES;
  for (let mask = 1; mask < 16; mask++) {
    const held = pages.filter((_, i) => mask & (1 << i));
    // 嘗試所有裝訂順序（排列）
    const perms = held.length <= 1 ? [held] : permute(held);
    for (const order of perms) {
      const s = E.newState();
      s.inv.push(...held);
      for (let i = 1; i < order.length; i++) {
        const a = i === 1 ? order[0] : 'diary';
        const r = E.combine(s, a, order[i]);
        assert.ok(r.ok, r.messages.map(m => m.text.zh).join());
      }
      assert.equal(G.countPages(s), held.length);
      if (held.length >= 2) {
        assert.deepEqual(s.flags.diaryPages, pages.filter(p => held.includes(p)), '裝訂後應按日期排序');
        assert.ok(s.inv.includes('diary'));
        assert.deepEqual(E.itemName(s, 'diary'), { zh: `陸觀的日記（${held.length}/4）`, en: `Lu Guan's Diary (${held.length}/4)` });
      }
    }
  }
});

function permute(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permute(arr.filter((_, j) => j !== i)).map(p => [x, ...p]));
}
