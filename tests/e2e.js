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

async function newGame(P) {
  const { page } = P;
  await page.click('#btn-new');
  if (await page.locator('#btn-new').isVisible()) await page.click('#btn-new'); // 確認覆蓋自動存檔
  await P.check('intro');
  for (let i = 0; i < 6 && await page.locator('#intro').isVisible(); i++) await page.click('#btn-intro-next');
  ok(await P.modalOpen(), '開場後應該打開信');
  await P.modalHas(X(/三枚徽章/, /Three emblems/), '信的內容');
  await P.check('letter');
  await P.close();
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

async function observatory(P) {
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
  await P.feedback(X(/順序不對/, /order is wrong/));
  await P.shot('dial-wrong');
  await P.dial(['key', 'boat', 'bird']);
  await P.said(X(/星徽/, /star emblem/));
  await P.obj('o_cabinet');
  await P.obj('o_log'); await P.shot('obs-log'); await P.close();
  await P.obj('o_almanac'); await P.shot('almanac'); await P.close();
  await P.obj('o_lamp');
  await P.combine('grid_paper', 'transparency');
  await P.item('overlay'); await page.click('[data-detail=view]'); await P.shot('overlay'); await P.close();
  ok(!(await page.evaluate(() => document.body.classList.contains('holding'))), '查看之後物品不應仍拿在手上');
}

async function clockSafeValves(P) {
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
  await P.feedback(X(/仙人掌/, /cactus/));
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
  await page.context().close();
}

// 遊戲中途切換語言：進度、物品、紀錄都保留，畫面上的每一段文字都換成新語言
async function switchRun(browser) {
  const page = await setup(browser, 'zh');
  const P = player(page, 'zh');
  await newGame(P);
  await P.obj('f_coat');
  await P.room('study');
  await P.obj('s_drawer');
  await P.lockType('3751');
  const before = await page.evaluate(() => JSON.stringify(window.__stargazer.state));
  await page.click('#btn-lang');
  ok(await page.evaluate(() => window.__stargazer.lang) === 'en', '狀態列的按鈕切換到英文');
  const en = player(page, 'en');
  await en.check('switch-to-en');
  ok((await page.locator('#room-name').innerText()).trim() === G.rooms.study.name.en, '房間名稱換成英文');
  ok(/drawer springs open/.test(await page.locator('#narration').innerText()), '剛才的敘述也換成英文');
  ok((await page.locator('#log').innerText()).includes(G.items.flashlight_dead.name.en), '紀錄也換成英文');
  const after = await page.evaluate(() => JSON.stringify(window.__stargazer.state));
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

/* ---------- 主流程 ---------- */
(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  const summary = [];
  for (const lang of LANGS) {
    const results = await fullRun(browser, lang);
    await keyboardRun(browser, lang);
    await mobileRun(browser, lang);
    const missing = ['A', 'B', 'C', 'D', 'E'].filter(e => !results.includes(e));
    if (missing.length) { console.error(`[${lang}] 沒有走到的結局：`, missing); process.exit(1); }
    summary.push(`${lang}：${results.join('、')}`);
  }
  if (LANGS.length > 1) await switchRun(browser);
  await browser.close();
  console.log(`走完的結局 ${summary.join('；')}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  if (errors.length) { console.error('主控台錯誤：', errors); process.exit(1); }
  console.log(`端對端測試通過：${LANGS.join(' / ')} 兩種語言都能只靠介面操作玩到五個結局；英文畫面沒有任何中文，主控台沒有錯誤。`);
})().catch(e => { console.error(e); console.error('主控台錯誤：', errors); process.exit(1); });
