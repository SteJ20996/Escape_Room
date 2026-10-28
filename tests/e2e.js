'use strict';
/*
 * 端對端測試：以玩家的方式，只透過點擊真實介面，從「新遊戲」一路玩到五個結局——中文、英文各玩一遍。
 *   node tests/e2e.js                     測試 index.html
 *   node tests/e2e.js dist/stargazer.html 測試打包後的單檔版本
 *   SHOTS=資料夾 node tests/e2e.js         同時把各畫面截圖存到該資料夾
 *   LANGS=en node tests/e2e.js            只測某一種語言
 * 不注入任何遊戲狀態；所有輸入都經由按鈕、物品欄與鍵盤完成。
 * 物件、房間以 id 點擊（兩種語言共用同一套流程），畫面上的文字則用該語言的內容檢查。
 * 英文模式下，每一步都會掃描畫面：不得出現任何中文字（語言切換鈕「中文」除外），
 * 兩種語言都不得出現 undefined、[object Object]、NaN 這類漏翻或程式錯誤的痕跡。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const G = require('../js/data.js');
const I = require('../js/i18n.js');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.resolve(ROOT, process.argv[2] || 'index.html');
const SHOTS = process.env.SHOTS || '';
const LANGS = (process.env.LANGS || 'zh,en').split(',');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let step = 0;
const errors = [];
function ok(cond, msg) { if (!cond) throw new Error('檢查失敗：' + msg); }
const X = (zh, en) => ({ zh, en });
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ui = (key, lang, vars) => I.fmt(I.tr(I.UI[key], lang), vars);
// 資深模式「剛爬上閣樓、拿了燈號卡與五張照片」的存檔碼：用引擎照玩家動作走出來，再編成存檔碼
const VET_ATTIC_CODE = (() => {
  const { makeGame } = require('./helpers');
  const Store = require('../js/storage.js');
  const P = makeGame('veteran');
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  P.look('s_desk'); P.use('flashlight', 's_fireplace'); P.go('foyer');
  P.use('greenhouse_key', 'f_gh_door'); P.look('f_gh_door'); P.look('g_tools'); P.look('g_rules');
  P.use('storeroom_key', 'g_storedoor'); P.look('g_storedoor'); P.solve('seedlock', G.SEED_CODE);
  P.go('foyer'); P.use('hook_pole', 'f_hatch'); P.look('f_hatch'); P.look('a_chest'); P.look('a_photobox');
  return Store.encode(P.s);
})();
// 資深模式「問過周伯、回到溫室、還沒挖」的存檔碼（用來測挖錯三盆的失敗）
const VET_POTS_CODE = (() => {
  const { makeGame } = require('./helpers');
  const Store = require('../js/storage.js');
  const P = makeGame('veteran');
  P.look('f_coat'); P.go('study'); P.look('s_shelf'); P.solve('drawer', G.DRAWER_CODE); P.combine('flashlight_dead', 'battery');
  P.look('s_desk'); P.use('flashlight', 's_fireplace');
  P.go('foyer'); P.use('greenhouse_key', 'f_gh_door'); P.look('f_gh_door'); P.look('g_tools'); P.look('g_rules');
  P.use('storeroom_key', 'g_storedoor'); P.look('g_storedoor'); P.solve('seedlock', G.SEED_CODE);
  P.go('foyer'); P.use('hook_pole', 'f_hatch'); P.look('f_hatch'); P.look('a_chest');
  P.go('storeroom'); P.solve('signal', ['.-.']); P.solve('signal', ['---', '...']);
  P.go('greenhouse');
  return Store.encode(P.s);
})();
// 資深模式「三枚徽章到手、暗房紅燈已亮」的存檔碼
const VET_DARKROOM_CODE = (() => {
  const { makeGame, vetMainPath } = require('./helpers');
  const Store = require('../js/storage.js');
  const P = makeGame('veteran');
  vetMainPath(P);
  P.go('study'); P.look('s_waste'); P.go('observatory'); P.look('o_lamp'); P.combine('note_left', 'note_right');
  P.go('greenhouse'); P.use('flashlight', 'g_bench'); P.solve('trapdoor', G.TRAPDOOR_CODE); P.look('g_trapdoor');
  P.use('red_bulb', 'd_socket');
  return Store.encode(P.s);
})();

async function setup(browser, lang, viewport = { width: 1280, height: 860 }) {
  // 用瀏覽器語言測試預設語言的偵測；之後仍透過標題畫面的語言按鈕確認一次
  const ctx = await browser.newContext({ viewport, locale: lang === 'zh' ? 'zh-TW' : 'en-US' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + TARGET);
  ok(await page.evaluate(() => window.__stargazer.lang) === lang, `瀏覽器語言 ${lang} 時預設語言應為 ${lang}`);
  await page.click(`.title-lang [data-lang="${lang}"]`);
  ok(await page.locator('.title-main').innerText() === G.title[lang], '標題語言');
  return page;
}

// 掃描畫面上看得到的文字與無障礙標籤
async function scan(page) {
  return page.evaluate(() => {
    const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
    const BROKEN = /undefined|\[object Object\]|\bNaN\b/;
    const vis = el => (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0);
    const skip = el => el.closest('[lang="zh-Hant"], script, style');
    const cjk = [], broken = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const el = n.parentElement, v = n.nodeValue;
      if (!el || el.closest('script, style') || !v.trim()) continue;
      const shown = el.closest('svg title') ? vis(el.closest('svg')) : vis(el);
      if (!shown) continue;
      if (BROKEN.test(v)) broken.push(v.trim().slice(0, 80));
      if (!skip(el) && CJK.test(v)) cjk.push(v.trim().slice(0, 80));
    }
    for (const el of document.body.querySelectorAll('[aria-label], [title], [placeholder]')) {
      if (!vis(el)) continue;
      for (const a of ['aria-label', 'title', 'placeholder']) {
        const v = el.getAttribute(a);
        if (!v) continue;
        if (BROKEN.test(v)) broken.push(`${a}=${v.slice(0, 80)}`);
        if (!skip(el) && CJK.test(v)) cjk.push(`${a}=${v.slice(0, 80)}`);
      }
    }
    return { cjk, broken, lang: document.documentElement.lang };
  });
}

function player(page, lang) {
  const name = id => G.hotspots.find(h => h.id === id).name[lang];
  const P = {
    page, lang, scans: 0,
    async check(where) {
      const r = await scan(page);
      P.scans++;
      ok(!r.broken.length, `${where}：畫面上有漏翻或錯誤文字 ${JSON.stringify(r.broken)}`);
      if (lang === 'en') {
        ok(r.lang === 'en', `${where}：<html lang> 應為 en`);
        ok(!r.cjk.length, `${where}：英文模式出現中文 ${JSON.stringify(r.cjk)}`);
      }
    },
    async shot(label) {
      await P.check(label);
      // 等房間淡入之類的一次性動畫跑完（略過無限循環的動畫）
      if (SHOTS) await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${lang}-${String(++step).padStart(2, '0')}-${label}.png`) });
    },
    async obj(id) {
      const b = page.locator(`#objects [data-obj="${id}"]`);
      ok(await b.count() === 1, `找不到物件 ${id}，目前：${(await page.locator('#objects').innerText()).replace(/\s+/g, ' ')}`);
      ok((await b.innerText()).trim() === name(id), `物件 ${id} 的名稱應為「${name(id)}」`);
      await b.click();
    },
    async item(id) {
      const b = page.locator(`#inventory [data-item="${id}"]`);
      ok(await b.count() === 1, `物品欄沒有 ${id}`);
      await b.click();
    },
    async use(id, target) { await P.item(id); await P.obj(target); },
    async combine(a, b) { await P.item(a); await page.click('[data-detail=combine]'); await P.item(b); },
    async room(id) {
      const b = page.locator(`#nav [data-room="${id}"]`);
      ok(await b.isEnabled(), `無法前往 ${id}`);
      await b.click();
      ok((await page.locator('#room-name').innerText()).trim() === G.rooms[id].name[lang], `房間名稱 ${id}`);
      await P.check('room ' + id);
    },
    async modalOpen() { return page.locator('#modal-back').isVisible(); },
    async close() { if (await P.modalOpen()) await page.click('#modal-close'); },
    async said(x) {
      const t = await page.locator('#narration').innerText();
      ok(x[lang].test(t), `敘述中沒有 ${x[lang]}：${t}`);
      await P.check('narration ' + x[lang]);
    },
    async feedback(x) {
      const t = await page.locator('#modal-body .feedback').innerText();
      ok(x[lang].test(t), `回饋中沒有 ${x[lang]}：${t}`);
      await P.check('feedback ' + x[lang]);
    },
    async feedbackLacks(x) {
      const t = await page.locator('#modal-body .feedback').innerText();
      ok(!x[lang].test(t), `資深模式答錯時不應點破錯在哪（${x[lang]}）：${t}`);
    },
    async modalHasEnding(x, msg) {
      ok(x[lang].test(await page.locator('#ending-card').innerText()), msg);
    },
    async modalHas(x, msg) {
      const t = await page.locator('#modal-body').innerText();
      ok(x[lang].test(t), `${msg}：對話框中沒有 ${x[lang]}`);
    },
    async has(id) { return (await page.locator(`#inventory [data-item="${id}"]`).count()) === 1; },
    async lockType(code) {
      for (const ch of code) await page.keyboard.press(ch);
      await page.click('#modal-body [data-act=open]');
    },
    async lockWheels(code) {
      // 用 ▲ 按鈕一位一位轉到目標數字（測試按鈕操作）
      const digits = await page.locator('#modal-body .digit').allInnerTexts();
      for (let i = 0; i < code.length; i++) {
        const need = (+code[i] - +digits[i] + 10) % 10;
        for (let k = 0; k < need; k++) await page.click(`#modal-body [data-up="${i}"]`);
      }
      await page.click('#modal-body [data-act=open]');
    },
    async dial(ids) {
      const names = ids.map(id => G.CONSTELLATIONS[id].name[lang]);
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 9; k++) {
          const cur = (await page.locator('#modal-body .picker-row .name').nth(i).innerText()).trim();
          if (cur === names[i]) break;
          await page.click(`#modal-body [data-next="${i}"]`);
        }
      }
      await P.check('dial');
      await page.click('#modal-body [data-act=turn]');
    },
    async clock(h, m) {
      const hv = ui('hourVal', lang, { h }), mv = ui('minVal', lang, { m: String(m).padStart(2, '0') });
      for (let k = 0; k < 12; k++) {
        if ((await page.locator('#modal-body .picker-row .name').nth(0).innerText()).trim() === hv) break;
        await page.click('#modal-body [data-h="1"]');
      }
      for (let k = 0; k < 12; k++) {
        if ((await page.locator('#modal-body .picker-row .name').nth(1).innerText()).trim() === mv) break;
        await page.click('#modal-body [data-m="5"]');
      }
      await page.click('#modal-body [data-act=set]');
    },
    async noHorizontalScroll(label) {
      const over = await page.evaluate(() => document.scrollingElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 1, `${label} 出現水平捲動（多出 ${over}px）`);
    },
  };
  return P;
}

async function newGame(P, { mode = 'novice', tutorial = false } = {}) {
  const { page } = P;
  await page.click('#btn-new');
  ok(await P.modalOpen(), '「新遊戲」應先打開難度選擇');
  await P.modalHas(X(/新手[\s\S]*資深/, /Novice[\s\S]*Veteran/), '兩種難度');
  await P.check('mode');
  const box = page.locator('#tut-toggle');
  if ((await box.isChecked()) !== tutorial) await box.click();
  await page.click(`#modal-body [data-mode="${mode}"]`);
  await P.check('intro');
  for (let i = 0; i < 6 && await page.locator('#intro').isVisible(); i++) await page.click('#btn-intro-next');
  ok(await P.modalOpen(), '開場後應該打開信');
  await P.modalHas(X(/三枚徽章/, /Three emblems/), '信的內容');
  if (mode === 'veteran') await P.modalHas(X(/周伯/, /Old Zhou/), '資深模式的信提到周伯');
  await P.check('letter');
  await P.close();
  const chip = (await page.locator('#chip-mode').innerText()).trim();
  ok(chip === ui(mode === 'veteran' ? 'modeVeteran' : 'modeNovice', P.lang), `狀態列應顯示難度，實際「${chip}」`);
  ok((await page.locator('#tutorial').isVisible()) === tutorial, tutorial ? '應出現操作教學' : '關掉教學時不應出現教學');
}

/* ---------- 各段流程（全部用介面操作） ---------- */
async function studyDrawer(P, { tryTrap = true } = {}) {
  await P.obj('f_coat');
  await P.said(X(/手電筒（沒電）/, /Flashlight \(Dead\)/));
  await P.room('study');
  await P.obj('s_shelf'); await P.shot('bookshelf'); await P.close();
  await P.obj('s_clipping'); await P.shot('clipping'); await P.close();
  await P.obj('s_drawer');
  if (tryTrap) {
    await P.lockType('7135');
    await P.feedback(X(/位置/, /positions/));  // 誤把位置當卷數時，會被溫和地點出
    await P.shot('drawer-wrong');
  }
  await P.lockType('3751');
  ok(!(await P.modalOpen()), '抽屜開了之後應關閉鎖的視窗');
  await P.said(X(/抽屜彈開/, /drawer springs open/));
  ok(await P.has('greenhouse_key') && await P.has('battery') && await P.has('page1'), '抽屜物品');
  // 錯誤組合不會造成任何改變
  await P.combine('letter', 'battery');
  await P.said(X(/組合不起來/, /can't combine/));
  await P.combine('flashlight_dead', 'battery');
  await P.said(X(/白光/, /white light/));
  ok(await P.has('flashlight'), '手電筒');
  await P.obj('s_desk');
  await P.obj('s_waste');
  await P.obj('s_painting');
  await P.said(X(/保險箱/, /a safe is set into the wall/));
}

async function greenhouseAndGate(P) {
  await P.room('foyer');
  await P.obj('f_gh_door');
  await P.said(X(/鎖著/, /is locked/));
  await P.use('greenhouse_key', 'f_gh_door');
  await P.said(X(/溫室門開了/, /greenhouse door opens/));
  await P.obj('f_gh_door');
  await P.obj('g_pots');
  await P.page.click('#modal-body [data-pot="sage"]');
  await P.feedback(X(/徒手挖不動/, /bare hands/));      // 還沒拿鏟子
  await P.close();
  await P.obj('g_tools');
  await P.obj('g_pots'); await P.shot('pots');
  await P.page.click('#modal-body [data-pot="mint"]');
  await P.feedback(X(/什麼也沒有/, /Nothing but roots/));
  await P.page.click('#modal-body [data-pot="rose"]');
  await P.said(X(/黃銅鑰匙/, /a brass key/));
  // 月光反光鏡：照提示的解切換鏡子
  await P.obj('g_mirrors');
  const target = { A: '\\', B: '/', C: '/', D: '\\', E: '/', F: '/', G: '\\' };
  const initial = { A: '/', B: '\\', C: '\\', D: '/', E: '\\', F: '\\', G: '/' };
  for (const id of Object.keys(target)) if (target[id] !== initial[id]) await P.page.click(`#modal-body [data-mirror="${id}"]`);
  await P.feedback(X(/落在月光花上/, /falls on the moonflower/));
  await P.shot('mirrors-solved');
  await P.close();
  await P.use('flashlight', 'g_bench');
  await P.said(X(/活板門/, /trapdoor/));
  await P.room('foyer');
  await P.use('brass_key', 'f_gate');
  await P.obj('f_gate');
}

async function observatory(P, { vet = false } = {}) {
  const { page } = P;
  await P.obj('o_telescope');
  await P.said(X(/目鏡座是空的/, /eyepiece holder is empty/));
  await P.use('flashlight', 'o_under');
  await P.use('eyepiece', 'o_telescope');
  await P.obj('o_poster'); await P.shot('poster'); await P.close();
  // 先看預設方位（北），再轉到東南
  await P.obj('o_telescope'); await P.shot('eyepiece-north');
  await page.click('#modal-body [data-act=dome]');
  await page.click('#modal-body [data-dir="SE"]');
  await P.feedback(X(/東南/, /southeast/));
  await page.click('#modal-body [data-act=look]'); await P.shot('eyepiece-southeast');
  await P.close();
  await P.obj('o_dial');
  await P.dial(['bird', 'boat', 'key']);  // 沒考慮倒像的答案
  await P.feedback(vet ? X(/^星盤紋絲不動。$/, /^The dial doesn't budge\.$/) : X(/順序不對/, /order is wrong/));
  await P.shot('dial-wrong');
  await P.dial(['key', 'boat', 'bird']);
  await P.said(X(/星徽/, /star emblem/));
  await P.obj('o_cabinet');
  await P.obj('o_log'); await P.shot('obs-log'); await P.close();
  await P.obj('o_almanac'); await P.shot('almanac'); await P.close();
  await P.obj('o_lamp');
  if (vet) return; // 資深模式的星圖膠片藏在閣樓的音樂盒裡
  await overlay(P);
}

async function overlay(P) {
  const { page } = P;
  await P.combine('grid_paper', 'transparency');
  await P.item('overlay'); await page.click('[data-detail=view]'); await P.shot('overlay'); await P.close();
  ok(!(await page.evaluate(() => document.body.classList.contains('holding'))), '查看之後物品不應仍拿在手上');
}

async function clockSafeValves(P, { vet = false } = {}) {
  const { page } = P;
  await P.room('foyer');
  await P.obj('f_clock');
  await P.clock(2, 15);
  await P.feedback(X(/毫無反應/, /does nothing/));
  await P.shot('clock');
  await P.clock(3, 15);
  await P.said(X(/三點十五分/, /quarter past three/));
  await P.room('study');
  await P.obj('s_safe');
  await P.lockWheels('472');
  await P.said(X(/太陽徽章/, /sun emblem/));
  await P.room('greenhouse');
  await P.obj('g_valves');
  await page.click('#modal-body [data-act=main]');
  await P.feedback(X(/手輪不見了/, /handwheel is missing/));
  await P.close();
  await P.use('valve_wheel', 'g_valves');
  await P.obj('g_valves');
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5']) await page.click(`#modal-body [data-valve="${v}"]`); // 全開
  await page.click('#modal-body [data-act=main]');
  await P.feedback(vet ? X(/怪聲——不對/, /pipes groan — not right/) : X(/仙人掌/, /cactus/));
  if (vet) await P.feedbackLacks(X(/仙人掌|蕨|蘭/, /cactus|fern|orchid/));
  await P.shot('valves-wrong');
  for (const v of ['V1', 'V3']) await page.click(`#modal-body [data-valve="${v}"]`); // 關掉 V1、V3
  await page.click('#modal-body [data-act=main]');
  await P.said(X(/汩汩的水聲/, /gurgles/));
  await P.shot('greenhouse');
  await P.obj('g_moonflower');
  await P.said(X(/銀白色的徽章/, /silvery emblem/));
}

async function darkroom(P) {
  const { page } = P;
  await P.room('observatory');
  await P.obj('o_log'); await P.close();
  await P.combine('note_left', 'note_right');
  await P.item('note_full'); await page.click('[data-detail=view]'); await P.shot('note-full'); await P.close();
  await P.room('greenhouse');
  await P.obj('g_trapdoor');
  await P.lockType('1208');
  await P.obj('g_trapdoor');
  await P.said(X(/只准開紅燈/, /RED LIGHT ONLY/));
  await P.use('flashlight', 'd_socket');
  await P.said(X(/白光會毀掉一切/, /white light ruins everything/));
  await P.shot('darkroom-dark');
  await P.use('red_bulb', 'd_socket');
  await P.obj('d_line');
  await P.obj('d_shelf'); await P.shot('bottle-card'); await P.close();
  await P.obj('d_tray');
  for (const b of ['red', 'blue', 'yellow', 'white']) await page.click(`#modal-body [data-bottle="${b}"]`);
  await page.click('#modal-body [data-act=go]');
  await P.feedback(X(/順序不對/, /Wrong order/));
  for (const b of ['yellow', 'white', 'blue', 'red']) await page.click(`#modal-body [data-bottle="${b}"]`);
  await P.shot('develop');
  await page.click('#modal-body [data-act=go]');
  await P.said(X(/彗星/, /comet/));
  await P.shot('darkroom-lit');
  ok(await P.has('plate'), '底片');
}

/* ---------- 資深模式各段（全部用介面操作） ---------- */
const NOT_RIGHT = X(/^不對。$/, /^That's not right\.$/);

// 操作教學：第一步要真的點衣帽架；第五步在資深模式會說明第一階段沒有提示
async function tutorial(P) {
  const { page } = P;
  const text = () => page.locator('#tut-text').innerText();
  ok(await page.locator('#tutorial').isVisible(), '教學應出現');
  ok((await text()) === ui('tut1', P.lang), '教學第一步');
  ok(await page.locator('#tut-next').isHidden(), '第一步要真的點衣帽架，不能直接按下一步');
  await P.shot('tutorial-1');
  await page.click('#scene [data-hs="f_coat"]');
  await P.said(X(/手電筒（沒電）/, /Flashlight \(Dead\)/));
  ok((await text()) === ui('tut2', P.lang), '點了衣帽架之後前進到第二步');
  for (const k of ['tut3', 'tut4', 'tut5']) {
    await page.click('#tut-next');
    const want = ui(k, P.lang) + (k === 'tut5' ? (P.lang === 'en' ? ' ' : '') + ui('tut5v', P.lang) : '');
    ok((await text()) === want, `教學 ${k}：${await text()}`);
  }
  await page.waitForTimeout(300); // 等圈選框移動到位
  const ring = await page.locator('#tut-ring').boundingBox(), btn = await page.locator('#btn-hints').boundingBox();
  ok(Math.abs(ring.x + 6 - btn.x) < 2 && Math.abs(ring.y + 6 - btn.y) < 2, '第五步應圈出提示按鈕');
  await P.shot('tutorial-5');
  await page.click('#tut-next');
  ok((await page.locator('#tut-next').innerText()).trim() === ui('tutDone', P.lang), '最後一步的按鈕是「開始」');
  await page.click('#tut-next');
  ok(await page.locator('#tutorial').isHidden(), '教學結束');
}

async function hintsLocked(P) {
  const { page } = P;
  ok((await page.locator('#hint-label').innerText()).trim() === ui('hintsBtnLocked', P.lang), '第一階段提示按鈕顯示鎖定');
  await page.click('#btn-hints');
  await P.modalHas(X(/第一階段不開放提示/, /no hints in the first stage/), '第一階段鎖定提示');
  ok(await page.locator('#modal-body [data-hint]').count() === 0, '鎖定時沒有任何提示按鈕');
  await P.shot('hints-locked');
  await P.close();
}

async function vetStudy(P, { tutorialDone = true } = {}) {
  const { page } = P;
  if (!tutorialDone) await P.obj('f_coat');
  await P.room('study');
  // 背下來的密碼沒有用：還沒看過書架，正確的 3751 也打不開
  await P.obj('s_drawer');
  await P.lockType('3751');
  await P.feedback({ zh: new RegExp('^' + reEsc(G.puzzles.drawer.needClue.zh) + '$'), en: new RegExp('^' + reEsc(G.puzzles.drawer.needClue.en) + '$') });
  ok(!(await P.has('greenhouse_key')), '沒看過書架就打不開抽屜');
  await P.close();
  await P.obj('s_shelf'); await P.close();
  await P.obj('s_drawer');
  await P.lockType('7135');
  await P.feedback(X(/^鎖紋絲不動。$/, /^The lock doesn't budge\.$/));  // 資深模式不點破「數成了位置」
  await P.feedbackLacks(X(/位置/, /position/));
  await P.lockType('3751');
  await P.said(X(/抽屜彈開/, /drawer springs open/));
  ok(await P.has('photo_comet'), '資深模式的抽屜裡還有一張照片');
  ok((await page.locator('#hint-label').innerText()).trim() === ui('hintsBtnLocked', P.lang), '燈還沒修好，第一階段還沒完成');
  await P.combine('flashlight_dead', 'battery');
  await P.said(X(/階段完成/, /Stage complete/));
  ok(await page.locator('#btn-hints').evaluate(b => b.classList.contains('pulse')), '完成階段後提示按鈕會亮起來');
  ok((await page.locator('#hint-label').innerText()).trim() === ui('hintsBtn', P.lang, { n: 2, total: 8 }), '提示按鈕顯示第 2/8 階段');
  await page.click('#btn-hints');
  await P.modalHas(X(/2\/8/, /2\/8/), '提示顯示目前階段');
  await page.locator('#modal-body .hint.current [data-hint]').first().click();
  ok(await page.locator('#modal-body .hint.current li').count() === 1, '目前階段的提示可以展開');
  await P.shot('hints-stage2');
  await P.close();
  ok(!(await page.locator('#btn-hints').evaluate(b => b.classList.contains('pulse'))), '打開提示後按鈕不再閃');
  await P.obj('s_desk');
  ok(await P.has('paperweight'), '書桌上的紙鎮');
  await P.obj('s_painting');
  await P.use('flashlight', 's_fireplace');
  ok(await P.has('storeroom_key'), '煙囪裡的儲物間鑰匙');
}

async function vetStoreroom(P) {
  const { page } = P;
  await P.room('foyer');
  await P.use('greenhouse_key', 'f_gh_door');
  await P.obj('f_gh_door');
  await P.obj('g_tools');
  await P.obj('g_rules'); await P.close();
  await P.obj('g_pots');
  await page.click(`#modal-body [data-pot="${G.POT_ANSWER_V}"]`);       // 背答案：還沒問周伯就挖對的那一盆
  await P.feedback({ zh: new RegExp(reEsc(G.puzzles.pots.needClue.zh)), en: new RegExp(reEsc(G.puzzles.pots.needClue.en)) });
  ok(!(await P.has('brass_key')), '還沒問周伯，挖不到鑰匙');
  ok((await page.locator('#modal-body .notice').first().innerText()) === ui('potsChances', P.lang, { n: 3, total: 3 }), '被拒絕的挖掘不扣機會');
  await P.close();
  await P.obj('g_storedoor');
  await P.said(X(/閒人勿進/, /Keep out/));
  await P.use('storeroom_key', 'g_storedoor');
  await P.obj('g_storedoor');
  ok((await page.locator('#room-name').innerText()).trim() === G.rooms.storeroom.name[P.lang], '進入儲物間');
  await P.shot('storeroom');
  await P.obj('t_calendar'); await P.shot('calendar'); await P.close();
  await P.obj('t_balance');
  ok(await page.locator('#modal-body .notice').count() === 0, '帶著紙鎮時不應提示缺砝碼');
  const pan = async (id, side) => page.click(`#modal-body [data-pan="${id}:${side}"]`);
  // 先比兩罐：蕨 vs 月 → 蕨重；再用砝碼秤出月＝3
  const read = () => page.locator('#modal-body .balance-read').innerText();
  ok((await read()) === ui('balanceReadNone', P.lang), '空的天平');
  await pan('tin_fern', 'L'); await pan('tin_moon', 'R');
  ok((await read()) === ui('balanceReadL', P.lang), '蕨類比月光花重：左盤沉下去');
  await pan('tin_fern', ''); await pan('tin_moon', '');
  await pan('tin_moon', 'L'); await pan('w2', 'L'); await pan('w5', 'R');
  ok((await read()) === ui('balanceReadEven', P.lang), '月光花＋2 兩＝5 兩：平衡');
  await P.shot('balance');
  await page.click('#modal-body [data-act=clear]');
  ok(await page.locator('#modal-body [data-pan$=":L"].cur').count() === 0, '清空天平');
  await page.click('#modal-body [data-act=cabinet]');
  await P.lockType('473');
  await P.feedback(X(/^鎖紋絲不動。$/, /^The lock doesn't budge\.$/));
  await P.lockType(G.SEED_CODE);
  ok(await P.has('hook_pole'), '種子櫃裡的鉤桿');
  await P.close();
  await P.obj('t_window');
  await P.modalHas(X(/燈號/, /Signal/), '帶著手電筒時小窗打開燈號畫面');
  await sendSignal(P, ['.-.']);                                         // 還沒有燈號卡：連「晴」都打不出去
  await P.feedback({ zh: new RegExp(reEsc(G.puzzles.signal.needClue.zh)), en: new RegExp(reEsc(G.puzzles.signal.needClue.en)) });
  await P.close();
}

async function vetAttic(P) {
  const { page } = P;
  await P.room('foyer');
  await P.obj('f_hatch');
  await P.said(X(/搆不著/, /far too high/));
  await P.use('hook_pole', 'f_hatch');
  await P.obj('f_hatch');
  ok((await page.locator('#room-name').innerText()).trim() === G.rooms.attic.name[P.lang], '爬上閣樓');
  await P.shot('attic');
  await P.obj('a_chest');
  ok(await P.has('code_card'), '燈號卡');
  await P.obj('a_photobox'); await P.close();
  ok(await P.has('photos'), '五張照片');
  await P.obj('a_marks'); await P.shot('height-marks'); await P.close();
  await P.obj('a_window');
  await P.obj('a_frame');
  await page.click('#modal-body [data-act=flip]');
  await P.shot('photos-backs');
  await page.click('#modal-body [data-act=flip]');
  for (const id of ['ph_a', 'ph_b', 'ph_c', 'ph_d', 'ph_e', 'ph_f']) await page.click(`#modal-body .tray [data-photo="${id}"]`);
  await page.click('#modal-body [data-slot="0"]');           // 取下一張再掛回去
  ok(await page.locator('#modal-body .tray [data-photo="ph_a"]').count() === 1, '取下的照片回到下方');
  await page.click('#modal-body .tray [data-photo="ph_a"]');
  await page.click('#modal-body [data-act=hang]');
  await P.feedback(X(/毫無動靜。不對。/, /don't react\. Not right\./));
  await page.click('#modal-body [data-act=clear]');
  for (const id of G.PHOTO_ORDER) await page.click(`#modal-body .tray [data-photo="${id}"]`);
  await P.shot('photos');
  await page.click('#modal-body [data-act=hang]');
  ok(await P.has('crank') && await P.has('qing_letter'), '相框後的發條鑰匙與晴的信');
  await P.use('crank', 'a_musicbox');
  await P.obj('a_musicbox');
  // 背答案：還沒看過天文台的星座圖，就算用鍵盤彈出正確的旋律也沒有用
  for (const n of G.MUSIC_ANSWER) await page.keyboard.press(n === 10 ? '0' : String(n));
  await page.click('#modal-body [data-act=play]');
  await P.feedback({ zh: new RegExp(reEsc(G.puzzles.musicbox.needClue.zh)), en: new RegExp(reEsc(G.puzzles.musicbox.needClue.en)) });
  ok(!(await P.has('transparency')), '沒有線索時音樂盒不會打開');
  await page.click('#modal-body [data-act=letter]');
  await P.shot('qing-letter');
  await page.click('#modal-back-btn');
  await P.close();
}

async function sendSignal(P, words) {
  const { page } = P;
  for (let i = 0; i < words.length; i++) {
    for (const ch of words[i]) await page.click(`#modal-body [data-sig="${ch}"]`);
    if (i < words.length - 1) await page.click('#modal-body [data-act=next]');
  }
  await page.click('#modal-body [data-act=send]');
}

async function vetSignal(P) {
  const { page } = P;
  await P.room('storeroom');
  await P.obj('t_window');
  const reply = () => page.locator('#modal-body .sig-line.reply .sig-code').innerText();
  await sendSignal(P, ['---', '...']);                 // 還沒先表明身分就問
  await P.feedback(X(/一動也不動/, /doesn't stir/));
  ok(await page.locator('#modal-body .sig-line.reply').count() === 0, '周伯還沒回應');
  await sendSignal(P, ['.-.']);                         // 晴
  ok((await reply()) === '··', '周伯回「好」');
  await sendSignal(P, ['---', '---']);                  // 看不懂的話
  ok((await reply()) === '···', `周伯回「?」：${await reply()}`);
  await sendSignal(P, ['---', '...']);                  // 花盆？
  ok((await reply()) === G.ZHOU_REPLY.pot.map(w => G.SIGNAL_OF[w]).map(c => c.replace(/\./g, '·').replace(/-/g, '—')).join(' / '), `周伯回答花盆：${await reply()}`);
  await P.shot('signal');
  await page.click('#modal-body [data-act=card]');
  await P.shot('code-card');
  await page.click('#modal-back-btn');
  await sendSignal(P, ['-.-', '...']);                  // 鑰匙？
  ok((await reply()) === G.ZHOU_REPLY.key.map(w => G.SIGNAL_OF[w]).map(c => c.replace(/\./g, '·').replace(/-/g, '—')).join(' / '), '周伯回答鑰匙');
  await P.close();
}

async function vetGreenhouse(P) {
  const { page } = P;
  await P.room('greenhouse');
  await P.obj('g_pots');
  ok(await page.locator('#modal-body [data-pot]').count() === 8, '資深模式有八個花盆');
  await P.shot('pots8');
  await page.click('#modal-body [data-pot="mint"]');
  await P.feedback(X(/什麼也沒有/, /Nothing but roots/));
  await page.click(`#modal-body [data-pot="${G.POT_ANSWER_V}"]`);
  await P.said(X(/黃銅鑰匙/, /a brass key/));
  await P.obj('g_mirrors');
  const beam = () => page.locator('#modal-body .beam').count();
  ok(await beam() === 0, '資深模式拉開天窗前看不到光路');
  await page.click('#modal-body [data-act=skylight]');
  await P.feedback(X(/不對/, /Not right/));
  ok(await beam() > 0, '拉開天窗後看得到這一次的光路');
  await P.shot('mirrors16-reveal');
  const cfg = Object.assign({}, G.MIRROR_GRID_V.initial);
  for (const id of Object.keys(G.MIRROR_SOLUTION_V)) {
    if (G.MIRROR_SOLUTION_V[id] !== cfg[id]) await page.click(`#modal-body [data-mirror="${id}"]`);
  }
  ok(await beam() === 0, '動了鏡子之後光路消失');
  await page.click('#modal-body [data-act=skylight]');
  await P.said(X(/月光花/, /moonflower/));
  await P.obj('g_mirrors'); await P.shot('mirrors16-solved'); await P.close();
  await P.use('flashlight', 'g_bench');
  await P.room('foyer');
  await P.use('brass_key', 'f_gate');
  await P.obj('f_gate');
}

async function vetMusic(P) {
  const { page } = P;
  await P.room('attic');
  await P.obj('a_musicbox');
  for (const k of ['1', '2', '3']) await page.keyboard.press(k);              // 讀過星座圖之後：彈錯只說「不對」
  await page.click('#modal-body [data-act=play]');
  await P.feedback(X(/什麼也沒發生。不對。/, /nothing happens\. Not right\./));
  for (const n of G.MUSIC_ANSWER) await page.click(`#modal-body [data-tine="${n}"]`);
  await P.shot('musicbox');
  await page.click('#modal-body [data-act=play]');
  ok(await P.has('transparency') && await P.has('page2'), '音樂盒裡的星圖膠片與日記第二頁');
  await overlay(P);
}

async function vetDarkroom(P, { dryingLine = true } = {}) {
  const { page } = P;
  await P.room('study');
  await P.obj('s_waste');
  await P.room('observatory');
  await P.obj('o_log'); await P.close();
  await P.combine('note_left', 'note_right');
  await P.item('note_full'); await page.click('[data-detail=view]');
  await P.modalHas(X(/冬夜的月和日/, /month and day of that winter night/), '資深便條只給謎面');
  ok(!(await page.locator('#modal-body').innerText()).includes('1208'), '資深便條不直接寫出密碼');
  await P.shot('note-full-v'); await P.close();
  await P.room('greenhouse');
  await P.obj('g_trapdoor');
  await P.lockType('1210');                                  // 韓嶽宣稱的日期
  await P.feedback(X(/^鎖紋絲不動。$/, /^The lock doesn't budge\.$/));
  await P.lockType('1208');                                  // 陸觀拍到彗星的那一夜
  await P.obj('g_trapdoor');
  await P.use('red_bulb', 'd_socket');
  if (dryingLine) await P.obj('d_line');
  await P.obj('d_chart'); await P.shot('process-chart'); await P.close();
  await P.obj('d_shelf'); await P.shot('bottle-card-v'); await P.close();
  await P.obj('d_tray');
  ok(await page.locator('#modal-body [data-bottle]').count() === 8, '資深模式有八瓶藥劑');
  await page.click('#modal-body [data-doc]');
  await P.modalHas(X(/潤濕液/, /wetting agent/), '沖洗台的「看卡片」打開資深的藥瓶卡片');
  await page.click('#modal-back-btn');
  for (const b of ['red', 'blue', 'yellow', 'white', 'green', 'black', 'orange', 'purple']) await page.click(`#modal-body [data-bottle="${b}"]`);
  await page.click('#modal-body [data-act=go]');
  await P.feedback(X(/一片模糊。不對。/, /just a blur\. Not right\./));
  for (const b of G.DEVELOP_ANSWER_V) await page.click(`#modal-body [data-bottle="${b}"]`);
  await P.shot('develop8');
  await page.click('#modal-body [data-act=go]');
  await P.said(X(/彗星/, /comet/));
  ok(await P.has('plate'), '底片');
}

/* ---------- 資深模式：五個結局 ---------- */
async function vetRun(browser, lang) {
  const results = [];
  const page = await setup(browser, lang);
  const P = player(page, lang);
  await newGame(P, { mode: 'veteran', tutorial: true });
  await tutorial(P);
  await hintsLocked(P);
  await vetStudy(P);
  await vetStoreroom(P);
  await vetAttic(P);
  await vetSignal(P);
  await vetGreenhouse(P);
  await observatory(P, { vet: true });
  await vetMusic(P);
  await clockSafeValves(P, { vet: true });
  // 欄位三：三枚徽章到手、還沒進暗房 → 之後走普通結局 A
  await page.click('#btn-save'); await page.click('#modal-body [data-save="3"]'); await P.close();
  await vetDarkroom(P, { dryingLine: false });
  // 欄位二：底片到手、但沒拿晾片繩上的日記四 → 之後走孤證 C
  await page.click('#btn-save'); await page.click('#modal-body [data-save="2"]'); await P.close();
  await P.obj('d_line');                                 // 還在暗房裡：補拿晾片繩上的日記四
  await P.combine('page1', 'page2');
  await P.combine('diary', 'page3');
  await P.combine('diary', 'page4');
  ok(/4\/4/.test(await page.locator('#inventory').innerText()), '日記 4/4');
  await P.item('plate'); await page.click('[data-detail=view]'); await P.close();
  await P.room('foyer');
  await P.obj('f_phone');
  await page.click('#modal-body [data-act=later]');
  await insertEmblems(P);
  await exitWith(P, 'publish', 'B');
  await P.modalHasEnding(X(/周伯/, /Zhou/), '資深模式的真結局提到周伯');
  ok((await page.locator('.stats').innerText()).includes(ui('modeVeteran', lang)), '結局統計顯示資深');
  results.push('B');
  await page.click('#btn-preend');
  await exitWith(P, 'leave_plate', 'E');
  results.push('E');
  await page.click('#btn-preend');
  await P.obj('f_phone');
  await page.click('#modal-body [data-act=accept]');
  await page.click('#modal-body [data-act=yes]');
  await page.waitForSelector('#ending:not([hidden])');
  ok(await page.locator('.ending-title').innerText() === G.endings.D.title[lang], '結局 D');
  results.push('D');
  // 讀欄位二 → 孤證 C
  await page.click('#btn-end-title');
  await page.click('#btn-load');
  await page.click('#modal-body [data-load="2"]');
  ok(await P.has('plate') && !(await P.has('page4')), '欄位二：有底片、沒有日記四');
  ok((await page.locator('#chip-mode').innerText()).trim() === ui('modeVeteran', lang), '讀檔後仍是資深模式');
  await P.room('foyer');
  await insertEmblems(P);
  await exitWith(P, 'publish', 'C');
  results.push('C');
  // 讀欄位三 → 普通結局 A
  await page.click('#btn-end-title');
  await page.click('#btn-load');
  await page.click('#modal-body [data-load="3"]');
  ok(!(await P.has('plate')), '欄位三：還沒有底片');
  await P.room('foyer');
  await insertEmblems(P);
  await exitWith(P, 'leave', 'A');
  results.push('A');
  await page.click('#btn-end-gallery');
  ok(await page.locator('#modal-body .badge-vet').count() === 5, '圖鑑上五個結局都有資深徽記');
  await P.shot('gallery-veteran');
  await P.close();
  await page.context().close();
  return results;
}

async function insertEmblems(P) {
  for (const e of ['emblem_sun', 'emblem_moon', 'emblem_star']) await P.use(e, 'f_door');
  await P.said(X(/大門的鎖開了/, /lock has opened/));
}

async function exitWith(P, choice, endingId) {
  const { page } = P;
  await P.obj('f_door');
  ok(await P.modalOpen(), '大門應該打開離開對話');
  await page.click(`#modal-body [data-choice="${choice}"]`);
  await P.check('exit-confirm');
  await page.click('#modal-body [data-yes]');
  await page.waitForSelector('#ending:not([hidden])');
  const title = await page.locator('.ending-title').innerText();
  const want = G.endings[endingId].title[P.lang];
  ok(title === want, `應為結局「${want}」，實際「${title}」`);
  await P.shot('ending-' + endingId);
}

/* ---------- 一整輪：五個結局 ---------- */
async function fullRun(browser, lang) {
  const results = [];
  // 第一輪：完整收集 → 真結局 B，再從「結局前」分歧到 E、D
  {
    const page = await setup(browser, lang);
    const P = player(page, lang);
    await P.shot('title');
    await newGame(P);
    await P.shot('foyer');
    await studyDrawer(P);
    // 手動存到欄位二（之後用來走「孤證」結局：還沒搜過煙囪）
    await page.click('#btn-save');
    await page.click('#modal-body [data-save="2"]');
    await P.modalHas(X(/欄位二/, /Slot 2/), '存到欄位二');
    await P.shot('save');
    await P.close();
    await P.use('flashlight', 's_fireplace');
    await P.said(X(/捲起來的紙/, /rolled-up sheet/));
    // 提示與筆記
    await page.click('#btn-hints');
    await page.locator('#modal-body [data-hint]').first().click();
    ok(await page.locator('#modal-body .hint li').count() >= 1, '提示應顯示');
    await P.shot('hints'); await P.close();
    await page.click('#btn-notes');
    await page.click('#modal-body [data-note="clipping"]');
    await P.modalHas(X(/東南/, /southeast/), '剪報可從筆記重讀');
    await page.click('#modal-back-btn');
    ok((await page.locator('#modal-title').innerText()) === ui('notesTitle', lang), '返回筆記清單');
    await P.close();
    await greenhouseAndGate(P);
    await observatory(P);
    await clockSafeValves(P);
    await darkroom(P);
    // 存檔碼匯出／匯入來回
    await page.click('#btn-save');
    const code = await page.locator('#code-out').inputValue();
    ok(code.startsWith('STAR1.'), '存檔碼格式');
    await page.fill('#code-in', code.slice(0, -3) + 'xyz');
    await page.click('#modal-body [data-act=import]');
    await P.modalHas(X(/校驗失敗|損毀/, /checksum failed|damaged/), '壞掉的存檔碼要被拒絕');
    await P.check('import-error');
    await page.fill('#code-in', code);
    await page.click('#modal-body [data-act=import]');
    ok(!(await P.modalOpen()), '匯入成功後回到遊戲');
    ok(await P.has('plate'), '匯入後底片仍在');
    // 日記裝訂
    await P.combine('page1', 'page2');
    await P.combine('diary', 'page3');
    await P.combine('diary', 'page4');
    ok(/4\/4/.test(await page.locator('#inventory').innerText()), '日記 4/4');
    await P.item('diary'); await page.click('[data-detail=view]'); await P.shot('diary'); await P.close();
    await P.item('plate'); await page.click('[data-detail=view]');
    await P.modalHas(X(/劃掉/, /struck out/), '底片紙套上看得到劃掉的 7');
    await P.shot('plate'); await P.close();
    // 對同一個物品組合：要有回應
    await P.item('letter'); await page.click('[data-detail=combine]'); await P.item('letter');
    await P.said(X(/另一個物品/, /another item/));
    await page.keyboard.press('Escape');
    await P.room('foyer');
    await P.said(X(/電話突然響了/, /suddenly starts to ring/));
    await P.obj('f_phone');
    await P.shot('phone');
    await page.click('#modal-body [data-act=later]');
    await insertEmblems(P);
    await exitWith(P, 'publish', 'B');
    results.push('B');
    await page.click('#btn-preend');
    await exitWith(P, 'leave_plate', 'E');
    results.push('E');
    await page.click('#btn-preend');
    await P.obj('f_phone');
    await page.click('#modal-body [data-act=accept]');
    await P.check('phone-confirm');
    await page.click('#modal-body [data-act=yes]');
    await page.waitForSelector('#ending:not([hidden])');
    ok(await page.locator('.ending-title').innerText() === G.endings.D.title[lang], '結局 D');
    await P.shot('ending-D');
    results.push('D');
    // 結局圖鑑
    await page.click('#btn-end-gallery');
    ok((await page.locator('#modal-body').innerText()).includes(ui('galleryCount', lang, { n: 3, total: 5 })), '圖鑑計數');
    await P.shot('gallery');
    await P.close();

    // 第二輪：讀取欄位二（還沒搜煙囪）→ 拿到底片但日記只有三頁 → 孤證 C
    await page.click('#btn-end-title');
    await page.click('#btn-load');
    await P.check('load');
    await page.click('#modal-body [data-load="2"]');
    ok(await page.locator('#game').isVisible(), '讀檔後進入遊戲');
    ok(!(await P.has('page2')), '欄位二的進度裡還沒有煙囪那一頁');
    await greenhouseAndGate(P);
    await observatory(P);
    await clockSafeValves(P);
    await darkroom(P);
    await P.room('foyer');
    await P.obj('f_phone');
    await page.click('#modal-body [data-act=refuse]');
    await P.said(X(/你會後悔的/, /regret this/));
    await insertEmblems(P);
    await exitWith(P, 'publish', 'C');
    results.push('C');
    await page.context().close();
  }

  // 第三輪：只走主線 → 普通結局 A；同時檢查重新整理後的「繼續遊戲」與語言記憶
  {
    const page = await setup(browser, lang);
    const P = player(page, lang);
    await newGame(P);
    await studyDrawer(P, { tryTrap: false });
    await page.reload();
    ok(await page.evaluate(() => window.__stargazer.lang) === lang, '重新整理後記得語言');
    await page.click('#btn-continue');
    ok(await P.has('greenhouse_key'), '重新整理後自動存檔可繼續');
    await greenhouseAndGate(P);
    await observatory(P);
    await clockSafeValves(P);
    await P.room('foyer');
    await insertEmblems(P);
    await exitWith(P, 'leave', 'A');
    results.push('A');
    await page.context().close();
  }
  return results;
}

// 只用鍵盤：Tab 到場景熱點、Enter 觸發、直接打數字開鎖、Esc 關閉與放下
async function keyboardRun(browser, lang) {
  const page = await setup(browser, lang);
  const name = id => G.hotspots.find(h => h.id === id).name[lang];
  const label = () => page.evaluate(() => { const a = document.activeElement; return (a.getAttribute('aria-label') || a.textContent || '').trim(); });
  await page.focus('#btn-new'); await page.keyboard.press('Enter');
  ok((await label()) === ui('modeStart', lang, { mode: ui('modeNovice', lang) }), '鍵盤：難度選擇的焦點預設在「新手」');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
  ok(await page.locator('#modal-back').isVisible(), '鍵盤：開場後打開信');
  await page.keyboard.press('Escape');
  ok(!(await page.locator('#modal-back').isVisible()), '鍵盤：Esc 關閉');
  ok((await label()) === name('f_door'), '鍵盤：關閉信後焦點回到房間物件');
  let found = false;
  for (let i = 0; i < 40 && !found; i++) { await page.keyboard.press('Tab'); found = (await label()) === name('f_coat'); }
  ok(found, '鍵盤：Tab 可以到達場景中的熱點');
  await page.keyboard.press('Enter');
  ok(X(/手電筒/, /Flashlight/)[lang].test(await page.locator('#narration').innerText()), '鍵盤：Enter 觸發場景熱點');
  await page.locator('#objects [data-obj="f_study_door"]').focus(); await page.keyboard.press('Enter');
  await page.locator('#objects [data-obj="s_shelf"]').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.locator('#objects [data-obj="s_drawer"]').focus(); await page.keyboard.press('Enter');
  await page.keyboard.type('3751'); await page.keyboard.press('Enter');
  ok(X(/抽屜彈開/, /drawer springs open/)[lang].test(await page.locator('#narration').innerText()), '鍵盤：直接打數字開鎖');
  await page.locator('#inventory [data-item="battery"]').focus(); await page.keyboard.press('Enter');
  ok(await page.evaluate(() => document.body.classList.contains('holding')), '鍵盤：選取物品');
  await page.keyboard.press('Escape');
  ok(!(await page.evaluate(() => document.body.classList.contains('holding'))), '鍵盤：Esc 放下物品');
  await page.context().close();
}

// 手機寬度：不得出現水平捲動
async function mobileRun(browser, lang) {
  const page = await setup(browser, lang, { width: 390, height: 844 });
  const P = player(page, lang);
  await P.noHorizontalScroll('手機標題畫面');
  await P.shot('mobile-title');
  await newGame(P);
  await P.noHorizontalScroll('手機遊戲畫面');
  await P.room('study');
  await P.obj('s_shelf');
  await P.noHorizontalScroll('手機對話框');
  await P.shot('mobile-bookshelf');
  await P.close();
  await P.obj('s_clipping');
  await P.noHorizontalScroll('手機剪報');
  await P.close();
  await P.shot('mobile-study');
  await page.click('#btn-menu');
  await P.noHorizontalScroll('手機選單');
  await P.shot('mobile-menu');
  await P.close();
  // 資深模式的新畫面：用「存檔碼匯入」載入一個剛上閣樓的進度（玩家也能這樣接續別台裝置的進度）
  await page.click('#btn-save');
  await page.fill('#code-in', VET_ATTIC_CODE);
  await page.click('#modal-body [data-act=import]');
  ok(!(await P.modalOpen()) && (await page.locator('#chip-mode').innerText()).trim() === ui('modeVeteran', lang), '匯入資深模式的存檔碼');
  const view = async (label, open, more) => {
    await open();
    await P.noHorizontalScroll('手機' + label);
    if (more) await more();
    await P.shot('mobile-' + label);
    await P.close();
  };
  ok((await page.locator('#room-name').innerText()).trim() === G.rooms.attic.name[lang], '存檔碼的進度停在閣樓');
  await view('photos', () => P.obj('a_frame'), async () => {
    for (const id of G.PHOTO_ORDER) await page.click(`#modal-body .tray [data-photo="${id}"]`);
    await P.noHorizontalScroll('手機相框（掛滿）');
    await P.shot('mobile-photos-full');
    await page.click('#modal-body [data-act=hang]');
  });
  ok(await P.has('crank'), '手機上也能掛好照片');
  await P.use('crank', 'a_musicbox');
  await view('musicbox', () => P.obj('a_musicbox'));
  await P.room('storeroom');
  await view('balance', () => P.obj('t_balance'));
  await view('signal', () => P.obj('t_window'), () => sendSignal(P, ['.-.']));
  await P.room('greenhouse');
  await view('pots8', () => P.obj('g_pots'));
  await view('mirrors16', () => P.obj('g_mirrors'), () => page.click('#modal-body [data-act=skylight]'));
  await page.click('#btn-hints');
  await P.noHorizontalScroll('手機提示');
  await P.shot('mobile-hints');
  await P.close();
  await page.click('#btn-save');
  await page.fill('#code-in', VET_DARKROOM_CODE);
  await page.click('#modal-body [data-act=import]');
  ok((await page.locator('#room-name').innerText()).trim() === G.rooms.darkroom.name[lang], '存檔碼的進度停在暗房');
  await view('develop8', () => P.obj('d_tray'));
  await page.context().close();
}

// 遊戲中途切換語言：進度、物品、紀錄都保留，畫面上的每一段文字都換成新語言
async function switchRun(browser) {
  const page = await setup(browser, 'zh');
  const P = player(page, 'zh');
  await newGame(P);
  await P.obj('f_coat');
  await P.room('study');
  await P.obj('s_shelf'); await P.close();
  await P.obj('s_drawer');
  await P.lockType('3751');
  // 比較時排除遊戲計時（它每秒都在走，與語言無關）
  const snap = () => page.evaluate(() => JSON.stringify(Object.assign({}, window.__stargazer.state, { stats: Object.assign({}, window.__stargazer.state.stats, { playMs: 0 }) })));
  const before = await snap();
  await page.click('#btn-lang');
  ok(await page.evaluate(() => window.__stargazer.lang) === 'en', '狀態列的按鈕切換到英文');
  const en = player(page, 'en');
  await en.check('switch-to-en');
  ok((await page.locator('#room-name').innerText()).trim() === G.rooms.study.name.en, '房間名稱換成英文');
  ok(/drawer springs open/.test(await page.locator('#narration').innerText()), '剛才的敘述也換成英文');
  ok((await page.locator('#log').innerText()).includes(G.items.flashlight_dead.name.en), '紀錄也換成英文');
  const after = await snap();
  ok(before === after, '切換語言不改變遊戲狀態');
  // 在對話框打開時切換：選單裡的語言按鈕
  await en.obj('s_drawer');
  await page.click('#btn-menu');
  await en.check('menu-en');
  await page.click('#modal-body [data-lang="zh"]');
  ok(await page.evaluate(() => window.__stargazer.lang) === 'zh', '選單切換回中文');
  ok((await page.locator('#modal-title').innerText()) === ui('menuTitle', 'zh'), '對話框標題跟著切換');
  await page.click('#modal-body [data-lang="en"]');
  await en.check('menu-en-again');
  await P.close();
  await en.obj('s_painting');
  await en.said(X(/保險箱/, /a safe is set into the wall/));
  await page.context().close();
}

// 資深模式的花盆：挖錯三盆就失敗、整局作廢（自動存檔清除，手動存檔保留，不算結局圖鑑）
async function potsFailRun(browser, lang) {
  const page = await setup(browser, lang);
  const P = player(page, lang);
  await page.click('#btn-load');
  await page.fill('#code-in', VET_POTS_CODE);
  await page.click('#modal-body [data-act=import]');
  ok((await page.locator('#room-name').innerText()).trim() === G.rooms.greenhouse.name[lang], '存檔碼的進度停在溫室');
  await page.click('#btn-save'); await page.click('#modal-body [data-save="1"]'); await P.close();   // 手動存檔：失敗後應該還在
  const notice = () => page.locator('#modal-body .notice').first().innerText();
  await P.obj('g_pots');
  await P.modalHas(X(/挖錯三盆/, /three wrong pots/i), '木牌事先寫明三次限制');
  ok((await notice()) === ui('potsChances', lang, { n: 3, total: 3 }), '一開始有三次機會');
  await P.shot('pots-chances');
  await page.click('#modal-body [data-pot="mint"]');
  await P.feedback(X(/還剩 2 次機會/, /2 chances left/));
  ok((await notice()) === ui('potsChances', lang, { n: 2, total: 3 }), '挖錯一盆：剩兩次');
  ok(await page.locator('#modal-body [data-pot="mint"]').isDisabled(), '挖過的盆不能再挖');
  ok((await page.locator('#modal-body [data-pot="mint"]').innerText()).trim() === ui('potDug', lang), '挖過的盆標示「挖過了」');
  await page.click('#modal-body [data-pot="rose"]');
  await P.feedback(X(/最後一次機會/, /one chance left/));
  ok((await notice()) === ui('potsLastChance', lang), '挖錯兩盆：最後一次');
  // 最後一次要再確認；「再想想」不會挖
  await page.click('#modal-body [data-pot="basil"]');
  await P.modalHas(X(/最後一次機會。確定要挖羅勒盆嗎/, /last chance\. Dig up the Basil pot\?/), '最後一次要確認');
  ok(await page.locator('#modal-body [data-pot="sage"]').isDisabled(), '確認時其他盆不能點');
  await P.shot('pots-confirm');
  await page.click('#modal-body [data-act=dig-no]');
  ok(await page.locator('#modal-body [data-act=dig-yes]').count() === 0 && await page.locator('#game').isVisible(), '再想想：沒有挖');
  await page.click('#modal-body [data-pot="basil"]');
  await page.click('#modal-body [data-act=dig-yes]');
  await page.waitForSelector('#ending:not([hidden])');
  ok((await page.locator('.ending-rank').innerText()).trim().toLowerCase() === G.endings.F.rank[lang].toLowerCase(), '失敗畫面');
  ok((await page.locator('.ending-title').innerText()) === G.endings.F.title[lang], '失敗的標題');
  ok(await page.locator('#btn-preend').count() === 0, '失敗不能回到之前');
  await P.modalHasEnding(X(/失敗/, /lost/), '說明這一局失敗、自動存檔已清除');
  await P.shot('pots-failed');
  await page.click('#btn-end-gallery');
  ok(!(await page.locator('#modal-body').innerText()).includes(G.endings.F.title[lang]), '失敗不進結局圖鑑');
  await P.close();
  await page.click('#btn-end-title');
  ok(await page.locator('#btn-continue').isDisabled(), '整局作廢：沒有「繼續遊戲」');
  // 手動存檔仍在：讀回來是還沒挖的時候
  await page.click('#btn-load');
  await page.click('#modal-body [data-load="1"]');
  await P.obj('g_pots');
  ok((await notice()) === ui('potsChances', lang, { n: 3, total: 3 }), '手動存檔讀回來：三次機會');
  await page.context().close();
}

// 撕開的便條：兩種語言 × 兩種難度 × 左半／右半／拼好，每一行字都要落在紙上（字寬只有在瀏覽器裡才量得到）
async function noteLayoutRun(browser) {
  for (const lang of ['zh', 'en']) {
    const page = await setup(browser, lang);
    await page.evaluate(() => document.fonts.ready);
    for (const mode of ['novice', 'veteran']) for (const w of ['left', 'right', 'full']) {
      const bad = await page.evaluate(([mode, w]) => {
        const d = document.createElement('div'); d.style.width = '640px';
        d.innerHTML = window.Art.note(w, mode); document.body.appendChild(d);
        const svg = d.querySelector('svg'), vb = svg.viewBox.baseVal;
        const out = [...svg.querySelectorAll('text')].map(t => ({ s: t.textContent, bb: t.getBBox() }))
          .filter(({ bb }) => bb.x < vb.x + 12 || bb.x + bb.width > vb.x + vb.width - 12).map(r => r.s);
        d.remove();
        return out;
      }, [mode, w]);
      ok(!bad.length, `便條（${lang}／${mode}／${w}）有字超出紙張：${JSON.stringify(bad)}`);
    }
    await page.context().close();
  }
}

/* ---------- 主流程 ---------- */
(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  const summary = [];
  for (const lang of LANGS) {
    const results = await fullRun(browser, lang);
    const vet = await vetRun(browser, lang);
    await keyboardRun(browser, lang);
    await mobileRun(browser, lang);
    for (const [m, got] of [['novice', results], ['veteran', vet]]) {
      const missing = ['A', 'B', 'C', 'D', 'E'].filter(e => !got.includes(e));
      if (missing.length) { console.error(`[${lang}/${m}] 沒有走到的結局：`, missing); process.exit(1); }
    }
    summary.push(`${lang} 新手：${results.join('、')}／資深：${vet.join('、')}`);
  }
  if (LANGS.length > 1) await switchRun(browser);
  for (const lang of LANGS) await potsFailRun(browser, lang);
  await noteLayoutRun(browser);
  await browser.close();
  console.log(`走完的結局 ${summary.join('；')}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  if (errors.length) { console.error('主控台錯誤：', errors); process.exit(1); }
  console.log(`端對端測試通過：${LANGS.join(' / ')}${LANGS.length > 1 ? ' 兩種語言' : ''}、新手與資深兩種難度，都能只靠介面操作玩到五個結局；英文畫面沒有任何中文，主控台沒有錯誤。`);
})().catch(e => { console.error(e); console.error('主控台錯誤：', errors); process.exit(1); });
