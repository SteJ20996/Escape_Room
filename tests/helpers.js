'use strict';
// 測試共用：建立引擎、以「玩家動作」逐步推進並在每一步檢查成功。
const G = require('../js/data.js');
const { create } = require('../js/engine.js');

function makeGame() {
  const E = create(G);
  const s = E.newState();
  const log = [];
  function check(label, r) {
    log.push(`${label} → ${r.messages.map(m => m.text).join(' / ')}`);
    if (!r.ok) throw new Error(`動作失敗：${label}\n${r.messages.map(m => m.text).join('\n')}`);
    return r;
  }
  const P = {
    E, s, log,
    look: id => check(`查看 ${id}`, E.interact(s, id)),
    use: (item, id) => check(`使用 ${item} → ${id}`, E.useItem(s, item, id)),
    combine: (a, b) => check(`組合 ${a} + ${b}`, E.combine(s, a, b)),
    go: room => check(`前往 ${room}`, E.move(s, room)),
    solve: (pz, ans) => {
      const r = check(`作答 ${pz}`, E.submit(s, pz, ans));
      return r;
    },
    has: id => s.inv.includes(id),
  };
  return P;
}

const MIRROR_SOLUTION = () => G.MIRROR_SOLUTIONS[0];
const VALVE_SOLUTION = { V1: false, V2: true, V3: false, V4: true, V5: true };

// 主線：取得三枚徽章（不含暗房）
function mainPath(P, { chimney = false } = {}) {
  P.look('f_coat');
  P.go('study');
  P.look('s_shelf');
  P.look('s_drawer');
  P.solve('drawer', G.DRAWER_CODE);
  P.combine('flashlight_dead', 'battery');
  P.look('s_desk');
  P.look('s_painting');
  if (chimney) P.use('flashlight', 's_fireplace');
  P.go('foyer');
  P.use('greenhouse_key', 'f_gh_door');
  P.look('f_gh_door');
  P.look('g_tools');
  P.look('g_pots');
  P.solve('pots', G.POT_ANSWER);
  P.solve('mirrors', MIRROR_SOLUTION());
  P.go('foyer');
  P.use('brass_key', 'f_gate');
  P.look('f_gate');
  P.look('o_telescope');
  P.use('flashlight', 'o_under');
  P.use('eyepiece', 'o_telescope');
  P.solve('dome', G.COMET_DIRECTION);
  P.look('o_dial');
  P.solve('dial', G.DIAL_ANSWER);
  P.look('o_cabinet');
  P.look('o_log');
  P.look('o_almanac');
  P.combine('grid_paper', 'transparency');
  P.go('foyer');
  P.look('f_clock');
  P.solve('clock', G.CLOCK_ANSWER);
  P.go('study');
  P.solve('safe', G.SAFE_CODE);
  P.go('greenhouse');
  P.use('valve_wheel', 'g_valves');
  P.solve('valves', VALVE_SOLUTION);
  P.look('g_moonflower');
}

// 支線：暗房與底片
function darkroomPath(P) {
  P.go('study');
  P.look('s_waste');
  P.go('observatory');
  if (!P.has('note_right')) P.look('o_log');
  P.look('o_lamp');
  P.combine('note_left', 'note_right');
  P.go('greenhouse');
  P.use('flashlight', 'g_bench');
  P.solve('trapdoor', G.TRAPDOOR_CODE);
  P.look('g_trapdoor');
  P.use('red_bulb', 'd_socket');
  P.look('d_line');
  P.look('d_shelf');
  P.solve('develop', G.DEVELOP_ANSWER);
}

function insertAll(P) {
  for (const e of G.EMBLEMS) P.use(e, 'f_door');
}

module.exports = { G, create, makeGame, mainPath, darkroomPath, insertAll, MIRROR_SOLUTION, VALVE_SOLUTION };
