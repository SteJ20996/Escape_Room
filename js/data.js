/*
 * 觀星者之屋 — 遊戲內容與規則
 * 房間、熱點、物品、線索文件、謎題、組合、結局與提示都定義在這裡。
 * 引擎（engine.js）只負責執行；這個檔案是唯一的「設計真相」。
 * 同時支援瀏覽器（window.GAME_DATA）與 Node（module.exports，供測試用）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GAME_DATA = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================
   * 一、謎題資料（UI 與引擎共用，測試會逐一驗證其唯一解）
   * ================================================================ */

  // 謎題 1：書架色碼。書架由左到右的排列（刻意不按卷數排序）。
  const BOOKS = [
    { vol: 7, color: 'yellow' }, { vol: 2, color: 'brown' }, { vol: 5, color: 'blue' },
    { vol: 9, color: 'brown' }, { vol: 1, color: 'green' }, { vol: 4, color: 'brown' },
    { vol: 3, color: 'red' }, { vol: 8, color: 'brown' }, { vol: 6, color: 'brown' },
  ];
  const DRAWER_ORDER = ['red', 'yellow', 'blue', 'green'];
  const DRAWER_CODE = DRAWER_ORDER.map(c => BOOKS.find(b => b.color === c).vol).join('');
  // 常見誤解：數的是書在架上的位置而不是卷數
  const DRAWER_TRAP = DRAWER_ORDER.map(c => BOOKS.findIndex(b => b.color === c) + 1).join('');

  // 謎題 3：星圖疊合。5×5 數字方格紙 + 透明星圖膠片。
  const GRID_DIGITS = [
    [8, 3, 6, 1, 9],
    [2, 5, 4, 0, 7],
    [9, 1, 7, 3, 6],
    [6, 0, 2, 8, 4],
    [3, 7, 5, 9, 1],
  ];
  const TRANSPARENCY_STARS = [
    { r: 0, c: 0 }, { r: 0, c: 4 }, { r: 1, c: 2, mark: 1 }, { r: 1, c: 4 }, { r: 2, c: 0 },
    { r: 2, c: 3 }, { r: 3, c: 2, mark: 3 }, { r: 3, c: 4 }, { r: 4, c: 1, mark: 2 }, { r: 4, c: 3 },
  ];
  const SAFE_CODE = TRANSPARENCY_STARS.filter(s => s.mark)
    .sort((a, b) => a.mark - b.mark)
    .map(s => GRID_DIGITS[s.r][s.c]).join('');

  // 謎題 2：花盆證詞。四句話只有一句為真。
  const POTS = [
    { id: 'rose', name: '玫瑰', says: '鑰匙在薰衣草盆裡。', truth: k => k === 'lavender' },
    { id: 'lavender', name: '薰衣草', says: '鑰匙不在我這裡。', truth: k => k !== 'lavender' },
    { id: 'sage', name: '鼠尾草', says: '鑰匙在我這裡。', truth: k => k === 'sage' },
    { id: 'mint', name: '薄荷', says: '鑰匙不在玫瑰盆裡。', truth: k => k !== 'rose' },
  ];
  const POT_ANSWER = 'rose';

  // 謎題 6：最後的觀測（日誌 + 月落表 → 時刻）
  const MOONSET = [
    ['一日', '00:42'], ['二日', '01:29'], ['三日', '02:15'],
    ['四日', '03:04'], ['五日', '03:56'], ['六日', '04:51'],
  ];
  const CLOCK_ANSWER = { h: 3, m: 15 };

  // 謎題 7：灌溉管線
  const VALVES = [
    { id: 'V1', src: 'rain', to: ['moon', 'cactus'] },
    { id: 'V2', src: 'rain', to: ['fern'] },
    { id: 'V3', src: 'fert', to: ['moon', 'fern'] },
    { id: 'V4', src: 'fert', to: ['fern'] },
    { id: 'V5', src: 'rain', to: ['moon'] },
  ];
  const BEDS = {
    moon: { name: '月光花', need: { rain: true, fert: false } },
    fern: { name: '蕨類', need: { rain: true, fert: true } },
    cactus: { name: '仙人掌', need: { rain: false, fert: false } },
  };
  function evalValves(open) {
    const got = {};
    for (const b of Object.keys(BEDS)) got[b] = { rain: false, fert: false };
    for (const v of VALVES) if (open && open[v.id]) for (const b of v.to) got[b][v.src] = true;
    const problems = [];
    if (got.cactus.rain || got.cactus.fert) problems.push('仙人掌那一格的土開始積水——守則說這個月一滴水都不能給它。');
    if (got.moon.fert) problems.push('肥料水正流向月光花！');
    else if (!got.moon.rain) problems.push('月光花那一格還是乾的。');
    if (!got.fern.rain && !got.fern.fert) problems.push('蕨類一滴水也沒喝到。');
    else if (!got.fern.rain) problems.push('蕨類只喝到肥料水，還缺雨水。');
    else if (!got.fern.fert) problems.push('蕨類只喝到雨水，土還是很貧瘠——它也需要肥料。');
    return { got, ok: problems.length === 0, problems };
  }

  // 謎題 8：月光折射。光從天窗（第 0 欄上方）往下射入，要從第 4 列右側射出照到月光花。
  const MIRROR_GRID = {
    cols: 6, rows: 5,
    entry: { c: 0, r: 0, d: 'down' },
    target: { side: 'right', r: 4 },
    mirrors: [
      { id: 'A', c: 0, r: 2 }, { id: 'B', c: 2, r: 2 }, { id: 'C', c: 2, r: 0 },
      { id: 'D', c: 4, r: 0 }, { id: 'E', c: 4, r: 3 }, { id: 'F', c: 3, r: 3 },
      { id: 'G', c: 3, r: 4 },
    ],
    blocks: [{ c: 1, r: 4 }, { c: 5, r: 1 }],
    initial: { A: '/', B: '\\', C: '\\', D: '/', E: '\\', F: '\\', G: '/' },
  };
  const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
  const REFLECT = {
    '/': { right: 'up', up: 'right', left: 'down', down: 'left' },
    '\\': { right: 'down', down: 'right', left: 'up', up: 'left' },
  };
  function traceBeam(config) {
    const g = MIRROR_GRID;
    let c = g.entry.c, r = g.entry.r, d = g.entry.d;
    const path = [{ c, r: -1 }];
    const seen = new Set();
    for (let step = 0; step < 200; step++) {
      if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) {
        path.push({ c, r });
        const side = c < 0 ? 'left' : c >= g.cols ? 'right' : r < 0 ? 'top' : 'bottom';
        const hit = side === g.target.side && r === g.target.r;
        return { path, hit, exit: { side, c, r } };
      }
      path.push({ c, r });
      if (g.blocks.some(b => b.c === c && b.r === r)) return { path, hit: false, exit: { side: 'block', c, r } };
      const m = g.mirrors.find(x => x.c === c && x.r === r);
      if (m) d = REFLECT[(config && config[m.id]) || g.initial[m.id]][d];
      const key = c + ',' + r + ',' + d;
      if (seen.has(key)) return { path, hit: false, exit: { side: 'loop', c, r } };
      seen.add(key);
      c += DIRS[d][0]; r += DIRS[d][1];
    }
    return { path, hit: false, exit: { side: 'loop', c, r } };
  }

  // 窮舉所有鏡子組合，找出能照到月光花的解（提示文字由此產生，避免與謎面不一致）
  function solveMirrors() {
    const ids = MIRROR_GRID.mirrors.map(m => m.id);
    const sols = [];
    for (let mask = 0; mask < (1 << ids.length); mask++) {
      const cfg = {};
      ids.forEach((id, i) => { cfg[id] = (mask >> i) & 1 ? '\\' : '/'; });
      if (traceBeam(cfg).hit) sols.push(cfg);
    }
    return sols;
  }
  const MIRROR_SOLUTIONS = solveMirrors();

  // 謎題 9：倒立的星空。陸觀自己命名的八個星座（座標在 0–100 的方框內）。
  const CONSTELLATIONS = {
    lamp: { name: '燈', stars: [[50, 8], [28, 88], [74, 70]], lines: [[0, 1], [1, 2], [2, 0]] },
    bird: { name: '鳥', stars: [[8, 22], [50, 52], [94, 16], [56, 94]], lines: [[0, 1], [1, 2], [1, 3]] },
    boat: { name: '舟', stars: [[10, 58], [90, 58], [72, 88], [30, 88], [44, 6]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 0], [4, 1]] },
    key: { name: '鑰', stars: [[12, 16], [40, 8], [26, 38], [56, 58], [82, 84], [94, 64]], lines: [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5]] },
    bow: { name: '弓', stars: [[30, 4], [14, 26], [8, 50], [14, 74], [30, 96], [58, 50], [92, 50]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]] },
    fish: { name: '魚', stars: [[14, 50], [34, 28], [62, 28], [80, 50], [62, 72], [34, 72], [96, 30], [96, 70]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [3, 7]] },
    crown: { name: '冠', stars: [[8, 88], [50, 88], [92, 88], [8, 34], [30, 58], [50, 10], [70, 58], [92, 34], [50, 62]], lines: [[0, 1], [1, 2], [0, 3], [2, 7], [3, 4], [4, 5], [5, 6], [6, 7]] },
    tower: { name: '塔', stars: [[50, 4], [38, 26], [62, 26], [34, 48], [66, 48], [30, 70], [70, 70], [26, 94], [74, 94], [50, 94]], lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [9, 8]] },
  };
  const CONSTELLATION_ORDER = ['lamp', 'bird', 'boat', 'key', 'bow', 'fish', 'crown', 'tower'];
  const DIRECTIONS = [
    { id: 'N', name: '北' }, { id: 'NE', name: '東北' }, { id: 'E', name: '東' }, { id: 'SE', name: '東南' },
    { id: 'S', name: '南' }, { id: 'SW', name: '西南' }, { id: 'W', name: '西' }, { id: 'NW', name: '西北' },
  ];
  // 每個方位真實天空中由高到低的三個星座
  const SKY_FIELDS = {
    N: ['crown', 'lamp', 'fish'], NE: ['tower', 'bow', 'lamp'], E: ['fish', 'bird', 'crown'],
    SE: ['key', 'boat', 'bird'], S: ['bow', 'key', 'tower'], SW: ['lamp', 'crown', 'boat'],
    W: ['boat', 'tower', 'bow'], NW: ['bird', 'fish', 'key'],
  };
  const COMET_DIRECTION = 'SE';
  const DIAL_ANSWER = SKY_FIELDS[COMET_DIRECTION].slice(); // [外環, 中環, 內環]

  // 謎題 10：撕成兩半的便條（每行在撕裂處分成左右兩段）
  const NOTE_LINES = [
    ['阿遙：', ''],
    ['溫室工作台底', '下有一扇活板門，'],
    ['門鎖密碼是 12', '08，那個冬夜的日期。'],
    ['暗房裡只能開紅燈', '，白光會毀掉底片。'],
    ['沖洗順序：顯影→停', '影→定影→清水。'],
    ['藥瓶標籤我撕了，看', '架上的卡片。'],
    ['', '—— 陸'],
  ];
  const TRAPDOOR_CODE = '1208';

  // 謎題 11：顯影藥劑（瓶蓋顏色由左到右）
  const BOTTLES = [
    { id: 'red', name: '紅蓋', content: 'water' },
    { id: 'blue', name: '藍蓋', content: 'fixer' },
    { id: 'yellow', name: '黃蓋', content: 'developer' },
    { id: 'white', name: '白蓋', content: 'stop' },
  ];
  const CHEM_NAMES = { developer: '顯影液', stop: '停影液', fixer: '定影液', water: '清水' };
  const DEVELOP_SEQUENCE = ['developer', 'stop', 'fixer', 'water'];
  const DEVELOP_ANSWER = DEVELOP_SEQUENCE.map(ch => BOTTLES.find(b => b.content === ch).id);

  const EMBLEMS = ['emblem_sun', 'emblem_moon', 'emblem_star'];
  const PAGES = ['page1', 'page2', 'page3', 'page4'];

  /* ================================================================
   * 二、線索文件（可在「線索筆記」中隨時重讀）
   * ================================================================ */
  const P = s => s; // 只是標示純文字段落
  const docs = {
    letter: {
      title: '陸觀的信', style: 'hand',
      body: [
        '阿遙：',
        '抱歉，用這種方式迎接你。',
        '大門已經被我設下的機關鎖上了。屋裡藏著三枚徽章——日、月、星。把它們嵌回大門，門就會打開。',
        '這屋子裡的每一道鎖，答案都在屋子裡。不必求助任何書本或旁人，只要仔細看、慢慢想。',
        '還有一件事。二十年前那個冬夜的真相，我藏在「光照不到的地方」。要不要把它帶出這扇門，由你決定。',
        '—— 陸觀',
      ],
    },
    clipping: {
      title: '舊剪報', style: 'news',
      body: [
        '《山城日報》1999 年 12 月 11 日',
        '【新彗星現身東南夜空　韓嶽教授率先發現】',
        '本報訊　天文學家韓嶽教授昨日宣布，他於本月十日夜間，在東南方的天空中發現一顆從未被記錄的彗星。國際天文組織已初步確認，暫定名為「韓嶽彗星」。韓教授表示：「這是我觀測生涯中最幸運的一夜。」',
        '（剪報的「十日」旁，有人用紅筆重重畫了一個問號。）',
      ],
    },
    drawer_note: {
      title: '抽屜鎖上的便條', style: 'hand',
      body: ['紅、黃、藍、綠——', '照這個順序，它們各是第幾卷？'],
    },
    bookshelf: { title: '書架上的《星空圖鑑》', view: 'bookshelf' },
    painting_back: {
      title: '油畫背面的字', style: 'hand',
      body: ['（畫框背面，鉛筆字）', '星星會告訴你數字。'],
    },
    pots_rule: {
      title: '花盆架上的木牌', style: 'plain',
      body: [
        '四個花盆裡，只有一個埋著東西。',
        '盆上刻的四句話裡，只有一句是真的。',
        ...POTS.map(p => `${p.name}盆：「${p.says}」`),
      ],
    },
    garden_rules: {
      title: '園丁守則', style: 'plain',
      body: [
        '十月澆水守則',
        '・月光花：只喝雨水。沾到一滴肥料水就會枯萎。',
        '・蕨類：雨水和肥料水都要。',
        '・仙人掌：這個月一滴水都不能給。',
        '・月光花只在月光照到它時開花。天窗下的反光鏡可以轉動。',
        '打開總閘之前，先把每個閥門設好。',
      ],
    },
    eyepiece_box: {
      title: '目鏡盒蓋內側的字', style: 'hand',
      body: ['目鏡又滾到地圖櫃底下去了。', '那裡太暗，下次記得帶燈。'],
    },
    telescope_note: {
      title: '望遠鏡上的便條', style: 'hand',
      body: ['提醒自己：', '這支折射鏡看到的像是倒過來的——上下顛倒，左右也相反。'],
    },
    dial_inscription: {
      title: '星盤上的刻字', style: 'plain',
      body: [
        '轉動三環，對準彗星初次現身的方位上那三個星座。',
        '外環：位置最高者。中環：居中者。內環：位置最低者。',
        '——以真實的天空為準。',
      ],
    },
    poster: { title: '手繪星座圖', view: 'poster' },
    almanac: {
      title: '十月月落時刻表', style: 'table',
      body: ['十月　月落時刻', ...MOONSET.map(([d, t]) => `${d}　${t}`)],
    },
    obs_log: {
      title: '觀測日誌（最後幾頁）', style: 'hand',
      body: [
        '九月二十八日　晴　——　東方的「鳥」清晰可見。',
        '十月一日　陰　——　無法觀測。',
        '十月三日　晴　——　最後一次觀測。照老規矩，等月亮落下後整整一小時才開始，月光會淹沒暗星。咳得厲害，手也不穩了，也許這真是最後一次。',
        '（之後的頁面全是空白。）',
      ],
    },
    clock_inscription: {
      title: '落地鐘上的刻字', style: 'plain',
      body: ['讓指針回到我最後一次觀測開始的那一刻。'],
    },
    bottle_card: {
      title: '藥瓶架上的卡片', style: 'hand',
      body: [
        '藥瓶的標籤都被我撕掉了，只剩瓶蓋顏色。架上由左到右：紅、藍、黃、白。',
        '一、清水放在架子的最左邊或最右邊。',
        '二、定影液的瓶蓋既不是白色，也不是紅色。',
        '三、顯影液就在停影液的緊左邊。',
        '四、白色瓶蓋裡裝的不是清水。',
      ],
    },
    darkroom_warning: {
      title: '活板門內側的警告', style: 'plain',
      body: ['暗房——只准開紅燈。', '白光會毀掉一切。'],
    },
    page1: {
      title: '日記殘頁（一）', style: 'hand',
      body: [
        '1999 年 12 月 8 日',
        '雲散了。十點過後，我在東南方的天空看見一團模糊的光，拖著短短的尾巴。星圖上沒有它。',
        '我拍了三張玻璃底片，每張曝光二十分鐘。手一直在抖——如果我沒弄錯，這是一顆從未被記錄過的彗星。',
      ],
    },
    page2: {
      title: '日記殘頁（二）', style: 'hand',
      body: [
        '1999 年 12 月 9 日',
        '我把消息告訴了韓老師。他說要幫我核對軌道，借走了我的觀測紀錄和兩張已沖洗的底片。',
        '第三張我還沒沖，就先收進了暗房的避光盒裡。說不上為什麼，我留了個心眼。',
      ],
    },
    page3: {
      title: '日記殘頁（三）', style: 'hand',
      body: [
        '1999 年 12 月 12 日',
        '報紙頭版：「韓嶽教授發現新彗星」。坐標、時刻，和我的紀錄一模一樣——連我抄錯了又劃掉的那個「7」，他也照抄了上去。',
        '我打了十一通電話，他一通也沒接。',
      ],
    },
    page4: {
      title: '日記殘頁（四）', style: 'hand',
      body: [
        '九月二十日',
        '醫生說，我的時間不多了。二十年來，我一次也沒有打開那個避光盒。我恨過他，後來不恨了，只是累。',
        '阿遙，第三張底片留給你。彗星每晚都在群星之間移動，底片上它和星星的相對位置，就是那一夜的日期，誰也偽造不了。再加上那個被照抄的錯誤——你會知道該怎麼做。',
        '或者，你也可以讓它繼續沉睡。由你決定。',
      ],
    },
  };

  /* ================================================================
   * 三、物品
   * ================================================================ */
  const items = {
    letter: { name: '陸觀的信', glyph: '信', kind: 'paper', desc: '老師寫給你的最後一封信。', doc: 'letter' },
    flashlight_dead: { name: '手電筒（沒電）', glyph: '筒', kind: 'tool', desc: '一支老式金屬手電筒。按下開關沒有反應——電池倉是空的。' },
    battery: { name: '電池', glyph: '電', kind: 'tool', desc: '兩節還算新的電池，用橡皮筋綁在一起。' },
    flashlight: { name: '手電筒', glyph: '光', kind: 'tool', desc: '裝上電池的手電筒，光線又白又亮。可以照亮黑暗的角落。' },
    grid_paper: { name: '數字方格紙', glyph: '格', kind: 'paper', desc: '一張 5×5 的方格紙，每格寫著一個數字。四個角上各畫著一個小十字。', view: 'grid' },
    transparency: { name: '星圖膠片', glyph: '膠', kind: 'paper', desc: '一張透明膠片，畫著十顆星星，其中三顆被圈起來，標著①②③。四個角上各畫著一個小十字。', view: 'transparency' },
    overlay: { name: '疊合的星圖', glyph: '疊', kind: 'paper', desc: '星圖膠片疊在方格紙上，四角的十字對得整整齊齊。', view: 'overlay' },
    greenhouse_key: { name: '溫室鑰匙', glyph: '葉', kind: 'key', desc: '一把鐵鑰匙，握柄做成葉子的形狀。' },
    trowel: { name: '小鏟子', glyph: '鏟', kind: 'tool', desc: '園藝用的小鏟子，鏟刃有點鈍了。' },
    brass_key: { name: '黃銅鑰匙', glyph: '銅', kind: 'key', desc: '一把沾著泥土的黃銅鑰匙，匙柄刻著樓梯的圖樣。' },
    valve_wheel: { name: '閥門手輪', glyph: '輪', kind: 'tool', desc: '黃銅手輪，背面貼著紙條：「溫室總閘」。' },
    eyepiece: { name: '望遠鏡目鏡', glyph: '鏡', kind: 'tool', desc: '一枚黃銅框的目鏡，鏡片上沾了點灰，擦一擦還能用。' },
    red_bulb: { name: '紅色燈泡', glyph: '泡', kind: 'tool', desc: '從觀測桌的檯燈上轉下來的紅色燈泡。陸觀說過：看星星和沖底片，都只用紅光。' },
    note_left: { name: '便條（左半）', glyph: '左', kind: 'paper', desc: '被撕成兩半的便條，這是左半邊。字跡是陸觀的。', view: 'note_left' },
    note_right: { name: '便條（右半）', glyph: '右', kind: 'paper', desc: '被撕成兩半的便條，這是右半邊。夾在觀測日誌裡當書籤。', view: 'note_right' },
    note_full: { name: '拼好的便條', glyph: '條', kind: 'paper', desc: '兩半便條沿著撕口拼在一起，終於能讀了。', view: 'note_full' },
    page1: { name: '日記殘頁（一）', glyph: '壹', kind: 'page', desc: '從日記上撕下的一頁。', doc: 'page1' },
    page2: { name: '日記殘頁（二）', glyph: '貳', kind: 'page', desc: '從日記上撕下的一頁，邊緣被煙燻黑了。', doc: 'page2' },
    page3: { name: '日記殘頁（三）', glyph: '參', kind: 'page', desc: '從日記上撕下的一頁，紙上有淚痕似的水漬。', doc: 'page3' },
    page4: { name: '日記殘頁（四）', glyph: '肆', kind: 'page', desc: '從日記上撕下的一頁，字跡已經有些顫抖。', doc: 'page4' },
    diary: { name: '陸觀的日記', glyph: '記', kind: 'page', desc: '你把找到的殘頁按日期裝訂在一起。', view: 'diary' },
    emblem_sun: { name: '日徽', glyph: '日', kind: 'emblem', desc: '一枚沉甸甸的黃銅徽章，刻著光芒四射的太陽。' },
    emblem_moon: { name: '月徽', glyph: '月', kind: 'emblem', desc: '一枚銀白色的徽章，刻著一彎新月。' },
    emblem_star: { name: '星徽', glyph: '星', kind: 'emblem', desc: '一枚深藍色的琺瑯徽章，嵌著一顆八角星。' },
    plate: { name: '玻璃底片', glyph: '底', kind: 'evidence', desc: '剛沖洗出來的玻璃底片。群星之間，一顆拖著短尾的彗星清清楚楚。片角刻著：1999.12.08　陸觀。', view: 'plate' },
  };

  /* ================================================================
   * 四、房間
   * ================================================================ */
  const rooms = {
    foyer: {
      name: '門廳',
      accessible: () => true,
      enterText: () => '門廳。熄滅的吊燈垂在挑高的天花板下，正對面是那扇鎖死的大門。左邊是書房，右邊是溫室，樓梯通往天文台。',
      onEnter(ctx) {
        if (ctx.has('plate') && !ctx.flag('phoneRinging') && !ctx.flag('phoneDone')) {
          ctx.set('phoneRinging');
          ctx.say('鈴——鈴——門廳裡那台老電話突然響了起來。', 'event');
        }
      },
    },
    study: {
      name: '書房',
      accessible: () => true,
      enterText: () => '書房裡瀰漫著舊紙和菸草的味道。書架、書桌、壁爐，牆上掛著一幅星空油畫。',
    },
    greenhouse: {
      name: '溫室',
      accessible: s => !!s.flags.greenhouseOpen,
      enterText: () => '雨剛停，玻璃頂上還掛著水珠。雲散了，月光從天窗斜斜地照進來。空氣又濕又暖。',
    },
    observatory: {
      name: '天文台',
      accessible: s => !!s.flags.gateOpen,
      enterText: () => '天文台。圓頂下立著一支黃銅折射望遠鏡，牆上貼滿了星圖。',
    },
    darkroom: {
      name: '暗房',
      accessible: s => !!s.flags.trapdoorOpen,
      enterText: s => s.flags.darkroomLit
        ? '紅色的安全燈把暗房染成一片暗紅。'
        : '你沿著梯子爬下去，四周伸手不見五指。',
      onEnter(ctx) {
        if (!ctx.flag('darkroomLit')) {
          ctx.say('借著頭頂溫室透下來的一點微光，你看見活板門內側貼著一張紙：「暗房——只准開紅燈。白光會毀掉一切。」', 'event');
          ctx.note('darkroom_warning');
        }
      },
    },
  };

  /* ================================================================
   * 五、熱點（房間裡可以互動的東西）
   *   examine(ctx)       —— 直接點擊
   *   use[itemId](ctx)   —— 拿著某個物品點擊
   *   useAny(ctx, item)  —— 其他物品的預設反應（可省略）
   * ================================================================ */
  const allInserted = s => EMBLEMS.every(e => s.flags['inserted_' + e]);
  const insertEmblem = e => ctx => {
    ctx.take(e);
    ctx.set('inserted_' + e);
    ctx.say(`你把${items[e].name}按進大門上對應的凹槽，「喀」的一聲，嵌得嚴絲合縫。`, 'good');
    if (allInserted(ctx.s)) ctx.say('三枚徽章全部歸位。門內傳來齒輪轉動的聲音——大門的鎖開了。', 'event');
  };

  const hotspots = [
    /* ---------------- 門廳 ---------------- */
    {
      id: 'f_door', room: 'foyer', name: '大門',
      examine(ctx) {
        const s = ctx.s;
        if (allInserted(s)) { ctx.open({ view: 'exit' }); return; }
        const parts = EMBLEMS.map(e => `${items[e].glyph}：${s.flags['inserted_' + e] ? '已嵌入' : '空'}`);
        ctx.say(`厚重的橡木大門，門把紋絲不動。門板中央有一塊黃銅面板，上面有三個凹槽（${parts.join('，')}）。`);
      },
      use: { emblem_sun: insertEmblem('emblem_sun'), emblem_moon: insertEmblem('emblem_moon'), emblem_star: insertEmblem('emblem_star') },
      useAny(ctx) { ctx.say('大門的機關只認那三枚徽章。'); },
    },
    {
      id: 'f_mailslot', room: 'foyer', name: '信件口',
      examine(ctx) {
        if (ctx.flag('phoneDone')) ctx.say('信件口外一片漆黑。門外那輛車的引擎聲已經遠去了。');
        else ctx.say('門上的黃銅信件口。往外推只能推開一條細縫——夠塞進一封信，人是絕對過不去的。');
      },
      use: {
        plate(ctx) {
          if (ctx.flag('phoneRinging')) ctx.say('電話還在響。也許該先聽聽是誰。');
          else ctx.say('你把底片湊近信件口，又收了回來。外面沒有人在等它。');
        },
      },
    },
    {
      id: 'f_phone', room: 'foyer', name: '老電話',
      examine(ctx) {
        if (ctx.flag('phoneRinging')) { ctx.open({ view: 'phone' }); return; }
        if (ctx.flag('phoneDone')) { ctx.say('聽筒裡只剩嘟嘟聲。'); return; }
        ctx.say('一台黑色轉盤電話。你拿起聽筒——線路是通的，但撥不出去，好像只能接聽。');
      },
    },
    {
      id: 'f_clock', room: 'foyer', name: '落地鐘',
      examine(ctx) {
        if (ctx.flag('clockSolved')) { ctx.say('落地鐘停在三點十五分，鐘擺箱的小門敞開著，裡面已經空了。'); return; }
        ctx.note('clock_inscription');
        ctx.open({ view: 'clock' });
      },
    },
    {
      id: 'f_coat', room: 'foyer', name: '衣帽架',
      examine(ctx) {
        if (!ctx.flag('coatSearched')) {
          ctx.set('coatSearched');
          ctx.say('衣帽架上掛著陸觀的舊大衣。你摸了摸口袋——');
          ctx.give('flashlight_dead');
        } else ctx.say('舊大衣上還留著淡淡的菸草味。口袋已經空了。');
      },
    },
    {
      id: 'f_umbrella', room: 'foyer', name: '傘架',
      examine(ctx) { ctx.say('傘架裡只有一把黑傘，傘尖還在滴水——那是你自己的。'); },
    },
    {
      id: 'f_window', room: 'foyer', name: '窗戶',
      examine(ctx) { ctx.say('窗外裝著粗鐵欄杆，玻璃後面是漆黑的山。看來只能走大門了。'); },
    },
    {
      id: 'f_study_door', room: 'foyer', name: '書房門',
      examine(ctx) { ctx.goto('study'); },
    },
    {
      id: 'f_gh_door', room: 'foyer', name: '溫室門',
      examine(ctx) {
        if (ctx.flag('greenhouseOpen')) { ctx.goto('greenhouse'); return; }
        ctx.say('通往溫室的玻璃門鎖著。鑰匙孔旁刻著一片小小的葉子。');
      },
      use: {
        greenhouse_key(ctx) {
          if (ctx.flag('greenhouseOpen')) return;
          ctx.take('greenhouse_key');
          ctx.set('greenhouseOpen');
          ctx.say('葉子形狀的鑰匙正好插進鎖孔。「喀噠」——溫室門開了。', 'good');
        },
      },
    },
    {
      id: 'f_gate', room: 'foyer', name: '樓梯鐵門',
      examine(ctx) {
        if (ctx.flag('gateOpen')) { ctx.goto('observatory'); return; }
        ctx.say('通往天文台的樓梯被一道鐵柵門擋住，門上掛著一把黃銅掛鎖。');
      },
      use: {
        brass_key(ctx) {
          ctx.take('brass_key');
          ctx.set('gateOpen');
          ctx.say('黃銅鑰匙轉了半圈，掛鎖彈開。鐵柵門吱呀一聲打開了。', 'good');
        },
      },
    },

    /* ---------------- 書房 ---------------- */
    {
      id: 's_shelf', room: 'study', name: '書架',
      examine(ctx) {
        ctx.note('bookshelf');
        ctx.open({ view: 'bookshelf' });
      },
    },
    {
      id: 's_drawer', room: 'study', name: '書桌抽屜',
      examine(ctx) {
        if (ctx.flag('drawerOpen')) { ctx.say('抽屜開著，裡面已經空了。'); return; }
        ctx.note('drawer_note');
        ctx.open({ view: 'lock', id: 'drawer' });
      },
    },
    {
      id: 's_desk', room: 'study', name: '書桌桌面',
      examine(ctx) {
        if (!ctx.flag('gridTaken')) {
          ctx.set('gridTaken');
          ctx.say('桌面的玻璃墊下壓著一張寫滿數字的方格紙。你把它抽了出來。');
          ctx.give('grid_paper');
        } else ctx.say('桌上攤著幾本星表，墨水早就乾了。');
      },
    },
    {
      id: 's_clipping', room: 'study', name: '牆上的剪報',
      examine(ctx) { ctx.note('clipping'); ctx.open({ view: 'doc', id: 'clipping' }); },
    },
    {
      id: 's_painting', room: 'study', name: '星空油畫',
      examine(ctx) {
        if (!ctx.flag('paintingMoved')) {
          ctx.set('paintingMoved');
          ctx.say('油畫裡是一片星空，右下角簽著「陸觀」。畫框有點歪——你把它取下來，後面的牆裡嵌著一個保險箱！', 'event');
          ctx.say('畫框背面用鉛筆寫著一行字：「星星會告訴你數字。」');
          ctx.note('painting_back');
        } else ctx.say('取下的油畫靠在牆邊。畫框背面寫著：「星星會告訴你數字。」');
      },
    },
    {
      id: 's_safe', room: 'study', name: '保險箱',
      visible: s => !!s.flags.paintingMoved,
      examine(ctx) {
        if (ctx.flag('safeOpen')) { ctx.say('保險箱的門開著，裡面空了。'); return; }
        ctx.open({ view: 'lock', id: 'safe' });
      },
    },
    {
      id: 's_fireplace', room: 'study', name: '壁爐',
      examine(ctx) {
        if (ctx.flag('chimneySearched')) { ctx.say('壁爐裡只剩冷掉的灰燼。'); return; }
        ctx.say('爐火早已熄滅。你探頭往煙囪裡看，磚縫間好像卡著什麼東西，可是裡面太黑，什麼也看不清。');
      },
      use: {
        flashlight(ctx) {
          if (ctx.flag('chimneySearched')) { ctx.say('煙囪裡只有煤灰。'); return; }
          ctx.set('chimneySearched');
          ctx.say('手電筒的光照進煙囪——磚縫裡夾著一張捲起來的紙。你小心地把它抽了出來。', 'good');
          ctx.give('page2');
        },
        flashlight_dead(ctx) { ctx.say('手電筒沒電，按了也不會亮。'); },
      },
    },
    {
      id: 's_waste', room: 'study', name: '廢紙簍',
      examine(ctx) {
        if (!ctx.flag('wasteSearched')) {
          ctx.set('wasteSearched');
          ctx.say('廢紙簍裡大多是揉皺的草稿。最底下有半張被撕開的便條。');
          ctx.give('note_left');
        } else ctx.say('只剩一些揉皺的星表草稿。');
      },
    },
    {
      id: 's_window', room: 'study', name: '窗戶',
      examine(ctx) { ctx.say('窗框被人從外面釘死了。窗外，雨後的星星一顆一顆亮了起來。'); },
    },
    {
      id: 's_exit', room: 'study', name: '回到門廳',
      examine(ctx) { ctx.goto('foyer'); },
    },

    /* ---------------- 溫室 ---------------- */
    {
      id: 'g_tools', room: 'greenhouse', name: '工具架',
      examine(ctx) {
        if (!ctx.flag('trowelTaken')) {
          ctx.set('trowelTaken');
          ctx.say('工具架上掛著水壺、剪刀和一把小鏟子。你取下了小鏟子。');
          ctx.give('trowel');
        } else ctx.say('工具架上掛著水壺和剪刀。');
      },
    },
    {
      id: 'g_pots', room: 'greenhouse', name: '花盆架',
      examine(ctx) {
        if (ctx.flag('keyDug')) { ctx.say('玫瑰盆的土被翻過了。其餘三盆安安靜靜地立著。'); return; }
        ctx.note('pots_rule');
        ctx.open({ view: 'pots' });
      },
    },
    {
      id: 'g_rules', room: 'greenhouse', name: '園丁守則',
      examine(ctx) { ctx.note('garden_rules'); ctx.open({ view: 'doc', id: 'garden_rules' }); },
    },
    {
      id: 'g_valves', room: 'greenhouse', name: '灌溉系統',
      examine(ctx) {
        if (ctx.flag('waterOk')) { ctx.say('雨水桶和肥料桶靜靜地立著。月光花、蕨類都喝足了水，仙人掌的土依然乾燥。'); return; }
        ctx.note('garden_rules');
        ctx.open({ view: 'valves' });
      },
      use: {
        valve_wheel(ctx) {
          ctx.take('valve_wheel');
          ctx.set('wheelInstalled');
          ctx.say('你把黃銅手輪套上總閘的閥桿，轉了轉，很順手。', 'good');
        },
      },
    },
    {
      id: 'g_mirrors', room: 'greenhouse', name: '天窗反光鏡',
      examine(ctx) {
        if (ctx.flag('lightOk')) { ctx.say('月光經過一面面反光鏡，穩穩地落在月光花上。'); return; }
        ctx.open({ view: 'mirrors' });
      },
    },
    {
      id: 'g_moonflower', room: 'greenhouse', name: '月光花',
      examine(ctx) {
        const water = ctx.flag('waterOk'), light = ctx.flag('lightOk');
        if (ctx.flag('moonTaken')) { ctx.say('月光花在月光下靜靜開著，潔白如雪。'); return; }
        if (water && light) {
          ctx.set('moonTaken');
          ctx.say('喝足了雨水、沐浴在月光裡，月光花一瓣一瓣地綻開——花心裡躺著一枚銀白色的徽章。', 'event');
          ctx.give('emblem_moon');
          return;
        }
        const need = [];
        if (!water) need.push('土壤乾裂，它渴了');
        if (!light) need.push('月光照不到這個角落');
        ctx.say(`一株含苞的月光花，花苞緊緊閉著，裡面好像包著什麼發亮的東西。（${need.join('；')}。）`);
      },
    },
    {
      id: 'g_bench', room: 'greenhouse', name: '工作台',
      examine(ctx) {
        if (ctx.flag('trapdoorFound')) { ctx.say('工作台底下的地板上，露出一扇活板門。'); return; }
        ctx.say('工作台上散落著種子袋和麻繩。台面底下黑漆漆的，什麼也看不見。');
      },
      use: {
        flashlight(ctx) {
          if (ctx.flag('trapdoorFound')) { ctx.say('活板門就在那裡。'); return; }
          ctx.set('trapdoorFound');
          ctx.say('你趴下來用手電筒往工作台底下照——地板上有一扇方形的活板門，門上掛著四位數字鎖。', 'event');
        },
        flashlight_dead(ctx) { ctx.say('手電筒沒電，照不亮任何東西。'); },
      },
    },
    {
      id: 'g_trapdoor', room: 'greenhouse', name: '活板門',
      visible: s => !!s.flags.trapdoorFound,
      examine(ctx) {
        if (ctx.flag('trapdoorOpen')) { ctx.goto('darkroom'); return; }
        ctx.open({ view: 'lock', id: 'trapdoor' });
      },
    },
    {
      id: 'g_exit', room: 'greenhouse', name: '回到門廳',
      examine(ctx) { ctx.goto('foyer'); },
    },

    /* ---------------- 天文台 ---------------- */
    {
      id: 'o_telescope', room: 'observatory', name: '望遠鏡',
      examine(ctx) {
        ctx.note('telescope_note');
        if (!ctx.flag('eyepieceInstalled')) {
          ctx.say('黃銅鏡筒上貼著一張便條：「這支折射鏡看到的像是倒過來的——上下顛倒，左右也相反。」可是目鏡座是空的。');
          ctx.say('一旁的目鏡盒也是空的，盒蓋內側寫著：「目鏡又滾到地圖櫃底下去了。那裡太暗，下次記得帶燈。」');
          ctx.note('eyepiece_box');
          return;
        }
        ctx.open({ view: 'eyepiece' });
      },
      use: {
        eyepiece(ctx) {
          ctx.take('eyepiece');
          ctx.set('eyepieceInstalled');
          ctx.say('你把目鏡旋進目鏡座。現在可以看望遠鏡了。', 'good');
        },
      },
    },
    {
      id: 'o_dome', room: 'observatory', name: '穹頂轉輪',
      examine(ctx) { ctx.open({ view: 'dome' }); },
    },
    {
      id: 'o_dial', room: 'observatory', name: '星盤',
      examine(ctx) {
        ctx.note('dial_inscription');
        if (ctx.flag('starDialSolved')) { ctx.say('星盤的中心敞開著，裡面空了。'); return; }
        ctx.open({ view: 'dial' });
      },
    },
    {
      id: 'o_poster', room: 'observatory', name: '星座圖',
      examine(ctx) { ctx.note('poster'); ctx.open({ view: 'poster' }); },
    },
    {
      id: 'o_almanac', room: 'observatory', name: '月落時刻表',
      examine(ctx) { ctx.note('almanac'); ctx.open({ view: 'doc', id: 'almanac' }); },
    },
    {
      id: 'o_log', room: 'observatory', name: '觀測日誌',
      examine(ctx) {
        ctx.note('obs_log');
        if (!ctx.flag('logBookmark')) {
          ctx.set('logBookmark');
          ctx.say('你翻開觀測日誌，一張撕開的半張便條從書頁間滑了出來。');
          ctx.give('note_right');
        }
        ctx.open({ view: 'doc', id: 'obs_log' });
      },
    },
    {
      id: 'o_lamp', room: 'observatory', name: '紅光檯燈',
      examine(ctx) {
        if (!ctx.flag('bulbTaken')) {
          ctx.set('bulbTaken');
          ctx.say('觀測桌上的檯燈裝著紅色燈泡，發出微弱的紅光。你把燈泡轉了下來，房間又暗了一些。');
          ctx.give('red_bulb');
        } else ctx.say('檯燈的燈座空著。');
      },
    },
    {
      id: 'o_cabinet', room: 'observatory', name: '地圖櫃',
      examine(ctx) {
        if (!ctx.flag('transparencyTaken')) {
          ctx.set('transparencyTaken');
          ctx.say('地圖櫃的淺抽屜裡收著一疊星圖。最上面是一張透明膠片。');
          ctx.give('transparency');
        } else ctx.say('抽屜裡是一疊疊手繪星圖。');
      },
    },
    {
      id: 'o_under', room: 'observatory', name: '地圖櫃底下',
      examine(ctx) {
        if (ctx.flag('eyepieceFound')) { ctx.say('櫃子底下只剩灰塵。'); return; }
        ctx.say('地圖櫃和地板之間有一道窄縫，裡面黑漆漆的，好像有什麼東西閃了一下。');
      },
      use: {
        flashlight(ctx) {
          if (ctx.flag('eyepieceFound')) { ctx.say('櫃子底下只剩灰塵。'); return; }
          ctx.set('eyepieceFound');
          ctx.say('手電筒一照，縫裡躺著一枚黃銅框的目鏡。你伸手把它撈了出來。', 'good');
          ctx.give('eyepiece');
        },
        flashlight_dead(ctx) { ctx.say('手電筒沒電，照不亮任何東西。'); },
      },
    },
    {
      id: 'o_exit', room: 'observatory', name: '下樓回門廳',
      examine(ctx) { ctx.goto('foyer'); },
    },

    /* ---------------- 暗房 ---------------- */
    {
      id: 'd_socket', room: 'darkroom', name: '牆上的燈座',
      examine(ctx) {
        if (ctx.flag('darkroomLit')) { ctx.say('紅色安全燈靜靜亮著。'); return; }
        ctx.say('你在牆上摸到一個燈座，裡面沒有燈泡。');
      },
      use: {
        red_bulb(ctx) {
          ctx.take('red_bulb');
          ctx.set('darkroomLit');
          ctx.say('你把紅色燈泡旋進燈座。暗紅色的光亮起來，暗房的輪廓一點一點浮現。', 'event');
        },
      },
    },
    {
      id: 'd_ladder', room: 'darkroom', name: '梯子（回溫室）',
      examine(ctx) { ctx.goto('greenhouse'); },
    },
    {
      id: 'd_shelf', room: 'darkroom', name: '藥瓶架',
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) { ctx.note('bottle_card'); ctx.open({ view: 'doc', id: 'bottle_card' }); },
    },
    {
      id: 'd_tray', room: 'darkroom', name: '顯影台',
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) {
        if (ctx.flag('plateDeveloped')) { ctx.say('顯影盤裡的藥水已經倒掉了。避光盒空著。'); return; }
        ctx.open({ view: 'develop' });
      },
    },
    {
      id: 'd_line', room: 'darkroom', name: '晾片繩',
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) {
        if (!ctx.flag('p4Taken')) {
          ctx.set('p4Taken');
          ctx.say('晾片繩上夾著幾張空白相紙，還有一頁從日記上撕下來的紙。');
          ctx.give('page4');
        } else ctx.say('晾片繩上夾著幾張空白相紙。');
      },
    },
    {
      id: 'd_vent', room: 'darkroom', name: '氣窗',
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) { ctx.say('牆角高處有一扇小氣窗，被黑布遮著，可是黑布有一角翹了起來。這盞紅燈，從外面看得見嗎？'); },
    },
  ];

  /* ================================================================
   * 六、線索組合（物品欄中兩兩組合）
   * ================================================================ */
  const isPagey = id => PAGES.includes(id) || id === 'diary';
  const recipes = [
    {
      pair: ['flashlight_dead', 'battery'],
      run(ctx) {
        ctx.take('flashlight_dead'); ctx.take('battery');
        ctx.say('你把電池塞進手電筒，按下開關——一道白光射了出去。', 'good');
        ctx.give('flashlight');
      },
    },
    {
      pair: ['grid_paper', 'transparency'],
      run(ctx) {
        ctx.take('grid_paper'); ctx.take('transparency');
        ctx.say('你把透明膠片疊在方格紙上，讓四個角的十字一一對齊。三個圈起來的星星，正好落在三個數字上。', 'good');
        ctx.give('overlay');
      },
    },
    {
      pair: ['note_left', 'note_right'],
      run(ctx) {
        ctx.take('note_left'); ctx.take('note_right');
        ctx.say('撕口的鋸齒完全吻合。兩半便條拼在一起，字句終於連貫了。', 'good');
        ctx.give('note_full');
      },
    },
    {
      match: (a, b) => isPagey(a) && isPagey(b) && !(a === 'diary' && b === 'diary'),
      run(ctx, a, b) {
        const bound = new Set(ctx.get('diaryPages') || []);
        for (const id of [a, b]) {
          if (id !== 'diary') bound.add(id);
          ctx.take(id);
        }
        const list = PAGES.filter(p => bound.has(p));
        ctx.set('diaryPages', list);
        ctx.give('diary', true);
        ctx.say(`你按日期把殘頁裝訂在一起。日記現在有 ${list.length} / 4 頁。`, 'good');
      },
    },
  ];

  /* ================================================================
   * 七、謎題的判定（UI 只負責輸入，對錯一律在這裡判定）
   * ================================================================ */
  const inRoom = room => s => s.room === room;
  const lockPuzzle = (opts) => ({
    available: opts.available,
    check(ctx, answer) {
      const code = String(answer == null ? '' : answer).replace(/\D/g, '');
      if (code === opts.code) { opts.success(ctx); return true; }
      ctx.wrong();
      ctx.say(opts.wrongText ? opts.wrongText(code) : '鎖紋絲不動。', 'bad');
      return false;
    },
  });

  const puzzles = {
    drawer: Object.assign(lockPuzzle({
      code: DRAWER_CODE,
      available: s => inRoom('study')(s) && !s.flags.drawerOpen,
      success(ctx) {
        ctx.set('drawerOpen');
        ctx.say('「喀」——抽屜彈開了。', 'good');
        ctx.say('裡面有一把葉子形狀的鑰匙、一捆電池，還有一頁撕下來的日記。');
        ctx.give('greenhouse_key'); ctx.give('battery'); ctx.give('page1');
      },
      wrongText: code => code === DRAWER_TRAP
        ? '鎖紋絲不動。你數的好像是書在架上的位置——便條問的是「第幾卷」。'
        : '鎖紋絲不動。',
    }), { digits: 4, title: '書桌抽屜', prompt: '四位數字鎖。鎖旁的便條寫著：「紅、黃、藍、綠——照這個順序，它們各是第幾卷？」' }),

    safe: Object.assign(lockPuzzle({
      code: SAFE_CODE,
      available: s => inRoom('study')(s) && s.flags.paintingMoved && !s.flags.safeOpen,
      success(ctx) {
        ctx.set('safeOpen');
        ctx.say('轉盤咬合，保險箱的門應聲而開。天鵝絨墊子上放著一枚太陽徽章。', 'good');
        ctx.give('emblem_sun');
      },
    }), { digits: 3, title: '保險箱', prompt: '嵌在牆裡的保險箱，三位數字轉盤。畫框背面寫著：「星星會告訴你數字。」' }),

    trapdoor: Object.assign(lockPuzzle({
      code: TRAPDOOR_CODE,
      available: s => inRoom('greenhouse')(s) && s.flags.trapdoorFound && !s.flags.trapdoorOpen,
      success(ctx) {
        ctx.set('trapdoorOpen');
        ctx.say('數字鎖彈開了。你掀起活板門，一道窄梯通往漆黑的地下。', 'good');
      },
    }), { digits: 4, title: '活板門', prompt: '活板門上的四位數字鎖。鎖旁刻著一顆拖著尾巴的彗星。' }),

    pots: {
      available: s => inRoom('greenhouse')(s) && !s.flags.keyDug,
      check(ctx, potId) {
        const pot = POTS.find(p => p.id === potId);
        if (!pot) return null;
        if (!ctx.has('trowel')) { ctx.say('花盆裡的土壓得很實，徒手挖不動。得找把工具。', 'bad'); return false; }
        if (potId === POT_ANSWER) {
          ctx.set('keyDug');
          ctx.say(`你用小鏟子挖開${pot.name}盆的土，鏟尖「叮」地碰到了金屬——一把黃銅鑰匙。`, 'good');
          ctx.give('brass_key');
          return true;
        }
        ctx.wrong();
        ctx.say(`你挖開${pot.name}盆的土，裡面除了根和泥什麼也沒有。你把土填了回去。`, 'bad');
        return false;
      },
    },

    clock: {
      available: s => inRoom('foyer')(s) && !s.flags.clockSolved,
      check(ctx, ans) {
        const h = Number(ans && ans.h), m = Number(ans && ans.m);
        if (h === CLOCK_ANSWER.h && m === CLOCK_ANSWER.m) {
          ctx.set('clockSolved');
          ctx.say('指針停在三點十五分的那一刻，鐘裡傳來「噹」的一聲，鐘擺箱的小門彈開了。', 'good');
          ctx.say('裡面放著一個黃銅手輪，還有一頁折起來的日記。');
          ctx.give('valve_wheel'); ctx.give('page3');
          return true;
        }
        ctx.wrong();
        ctx.say('你撥好指針，等了一會兒。落地鐘毫無反應。', 'bad');
        return false;
      },
    },

    valves_set: { // 只記錄閥門的開關狀態（不判對錯）
      available: inRoom('greenhouse'),
      silent: true,
      check(ctx, cfg) {
        const clean = {};
        for (const v of VALVES) clean[v.id] = !!(cfg && cfg[v.id]);
        ctx.s.puz.valves = clean;
        return true;
      },
    },
    valves: {
      available: s => inRoom('greenhouse')(s) && !s.flags.waterOk,
      check(ctx, cfg) {
        if (!ctx.flag('wheelInstalled')) { ctx.say('總閘上只剩一根光禿禿的閥桿——手輪不見了，轉不動。', 'bad'); return false; }
        const clean = {};
        for (const v of VALVES) clean[v.id] = !!(cfg && cfg[v.id]);
        ctx.s.puz.valves = clean;
        const r = evalValves(clean);
        if (r.ok) {
          ctx.set('waterOk');
          ctx.say('你轉開總閘，水管裡響起汩汩的水聲。雨水流進月光花和蕨類的花床，肥料水只流向蕨類，仙人掌那一格滴水未沾。', 'good');
          if (ctx.flag('lightOk')) ctx.say('月光花的花苞輕輕顫動了一下。', 'event');
          return true;
        }
        ctx.wrong();
        ctx.say('你轉開總閘——', 'bad');
        for (const p of r.problems) ctx.say(p, 'bad');
        ctx.say('你趕緊關上總閘。幸好沒造成損害。', 'bad');
        return false;
      },
    },

    mirrors: {
      available: s => inRoom('greenhouse')(s),
      silent: true,
      check(ctx, cfg) {
        const clean = {};
        for (const m of MIRROR_GRID.mirrors) clean[m.id] = (cfg && cfg[m.id] === '/') ? '/' : (cfg && cfg[m.id] === '\\') ? '\\' : MIRROR_GRID.initial[m.id];
        ctx.s.puz.mirrors = clean;
        if (ctx.flag('lightOk')) return true;
        if (traceBeam(clean).hit) {
          ctx.set('lightOk');
          ctx.say('月光在鏡面間折了幾折，終於落在月光花上。花苞微微發亮。', 'good');
          if (ctx.flag('waterOk')) ctx.say('月光花的花苞輕輕顫動了一下。', 'event');
          return true;
        }
        return false;
      },
    },

    dome: {
      available: inRoom('observatory'),
      silent: true,
      check(ctx, dir) {
        if (!DIRECTIONS.some(d => d.id === dir)) return null;
        ctx.s.puz.dome = dir;
        const name = DIRECTIONS.find(d => d.id === dir).name;
        ctx.say(`你轉動轉輪，穹頂隆隆作響，觀測窗轉向了${name}方。`);
        return true;
      },
    },

    dial: {
      available: s => inRoom('observatory')(s) && !s.flags.starDialSolved,
      check(ctx, ans) {
        const pick = Array.isArray(ans) ? ans.slice(0, 3) : [];
        if (pick.join() === DIAL_ANSWER.join()) {
          ctx.set('starDialSolved');
          ctx.say('三個環同時「喀」地卡進定位，星盤中心像花瓣一樣向外翻開——裡面是一枚深藍色的星徽。', 'good');
          ctx.give('emblem_star');
          return true;
        }
        ctx.wrong();
        const sameSet = pick.length === 3 && pick.slice().sort().join() === DIAL_ANSWER.slice().sort().join();
        ctx.say(sameSet
          ? '星盤卡了一下，又鬆開了。這三個星座似乎沒錯，但順序不對。'
          : '星盤紋絲不動。', 'bad');
        return false;
      },
    },

    develop: {
      available: s => inRoom('darkroom')(s) && s.flags.darkroomLit && !s.flags.plateDeveloped,
      check(ctx, seq) {
        const pick = Array.isArray(seq) ? seq.slice(0, 4) : [];
        if (pick.join() === DEVELOP_ANSWER.join()) {
          ctx.set('plateDeveloped');
          ctx.say('你先用一張廢片試了一次——影像清清楚楚地浮現出來。順序對了。', 'good');
          ctx.say('你打開避光盒，取出那張封存了二十年的玻璃底片，依序浸過四個藥盤。紅光下，群星一顆顆浮現，星群之間，是一顆拖著短尾的彗星。', 'event');
          ctx.give('plate');
          return true;
        }
        ctx.wrong();
        ctx.say('你先拿一張廢片試了試——片子上一片模糊。順序不對。幸好沒有直接用那張底片。', 'bad');
        return false;
      },
    },

    phone: {
      available: s => inRoom('foyer')(s) && s.flags.phoneRinging,
      check(ctx, choice) {
        if (choice === 'accept' && ctx.has('plate')) {
          ctx.take('plate');
          ctx.set('phoneRinging', false);
          ctx.set('phoneDone');
          ctx.end('D');
          return true;
        }
        if (choice === 'refuse') {
          ctx.set('phoneRinging', false);
          ctx.set('phoneDone');
          ctx.say('「……你會後悔的。」電話被狠狠地掛斷了。過了一會兒，門外傳來汽車發動、駛遠的聲音。', 'event');
          return true;
        }
        return null;
      },
    },

    exit: {
      available: s => inRoom('foyer')(s) && allInserted(s),
      check(ctx, choice) {
        const plate = ctx.has('plate');
        if (choice === 'leave' && !plate) { ctx.end('A'); return true; }
        if (choice === 'publish' && plate) { ctx.end(countPages(ctx.s) === 4 ? 'B' : 'C'); return true; }
        if (choice === 'leave_plate' && plate) { ctx.take('plate'); ctx.end('E'); return true; }
        return null;
      },
    },
  };

  function countPages(s) {
    const bound = (s.flags.diaryPages || []).length;
    const loose = PAGES.filter(p => s.inv.includes(p)).length;
    return bound + loose;
  }

  /* ================================================================
   * 八、結局
   * ================================================================ */
  const endings = {
    B: {
      title: '陸觀彗星', rank: '真結局',
      text: [
        '你把底片和那本拼完整的日記一起帶出了大門。',
        '三個月後，天文學會公布了調查結果：底片上彗星與群星的相對位置，精確對應 1999 年 12 月 8 日的夜空——比韓嶽宣稱的發現早了整整兩天；而韓嶽當年發表的坐標裡，那個抄錯後又被照抄的「7」，只可能來自陸觀的原始紀錄。',
        '那顆彗星被正式更名為「陸觀彗星」。',
        '公布的那天晚上，你回到老宅，在天文台架起望遠鏡，把穹頂轉向東南。目鏡裡的星空是倒過來的。你笑了——這一次，你知道該怎麼看。',
      ],
    },
    A: {
      title: '破曉', rank: '普通結局',
      text: [
        '三枚徽章各歸其位，門內傳來一連串齒輪咬合的聲音。大門緩緩向外打開，山間的晨霧湧了進來。',
        '你回頭望了一眼。書房、溫室、天文台——你走遍了它們，卻沒有帶走那個「光照不到的地方」裡的東西。',
        '許多年後，教科書上那顆彗星依然叫做「韓嶽彗星」。偶爾在失眠的夜裡，你會想起信上那句話，想知道那裡究竟藏著什麼。',
        '你始終沒有回去。',
      ],
    },
    C: {
      title: '孤證', rank: '未竟結局',
      text: [
        '你把底片交給了天文學會。底片上的彗星清清楚楚，可韓嶽的律師一口咬定：一張來歷不明的舊底片，誰能證明它不是事後偽造的？',
        '你說不出更多細節。陸觀的日記你只找到了一部分，缺掉的那幾頁裡，也許正寫著讓這張底片無可辯駁的關鍵。',
        '爭論拖了兩年，最後不了了之。',
        '（屋子裡還有你沒找到的日記殘頁。）',
      ],
    },
    E: {
      title: '沉睡的星', rank: '抉擇結局',
      text: [
        '你站在敞開的大門前，看了很久手裡的底片。',
        '最後，你走回暗房，把它放回避光盒，鎖上活板門，獨自走出了大門。',
        '真相還在那裡，只是從今以後，由你來守護。也許有一天你會回來帶走它，也許永遠不會。',
        '陸觀說過：由你決定。',
      ],
    },
    D: {
      title: '交易', rank: '壞結局',
      text: [
        '你把底片塞出了信件口。',
        '門外傳來一聲輕笑，接著是打火機「喀嚓」一響。幾分鐘後，門從外面被打開了。韓嶽把一張支票塞進你手裡；在他身後的石階上，一小團灰燼正被夜風吹散。',
        '你得到了想要的一切。',
        '只是從那以後，你再也沒有抬頭看過星空。',
      ],
    },
  };
  const ENDING_ORDER = ['B', 'A', 'C', 'E', 'D'];

  /* ================================================================
   * 九、提示（每個目標三段：方向 → 線索位置 → 答案）
   * ================================================================ */
  function mirrorHint() {
    const sol = MIRROR_SOLUTIONS[0];
    const back = MIRROR_GRID.mirrors.filter(m => sol[m.id] === '\\').map(m => m.id);
    const fwd = MIRROR_GRID.mirrors.filter(m => sol[m.id] === '/').map(m => m.id);
    const order = [];
    for (const p of traceBeam(sol).path) {
      const m = MIRROR_GRID.mirrors.find(x => x.c === p.c && x.r === p.r);
      if (m && !order.includes(m.id)) order.push(m.id);
    }
    return `${back.join('、')} 設成「\\」，${fwd.join('、')} 設成「/」。光線依序經過 ${order.join('→')}，從右側照進月光花。`;
  }
  const F = (s, k) => !!s.flags[k];
  const has = (s, id) => s.inv.includes(id);
  const hints = [
    {
      id: 'drawer', title: '書桌抽屜的鎖',
      avail: () => true, done: s => F(s, 'drawerOpen'),
      texts: [
        '書房的書桌抽屜上了四位數字鎖，鎖旁的便條提到四種顏色。',
        '仔細看書架：書脊上印著「第幾卷」。注意書並不是按卷數順序排的，問的是卷數，不是位置。',
        `紅＝第 3 卷、黃＝第 7 卷、藍＝第 5 卷、綠＝第 1 卷。密碼是 ${DRAWER_CODE}。`,
      ],
    },
    {
      id: 'flashlight', title: '讓手電筒亮起來',
      avail: s => F(s, 'drawerOpen') || F(s, 'coatSearched'), done: s => has(s, 'flashlight'),
      texts: [
        '屋裡有好幾個太暗、看不清的角落。你需要一支能亮的手電筒。',
        '門廳衣帽架上的大衣口袋裡有一支沒電的手電筒；書桌抽屜裡有電池。',
        '在物品欄選中手電筒，按「組合」，再點電池。',
      ],
    },
    {
      id: 'greenhouse', title: '打開溫室',
      avail: s => F(s, 'drawerOpen'), done: s => F(s, 'greenhouseOpen'),
      texts: [
        '抽屜裡那把鑰匙的握柄是葉子形狀。',
        '門廳右邊溫室門的鑰匙孔旁，也刻著一片葉子。',
        '在物品欄選中溫室鑰匙，再點門廳的「溫室門」。',
      ],
    },
    {
      id: 'pots', title: '四個花盆',
      avail: s => F(s, 'greenhouseOpen'), done: s => F(s, 'keyDug'),
      texts: [
        '木牌說：四句話裡只有一句是真的。先從溫室的工具架拿小鏟子。',
        '逐一假設鑰匙在每個盆裡，數數看那時有幾句話成立。只有一種假設恰好讓一句話成立。',
        '答案是玫瑰盆：鑰匙在玫瑰盆時，只有薰衣草盆那句「鑰匙不在我這裡」是真的。',
      ],
    },
    {
      id: 'gate', title: '樓梯鐵門',
      avail: s => F(s, 'keyDug'), done: s => F(s, 'gateOpen'),
      texts: [
        '黃銅鑰匙的匙柄刻著樓梯。',
        '門廳的樓梯鐵門掛著一把黃銅掛鎖。',
        '選中黃銅鑰匙，再點門廳的「樓梯鐵門」。',
      ],
    },
    {
      id: 'eyepiece', title: '望遠鏡的目鏡',
      avail: s => F(s, 'gateOpen'), done: s => F(s, 'eyepieceInstalled'),
      texts: [
        '望遠鏡少了目鏡。看看目鏡盒蓋內側寫了什麼。',
        '目鏡滾到地圖櫃底下了，那裡太暗，需要能亮的手電筒。',
        '對「地圖櫃底下」使用手電筒拿到目鏡，再對望遠鏡使用目鏡。',
      ],
    },
    {
      id: 'dial', title: '星盤（星徽）',
      avail: s => F(s, 'eyepieceInstalled'), done: s => F(s, 'starDialSolved'),
      texts: [
        '星盤要你對準「彗星初次現身的方位」上的三個星座。哪裡提到過彗星出現在哪個方向？',
        '日記殘頁（一）和書房的剪報都寫著「東南方」。用穹頂轉輪把觀測窗轉向東南，再看望遠鏡。記住望遠鏡上的便條：成像上下顛倒。用星座圖上的星數辨認星座。',
        '東南方目鏡裡由上而下是：鳥（4 星）、舟（5 星）、鑰（6 星）。倒回真實天空，由高到低是鑰、舟、鳥。外環＝鑰、中環＝舟、內環＝鳥。',
      ],
    },
    {
      id: 'safe', title: '油畫後的保險箱（日徽）',
      avail: s => F(s, 'drawerOpen'), done: s => F(s, 'safeOpen'),
      texts: [
        '書房那幅星空油畫的畫框有點歪。畫背面寫著：「星星會告訴你數字。」',
        '書桌上的數字方格紙和天文台地圖櫃裡的星圖膠片，四個角都有小十字——試著把它們組合。',
        `疊合後，①②③ 依序落在 ${SAFE_CODE.split('').join('、')} 上。保險箱密碼是 ${SAFE_CODE}。`,
      ],
    },
    {
      id: 'clock', title: '落地鐘',
      avail: () => true, done: s => F(s, 'clockSolved'),
      texts: [
        '鐘上刻著：「讓指針回到我最後一次觀測開始的那一刻。」觀測的紀錄應該在天文台。',
        '天文台的觀測日誌寫了最後一次觀測的日期和規矩；牆上的月落時刻表列著那天月亮落下的時刻。',
        '十月三日月落 02:15，再過整整一小時就是 3:15。把落地鐘撥到 3 點 15 分。',
      ],
    },
    {
      id: 'wheel', title: '溫室的總閘',
      avail: s => F(s, 'greenhouseOpen'), done: s => F(s, 'wheelInstalled'),
      texts: [
        '灌溉系統的總閘少了手輪，轉不動。',
        '手輪被陸觀藏在某個機關裡——門廳的落地鐘還沒打開。',
        '解開落地鐘拿到閥門手輪，再對溫室的「灌溉系統」使用它。',
      ],
    },
    {
      id: 'valves', title: '灌溉管線',
      avail: s => F(s, 'wheelInstalled'), done: s => F(s, 'waterOk'),
      texts: [
        '牆上的園丁守則寫著三種植物各需要什麼水。',
        '逐一看每個閥門通往哪些花床。仙人掌一滴水都不能有，月光花不能碰肥料，蕨類兩樣都要。',
        '打開 V2、V4、V5，關閉 V1、V3，然後轉開總閘。',
      ],
    },
    {
      id: 'mirrors', title: '月光反光鏡',
      avail: s => F(s, 'greenhouseOpen'), done: s => F(s, 'lightOk'),
      texts: [
        '守則說月光花只在月光照到時開花。天窗下的反光鏡可以轉動。',
        '點擊鏡子會切換斜向，光線會即時顯示。從光線第一個碰到的鏡子開始，一面一面往花的方向修正。',
        mirrorHint(),
      ],
    },
    {
      id: 'moon', title: '月光花（月徽）',
      avail: s => F(s, 'waterOk') && F(s, 'lightOk'), done: s => F(s, 'moonTaken'),
      texts: ['月光花有了雨水和月光。', '去看看月光花。', '點擊溫室裡的「月光花」。'],
    },
    {
      id: 'door', title: '把徽章嵌回大門',
      avail: s => EMBLEMS.some(e => has(s, e)), done: s => allInserted(s),
      texts: [
        '大門的黃銅面板上有日、月、星三個凹槽。',
        '選中徽章，再點門廳的大門。',
        '三枚都嵌好之後，再點一次大門就能離開。',
      ],
    },
    {
      id: 'exit', title: '離開之前',
      avail: s => allInserted(s), done: () => false,
      texts: [
        s => `大門已經可以打開了。你目前有日記 ${countPages(s)} / 4 頁${s.inv.includes('plate') ? '，也帶著底片' : '，還沒找到信裡說的真相'}。`,
        '信裡說，真相藏在「光照不到的地方」。完整的日記會讓真相更有分量。',
        '離開前若想看到真結局：取得暗房裡的玻璃底片，並收齊四頁日記，然後選擇公開真相。',
      ],
    },
    {
      id: 'darkroom', title: '光照不到的地方（選擇性）',
      avail: s => F(s, 'drawerOpen'), done: s => F(s, 'trapdoorOpen'),
      texts: [
        '信裡說真相藏在「光照不到的地方」。屋裡有一張被撕成兩半的便條。',
        '書房的廢紙簍和天文台的觀測日誌裡各有半張便條，把它們組合起來。溫室工作台底下很暗，用手電筒照照看。',
        `活板門在溫室工作台底下（用手電筒照工作台），密碼是 ${TRAPDOOR_CODE}。`,
      ],
    },
    {
      id: 'bulb', title: '暗房的燈（選擇性）',
      avail: s => F(s, 'trapdoorOpen'), done: s => F(s, 'darkroomLit'),
      texts: [
        '暗房只准開紅燈，手電筒的白光不行。',
        '天文台觀測桌上的檯燈，用的就是紅色燈泡。',
        '拿走天文台的紅色燈泡，對暗房「牆上的燈座」使用它。',
      ],
    },
    {
      id: 'develop', title: '沖洗底片（選擇性）',
      avail: s => F(s, 'darkroomLit'), done: s => F(s, 'plateDeveloped'),
      texts: [
        '拼好的便條寫了沖洗順序；藥瓶架上的卡片能推出每個瓶子裝的是什麼。',
        '先用卡片第四條和第一條確定清水的位置，再用第二條和第三條排出其他三瓶。',
        '紅＝清水、藍＝定影液、黃＝顯影液、白＝停影液。依序倒：黃 → 白 → 藍 → 紅。',
      ],
    },
    {
      id: 'diary', title: '陸觀的日記（選擇性）',
      avail: s => countPages(s) > 0, done: s => countPages(s) >= 4,
      texts: [
        s => `日記一共四頁，你找到了 ${countPages(s)} 頁。`,
        '四頁分別藏在：書桌抽屜、落地鐘、書房壁爐的煙囪、暗房的晾片繩。',
        '煙囪那一頁要用能亮的手電筒照壁爐；暗房那一頁要先點亮紅燈。',
      ],
    },
  ];

  /* ================================================================
   * 十、開場
   * ================================================================ */
  const intro = [
    '十月的最後一個雨夜，你——沈遙——收到一封沒有郵戳的信。',
    '寫信的人是你的老師，業餘天文學家陸觀。三週前，他在山上的老宅裡病逝了。信封裡只有一張卡片：「來宅邸吧，我留了東西給你。」',
    '你推開老宅的大門。門在身後「喀」地一聲，自己鎖上了。',
    '門內的地毯上，端端正正地放著第二封信。',
  ];

  return {
    title: '觀星者之屋',
    subtitle: '最後的觀測',
    saveVersion: 1,
    startRoom: 'foyer',
    startItems: ['letter'],
    roomOrder: ['foyer', 'study', 'greenhouse', 'observatory', 'darkroom'],
    rooms, items, docs, hotspots, recipes, puzzles, endings, ENDING_ORDER, hints, intro,
    // 共用謎題資料（UI 繪圖與測試用）
    BOOKS, DRAWER_CODE, DRAWER_TRAP, GRID_DIGITS, TRANSPARENCY_STARS, SAFE_CODE, POTS, POT_ANSWER,
    MOONSET, CLOCK_ANSWER, VALVES, BEDS, evalValves, MIRROR_GRID, traceBeam, MIRROR_SOLUTIONS,
    CONSTELLATIONS, CONSTELLATION_ORDER, DIRECTIONS, SKY_FIELDS, COMET_DIRECTION, DIAL_ANSWER,
    NOTE_LINES, TRAPDOOR_CODE, BOTTLES, CHEM_NAMES, DEVELOP_SEQUENCE, DEVELOP_ANSWER,
    EMBLEMS, PAGES, countPages, allInserted,
  };
}));
