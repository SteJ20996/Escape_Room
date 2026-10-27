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
        puz: { dome: 'N', valves: {}, mirrors: Object.assign({}, G.MIRROR_GRID.initial) },
        hints: {},
        visited: { [G.startRoom]: true },
        stats: { actions: 0, wrong: 0, hints: 0, playMs: 0 },
        ending: null,
      };
    }

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
          if (!quiet) out.messages.push({ text: '獲得：' + itemName(s, id), kind: 'item', item: id });
        },
        take(id) { const i = s.inv.indexOf(id); if (i >= 0) s.inv.splice(i, 1); },
        say(text, kind) { out.messages.push({ text, kind: kind || 'info' }); },
        open(view) { out.open = view; },
        note(id) {
          if (!G.docs[id]) throw new Error('不存在的線索：' + id);
          if (!s.notes.includes(id)) {
            s.notes.push(id);
            out.messages.push({ text: '線索已記入筆記：' + G.docs[id].title, kind: 'note' });
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
      if (!R.accessible(s)) { out.messages.push({ text: R.name + '還進不去。', kind: 'bad' }); out.ok = false; return; }
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
      if (id === 'diary') return `${G.items.diary.name}（${(s.flags.diaryPages || []).length}/4）`;
      return G.items[id] ? G.items[id].name : id;
    }
    function pageCount(s) { return G.countPages(s); }

    function guard(s) {
      if (!s || typeof s !== 'object') return '狀態無效。';
      if (s.ending) return '遊戲已經結束。';
      return null;
    }
    function done(s, out) { if (out.ok) s.stats.actions++; return out; }

    /* ---------- 動作 ---------- */
    function interact(s, hsId) {
      const g = guard(s); if (g) return fail(g);
      const h = hotspotById[hsId];
      if (!h || !isVisible(s, h)) return fail('這裡沒有那樣東西。');
      const out = result();
      h.examine(makeCtx(s, out));
      return done(s, out);
    }

    function useItem(s, itemId, hsId) {
      const g = guard(s); if (g) return fail(g);
      if (!s.inv.includes(itemId)) return fail('你身上沒有那樣東西。');
      const h = hotspotById[hsId];
      if (!h || !isVisible(s, h)) return fail('這裡沒有那樣東西。');
      const out = result();
      const ctx = makeCtx(s, out);
      if (h.use && h.use[itemId]) h.use[itemId](ctx);
      else if (s.room === 'darkroom' && itemId === 'flashlight') ctx.say('你想起活板門上的警告——白光會毀掉一切。你沒有打開手電筒。');
      else if (h.useAny) h.useAny(ctx, itemId);
      else if (itemId === 'flashlight') ctx.say(`手電筒照亮了${h.name}，沒有發現什麼特別的。`);
      else ctx.say(`把${itemName(s, itemId)}用在${h.name}上，似乎沒什麼用。`);
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
      if (a === b) return fail('同一樣東西沒辦法和自己組合。');
      if (!s.inv.includes(a) || !s.inv.includes(b)) return fail('你身上沒有那樣東西。');
      const r = findRecipe(a, b);
      if (!r) {
        const out = result();
        out.ok = false;
        out.messages.push({ text: `${itemName(s, a)}和${itemName(s, b)}組合不起來。`, kind: 'bad' });
        return out;
      }
      const out = result();
      r.run(makeCtx(s, out), a, b);
      return done(s, out);
    }

    function move(s, room) {
      const g = guard(s); if (g) return fail(g);
      if (!G.rooms[room]) return fail('沒有那個地方。');
      if (s.room === room) return fail('你已經在' + G.rooms[room].name + '了。');
      const out = result();
      enterRoom(s, room, out);
      return done(s, out);
    }

    function submit(s, puzzleId, answer) {
      const g = guard(s); if (g) return fail(g);
      const p = G.puzzles[puzzleId];
      if (!p) return fail('沒有那個機關。');
      if (!p.available(s)) return fail('現在沒辦法操作那個機關。');
      const out = result();
      const solved = p.check(makeCtx(s, out), answer);
      if (solved === null) return fail('這個選項現在不能用。'); // 不合法的輸入：不改變任何狀態
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
        id: e, glyph: G.items[e].glyph,
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
      if (!s || typeof s !== 'object') return ['不是有效的存檔資料'];
      if (s.v !== G.saveVersion) errs.push('存檔版本不符');
      if (!G.rooms[s.room]) errs.push('房間無效');
      if (!Array.isArray(s.inv) || s.inv.some(i => !G.items[i])) errs.push('物品無效');
      if (!s.flags || typeof s.flags !== 'object') errs.push('旗標無效');
      if (!Array.isArray(s.notes) || s.notes.some(n => !G.docs[n])) errs.push('筆記無效');
      if (!s.puz || typeof s.puz !== 'object') errs.push('機關狀態無效');
      if (!s.stats || typeof s.stats !== 'object') errs.push('統計無效');
      if (s.ending && !G.endings[s.ending]) errs.push('結局無效');
      if (!errs.length && G.rooms[s.room] && !G.rooms[s.room].accessible(s)) errs.push('所在房間尚未解鎖');
      return errs;
    }
    function normalize(s) {
      // 補上舊存檔可能缺少的欄位
      s.hints = s.hints || {};
      s.visited = s.visited || { [s.room]: true };
      s.puz = Object.assign({ dome: 'N', valves: {}, mirrors: Object.assign({}, G.MIRROR_GRID.initial) }, s.puz || {});
      s.stats = Object.assign({ actions: 0, wrong: 0, hints: 0, playMs: 0 }, s.stats || {});
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
