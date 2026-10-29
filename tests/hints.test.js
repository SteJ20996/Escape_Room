'use strict';
// 提示系統：不劇透尚未發現的東西；每個提示都會在正常遊玩中出現；每一段文字都有內容。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, create, makeGame, VALVE_SOLUTION } = require('./helpers');
const { textProblem } = require('./solver');

const forMode = (h, mode) => G.modeOk(mode, h);

function recorder(mode) {
  const P = makeGame(mode);
  const seen = new Set();
  const check = () => {
    for (const h of G.hints) {
      if (!forMode(h, P.s.mode) || !h.avail(P.s) || h.done(P.s)) continue;
      seen.add(h.id);
      h.texts.forEach((t, i) => {
        const text = typeof t === 'function' ? t(P.s) : t;
        const bad = textProblem(text);
        assert.ok(!bad, `提示 ${h.id} 第 ${i + 1} 段：${bad}`);
        assert.ok(!/undefined|NaN/.test(text.zh + text.en), `提示 ${h.id} 第 ${i + 1} 段內容異常`);
      });
    }
  };
  for (const k of ['look', 'use', 'combine', 'go', 'solve']) {
    const f = P[k];
    P[k] = (...a) => { const r = f(...a); check(); return r; };
  }
  check();
  return { P, seen };
}

test('新遊戲時，提示只會說「還有沒看過的地方」，不會預告任何機關或獎勵', () => {
  const { P } = recorder();
  const titles = P.E.hintList(P.s).map(h => h.title.zh);
  assert.deepEqual(titles, ['還沒仔細看過的地方']);
  P.go('study');
  assert.ok(!P.E.hintList(P.s).some(h => /保險箱|徽/.test(h.title.zh) || /safe|emblem/i.test(h.title.en)), '還沒取下油畫前不應出現保險箱');
  P.look('s_painting');
  assert.ok(P.E.hintList(P.s).some(h => h.title.zh === '牆裡的保險箱'));
});

test('提示標題不包含獎勵名稱（日徽、月徽、星徽）', () => {
  for (const h of G.hints) assert.ok(!/日徽|月徽|星徽/.test(h.title.zh) && !/emblem/i.test(h.title.en.replace('Setting the Emblems', '')), h.title.en);
});

test('完整玩一遍時，每一個提示都會在某個時刻出現，且三段文字都有內容', () => {
  const { P, seen } = recorder();
  P.look('f_coat');
  P.go('study'); P.look('s_shelf'); P.look('s_clipping'); P.look('s_drawer');
  P.solve('drawer', G.DRAWER_CODE);
  P.combine('flashlight_dead', 'battery');
  P.look('s_desk'); P.look('s_painting'); P.look('s_waste');
  P.use('flashlight', 's_fireplace');
  P.go('foyer'); P.look('f_clock');
  P.use('greenhouse_key', 'f_gh_door');
  P.go('greenhouse'); P.look('g_valves'); P.look('g_pots'); P.look('g_tools');
  P.solve('pots', G.POT_ANSWER);
  P.solve('mirrors', G.MIRROR_SOLUTIONS[0]);
  P.use('flashlight', 'g_bench');
  P.go('foyer'); P.use('brass_key', 'f_gate');
  P.go('observatory'); P.look('o_telescope'); P.look('o_dial'); P.look('o_poster');
  P.use('flashlight', 'o_under'); P.use('eyepiece', 'o_telescope');
  P.solve('dome', 'SE'); P.solve('dial', G.DIAL_ANSWER);
  P.look('o_cabinet'); P.look('o_log'); P.look('o_almanac'); P.look('o_lamp');
  P.combine('grid_paper', 'transparency'); P.combine('note_left', 'note_right');
  P.go('foyer'); P.solve('clock', G.CLOCK_ANSWER);
  P.go('study'); P.solve('safe', G.SAFE_CODE);
  P.go('greenhouse'); P.use('valve_wheel', 'g_valves'); P.solve('valves', VALVE_SOLUTION);
  P.look('g_moonflower');
  P.solve('trapdoor', G.TRAPDOOR_CODE); P.go('darkroom');
  P.use('red_bulb', 'd_socket'); P.look('d_shelf'); P.look('d_line');
  P.solve('develop', G.DEVELOP_ANSWER);
  P.go('foyer'); P.solve('phone', 'refuse');
  for (const e of G.EMBLEMS) P.use(e, 'f_door');
  const missing = G.hints.filter(h => forMode(h, 'novice')).map(h => h.id).filter(id => !seen.has(id));
  assert.deepEqual(missing, []);
  assert.equal(P.solve('exit', 'publish').ending, 'B');
});

test('「還沒看過的地方」最後會全部看完而消失', () => {
  const { P } = recorder();
  assert.ok(P.E.hintList(P.s).some(h => h.id === 'explore'));
  P.look('f_coat');
  P.go('study');
  for (const id of ['s_shelf', 's_drawer', 's_clipping', 's_desk', 's_painting', 's_waste']) P.look(id);
  P.go('foyer'); P.look('f_clock');
  assert.ok(!P.E.hintList(P.s).some(h => h.id === 'explore'), '門廳與書房都看完了，而其他房間還鎖著');
});

/* ================= 資深模式 ================= */

test('［資深］完整玩一遍時，每一個資深提示都會在某個時刻出現，且三段文字都有內容', () => {
  const { P, seen } = recorder('veteran');
  P.look('f_coat');
  P.go('study'); P.look('s_shelf'); P.look('s_clipping'); P.look('s_drawer');
  P.solve('drawer', G.DRAWER_CODE);
  P.combine('flashlight_dead', 'battery');
  P.look('s_desk'); P.look('s_painting'); P.look('s_waste');
  P.go('foyer'); P.look('f_clock'); P.look('f_hatch');
  P.use('greenhouse_key', 'f_gh_door');
  P.go('greenhouse'); P.look('g_valves'); P.look('g_pots'); P.look('g_tools'); P.look('g_storedoor');
  P.go('study'); P.use('flashlight', 's_fireplace');
  P.go('greenhouse'); P.use('storeroom_key', 'g_storedoor');
  P.go('storeroom'); P.look('t_balance'); P.look('t_cabinet'); P.look('t_calendar');
  P.solve('seedlock', G.SEED_CODE);
  P.go('foyer'); P.use('hook_pole', 'f_hatch');
  P.go('attic'); P.look('a_chest'); P.look('a_photobox'); P.look('a_marks');
  P.solve('photos', G.PHOTO_ORDER);
  P.use('crank', 'a_musicbox');
  P.go('storeroom'); P.solve('signal', ['.-.']); P.solve('signal', ['---', '...']);
  P.go('greenhouse'); P.solve('pots', G.POT_ANSWER_V);
  P.use('flashlight', 'g_bench');
  P.go('foyer'); P.use('brass_key', 'f_gate');
  P.go('observatory'); P.look('o_telescope'); P.look('o_dial'); P.look('o_poster');
  P.use('flashlight', 'o_under'); P.use('eyepiece', 'o_telescope');
  P.solve('dome', 'SE'); P.solve('dial', G.DIAL_ANSWER);
  P.look('o_cabinet'); P.look('o_log'); P.look('o_almanac'); P.look('o_lamp');
  P.go('attic'); P.solve('musicbox', G.MUSIC_ANSWER);
  P.combine('grid_paper', 'transparency'); P.combine('note_left', 'note_right');
  P.go('foyer'); P.solve('clock', G.CLOCK_ANSWER);
  P.go('study'); P.solve('safe', G.SAFE_CODE);
  P.go('greenhouse'); P.solve('skylight', G.MIRROR_SOLUTION_V);
  P.use('valve_wheel', 'g_valves'); P.solve('valves', VALVE_SOLUTION);
  P.look('g_moonflower');
  P.solve('trapdoor', G.TRAPDOOR_CODE); P.go('darkroom');
  P.use('red_bulb', 'd_socket'); P.look('d_shelf'); P.look('d_chart'); P.look('d_line');
  P.solve('develop', G.DEVELOP_ANSWER_V);
  P.go('foyer'); P.solve('phone', 'refuse');
  for (const e of G.EMBLEMS) P.use(e, 'f_door');
  const missing = G.hints.filter(h => forMode(h, 'veteran')).map(h => h.id).filter(id => !seen.has(id));
  assert.deepEqual(missing, []);
  assert.equal(P.solve('exit', 'publish').ending, 'B');
});

test('［資深］提示不會預告還沒發現的閣樓、儲物間或周伯', () => {
  const { P } = recorder('veteran');
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  const titles = () => P.E.hintList(P.s).map(h => h.title.zh + h.title.en).join(' ');
  assert.ok(!/閣樓|儲物間|周伯|Attic|Storeroom|Zhou/.test(titles()), titles());
  P.go('foyer'); P.use('greenhouse_key', 'f_gh_door'); P.go('greenhouse'); P.look('g_storedoor');
  assert.ok(P.E.hintList(P.s).some(h => h.id === 'storeroom'));
  assert.ok(!/閣樓|周伯|Attic|Zhou/.test(titles()), titles());
});

test('［資深］提示依階段分組：目前階段的提示排在最前面', () => {
  const { P } = recorder('veteran');
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.look('s_drawer'); P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  P.look('s_painting'); // 保險箱屬於之後的階段
  const list = P.E.hintList(P.s);
  assert.equal(P.E.stage(P.s).id, 'greenhouse');
  const safe = list.find(h => h.id === 'safe');
  const gh = list.find(h => h.id === 'greenhouse');
  assert.equal(safe.group, 'other');
  assert.equal(gh.group, 'current');
  assert.ok(list.indexOf(gh) < list.indexOf(safe));
});

test('每一則提示都標明「第幾段會公布答案」，而且答案不會提早出現在前面的段落', () => {
  // 各謎題答案的關鍵字：只能出現在 answerAt 那一段（含）之後
  const ANSWERS = [G.DRAWER_CODE, G.SAFE_CODE, G.SEED_CODE, G.TRAPDOOR_CODE, G.TUNNEL_CODE, '3:15', '3 點 15', '5、8、10', '6、6、5', '鼠尾草盆', '羅勒盆', '答案是玫瑰盆', 'V2、V4、V5', '黃 → 白', '黑 → 紅', '外環＝鑰', 'H→J→K', 'A→B→C', '查看「雜物架」', '是韓嶽偽造的'];
  for (const mode of G.MODES) {
    const E = create(G);
    const s = E.newState(mode);
    for (const h of G.hints) {
      const at = (h.answer === undefined ? h.texts.length - 1 : h.answer) + 1;
      assert.ok(at >= 2 && at <= h.texts.length, `${h.id}：公布答案的段落要在第 2 段之後`);
      h.texts.slice(0, at - 1).forEach((t, i) => {
        const text = (typeof t === 'function' ? t(s) : t).zh;
        for (const a of ANSWERS) assert.ok(!text.includes(a), `${h.id} 第 ${i + 1} 段提早說出答案「${a}」`);
      });
    }
  }
  // 引擎把 answerAt 交給介面：抽屜是第 3 段、日記是第 2 段
  const P = makeGame('novice');
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.look('s_drawer');
  const drawer = P.E.hintList(P.s).find(h => h.id === 'drawer');
  assert.equal(drawer.answerAt, 3);
  assert.equal(G.hints.find(h => h.id === 'diary').answer, 1);
});

/* ================= 大師模式 ================= */

test('［大師］完整玩一遍時，每一個大師適用的提示都會在某個時刻出現；資深專用的版本不會出現', () => {
  const { P, seen } = recorder('master');
  P.look('f_coat');
  P.go('study'); P.look('s_shelf'); P.look('s_clipping'); P.look('s_drawer');
  P.solve('drawer', G.DRAWER_CODE);
  P.combine('flashlight_dead', 'battery');
  P.look('s_desk'); P.look('s_painting'); P.look('s_waste');
  P.go('foyer'); P.look('f_clock'); P.look('f_hatch');
  P.use('greenhouse_key', 'f_gh_door');
  P.go('greenhouse'); P.look('g_valves'); P.look('g_pots'); P.look('g_tools'); P.look('g_storedoor');
  P.go('study'); P.use('flashlight', 's_fireplace');
  P.go('greenhouse'); P.use('storeroom_key', 'g_storedoor');
  P.go('storeroom'); P.look('t_balance'); P.look('t_cabinet'); P.look('t_calendar'); P.look('t_shelf');
  P.solve('seedlock', G.SEED_CODE);
  P.go('foyer'); P.use('hook_pole', 'f_hatch');
  P.go('attic'); P.look('a_chest'); P.look('a_photobox'); P.look('a_marks'); P.look('a_window');
  P.solve('photos', G.PHOTO_ORDER);
  P.use('crank', 'a_musicbox');
  P.go('storeroom'); P.solve('signal', ['.-.']); P.solve('signal', ['---', '...']);
  P.go('greenhouse'); P.solve('pots', G.POT_ANSWER_M);
  P.use('flashlight', 'g_bench');
  P.go('foyer'); P.use('brass_key', 'f_gate');
  P.go('observatory'); P.look('o_telescope'); P.look('o_dial'); P.look('o_poster');
  P.use('flashlight', 'o_under'); P.use('eyepiece', 'o_telescope');
  P.solve('dome', 'SE'); P.solve('dial', G.DIAL_ANSWER);
  P.look('o_cabinet'); P.look('o_log'); P.look('o_almanac'); P.look('o_lamp');
  P.go('attic'); P.solve('musicbox', G.MUSIC_ANSWER_M);
  P.combine('grid_paper', 'transparency'); P.combine('note_left', 'note_right');
  P.go('foyer'); P.solve('clock', G.CLOCK_ANSWER);
  P.go('study'); P.solve('safe', G.SAFE_CODE);
  P.go('greenhouse'); P.solve('skylight', G.MIRROR_SOLUTION_V);
  P.use('valve_wheel', 'g_valves'); P.solve('valves', VALVE_SOLUTION);
  P.look('g_moonflower');
  P.solve('trapdoor', G.TRAPDOOR_CODE); P.go('darkroom');
  P.use('red_bulb', 'd_socket'); P.look('d_shelf'); P.look('d_card2'); P.look('d_chart'); P.look('d_line');
  P.solve('develop', G.DEVELOP_ANSWER_V);
  P.go('foyer'); P.solve('phone', 'refuse');
  for (const e of G.EMBLEMS) P.use(e, 'f_door');
  P.go('storeroom'); P.look('t_shelf'); P.look('t_tunnel');
  P.solve('tunnel', G.TUNNEL_CODE);
  const want = G.hints.filter(h => forMode(h, 'master')).map(h => h.id);
  assert.deepEqual(want.filter(id => !seen.has(id)), []);
  const vetOnly = G.hints.filter(h => h.upTo === 'veteran').map(h => h.id);
  assert.ok(vetOnly.length >= 4);
  assert.deepEqual(vetOnly.filter(id => seen.has(id)), [], '被大師版本取代的資深提示不應出現');
  assert.equal(P.solve('escape', 'publish').ending, 'B');
});

test('［大師］「還沒仔細看過的地方」也會列出資深的物件；嵌好徽章之前，提示不會預告老水道', () => {
  const { P } = recorder('master');
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.look('s_clipping'); P.look('s_drawer');
  P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  P.look('s_desk'); P.look('s_painting'); P.look('s_waste');
  // 書房裡只剩資深才有意義的煙囪（藏著儲物間鑰匙）
  const explore = P.E.hintList(P.s).find(h => h.id === 'explore');
  assert.ok(explore && /煙囪|壁爐/.test(explore.texts.map(t => t.zh).join() + G.hotspots.find(h => h.id === 's_fireplace').name.zh));
  const all = () => P.E.hintList(P.s).map(h => h.title.zh + h.title.en + h.texts.map(t => t.zh + t.en).join()).join(' ');
  assert.ok(!/水道|channel/i.test(all()), '還沒嵌好徽章時，提示不會提到老水道');
});
