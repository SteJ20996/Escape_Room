/*
 * 觀星者之屋 — 遊戲引擎
 * 純邏輯、無 DOM、狀態完全可序列化（JSON），所以存檔與自動化測試都直接使用它。
 * 每個動作都會先檢查合法性（物品是否在身上、熱點是否可見、謎題是否可作答），
 * 介面再怎麼出錯也不會把遊戲帶進非法狀態。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EscapeEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 雙語文字：{ zh, en }。引擎產生的所有訊息都同時帶兩種語言，由介面依目前語言顯示。
  const L = (zh, en) => ({ zh, en });
  // 英文冠詞：專有名詞所有格（Lu Guan's …）與出口類名稱不加 the
  const the = name => /^(Lu Guan|Back |Downstairs|Under |Ladder)/.test(name) ? name : 'the ' + name;

  function create(G) {
    const hotspotById = {};
    for (const h of G.hotspots) {
      if (hotspotById[h.id]) throw new Error('重複的熱點 id：' + h.id);
      if (!G.rooms[h.room]) throw new Error('熱點指向不存在的房間：' + h.id);
      hotspotById[h.id] = h;
    }

    function newState() {
      return {
        v: G.saveVersion,
        room: G.startRoom,
        inv: G.startItems.slice(),
        flags: {},
        notes: ['letter'],
        puz: { dome: 'N', valves: {}, mirrors: Object.assign({}, G.MIRROR_GRID.initial), dial: ['lamp', 'lamp', 'lamp'], clock: { h: 12, m: 0 } },
        hints: {},
        visited: { [G.startRoom]: true },
        stats: { actions: 0, wrong: 0, hints: 0, playMs: 0 },
        ending: null,
      };
    }

    const NOT_HERE = L('這裡沒有那樣東西。', 'That isn\'t here.');
    const NOT_HELD = L('你身上沒有那樣東西。', 'You don\'t have that.');

    /* ---------- 結果與上下文 ---------- */
    function result() { return { ok: true, messages: [], open: null, ending: null, moved: null }; }
    function fail(text) { const r = result(); r.ok = false; r.messages.push({ text, kind: 'bad' }); return r; }

    function makeCtx(s, out) {
      const ctx = {
        s,
        flag: k => !!s.flags[k],
        get: k => s.flags[k],
        set(k, v) { s.flags[k] = v === undefined ? true : v; },
        has: id => s.inv.includes(id),
        give(id, quiet) {
          if (!G.items[id]) throw new Error('不存在的物品：' + id);
          if (!s.inv.includes(id)) s.inv.push(id);
          if (!quiet) { const n = itemName(s, id); out.messages.push({ text: L('獲得：' + n.zh, 'Obtained: ' + n.en), kind: 'item', item: id }); }
        },
        take(id) { const i = s.inv.indexOf(id); if (i >= 0) s.inv.splice(i, 1); },
        say(text, kind) { out.messages.push({ text, kind: kind || 'info' }); },
        open(view) { out.open = view; },
        note(id) {
          if (!G.docs[id]) throw new Error('不存在的線索：' + id);
          if (!s.notes.includes(id)) {
            s.notes.push(id);
            const t = G.docs[id].title;
            out.messages.push({ text: L('線索已記入筆記：' + t.zh, 'Added to your notebook: ' + t.en), kind: 'note' });
          }
        },
        goto(room) { enterRoom(s, room, out, ctx); },
        end(id) { s.ending = id; out.ending = id; },
        wrong() { s.stats.wrong++; },
      };
      return ctx;
    }

    function enterRoom(s, room, out, ctx) {
      const R = G.rooms[room];
      if (!R) throw new Error('不存在的房間：' + room);
      if (!R.accessible(s)) { out.messages.push({ text: L(R.name.zh + '還進不去。', `You can't get into the ${R.name.en.toLowerCase()} yet.`), kind: 'bad' }); out.ok = false; return; }
      s.room = room;
      s.visited[room] = true;
      out.moved = room;
      out.messages.push({ text: R.enterText(s), kind: 'room' });
      if (R.onEnter) R.onEnter(ctx || makeCtx(s, out));
    }

    /* ---------- 查詢 ---------- */
    function isVisible(s, h) { return h.room === s.room && (!h.visible || !!h.visible(s)); }
    function visibleHotspots(s) { return G.hotspots.filter(h => isVisible(s, h)); }
    function canEnter(s, room) { return !!G.rooms[room] && G.rooms[room].accessible(s); }
    function itemName(s, id) {
      const n = G.items[id] ? G.items[id].name : L(id, id);
      if (id === 'diary') { const k = (s.flags.diaryPages || []).length; return L(`${n.zh}（${k}/4）`, `${n.en} (${k}/4)`); }
      return n;
    }
    function pageCount(s) { return G.countPages(s); }

    function guard(s) {
      if (!s || typeof s !== 'object') return L('狀態無效。', 'Invalid game state.');
      if (s.ending) return L('遊戲已經結束。', 'The game is over.');
      return null;
    }
    function done(s, out) { if (out.ok) s.stats.actions++; return out; }

    /* ---------- 動作 ---------- */
    function interact(s, hsId) {
      const g = guard(s); if (g) return fail(g);
      const h = hotspotById[hsId];
      if (!h || !isVisible(s, h)) return fail(NOT_HERE);
      const out = result();
      h.examine(makeCtx(s, out));
      return done(s, out);
    }

    function useItem(s, itemId, hsId) {
      const g = guard(s); if (g) return fail(g);
      if (!s.inv.includes(itemId)) return fail(NOT_HELD);
      const h = hotspotById[hsId];
      if (!h || !isVisible(s, h)) return fail(NOT_HERE);
      const out = result();
      const ctx = makeCtx(s, out);
      if (h.use && h.use[itemId]) h.use[itemId](ctx);
      else if (s.room === 'darkroom' && itemId === 'flashlight') ctx.say(L('你想起活板門上的警告——白光會毀掉一切。你沒有打開手電筒。', 'You remember the warning on the trapdoor — white light ruins everything. You leave the flashlight off.'));
      else if (h.useAny) h.useAny(ctx, itemId);
      else if (itemId === 'flashlight') ctx.say(L(`手電筒照亮了${h.name.zh}，沒有發現什麼特別的。`, `The flashlight lights up ${the(h.name.en)}. Nothing unusual.`));
      else { const n = itemName(s, itemId); ctx.say(L(`把${n.zh}用在${h.name.zh}上，似乎沒什麼用。`, `Using ${the(n.en)} on ${the(h.name.en)} doesn't seem to do anything.`)); }
      return done(s, out);
    }

    function findRecipe(a, b) {
      for (const r of G.recipes) {
        if (r.pair && ((r.pair[0] === a && r.pair[1] === b) || (r.pair[0] === b && r.pair[1] === a))) return r;
        if (r.match && r.match(a, b)) return r;
      }
      return null;
    }

    function combine(s, a, b) {
      const g = guard(s); if (g) return fail(g);
      if (a === b) return fail(L('同一樣東西沒辦法和自己組合。', 'You can\'t combine something with itself.'));
      if (!s.inv.includes(a) || !s.inv.includes(b)) return fail(NOT_HELD);
      const r = findRecipe(a, b);
      if (!r) {
        const out = result();
        out.ok = false;
        const na = itemName(s, a), nb = itemName(s, b);
        out.messages.push({ text: L(`${na.zh}和${nb.zh}組合不起來。`, `You can't combine ${the(na.en)} with ${the(nb.en)}.`), kind: 'bad' });
        return out;
      }
      const out = result();
      r.run(makeCtx(s, out), a, b);
      return done(s, out);
    }

    function move(s, room) {
      const g = guard(s); if (g) return fail(g);
      if (!G.rooms[room]) return fail(L('沒有那個地方。', 'There is no such place.'));
      if (s.room === room) return fail(L('你已經在' + G.rooms[room].name.zh + '了。', `You're already in the ${G.rooms[room].name.en.toLowerCase()}.`));
      const out = result();
      enterRoom(s, room, out);
      return done(s, out);
    }

    function submit(s, puzzleId, answer) {
      const g = guard(s); if (g) return fail(g);
      const p = G.puzzles[puzzleId];
      if (!p) return fail(L('沒有那個機關。', 'There is no such mechanism.'));
      if (!p.available(s)) return fail(L('現在沒辦法操作那個機關。', 'You can\'t operate that right now.'));
      const out = result();
      const solved = p.check(makeCtx(s, out), answer);
      if (solved === null) return fail(L('這個選項現在不能用。', 'That option isn\'t available right now.')); // 不合法的輸入：不改變任何狀態
      out.solved = !!solved;
      if (p.silent && !out.messages.length) return out; // 純介面狀態（閥門開關、鏡子角度）不計入行動次數
      return done(s, out);
    }

    /* ---------- 提示 ---------- */
    function hintList(s) {
      return G.hints.filter(h => h.avail(s) && !h.done(s)).map(h => {
        const level = s.hints[h.id] || 0;
        return {
          id: h.id, title: h.title, level, max: h.texts.length,
          texts: h.texts.slice(0, level).map(t => typeof t === 'function' ? t(s) : t),
        };
      });
    }
    function revealHint(s, id) {
      const h = G.hints.find(x => x.id === id);
      if (!h || !h.avail(s) || h.done(s)) return false;
      const level = s.hints[id] || 0;
      if (level >= h.texts.length) return false;
      s.hints[id] = level + 1;
      s.stats.hints++;
      return true;
    }

    /* ---------- 進度摘要（狀態列用） ---------- */
    function progress(s) {
      const emblems = G.EMBLEMS.map(e => ({
        id: e,
        state: s.flags['inserted_' + e] ? 'inserted' : s.inv.includes(e) ? 'held' : 'missing',
      }));
      return {
        emblems,
        pages: pageCount(s),
        plate: s.inv.includes('plate'),
        truthKnown: !!s.flags.trapdoorFound || !!s.flags.trapdoorOpen,
      };
    }

    /* ---------- 存檔驗證 ---------- */
    function validate(s) {
      const errs = [];
      if (!s || typeof s !== 'object') return [L('不是有效的存檔資料', 'not valid save data')];
      if (s.v !== G.saveVersion) errs.push(L('存檔版本不符', 'wrong save version'));
      if (!G.rooms[s.room]) errs.push(L('房間無效', 'invalid room'));
      if (!Array.isArray(s.inv) || s.inv.some(i => !G.items[i])) errs.push(L('物品無效', 'invalid items'));
      if (!s.flags || typeof s.flags !== 'object') errs.push(L('旗標無效', 'invalid flags'));
      if (!Array.isArray(s.notes) || s.notes.some(n => !G.docs[n])) errs.push(L('筆記無效', 'invalid notebook'));
      if (!s.puz || typeof s.puz !== 'object') errs.push(L('機關狀態無效', 'invalid mechanism state'));
      if (!s.stats || typeof s.stats !== 'object') errs.push(L('統計無效', 'invalid statistics'));
      if (s.ending && !G.endings[s.ending]) errs.push(L('結局無效', 'invalid ending'));
      const dp = s.flags && s.flags.diaryPages;
      if (dp !== undefined && (!Array.isArray(dp) || dp.some(p => !G.PAGES.includes(p)) || new Set(dp).size !== dp.length)) errs.push(L('日記頁面無效', 'invalid diary pages'));
      if (Array.isArray(s.inv) && new Set(s.inv).size !== s.inv.length) errs.push(L('物品重複', 'duplicate items'));
      if (!errs.length && G.rooms[s.room] && !G.rooms[s.room].accessible(s)) errs.push(L('所在房間尚未解鎖', 'current room is not unlocked yet'));
      return errs;
    }
    function normalize(s) {
      // 補上舊存檔可能缺少的欄位，並把純顯示用的欄位修正到合法範圍（不影響遊戲邏輯）
      if (!s || typeof s !== 'object') return s;
      const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
      s.hints = obj(s.hints);
      s.visited = obj(s.visited);
      s.visited[s.room] = true;
      const puz = obj(s.puz);
      const dome = G.DIRECTIONS.some(d => d.id === puz.dome) ? puz.dome : 'N';
      const valves = {};
      for (const v of G.VALVES) valves[v.id] = !!obj(puz.valves)[v.id];
      const mirrors = {};
      for (const m of G.MIRROR_GRID.mirrors) {
        const d = obj(puz.mirrors)[m.id];
        mirrors[m.id] = d === '/' || d === '\\' ? d : G.MIRROR_GRID.initial[m.id];
      }
      // 星盤三環與落地鐘指針的位置（純顯示，存檔後重新讀取時保留）
      const dialIn = Array.isArray(puz.dial) ? puz.dial : [];
      const dial = [0, 1, 2].map(i => G.CONSTELLATIONS[dialIn[i]] ? dialIn[i] : 'lamp');
      const ck = obj(puz.clock);
      const clock = { h: Number.isInteger(ck.h) && ck.h >= 1 && ck.h <= 12 ? ck.h : 12, m: Number.isInteger(ck.m) && ck.m >= 0 && ck.m < 60 && ck.m % 5 === 0 ? ck.m : 0 };
      s.puz = { dome, valves, mirrors, dial, clock };
      const st = obj(s.stats);
      s.stats = {};
      for (const k of ['actions', 'wrong', 'hints', 'playMs']) s.stats[k] = Number.isFinite(+st[k]) && +st[k] >= 0 ? +st[k] : 0;
      return s;
    }

    return {
      G, newState, interact, useItem, combine, move, submit,
      hintList, revealHint, progress, visibleHotspots, canEnter, itemName, pageCount,
      validate, normalize, findRecipe,
      hotspot: id => hotspotById[id],
      clone: s => JSON.parse(JSON.stringify(s)),
    };
  }

  return { create };
}));
