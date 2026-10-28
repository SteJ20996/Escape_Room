'use strict';
// 窮舉所有可達狀態，證明：無死局、無取不到的物品、無解不開的謎題、謎題線索不循環依賴。
// 新手、資深、大師三種模式各自窮舉一次。
const test = require('node:test');
const assert = require('node:assert/strict');
const { G } = require('./helpers');
const { E, explore, canReach, reachableWithout, inertActions, enter } = require('./solver');

// 只出現在資深模式的東西
const VET_ITEMS = ['storeroom_key', 'paperweight', 'hook_pole', 'code_card', 'photos', 'photo_comet', 'crank', 'qing_letter'];
const VET_PUZZLES = ['seedlock', 'balance_set', 'signal', 'photos', 'musicbox', 'skylight'];
const MASTER_PUZZLES = ['tunnel', 'escape'];
// 某個熱點在這個難度會不會出現：熱點本身與它所在的房間都要符合難度
const shownIn = (mode, h) => G.modeOk(mode, h) && G.modeOk(mode, G.rooms[h.room]);
const puzzleIn = (mode, pid) => !(mode === 'novice' && VET_PUZZLES.includes(pid)) && !(mode !== 'master' && MASTER_PUZZLES.includes(pid));
const TAG = { novice: '［新手］', veteran: '［資深］', master: '［大師］' };
// 失敗（整局作廢、不算結局）：資深以上挖錯三盆（F）；大師三張廢片都試壞（G）
const FAILS = { novice: [], veteran: ['F'], master: ['F', 'G'] };

const has = (s, id) => s.inv.includes(id);
const noteReady = s => has(s, 'note_full') || (has(s, 'note_left') && has(s, 'note_right'));
const overlayReady = s => has(s, 'overlay') || (has(s, 'grid_paper') && has(s, 'transparency'));

// 公平性：解謎所需的線索，必須能在「不解開該謎題」的前提下取得（不能有循環依賴）
const CLUES = {
  novice: {
    drawer: { room: 'study', clue: () => true, why: '書架與便條都在書房' },
    pots: { room: 'greenhouse', clue: s => has(s, 'trowel'), why: '木牌、花盆證詞與小鏟子' },
    safe: { room: 'study', clue: overlayReady, why: '方格紙與星圖膠片' },
    clock: { room: 'foyer', clue: s => E.canEnter(s, 'observatory'), why: '觀測日誌與月落表（天文台）' },
    valves: { room: 'greenhouse', clue: s => !!s.flags.wheelInstalled, why: '園丁守則與已裝上的手輪' },
    mirrors: { room: 'greenhouse', clue: () => true, why: '光路即時可見' },
    dial: { room: 'observatory', clue: s => !!s.flags.eyepieceInstalled, why: '剪報/日記的「東南」、目鏡、倒像便條、星座圖' },
    trapdoor: { room: 'greenhouse', clue: noteReady, why: '兩半便條' },
    develop: { room: 'darkroom', clue: noteReady, why: '便條上的順序與藥瓶卡片' },
  },
  veteran: {
    drawer: { room: 'study', clue: () => true, why: '書架與便條都在書房' },
    seedlock: { room: 'storeroom', clue: s => has(s, 'paperweight') && E.canEnter(s, 'greenhouse'), why: '天平、5 兩紙鎮（書房）、園丁守則的順序（溫室）' },
    signal: { room: 'storeroom', clue: s => has(s, 'code_card') && has(s, 'flashlight'), why: '閣樓的燈號卡與手電筒' },
    pots: { room: 'greenhouse', clue: s => !!s.flags.zhouReplied && has(s, 'trowel'), why: '周伯的燈號（兩句為真）與小鏟子' },
    photos: { room: 'attic', clue: s => has(s, 'photos') && has(s, 'photo_comet'), why: '相片盒的五張照片與書桌抽屜的第六張' },
    musicbox: { room: 'attic', clue: s => !!s.flags.crankInserted && has(s, 'qing_letter') && E.canEnter(s, 'observatory'), why: '晴的信（星星譜）與天文台的星座圖' },
    safe: { room: 'study', clue: overlayReady, why: '方格紙與音樂盒裡的星圖膠片' },
    clock: { room: 'foyer', clue: s => E.canEnter(s, 'observatory'), why: '觀測日誌與月落表（天文台）' },
    valves: { room: 'greenhouse', clue: s => !!s.flags.wheelInstalled, why: '園丁守則與已裝上的手輪' },
    skylight: { room: 'greenhouse', clue: () => true, why: '鏡子格子圖（光路要自己推）' },
    dial: { room: 'observatory', clue: s => !!s.flags.eyepieceInstalled, why: '剪報/日記的「東南」、目鏡、倒像便條、星座圖' },
    trapdoor: { room: 'greenhouse', clue: s => noteReady(s) && !!s.flags.drawerOpen, why: '兩半便條（「那個冬夜的月和日」）與抽屜裡的日記一、窗邊的照片' },
    develop: { room: 'darkroom', clue: noteReady, why: '便條上的順序、牆上的流程表與藥瓶卡片' },
  },
};
CLUES.master = Object.assign({}, CLUES.veteran, {
  musicbox: { room: 'attic', clue: s => !!s.flags.crankInserted && has(s, 'qing_letter') && !!s.flags.starDialSolved, why: '晴的信（旋律藏在星盤的答案裡）、已解開的星盤與星座圖' },
  // 拆穿假卡片的兩個證據：流程表上的褐色結晶（暗房）、周伯日誌裡陸觀死後韓嶽進過暗房（種子櫃）
  develop: { room: 'darkroom', clue: s => noteReady(s) && !!s.flags.chartRead && !!s.flags.cabinetOpen, why: '便條、流程表（褐色結晶）與周伯日誌（陸觀死後韓嶽來過暗房）' },
  tunnel: { room: 'storeroom', clue: s => !!s.flags.tunnelFound && !!s.flags.clippingRead && (has(s, 'page3') || (s.flags.diaryPages || []).includes('page3') || has(s, 'plate')), why: '剪報的赤經、日記三或底片紙套上的修正' },
});

for (const mode of G.MODES) {
  const graph = explore({ mode });
  const live = graph.states.map(s => !s.ending);
  const tag = TAG[mode];
  const isFail = s => FAILS[mode].includes(s.ending);
  const endings = G.ENDING_ORDER.filter(id => G.modeOk(mode, G.endings[id]));

  test(`${tag}窮舉過程沒有任何例外或空白回應（${graph.states.length} 個狀態）`, () => {
    // 拿到線索才能作答之後，「先輸入背下來的答案、再拿線索」的順序都不存在了，狀態數因此比早期版本少
    assert.ok(graph.states.length > 5000, `狀態數異常地少：${graph.states.length}`);
    assert.deepEqual(graph.errors.slice(0, 3), []);
  });

  test(`${tag}${endings.length} 個結局全部可達${FAILS[mode].length ? `，失敗（${FAILS[mode].join('、')}）也可達` : '，而且不會失敗'}`, () => {
    const seen = new Set(graph.states.filter(s => s.ending).map(s => s.ending));
    const want = endings.concat(FAILS[mode]);
    assert.deepEqual([...seen].sort(), want.sort());
  });

  if (G.isAdv(mode)) {
    test(`${tag}挖錯第三盆就失敗；挖錯一、兩次的狀態仍然都能走到真結局`, () => {
      const fails = graph.states.filter(s => s.ending === 'F');
      assert.ok(fails.length > 0);
      assert.ok(fails.every(s => (s.flags.potsDug || []).length === G.POT_MISS_LIMIT && !s.flags.keyDug), '失敗狀態都是挖錯三盆、還沒挖到鑰匙');
      const okB = canReach(graph, s => s.ending === 'B');
      const missed = graph.states.map((s, i) => [s, i]).filter(([s]) => !s.ending && s.flags.potsDug);
      assert.ok(missed.some(([s]) => s.flags.potsDug.length === 2), '有挖錯兩次的狀態');
      assert.ok(missed.every(([, i]) => okB[i]), '挖錯一、兩次之後仍然能走到真結局');
      // 挖到鑰匙之後就再也不會失敗
      const failIdx = new Set(fails.map(s => graph.states.indexOf(s)));
      graph.states.forEach((s, i) => { if (s.flags.keyDug) for (const [j] of graph.edges[i]) assert.ok(!failIdx.has(j)); });
    });
  }

  if (mode === 'master') {
    test(`${tag}三張廢片都試壞就失敗（G）；用掉一、兩張的狀態仍然都能走到真結局`, () => {
      const fails = graph.states.filter(s => s.ending === 'G');
      assert.ok(fails.length > 0);
      assert.ok(fails.every(s => s.flags.devMisses === G.DEV_MISS_LIMIT && !s.flags.plateDeveloped), '失敗狀態都是用掉三張廢片、還沒沖出底片');
      const okB = canReach(graph, s => s.ending === 'B');
      const missed = graph.states.map((s, i) => [s, i]).filter(([s]) => !s.ending && s.flags.devMisses);
      assert.ok(missed.some(([s]) => s.flags.devMisses === 2), '有用掉兩張廢片的狀態');
      assert.ok(missed.every(([, i]) => okB[i]), '用掉一、兩張廢片之後仍然能走到真結局');
    });

    test(`${tag}大門外有人守著：沖出底片後從大門走一定是 H；B、C、E 只能經由老水道`, () => {
      const into = {};
      graph.edges.forEach((out, i) => out.forEach(([j, label]) => {
        const e = graph.states[j].ending;
        if (e && !graph.states[i].ending) (into[e] = into[e] || new Set()).add(label);
      }));
      assert.deepEqual([...into.H], ['exit']);
      for (const e of ['B', 'C', 'E']) assert.deepEqual([...into[e]], ['escape'], `結局 ${e} 的來源`);
      assert.ok(graph.states.filter(s => s.ending === 'H').every(s => s.flags.plateDeveloped));
    });
  }

  test(`${tag}無死局：任何尚未結束的狀態都還能走到真結局 B`, () => {
    const okB = canReach(graph, s => s.ending === 'B');
    const stuck = graph.states.filter((s, i) => live[i] && !okB[i]);
    assert.equal(stuck.length, 0, '卡死的狀態範例：' + JSON.stringify(stuck[0] && { inv: stuck[0].inv, flags: stuck[0].flags }));
  });

  test(`${tag}無死局：任何尚未結束的狀態都至少能走到某個結局`, () => {
    const okAny = canReach(graph, s => !!s.ending && !isFail(s));
    assert.ok(graph.states.every((s, i) => !live[i] || okAny[i]));
  });

  test(`${tag}普通結局 A 在拿到底片前永遠可達（拿到底片後由 B/C/E 取代）`, () => {
    const okA = canReach(graph, s => s.ending === 'A');
    const bad = graph.states.filter((s, i) => live[i] && !s.flags.plateDeveloped && !okA[i]);
    assert.equal(bad.length, 0);
  });

  test(`${tag}每個物品都取得得到（日記另由裝訂測試涵蓋）`, () => {
    const got = new Set();
    for (const s of graph.states) for (const it of s.inv) got.add(it);
    // 嵌入/安裝後就離開物品欄的東西，也算取得過
    const expect = Object.keys(G.items).filter(id => id !== 'diary' && (G.isAdv(mode) || !VET_ITEMS.includes(id)));
    assert.deepEqual(expect.filter(id => !got.has(id)), []);
    if (mode === 'novice') assert.deepEqual(VET_ITEMS.filter(id => got.has(id)), [], '新手模式不應出現資深模式的物品');
  });

  test(`${tag}每個熱點都會在某個狀態中出現`, () => {
    const seen = new Set();
    for (const s of graph.states) {
      if (s.ending) continue;
      for (const room of G.roomOrder) {
        if (!E.canEnter(s, room)) continue;
        const c = E.clone(s); c.room = room;
        for (const h of E.visibleHotspots(c)) seen.add(h.id);
      }
    }
    const expect = G.hotspots.filter(h => shownIn(mode, h)).map(h => h.id);
    assert.deepEqual(expect.filter(id => !seen.has(id)), []);
    assert.deepEqual(G.hotspots.filter(h => !shownIn(mode, h)).map(h => h.id).filter(id => seen.has(id)), [], '不應出現更高難度才有的物件');
  });

  test(`${tag}每個謎題都在某個狀態中被解開`, () => {
    const solved = new Set();
    graph.edges.forEach(out => out.forEach(([, label]) => label && solved.add(label)));
    const expect = Object.keys(G.puzzles).filter(p => {
      if (!puzzleIn(mode, p)) return false;
      if (G.isAdv(mode) && p === 'mirrors') return false; // 資深以上由「拉開天窗」判定
      return !G.puzzles[p].silent || p === 'mirrors';
    });
    assert.deepEqual(expect.filter(p => !solved.has(p)), []);
  });

  test(`${tag}每一道設了線索門檻的謎題，都列在公平性檢查裡`, () => {
    const gated = Object.keys(G.puzzles).filter(pid => G.puzzles[pid].clue && puzzleIn(mode, pid));
    assert.deepEqual(gated.filter(pid => !CLUES[mode][pid]), []);
  });

  for (const [pid, c] of Object.entries(CLUES[mode])) {
    test(`${tag}公平性：謎題「${pid}」的線索（${c.why}）不必先解開它就能取得`, () => {
      const reach = reachableWithout(graph, pid);
      const found = graph.states.some((s, i) => {
        if (!reach[i] || s.ending || !E.canEnter(s, c.room)) return false;
        const x = enter(s, c.room);
        // 遊戲本身的門檻（拿到線索才能作答）也必須在不解開它的前提下滿足得了
        const gate = G.puzzles[pid].clue;
        return G.puzzles[pid].available(x) && c.clue(x) && (!gate || gate(x));
      });
      assert.ok(found);
    });
  }

  test(`${tag}被化簡掉的動作（無效用法、無效組合、錯誤答案、純顯示機關）不會改變邏輯狀態，也不會拋錯`, () => {
    // 抽樣涵蓋各個進度階段，並包含所有結局前一刻的狀態
    const every = 7;
    const sample = { states: graph.states.filter((s, i) => i % every === 0 || G.allInserted(s)) };
    const { problems, tried } = inertActions(sample);
    assert.ok(tried > 10000, `嘗試次數過少：${tried}`);
    assert.deepEqual(problems.slice(0, 3), []);
  });
}
