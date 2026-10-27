'use strict';
/*
 * 端對端測試：以玩家的方式，只透過點擊真實介面，從「新遊戲」一路玩到五個結局。
 *   node tests/e2e.js                    測試 index.html
 *   node tests/e2e.js dist/stargazer.html 測試打包後的單檔版本
 *   SHOTS=資料夾 node tests/e2e.js        同時把各畫面截圖存到該資料夾
 * 不注入任何遊戲狀態；所有輸入都經由按鈕、物品欄與鍵盤完成。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.resolve(ROOT, process.argv[2] || 'index.html');
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let step = 0;
const errors = [];
function ok(cond, msg) { if (!cond) throw new Error('檢查失敗：' + msg); }

async function setup(browser, viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + TARGET);
  return page;
}

function player(page) {
  const P = {
    page,
    async shot(name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${String(++step).padStart(2, '0')}-${name}.png`) }); },
    async obj(name) {
      const b = page.locator('#objects [data-obj]', { hasText: name }).filter({ hasText: new RegExp('^' + name + '$') });
      ok(await b.count() === 1, `找不到物件「${name}」，目前：${(await page.locator('#objects').innerText()).replace(/\s+/g, ' ')}`);
      await b.click();
    },
    async item(id) {
      const b = page.locator(`#inventory [data-item="${id}"]`);
      ok(await b.count() === 1, `物品欄沒有 ${id}`);
      await b.click();
    },
    async use(id, name) { await P.item(id); await P.obj(name); },
    async combine(a, b) { await P.item(a); await page.click('[data-detail=combine]'); await P.item(b); },
    async room(name) {
      const b = page.locator('#nav [data-room]', { hasText: name });
      ok(await b.isEnabled(), `無法前往 ${name}`);
      await b.click();
    },
    async modalOpen() { return page.locator('#modal-back').isVisible(); },
    async close() { if (await P.modalOpen()) await page.click('#modal-close'); },
    async said(re) {
      const t = await page.locator('#narration').innerText();
      ok(re.test(t), `敘述中沒有 ${re}：${t}`);
    },
    async feedback(re) {
      const t = await page.locator('#modal-body .feedback').innerText();
      ok(re.test(t), `回饋中沒有 ${re}：${t}`);
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
    async dial(names) {
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 9; k++) {
          const cur = (await page.locator('#modal-body .picker-row .name').nth(i).innerText()).trim();
          if (cur === names[i]) break;
          await page.click(`#modal-body [data-next="${i}"]`);
        }
      }
      await page.click('#modal-body [data-act=turn]');
    },
    async clock(h, m) {
      for (let k = 0; k < 12; k++) {
        if ((await page.locator('#modal-body .picker-row .name').nth(0).innerText()).trim() === `${h} 點`) break;
        await page.click('#modal-body [data-h="1"]');
      }
      for (let k = 0; k < 12; k++) {
        if ((await page.locator('#modal-body .picker-row .name').nth(1).innerText()).trim() === `${String(m).padStart(2, '0')} 分`) break;
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
  for (let i = 0; i < 6 && await page.locator('#intro').isVisible(); i++) await page.click('#btn-intro-next');
  ok(await P.modalOpen(), '開場後應該打開信');
  ok(/三枚徽章/.test(await page.locator('#modal-body').innerText()), '信的內容');
  await P.close();
}

/* ---------- 各段流程（全部用介面操作） ---------- */
async function studyDrawer(P, { tryTrap = true } = {}) {
  const { page } = P;
  await P.obj('衣帽架');
  await P.said(/手電筒（沒電）/);
  await P.room('書房');
  await P.obj('書架'); await P.shot('bookshelf'); await P.close();
  await P.obj('牆上的剪報'); await P.close();
  await P.obj('書桌抽屜');
  if (tryTrap) {
    await P.lockType('7135');
    await P.feedback(/位置/);           // 誤把位置當卷數時，會被溫和地點出
    await P.shot('drawer-wrong');
  }
  await P.lockType('3751');
  ok(!(await P.modalOpen()), '抽屜開了之後應關閉鎖的視窗');
  await P.said(/抽屜彈開/);
  ok(await P.has('greenhouse_key') && await P.has('battery') && await P.has('page1'), '抽屜物品');
  // 錯誤組合不會造成任何改變
  await P.combine('letter', 'battery');
  await P.said(/組合不起來/);
  await P.combine('flashlight_dead', 'battery');
  await P.said(/白光/);
  ok(await P.has('flashlight'), '手電筒');
  await P.obj('書桌桌面');
  await P.obj('廢紙簍');
  await P.obj('星空油畫');
  await P.said(/保險箱/);
}

async function greenhouseAndGate(P) {
  await P.room('門廳');
  await P.obj('溫室門');
  await P.said(/鎖著/);
  await P.use('greenhouse_key', '溫室門');
  await P.said(/溫室門開了/);
  await P.obj('溫室門');
  await P.obj('花盆架');
  await P.page.click('#modal-body [data-pot="sage"]');
  await P.feedback(/徒手挖不動/);      // 還沒拿鏟子
  await P.close();
  await P.obj('工具架');
  await P.obj('花盆架'); await P.shot('pots');
  await P.page.click('#modal-body [data-pot="mint"]');
  await P.feedback(/什麼也沒有/);
  await P.page.click('#modal-body [data-pot="rose"]');
  await P.said(/黃銅鑰匙/);
  // 月光反光鏡：照提示的解切換鏡子
  await P.obj('天窗反光鏡');
  const target = { A: '\\', B: '/', C: '/', D: '\\', E: '/', F: '/', G: '\\' };
  const initial = { A: '/', B: '\\', C: '\\', D: '/', E: '\\', F: '\\', G: '/' };
  for (const id of Object.keys(target)) if (target[id] !== initial[id]) await P.page.click(`#modal-body [data-mirror="${id}"]`);
  await P.feedback(/落在月光花上/);
  await P.shot('mirrors-solved');
  await P.close();
  await P.use('flashlight', '工作台');
  await P.said(/活板門/);
  await P.room('門廳');
  await P.use('brass_key', '樓梯鐵門');
  await P.obj('樓梯鐵門');
}

async function observatory(P) {
  const { page } = P;
  await P.obj('望遠鏡');
  await P.said(/目鏡座是空的/);
  await P.use('flashlight', '地圖櫃底下');
  await P.use('eyepiece', '望遠鏡');
  await P.obj('星座圖'); await P.shot('poster'); await P.close();
  // 先看預設方位（北），再轉到東南
  await P.obj('望遠鏡'); await P.shot('eyepiece-north');
  await page.click('#modal-body [data-act=dome]');
  await page.click('#modal-body [data-dir="SE"]');
  await P.feedback(/東南/);
  await page.click('#modal-body [data-act=look]'); await P.shot('eyepiece-southeast');
  await P.close();
  await P.obj('星盤');
  await P.dial(['鳥', '舟', '鑰']);  // 沒考慮倒像的答案
  await P.feedback(/順序不對/);
  await P.dial(['鑰', '舟', '鳥']);
  await P.said(/星徽/);
  await P.obj('地圖櫃');
  await P.obj('觀測日誌'); await P.shot('obs-log'); await P.close();
  await P.obj('月落時刻表'); await P.close();
  await P.obj('紅光檯燈');
  await P.combine('grid_paper', 'transparency');
  await P.item('overlay'); await page.click('[data-detail=view]'); await P.shot('overlay'); await P.close();
  await P.item('overlay'); // 放下
}

async function clockSafeValves(P) {
  const { page } = P;
  await P.room('門廳');
  await P.obj('落地鐘');
  await P.clock(2, 15);
  await P.feedback(/毫無反應/);
  await P.clock(3, 15);
  await P.said(/三點十五分/);
  await P.room('書房');
  await P.obj('保險箱');
  await P.lockWheels('472');
  await P.said(/太陽徽章/);
  await P.room('溫室');
  await P.obj('灌溉系統');
  await page.click('#modal-body [data-act=main]');
  await P.feedback(/手輪不見了/);
  await P.close();
  await P.use('valve_wheel', '灌溉系統');
  await P.obj('灌溉系統');
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5']) await page.click(`#modal-body [data-valve="${v}"]`); // 全開
  await page.click('#modal-body [data-act=main]');
  await P.feedback(/仙人掌/);
  await P.shot('valves-wrong');
  for (const v of ['V1', 'V3']) await page.click(`#modal-body [data-valve="${v}"]`); // 關掉 V1、V3
  await page.click('#modal-body [data-act=main]');
  await P.said(/汩汩的水聲/);
  await P.obj('月光花');
  await P.said(/銀白色的徽章/);
}

async function darkroom(P) {
  const { page } = P;
  await P.room('天文台');
  await P.obj('觀測日誌'); await P.close();
  await P.combine('note_left', 'note_right');
  await P.item('note_full'); await page.click('[data-detail=view]'); await P.shot('note-full'); await P.close();
  await P.item('note_full');
  await P.room('溫室');
  await P.obj('活板門');
  await P.lockType('1208');
  await P.obj('活板門');
  await P.said(/只准開紅燈/);
  await P.use('flashlight', '牆上的燈座');
  await P.said(/白光會毀掉一切/);
  await P.shot('darkroom-dark');
  await P.use('red_bulb', '牆上的燈座');
  await P.obj('晾片繩');
  await P.obj('藥瓶架'); await P.close();
  await P.obj('顯影台');
  for (const b of ['red', 'blue', 'yellow', 'white']) await page.click(`#modal-body [data-bottle="${b}"]`);
  await page.click('#modal-body [data-act=go]');
  await P.feedback(/順序不對/);
  for (const b of ['yellow', 'white', 'blue', 'red']) await page.click(`#modal-body [data-bottle="${b}"]`);
  await P.shot('develop');
  await page.click('#modal-body [data-act=go]');
  await P.said(/彗星/);
  ok(await P.has('plate'), '底片');
}

async function insertEmblems(P) {
  for (const e of ['emblem_sun', 'emblem_moon', 'emblem_star']) await P.use(e, '大門');
  await P.said(/大門的鎖開了/);
}

async function exitWith(P, choice, endingTitle) {
  const { page } = P;
  await P.obj('大門');
  ok(await P.modalOpen(), '大門應該打開離開對話');
  await page.click(`#modal-body [data-choice="${choice}"]`);
  await page.click('#modal-body [data-yes]');
  await page.waitForSelector('#ending:not([hidden])');
  const title = await page.locator('.ending-title').innerText();
  ok(title === endingTitle, `應為結局「${endingTitle}」，實際「${title}」`);
  await P.shot('ending-' + endingTitle);
}

/* ---------- 主流程 ---------- */
(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  const results = [];

  // 第一輪：完整收集 → 真結局 B，再從「結局前」分歧到 E、D
  {
    const page = await setup(browser);
    const P = player(page);
    await P.shot('title');
    await newGame(P);
    await P.shot('foyer');
    await studyDrawer(P);
    // 手動存到欄位二（之後用來走「孤證」結局：還沒搜過煙囪）
    await page.click('#btn-save');
    await page.click('#modal-body [data-save="2"]');
    ok(/欄位二/.test(await page.locator('#modal-body').innerText()), '存到欄位二');
    await P.close();
    await P.use('flashlight', '壁爐');
    await P.said(/捲起來的紙/);
    // 提示與筆記
    await page.click('#btn-hints');
    await page.locator('#modal-body [data-hint]').first().click();
    ok(await page.locator('#modal-body .hint li').count() >= 1, '提示應顯示');
    await P.shot('hints'); await P.close();
    await page.click('#btn-notes');
    await page.click('#modal-body [data-note="clipping"]');
    ok(/東南/.test(await page.locator('#modal-body').innerText()), '剪報可從筆記重讀');
    await page.click('#modal-back-btn');
    ok(/線索筆記/.test(await page.locator('#modal-title').innerText()), '返回筆記清單');
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
    ok(/校驗失敗|損毀/.test(await page.locator('#modal-body').innerText()), '壞掉的存檔碼要被拒絕');
    await page.fill('#code-in', code);
    await page.click('#modal-body [data-act=import]');
    ok(!(await P.modalOpen()), '匯入成功後回到遊戲');
    ok(await P.has('plate'), '匯入後底片仍在');
    // 日記裝訂
    await P.combine('page1', 'page2');
    await P.combine('diary', 'page3');
    await P.combine('diary', 'page4');
    ok(/4\/4/.test(await page.locator('#inventory').innerText()), '日記 4/4');
    await P.item('diary'); await page.click('[data-detail=view]'); await P.shot('diary'); await P.close(); await P.item('diary');
    await P.room('門廳');
    await P.said(/電話突然響了/);
    await P.obj('老電話');
    await P.shot('phone');
    await page.click('#modal-body [data-act=later]');
    await insertEmblems(P);
    await exitWith(P, 'publish', '陸觀彗星');
    results.push('B');
    await page.click('#btn-preend');
    await exitWith(P, 'leave_plate', '沉睡的星');
    results.push('E');
    await page.click('#btn-preend');
    await P.obj('老電話');
    await page.click('#modal-body [data-act=accept]');
    await page.click('#modal-body [data-act=yes]');
    await page.waitForSelector('#ending:not([hidden])');
    ok(await page.locator('.ending-title').innerText() === '交易', '結局 D');
    await P.shot('ending-交易');
    results.push('D');
    // 結局圖鑑
    await page.click('#btn-end-gallery');
    ok(/已解鎖 3 \/ 5/.test(await page.locator('#modal-body').innerText()), '圖鑑計數');
    await P.close();

    // 第二輪：讀取欄位二（還沒搜煙囪）→ 拿到底片但日記只有三頁 → 孤證 C
    await page.click('#btn-end-title');
    await page.click('#btn-load');
    await page.click('#modal-body [data-load="2"]');
    ok(await page.locator('#game').isVisible(), '讀檔後進入遊戲');
    ok(!(await P.has('page2')), '欄位二的進度裡還沒有煙囪那一頁');
    await greenhouseAndGate(P);
    await observatory(P);
    await clockSafeValves(P);
    await darkroom(P);
    await P.room('門廳');
    await P.obj('老電話');
    await page.click('#modal-body [data-act=refuse]');
    await P.said(/你會後悔的/);
    await insertEmblems(P);
    await exitWith(P, 'publish', '孤證');
    results.push('C');
    await page.context().close();
  }

  // 第三輪：只走主線 → 普通結局 A；同時檢查重新整理後的「繼續遊戲」
  {
    const page = await setup(browser);
    const P = player(page);
    await newGame(P);
    await studyDrawer(P, { tryTrap: false });
    await page.reload();
    await page.click('#btn-continue');
    ok(await P.has('greenhouse_key'), '重新整理後自動存檔可繼續');
    await greenhouseAndGate(P);
    await observatory(P);
    await clockSafeValves(P);
    await P.room('門廳');
    await insertEmblems(P);
    await exitWith(P, 'leave', '破曉');
    results.push('A');
    await page.context().close();
  }

  // 手機寬度：不得出現水平捲動
  {
    const page = await setup(browser, { width: 390, height: 844 });
    const P = player(page);
    await P.noHorizontalScroll('手機標題畫面');
    await newGame(P);
    await P.noHorizontalScroll('手機遊戲畫面');
    await P.room('書房');
    await P.obj('書架');
    await P.noHorizontalScroll('手機對話框');
    await P.shot('mobile-bookshelf');
    await P.close();
    await P.shot('mobile-study');
    await page.context().close();
  }

  await browser.close();
  console.log(`走完的結局：${results.join('、')}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  if (errors.length) { console.error('主控台錯誤：', errors); process.exit(1); }
  const missing = ['A', 'B', 'C', 'D', 'E'].filter(e => !results.includes(e));
  if (missing.length) { console.error('沒有走到的結局：', missing); process.exit(1); }
  console.log('端對端測試通過：五個結局都能只靠介面操作從頭玩到結尾，主控台沒有錯誤。');
})().catch(e => { console.error(e); console.error('主控台錯誤：', errors); process.exit(1); });
