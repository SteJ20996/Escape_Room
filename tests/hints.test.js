'use strict';
// 提示系統：不劇透尚未發現的東西；每個提示都會在正常遊玩中出現；每一段文字都有內容。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, makeGame, VALVE_SOLUTION } = require('./helpers');

function recorder() {
  const P = makeGame();
  const seen = new Set();
  const check = () => {
    for (const h of G.hints) {
      if (!h.avail(P.s) || h.done(P.s)) continue;
      seen.add(h.id);
      h.texts.forEach((t, i) => {
        const text = typeof t === 'function' ? t(P.s) : t;
        assert.ok(typeof text === 'string' && text.trim() && !/undefined|NaN/.test(text), `提示 ${h.id} 第 ${i + 1} 段內容異常：${text}`);
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
  const titles = P.E.hintList(P.s).map(h => h.title);
  assert.deepEqual(titles, ['還沒仔細看過的地方']);
  P.go('study');
  assert.ok(!P.E.hintList(P.s).some(h => /保險箱|徽/.test(h.title)), '還沒取下油畫前不應出現保險箱');
  P.look('s_painting');
  assert.ok(P.E.hintList(P.s).some(h => h.title === '牆裡的保險箱'));
});

test('提示標題不包含獎勵名稱（日徽、月徽、星徽）', () => {
  for (const h of G.hints) assert.ok(!/日徽|月徽|星徽/.test(h.title), h.title);
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
  const missing = G.hints.map(h => h.id).filter(id => !seen.has(id));
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
