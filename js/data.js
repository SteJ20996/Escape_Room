/*
 * 觀星者之屋 The Stargazer's House — 遊戲內容與規則
 * 房間、熱點、物品、線索文件、謎題、組合、結局與提示都定義在這裡。
 * 引擎（engine.js）只負責執行；這個檔案是唯一的「設計真相」。
 *
 * 所有玩家看得到的文字都寫成 L(中文, English) 一組，兩種語言並排撰寫、一起維護。
 * 遊戲狀態只存 id 與旗標，從不存文字，所以可以在遊戲中途切換語言，舊存檔也不受影響。
 *
 * 同時支援瀏覽器（window.GAME_DATA）與 Node（module.exports，供測試用）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GAME_DATA = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const L = (zh, en) => ({ zh, en });
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ================================================================
   * 一、謎題資料（UI 與引擎共用，測試會逐一驗證其唯一解）
   * ================================================================ */

  // 謎題 1：書架色碼。書架由左到右的排列（刻意不按卷數排序）。
  const BOOKS = [
    { vol: 7, color: 'yellow' }, { vol: 2, color: 'brown' }, { vol: 5, color: 'blue' },
    { vol: 9, color: 'brown' }, { vol: 1, color: 'green' }, { vol: 4, color: 'brown' },
    { vol: 3, color: 'red' }, { vol: 8, color: 'brown' }, { vol: 6, color: 'brown' },
  ];
  const COLOR_NAMES = {
    red: L('紅', 'red'), yellow: L('黃', 'yellow'), blue: L('藍', 'blue'), green: L('綠', 'green'), brown: L('棕', 'brown'),
  };
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
    { id: 'rose', name: L('玫瑰', 'rose'), says: L('鑰匙在薰衣草盆裡。', 'The key is in the lavender pot.'), truth: k => k === 'lavender' },
    { id: 'lavender', name: L('薰衣草', 'lavender'), says: L('鑰匙不在我這裡。', 'The key is not in me.'), truth: k => k !== 'lavender' },
    { id: 'sage', name: L('鼠尾草', 'sage'), says: L('鑰匙在我這裡。', 'The key is in me.'), truth: k => k === 'sage' },
    { id: 'mint', name: L('薄荷', 'mint'), says: L('鑰匙不在玫瑰盆裡。', 'The key is not in the rose pot.'), truth: k => k !== 'rose' },
  ];
  const POT_ANSWER = 'rose';

  // 謎題 6：最後的觀測（日誌 + 月落表 → 時刻）
  const MOONSET = [
    [L('一日', 'Oct 1'), '00:42'], [L('二日', 'Oct 2'), '01:29'], [L('三日', 'Oct 3'), '02:15'],
    [L('四日', 'Oct 4'), '03:04'], [L('五日', 'Oct 5'), '03:56'], [L('六日', 'Oct 6'), '04:51'],
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
    moon: { name: L('月光花', 'Moonflower'), need: { rain: true, fert: false } },
    fern: { name: L('蕨類', 'Ferns'), need: { rain: true, fert: true } },
    cactus: { name: L('仙人掌', 'Cactus'), need: { rain: false, fert: false } },
  };
  function evalValves(open) {
    const got = {};
    for (const b of Object.keys(BEDS)) got[b] = { rain: false, fert: false };
    for (const v of VALVES) if (open && open[v.id]) for (const b of v.to) got[b][v.src] = true;
    const problems = [];
    if (got.cactus.rain || got.cactus.fert) problems.push(L('仙人掌那一格的土開始積水——守則說這個月一滴水都不能給它。', 'Water is pooling in the cactus bed — the rules say it mustn\'t get a single drop this month.'));
    if (got.moon.fert) problems.push(L('肥料水正流向月光花！', 'Fertilizer water is heading for the moonflower!'));
    else if (!got.moon.rain) problems.push(L('月光花那一格還是乾的。', 'The moonflower bed is still dry.'));
    if (!got.fern.rain && !got.fern.fert) problems.push(L('蕨類一滴水也沒喝到。', 'The ferns didn\'t get a drop.'));
    else if (!got.fern.rain) problems.push(L('蕨類只喝到肥料水，還缺雨水。', 'The ferns only got fertilizer water; they still need rainwater.'));
    else if (!got.fern.fert) problems.push(L('蕨類只喝到雨水，土還是很貧瘠——它也需要肥料。', 'The ferns only got rainwater, and the soil is still poor — they need fertilizer too.'));
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
    lamp: { name: L('燈', 'Lamp'), stars: [[50, 8], [28, 88], [74, 70]], lines: [[0, 1], [1, 2], [2, 0]] },
    bird: { name: L('鳥', 'Bird'), stars: [[8, 22], [50, 52], [94, 16], [56, 94]], lines: [[0, 1], [1, 2], [1, 3]] },
    boat: { name: L('舟', 'Boat'), stars: [[10, 58], [90, 58], [72, 88], [30, 88], [44, 6]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 0], [4, 1]] },
    key: { name: L('鑰', 'Key'), stars: [[12, 16], [40, 8], [26, 38], [56, 58], [82, 84], [94, 64]], lines: [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5]] },
    bow: { name: L('弓', 'Bow'), stars: [[30, 4], [14, 26], [8, 50], [14, 74], [30, 96], [58, 50], [92, 50]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]] },
    fish: { name: L('魚', 'Fish'), stars: [[14, 50], [34, 28], [62, 28], [80, 50], [62, 72], [34, 72], [96, 30], [96, 70]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [3, 7]] },
    crown: { name: L('冠', 'Crown'), stars: [[8, 88], [50, 88], [92, 88], [8, 34], [30, 58], [50, 10], [70, 58], [92, 34], [50, 62]], lines: [[0, 1], [1, 2], [0, 3], [2, 7], [3, 4], [4, 5], [5, 6], [6, 7]] },
    tower: { name: L('塔', 'Tower'), stars: [[50, 4], [38, 26], [62, 26], [34, 48], [66, 48], [30, 70], [70, 70], [26, 94], [74, 94], [50, 94]], lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [9, 8]] },
  };
  const CONSTELLATION_ORDER = ['lamp', 'bird', 'boat', 'key', 'bow', 'fish', 'crown', 'tower'];
  const DIRECTIONS = [
    { id: 'N', name: L('北', 'north') }, { id: 'NE', name: L('東北', 'northeast') },
    { id: 'E', name: L('東', 'east') }, { id: 'SE', name: L('東南', 'southeast') },
    { id: 'S', name: L('南', 'south') }, { id: 'SW', name: L('西南', 'southwest') },
    { id: 'W', name: L('西', 'west') }, { id: 'NW', name: L('西北', 'northwest') },
  ];
  // 每個方位真實天空中由高到低的三個星座
  const SKY_FIELDS = {
    N: ['crown', 'lamp', 'fish'], NE: ['tower', 'bow', 'lamp'], E: ['fish', 'bird', 'crown'],
    SE: ['key', 'boat', 'bird'], S: ['bow', 'key', 'tower'], SW: ['lamp', 'crown', 'boat'],
    W: ['boat', 'tower', 'bow'], NW: ['bird', 'fish', 'key'],
  };
  const COMET_DIRECTION = 'SE';
  const DIAL_ANSWER = SKY_FIELDS[COMET_DIRECTION].slice(); // [外環, 中環, 內環]

  // 謎題 10：撕成兩半的便條（每行在撕裂處分成左右兩段；兩種語言各自保證密碼與順序都橫跨撕口）
  const NOTE_LINES = {
    zh: [
      ['阿遙：', ''],
      ['溫室工作台底', '下有一扇活板門，'],
      ['門鎖密碼是 12', '08，那個冬夜的日期。'],
      ['暗房裡只能開紅燈', '，白光會毀掉底片。'],
      ['沖洗順序：顯影→停', '影→定影→清水。'],
      ['藥瓶標籤我撕了，看', '架上的卡片。'],
      ['', '—— 陸'],
    ],
    en: [
      ['Yao —', ''],
      ['There\'s a trapdoor under the', ' greenhouse workbench.'],
      ['Its code is 12', '08 — the date of that night.'],
      ['Red light only in the dark', 'room; white light ruins film.'],
      ['Order: developer → st', 'op bath → fixer → water.'],
      ['I tore the labels off — the c', 'ard on the shelf explains.'],
      ['', '— Lu'],
    ],
  };
  const NOTE_ORDER_TEXT = { zh: '顯影→停影→定影→清水', en: 'developer → stop bath → fixer → water' };
  const TRAPDOOR_CODE = '1208';

  // 謎題 11：顯影藥劑（瓶蓋顏色由左到右）
  const BOTTLES = [
    { id: 'red', name: L('紅蓋', 'Red cap'), content: 'water' },
    { id: 'blue', name: L('藍蓋', 'Blue cap'), content: 'fixer' },
    { id: 'yellow', name: L('黃蓋', 'Yellow cap'), content: 'developer' },
    { id: 'white', name: L('白蓋', 'White cap'), content: 'stop' },
  ];
  const CHEM_NAMES = { developer: L('顯影液', 'developer'), stop: L('停影液', 'stop bath'), fixer: L('定影液', 'fixer'), water: L('清水', 'water') };
  const DEVELOP_SEQUENCE = ['developer', 'stop', 'fixer', 'water'];
  const DEVELOP_ANSWER = DEVELOP_SEQUENCE.map(ch => BOTTLES.find(b => b.content === ch).id);

  const EMBLEMS = ['emblem_sun', 'emblem_moon', 'emblem_star'];
  const EMBLEM_SHORT = { emblem_sun: L('日', 'Sun'), emblem_moon: L('月', 'Moon'), emblem_star: L('星', 'Star') };
  const PAGES = ['page1', 'page2', 'page3', 'page4'];

  /* ================================================================
   * 二、線索文件（可在「線索筆記」中隨時重讀）
   * body 為 L([中文段落…], [English paragraphs…])
   * ================================================================ */
  const docs = {
    letter: {
      title: L('陸觀的信', 'Lu Guan\'s Letter'), style: 'hand',
      body: L([
        '阿遙：',
        '抱歉，用這種方式迎接你。',
        '大門已經被我設下的機關鎖上了。屋裡藏著三枚徽章——日、月、星。把它們嵌回大門，門就會打開。',
        '這屋子裡的每一道鎖，答案都在屋子裡。不必求助任何書本或旁人，只要仔細看、慢慢想。',
        '還有一件事。二十年前那個冬夜的真相，我藏在「光照不到的地方」。要不要把它帶出這扇門，由你決定。',
        '—— 陸觀',
      ], [
        'Yao,',
        'Forgive me for welcoming you like this.',
        'The front door is locked by a mechanism I built. Three emblems are hidden in this house — the Sun, the Moon and the Star. Set them back into the door and it will open.',
        'Every lock in this house has its answer inside this house. You won\'t need any book or any other person. Just look closely and think slowly.',
        'One more thing. The truth about that winter night twenty years ago is hidden "where the light cannot reach". Whether you carry it out through that door is up to you.',
        '— Lu Guan',
      ]),
    },
    clipping: {
      title: L('舊剪報', 'Old Newspaper Clipping'), style: 'news',
      body: L([
        '《山城日報》1999 年 12 月 11 日',
        '【新彗星現身東南夜空　韓嶽教授率先發現】',
        '本報訊　天文學家韓嶽教授昨日宣布，他於本月十日夜間，在東南方的天空中發現一顆從未被記錄的彗星。國際天文組織已初步確認，暫定名為「韓嶽彗星」。韓教授表示：「這是我觀測生涯中最幸運的一夜。」',
        '據韓教授公布的觀測資料，彗星當晚位於赤經 5 時 27 分、赤緯 −17 度附近。',
        '（剪報的「十日」旁，有人用紅筆重重畫了一個問號。）',
      ], [
        'Mountain City Daily · 11 December 1999',
        'NEW COMET IN THE SOUTHEAST SKY — PROF. HAN YUE FIRST TO SPOT IT',
        'Astronomer Professor Han Yue announced yesterday that on the night of the 10th he discovered a previously unrecorded comet in the southeastern sky. The International Astronomical Organization has given preliminary confirmation and provisionally named it Comet Han Yue. "It was the luckiest night of my observing life," Professor Han said.',
        'According to the observations Professor Han released, the comet lay near right ascension 5h 27m, declination −17° that night.',
        '(Beside "the 10th", someone has drawn a heavy question mark in red ink.)',
      ]),
    },
    drawer_note: {
      title: L('抽屜鎖上的便條', 'Note on the Drawer Lock'), style: 'hand',
      body: L(['紅、黃、藍、綠——', '照這個順序，它們各是第幾卷？'],
        ['Red, yellow, blue, green —', 'in that order: which volume is each one?']),
    },
    bookshelf: { title: L('書架上的《星空圖鑑》', 'The Star Atlas on the Bookshelf'), view: 'bookshelf' },
    painting_back: {
      title: L('油畫背面的字', 'Writing on the Back of the Painting'), style: 'hand',
      body: L(['（畫框背面，鉛筆字）', '星星會告訴你數字。'], ['(On the back of the frame, in pencil)', 'The stars will tell you the numbers.']),
    },
    pots_rule: {
      title: L('花盆架上的木牌', 'Wooden Sign on the Pot Shelf'), style: 'plain',
      body: L([
        '四個花盆裡，只有一個埋著東西。',
        '盆上刻的四句話裡，只有一句是真的。',
        ...POTS.map(p => `${p.name.zh}盆：「${p.says.zh}」`),
      ], [
        'Only one of these four pots has something buried in it.',
        'Of the four sentences carved on the pots, only one is true.',
        ...POTS.map(p => `${cap(p.name.en)} pot: "${p.says.en}"`),
      ]),
    },
    garden_rules: {
      title: L('園丁守則', 'Gardener\'s Rules'), style: 'plain',
      body: L([
        '十月澆水守則',
        '・月光花：只喝雨水。沾到一滴肥料水就會枯萎。',
        '・蕨類：雨水和肥料水都要。',
        '・仙人掌：這個月一滴水都不能給。',
        '・月光花只在月光照到它時開花。天窗下的反光鏡可以轉動。',
        '打開總閘之前，先把每個閥門設好。',
      ], [
        'October watering rules',
        '• Moonflower: rainwater only. One drop of fertilizer water and it withers.',
        '• Ferns: need both rainwater and fertilizer water.',
        '• Cactus: not a single drop this month.',
        '• The moonflower only blooms when moonlight falls on it. The mirrors under the skylight can be turned.',
        'Set every valve before you open the main valve.',
      ]),
    },
    eyepiece_box: {
      title: L('目鏡盒蓋內側的字', 'Inside the Eyepiece Box Lid'), style: 'hand',
      body: L(['目鏡又滾到地圖櫃底下去了。', '那裡太暗，下次記得帶燈。'],
        ['The eyepiece has rolled under the map cabinet again.', 'It\'s too dark under there — bring a light next time.']),
    },
    telescope_note: {
      title: L('望遠鏡上的便條', 'Note on the Telescope'), style: 'hand',
      body: L(['提醒自己：', '這支折射鏡看到的像是倒過來的——上下顛倒，左右也相反。'],
        ['Note to self:', 'this refractor shows everything inverted — upside down, and left and right swapped too.']),
    },
    dial_inscription: {
      title: L('星盤上的刻字', 'Inscription on the Star Dial'), style: 'plain',
      body: L([
        '轉動三環，對準彗星初次現身的方位上那三個星座。',
        '外環：天空中位置最高的那一個。中環：高度居中的那一個。內環：最低、最靠近地平線的那一個。',
        '——以真實的天空為準。',
      ], [
        'Turn the three rings to the three constellations in the direction where the comet first appeared.',
        'Outer ring: the one highest in the sky. Middle ring: the one in between. Inner ring: the lowest, the one nearest the horizon.',
        '— as they stand in the real sky.',
      ]),
    },
    poster: { title: L('手繪星座圖', 'Hand-drawn Constellation Chart'), view: 'poster' },
    almanac: {
      title: L('十月月落時刻表', 'October Moonset Times'), style: 'table',
      body: L(['十月　月落時刻', ...MOONSET.map(([d, t]) => `${d.zh}　${t}`)],
        ['October · moonset', ...MOONSET.map(([d, t]) => `${d.en}   ${t}`)]),
    },
    obs_log: {
      title: L('觀測日誌（最後幾頁）', 'Observation Log (Last Pages)'), style: 'hand',
      body: L([
        '九月二十八日　晴　——　東方的「鳥」清晰可見。',
        '十月一日　陰　——　無法觀測。',
        '十月三日　晴　——　最後一次觀測。照老規矩，等月亮落下後整整一小時才開始，月光會淹沒暗星。咳得厲害，手也不穩了，也許這真是最後一次。',
        '（之後的頁面全是空白。）',
      ], [
        '28 September — clear — The Bird stands out clearly in the east.',
        '1 October — overcast — No observing.',
        '3 October — clear — Last observation. As always, I waited one full hour after the moon set before starting; moonlight drowns the faint stars. Coughing badly, hands unsteady. Perhaps this really is the last time.',
        '(The remaining pages are blank.)',
      ]),
    },
    clock_inscription: {
      title: L('落地鐘上的刻字', 'Inscription on the Clock'), style: 'plain',
      body: L(['讓指針回到我最後一次觀測開始的那一刻。'], ['Turn the hands back to the moment my last observation began.']),
    },
    bottle_card: {
      title: L('藥瓶架上的卡片', 'Card on the Bottle Shelf'), style: 'hand',
      body: L([
        '藥瓶的標籤都被我撕掉了，只剩瓶蓋顏色。架上由左到右：紅、藍、黃、白。',
        '一、清水放在架子的最左邊或最右邊。',
        '二、定影液的瓶蓋既不是白色，也不是紅色。',
        '三、顯影液就在停影液的緊左邊。',
        '四、白色瓶蓋裡裝的不是清水。',
      ], [
        'I tore the labels off the bottles; only the cap colors are left. On the shelf, left to right: red, blue, yellow, white.',
        '1. The water sits at the far left or the far right of the shelf.',
        '2. The fixer\'s cap is neither white nor red.',
        '3. The developer stands immediately to the left of the stop bath.',
        '4. The white-capped bottle does not hold water.',
      ]),
    },
    darkroom_warning: {
      title: L('活板門內側的警告', 'Warning Inside the Trapdoor'), style: 'plain',
      body: L(['暗房——只准開紅燈。', '白光會毀掉一切。'], ['DARKROOM — RED LIGHT ONLY.', 'White light ruins everything.']),
    },
    page1: {
      title: L('日記殘頁（一）', 'Diary Page I'), style: 'hand',
      body: L([
        '1999 年 12 月 8 日',
        '雲散了。十點過後，我在東南方的天空看見一團模糊的光，拖著短短的尾巴。星圖上沒有它。',
        '我拍了三張玻璃底片，每張曝光二十分鐘。手一直在抖——如果我沒弄錯，這是一顆從未被記錄過的彗星。',
      ], [
        '8 December 1999',
        'The clouds cleared. A little after ten, I saw a faint smudge of light in the southeastern sky, trailing a short tail. It isn\'t on any star chart.',
        'I exposed three glass plates, twenty minutes each. My hands wouldn\'t stop shaking — if I\'m not mistaken, this is a comet no one has ever recorded.',
      ]),
    },
    page2: {
      title: L('日記殘頁（二）', 'Diary Page II'), style: 'hand',
      body: L([
        '1999 年 12 月 9 日',
        '我把消息告訴了韓老師。他說要幫我核對軌道，借走了我的觀測紀錄和兩張已沖洗的底片。',
        '第三張我還沒沖，就先收進了暗房的避光盒裡。說不上為什麼，我留了個心眼。',
      ], [
        '9 December 1999',
        'I told Professor Han. He offered to check the orbit for me, and borrowed my observation records and the two plates I had developed.',
        'I hadn\'t developed the third yet, so I put it away in the light-tight box in the darkroom. I can\'t say why. Something told me to be careful.',
      ]),
    },
    page3: {
      title: L('日記殘頁（三）', 'Diary Page III'), style: 'hand',
      body: L([
        '1999 年 12 月 12 日',
        '今天才看到昨天的報紙。頭版：「韓嶽教授發現新彗星」。坐標、時刻，和我的紀錄一模一樣——那晚我把赤緯 −16 度誤寫成 −17，當場劃掉改正；他連那個劃掉的「7」都照抄了上去。',
        '我打了十一通電話，他一通也沒接。',
      ], [
        '12 December 1999',
        'Only today did I see yesterday\'s paper. Front page: "Professor Han Yue Discovers New Comet." The coordinates and times match my records exactly — that night I miswrote declination −16° as −17 and struck it out on the spot. He copied that crossed-out "7" too.',
        'I called him eleven times. He didn\'t pick up once.',
      ]),
    },
    page4: {
      title: L('日記殘頁（四）', 'Diary Page IV'), style: 'hand',
      body: L([
        '九月二十日',
        '醫生說，我的時間不多了。二十年來，我一次也沒有打開那個避光盒。我恨過他，後來不恨了，只是累。',
        '阿遙，第三張底片留給你。彗星每晚都在群星之間移動，底片上它和星星的相對位置，就是那一夜的日期，誰也偽造不了。底片紙套背面，也記著那晚同一個劃掉的「7」。底片、紙套、報上照抄的錯誤，三樣放在一起，誰也賴不掉。',
        '或者，你也可以讓它繼續沉睡。由你決定。',
      ], [
        '20 September',
        'The doctor says I don\'t have much time left. In twenty years I never once opened that light-tight box. I hated him once. Later I didn\'t — I was only tired.',
        'Yao, I leave the third plate to you. A comet moves among the stars every night, so its position against the stars on that plate is the date of that night, and no one can forge it. The back of the plate\'s sleeve carries the same crossed-out "7" from that night. The plate, the sleeve, and the error copied into the newspaper — put the three together and no one can deny it.',
        'Or you can let it go on sleeping. The choice is yours.',
      ]),
    },
  };

  /* ================================================================
   * 三、物品（圖示由 art.js 依 id 繪製）
   * ================================================================ */
  const items = {
    letter: { name: L('陸觀的信', 'Lu Guan\'s Letter'), kind: 'paper', desc: L('老師寫給你的最後一封信。', 'Your teacher\'s last letter to you.'), doc: 'letter' },
    flashlight_dead: { name: L('手電筒（沒電）', 'Flashlight (Dead)'), kind: 'tool', desc: L('一支老式金屬手電筒。按下開關沒有反應——電池倉是空的。', 'An old metal flashlight. Nothing happens when you press the switch — the battery compartment is empty.') },
    battery: { name: L('電池', 'Batteries'), kind: 'tool', desc: L('兩節還算新的電池，用橡皮筋綁在一起。', 'Two fairly new batteries held together with a rubber band.') },
    flashlight: { name: L('手電筒', 'Flashlight'), kind: 'tool', desc: L('裝上電池的手電筒，光線又白又亮。可以照亮黑暗的角落。', 'The flashlight, now with batteries. Its beam is bright and white — good for dark corners.') },
    grid_paper: { name: L('數字方格紙', 'Number Grid'), kind: 'paper', desc: L('一張 5×5 的方格紙，每格寫著一個數字。四個角上各畫著一個小十字。', 'A 5×5 sheet of grid paper with a digit in every square. There\'s a small cross in each corner.'), view: 'grid' },
    transparency: { name: L('星圖膠片', 'Star-Chart Film'), kind: 'paper', desc: L('一張透明膠片，畫著十顆星星，其中三顆被圈起來，標著①②③。四個角上各畫著一個小十字。', 'A clear sheet of film with ten stars drawn on it. Three are circled and numbered ①②③. There\'s a small cross in each corner.'), view: 'transparency' },
    overlay: { name: L('疊合的星圖', 'Overlaid Star Chart'), kind: 'paper', desc: L('星圖膠片疊在方格紙上，四角的十字對得整整齊齊。', 'The star-chart film laid over the number grid, the corner crosses lined up exactly.'), view: 'overlay' },
    greenhouse_key: { name: L('溫室鑰匙', 'Greenhouse Key'), kind: 'key', desc: L('一把鐵鑰匙，握柄做成葉子的形狀。', 'An iron key whose bow is shaped like a leaf.') },
    trowel: { name: L('小鏟子', 'Trowel'), kind: 'tool', desc: L('園藝用的小鏟子，鏟刃有點鈍了。', 'A small garden trowel. The blade is a little blunt.') },
    brass_key: { name: L('黃銅鑰匙', 'Brass Key'), kind: 'key', desc: L('一把沾著泥土的黃銅鑰匙，匙柄刻著樓梯的圖樣。', 'A brass key caked with soil. A staircase is engraved on its bow.') },
    valve_wheel: { name: L('閥門手輪', 'Valve Handwheel'), kind: 'tool', desc: L('黃銅手輪，背面貼著紙條：「溫室總閘」。', 'A brass handwheel. A slip of paper on the back reads: "Greenhouse main valve".') },
    eyepiece: { name: L('望遠鏡目鏡', 'Eyepiece'), kind: 'tool', desc: L('一枚黃銅框的目鏡，鏡片上沾了點灰，擦一擦還能用。', 'A brass-rimmed telescope eyepiece. A little dusty, but it still works.') },
    red_bulb: { name: L('紅色燈泡', 'Red Bulb'), kind: 'tool', desc: L('從觀測桌的檯燈上轉下來的紅色燈泡。陸觀說過：看星星和沖底片，都只用紅光。', 'The red bulb from the observing-desk lamp. Lu Guan always said: stars and film both want red light only.') },
    note_left: { name: L('便條（左半）', 'Note (Left Half)'), kind: 'paper', desc: L('被撕成兩半的便條，這是左半邊。字跡是陸觀的。', 'The left half of a note torn in two. Lu Guan\'s handwriting.'), view: 'note_left' },
    note_right: { name: L('便條（右半）', 'Note (Right Half)'), kind: 'paper', desc: L('被撕成兩半的便條，這是右半邊。夾在觀測日誌裡當書籤。', 'The right half of a torn note. It was tucked into the observation log as a bookmark.'), view: 'note_right' },
    note_full: { name: L('拼好的便條', 'Mended Note'), kind: 'paper', desc: L('兩半便條沿著撕口拼在一起，終於能讀了。', 'The two halves fit together along the tear. Now it can be read.'), view: 'note_full' },
    page1: { name: L('日記殘頁（一）', 'Diary Page I'), kind: 'page', desc: L('從日記上撕下的一頁。', 'A page torn from a diary.'), doc: 'page1' },
    page2: { name: L('日記殘頁（二）', 'Diary Page II'), kind: 'page', desc: L('從日記上撕下的一頁，邊緣被煙燻黑了。', 'A page torn from a diary, its edges blackened by smoke.'), doc: 'page2' },
    page3: { name: L('日記殘頁（三）', 'Diary Page III'), kind: 'page', desc: L('從日記上撕下的一頁，紙上有淚痕似的水漬。', 'A page torn from a diary, with water stains like dried tears.'), doc: 'page3' },
    page4: { name: L('日記殘頁（四）', 'Diary Page IV'), kind: 'page', desc: L('從日記上撕下的一頁，字跡已經有些顫抖。', 'A page torn from a diary, the handwriting already a little shaky.'), doc: 'page4' },
    diary: { name: L('陸觀的日記', 'Lu Guan\'s Diary'), kind: 'page', desc: L('你把找到的殘頁按日期裝訂在一起。', 'The pages you found, bound together in date order.'), view: 'diary' },
    emblem_sun: { name: L('日徽', 'Sun Emblem'), kind: 'emblem', desc: L('一枚沉甸甸的黃銅徽章，刻著光芒四射的太陽。', 'A heavy brass emblem engraved with a radiant sun.') },
    emblem_moon: { name: L('月徽', 'Moon Emblem'), kind: 'emblem', desc: L('一枚銀白色的徽章，刻著一彎新月。', 'A silvery emblem engraved with a crescent moon.') },
    emblem_star: { name: L('星徽', 'Star Emblem'), kind: 'emblem', desc: L('一枚深藍色的琺瑯徽章，嵌著一顆八角星。', 'A deep-blue enamel emblem set with an eight-pointed star.') },
    plate: { name: L('玻璃底片', 'Glass Plate'), kind: 'evidence', desc: L('剛沖洗出來的玻璃底片，裝在陸觀手寫的紙套裡。群星之間，一顆拖著短尾的彗星清清楚楚。片角刻著：1999.12.08　陸觀。', 'The freshly developed glass plate, in a paper sleeve written in Lu Guan\'s hand. Among the stars, a comet with a short tail is perfectly clear. Etched in the corner: 1999.12.08 Lu Guan.'), view: 'plate' },
  };

  /* ================================================================
   * 四、房間
   * ================================================================ */
  const rooms = {
    foyer: {
      name: L('門廳', 'Foyer'),
      accessible: () => true,
      enterText: () => L('門廳。熄滅的吊燈垂在挑高的天花板下，正對面是那扇鎖死的大門。左邊是書房，右邊是溫室，樓梯通往天文台。',
        'The foyer. A dark chandelier hangs from the high ceiling; straight ahead is the locked front door. The study is to the left, the greenhouse to the right, and the stairs lead up to the observatory.'),
      onEnter(ctx) {
        if (ctx.has('plate') && !ctx.flag('phoneRinging') && !ctx.flag('phoneDone')) {
          ctx.set('phoneRinging');
          ctx.say(L('鈴——鈴——門廳裡那台老電話突然響了起來。', 'Brrring — brrring — the old telephone in the foyer suddenly starts to ring.'), 'event');
        }
      },
    },
    study: {
      name: L('書房', 'Study'),
      accessible: () => true,
      enterText: () => L('書房裡瀰漫著舊紙和菸草的味道。書架、書桌、壁爐，牆上掛著一幅星空油畫。',
        'The study smells of old paper and pipe tobacco. A bookshelf, a desk, a fireplace, and a painting of the night sky on the wall.'),
    },
    greenhouse: {
      name: L('溫室', 'Greenhouse'),
      accessible: s => !!s.flags.greenhouseOpen,
      enterText: () => L('雨剛停，玻璃頂上還掛著水珠。雲散了，月光從天窗斜斜地照進來。空氣又濕又暖。',
        'The rain has just stopped; drops still cling to the glass roof. The clouds have parted, and moonlight slants in through the skylight. The air is warm and damp.'),
    },
    observatory: {
      name: L('天文台', 'Observatory'),
      accessible: s => !!s.flags.gateOpen,
      enterText: () => L('天文台。圓頂下立著一支黃銅折射望遠鏡，牆上貼滿了星圖。',
        'The observatory. A brass refracting telescope stands beneath the dome, and the walls are covered in star charts.'),
    },
    darkroom: {
      name: L('暗房', 'Darkroom'),
      accessible: s => !!s.flags.trapdoorOpen,
      enterText: s => s.flags.darkroomLit
        ? L('紅色的安全燈把暗房染成一片暗紅。', 'The red safelight bathes the darkroom in a deep crimson glow.')
        : L('你沿著梯子爬下去，四周伸手不見五指。', 'You climb down the ladder into pitch darkness.'),
      onEnter(ctx) {
        if (!ctx.flag('darkroomLit')) {
          ctx.say(L('借著頭頂溫室透下來的一點微光，你看見活板門內側貼著一張紙：「暗房——只准開紅燈。白光會毀掉一切。」',
            'In the faint light from the greenhouse above, you can just make out a sheet of paper on the underside of the trapdoor: "DARKROOM — RED LIGHT ONLY. White light ruins everything."'), 'event');
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
    ctx.say(L(`你把${items[e].name.zh}按進大門上對應的凹槽，「喀」的一聲，嵌得嚴絲合縫。`,
      `You press the ${items[e].name.en} into its socket in the door. Click — a perfect fit.`), 'good');
    if (allInserted(ctx.s)) ctx.say(L('三枚徽章全部歸位。門內傳來齒輪轉動的聲音——大門的鎖開了。', 'All three emblems are in place. Gears turn inside the door — the lock has opened.'), 'event');
  };
  const DEAD_LIGHT = L('手電筒沒電，照不亮任何東西。', 'The flashlight is dead. It lights up nothing.');

  const hotspots = [
    /* ---------------- 門廳 ---------------- */
    {
      id: 'f_door', room: 'foyer', name: L('大門', 'Front Door'),
      examine(ctx) {
        const s = ctx.s;
        if (allInserted(s)) { ctx.open({ view: 'exit' }); return; }
        const set = e => !!s.flags['inserted_' + e];
        ctx.say(L(
          `厚重的橡木大門，門把紋絲不動。門板中央有一塊黃銅面板，上面有三個凹槽（${EMBLEMS.map(e => `${EMBLEM_SHORT[e].zh}：${set(e) ? '已嵌入' : '空'}`).join('，')}）。`,
          `A heavy oak door; the handle won't move. A brass panel in the middle has three sockets (${EMBLEMS.map(e => `${EMBLEM_SHORT[e].en}: ${set(e) ? 'set' : 'empty'}`).join(', ')}).`));
      },
      use: { emblem_sun: insertEmblem('emblem_sun'), emblem_moon: insertEmblem('emblem_moon'), emblem_star: insertEmblem('emblem_star') },
      useAny(ctx) { ctx.say(L('大門的機關只認那三枚徽章。', 'The door\'s mechanism only accepts the three emblems.')); },
    },
    {
      id: 'f_mailslot', room: 'foyer', name: L('信件口', 'Mail Slot'),
      examine(ctx) {
        if (ctx.flag('phoneDone')) ctx.say(L('信件口外一片漆黑。門外那輛車的引擎聲已經遠去了。', 'Beyond the mail slot there is only darkness. The car\'s engine has faded into the distance.'));
        else ctx.say(L('門上的黃銅信件口。往外推只能推開一條細縫——夠塞進一封信，人是絕對過不去的。', 'A brass mail slot in the door. It only pushes open a crack — wide enough for a letter, never for a person.'));
      },
      use: {
        plate(ctx) {
          if (ctx.flag('phoneRinging')) ctx.say(L('電話還在響。也許該先聽聽是誰。', 'The phone is still ringing. Maybe you should find out who it is first.'));
          else ctx.say(L('你把底片湊近信件口，又收了回來。外面沒有人在等它。', 'You hold the plate up to the slot, then draw it back. No one outside is waiting for it.'));
        },
      },
    },
    {
      id: 'f_phone', room: 'foyer', name: L('老電話', 'Old Telephone'),
      examine(ctx) {
        if (ctx.flag('phoneRinging')) { ctx.open({ view: 'phone' }); return; }
        if (ctx.flag('phoneDone')) { ctx.say(L('聽筒裡只剩嘟嘟聲。', 'Only a dial tone now.')); return; }
        ctx.say(L('一台黑色轉盤電話。你拿起聽筒——線路是通的，但撥不出去，好像只能接聽。', 'A black rotary telephone. You lift the receiver — the line is live, but you can\'t dial out. It seems it can only take calls.'));
      },
    },
    {
      id: 'f_clock', room: 'foyer', name: L('落地鐘', 'Grandfather Clock'),
      examine(ctx) {
        if (ctx.flag('clockSolved')) { ctx.say(L('落地鐘停在三點十五分，鐘擺箱的小門敞開著，裡面已經空了。', 'The grandfather clock stands at a quarter past three. The little door of the pendulum case hangs open; it\'s empty now.')); return; }
        ctx.note('clock_inscription');
        ctx.open({ view: 'clock' });
      },
    },
    {
      id: 'f_coat', room: 'foyer', name: L('衣帽架', 'Coat Rack'),
      examine(ctx) {
        if (!ctx.flag('coatSearched')) {
          ctx.set('coatSearched');
          ctx.say(L('衣帽架上掛著陸觀的舊大衣。你摸了摸口袋——', 'Lu Guan\'s old overcoat hangs on the rack. You feel in the pocket —'));
          ctx.give('flashlight_dead');
        } else ctx.say(L('舊大衣上還留著淡淡的菸草味。口袋已經空了。', 'The old overcoat still smells faintly of tobacco. The pockets are empty.'));
      },
    },
    {
      id: 'f_umbrella', room: 'foyer', name: L('傘架', 'Umbrella Stand'),
      examine(ctx) { ctx.say(L('傘架裡只有一把黑傘，傘尖還在滴水——那是你自己的。', 'There\'s only one black umbrella in the stand, still dripping — it\'s yours.')); },
    },
    {
      id: 'f_window', room: 'foyer', name: L('窗戶', 'Window'),
      examine(ctx) { ctx.say(L('窗外裝著粗鐵欄杆，玻璃後面是漆黑的山。看來只能走大門了。', 'Thick iron bars cover the window; beyond the glass is only the dark mountain. The front door is the only way out.')); },
    },
    {
      id: 'f_study_door', room: 'foyer', name: L('書房門', 'Study Door'),
      examine(ctx) { ctx.goto('study'); },
    },
    {
      id: 'f_gh_door', room: 'foyer', name: L('溫室門', 'Greenhouse Door'),
      examine(ctx) {
        if (ctx.flag('greenhouseOpen')) { ctx.goto('greenhouse'); return; }
        ctx.say(L('通往溫室的玻璃門鎖著。鑰匙孔旁刻著一片小小的葉子。', 'The glass door to the greenhouse is locked. A tiny leaf is carved beside the keyhole.'));
      },
      use: {
        greenhouse_key(ctx) {
          if (ctx.flag('greenhouseOpen')) return;
          ctx.take('greenhouse_key');
          ctx.set('greenhouseOpen');
          ctx.say(L('葉子形狀的鑰匙正好插進鎖孔。「喀噠」——溫室門開了。', 'The leaf-shaped key slides right in. Click — the greenhouse door opens.'), 'good');
        },
      },
    },
    {
      id: 'f_gate', room: 'foyer', name: L('樓梯鐵門', 'Stair Gate'),
      examine(ctx) {
        if (ctx.flag('gateOpen')) { ctx.goto('observatory'); return; }
        ctx.say(L('通往天文台的樓梯被一道鐵柵門擋住，門上掛著一把黃銅掛鎖。', 'An iron gate blocks the stairs up to the observatory. A brass padlock hangs on it.'));
      },
      use: {
        brass_key(ctx) {
          ctx.take('brass_key');
          ctx.set('gateOpen');
          ctx.say(L('黃銅鑰匙轉了半圈，掛鎖彈開。鐵柵門吱呀一聲打開了。', 'The brass key turns half a turn and the padlock springs open. The iron gate creaks open.'), 'good');
        },
      },
    },

    /* ---------------- 書房 ---------------- */
    {
      id: 's_shelf', room: 'study', name: L('書架', 'Bookshelf'),
      examine(ctx) {
        ctx.note('bookshelf');
        ctx.open({ view: 'bookshelf' });
      },
    },
    {
      id: 's_drawer', room: 'study', name: L('書桌抽屜', 'Desk Drawer'),
      examine(ctx) {
        if (ctx.flag('drawerOpen')) { ctx.say(L('抽屜開著，裡面已經空了。', 'The drawer is open and empty.')); return; }
        ctx.note('drawer_note');
        ctx.open({ view: 'lock', id: 'drawer' });
      },
    },
    {
      id: 's_desk', room: 'study', name: L('書桌桌面', 'Desktop'),
      examine(ctx) {
        if (!ctx.flag('gridTaken')) {
          ctx.set('gridTaken');
          ctx.say(L('桌面的玻璃墊下壓著一張寫滿數字的方格紙。你把它抽了出來。', 'A sheet of grid paper covered in digits is pressed under the desk\'s glass top. You slide it out.'));
          ctx.give('grid_paper');
        } else ctx.say(L('桌上攤著幾本星表，墨水早就乾了。', 'A few star catalogs lie open on the desk, the ink long dry.'));
      },
    },
    {
      id: 's_clipping', room: 'study', name: L('牆上的剪報', 'Newspaper Clipping'),
      examine(ctx) { ctx.note('clipping'); ctx.open({ view: 'doc', id: 'clipping' }); },
    },
    {
      id: 's_painting', room: 'study', name: L('星空油畫', 'Starry Painting'),
      examine(ctx) {
        if (!ctx.flag('paintingMoved')) {
          ctx.set('paintingMoved');
          ctx.say(L('油畫裡是一片星空，右下角簽著「陸觀」。畫框有點歪——你把它取下來，後面的牆裡嵌著一個保險箱！',
            'The painting shows a starry sky, signed "Lu Guan" in the lower right. The frame hangs a little crooked — you lift it down, and behind it a safe is set into the wall!'), 'event');
          ctx.say(L('畫框背面用鉛筆寫著一行字：「星星會告訴你數字。」', 'On the back of the frame, in pencil: "The stars will tell you the numbers."'));
          ctx.note('painting_back');
        } else ctx.say(L('取下的油畫靠在牆邊。畫框背面寫著：「星星會告訴你數字。」', 'The painting leans against the wall. On the back of the frame: "The stars will tell you the numbers."'));
      },
    },
    {
      id: 's_safe', room: 'study', name: L('保險箱', 'Wall Safe'),
      visible: s => !!s.flags.paintingMoved,
      examine(ctx) {
        if (ctx.flag('safeOpen')) { ctx.say(L('保險箱的門開著，裡面空了。', 'The safe door hangs open. It\'s empty.')); return; }
        ctx.open({ view: 'lock', id: 'safe' });
      },
    },
    {
      id: 's_fireplace', room: 'study', name: L('壁爐', 'Fireplace'),
      examine(ctx) {
        if (ctx.flag('chimneySearched')) { ctx.say(L('壁爐裡只剩冷掉的灰燼。', 'Only cold ashes in the fireplace.')); return; }
        ctx.say(L('爐火早已熄滅。你探頭往煙囪裡看，磚縫間好像卡著什麼東西，可是裡面太黑，什麼也看不清。', 'The fire went out long ago. You peer up the chimney — something seems wedged between the bricks, but it\'s too dark to see.'));
      },
      use: {
        flashlight(ctx) {
          if (ctx.flag('chimneySearched')) { ctx.say(L('煙囪裡只有煤灰。', 'Nothing but soot in the chimney.')); return; }
          ctx.set('chimneySearched');
          ctx.say(L('手電筒的光照進煙囪——磚縫裡夾著一張捲起來的紙。你小心地把它抽了出來。', 'The flashlight beam reaches up the chimney — a rolled-up sheet of paper is wedged between the bricks. You carefully pull it free.'), 'good');
          ctx.give('page2');
        },
        flashlight_dead(ctx) { ctx.say(L('手電筒沒電，按了也不會亮。', 'The flashlight is dead. Pressing the switch does nothing.')); },
      },
    },
    {
      id: 's_waste', room: 'study', name: L('廢紙簍', 'Wastebasket'),
      examine(ctx) {
        if (!ctx.flag('wasteSearched')) {
          ctx.set('wasteSearched');
          ctx.say(L('廢紙簍裡大多是揉皺的草稿。最底下有半張被撕開的便條。', 'The wastebasket is mostly crumpled drafts. At the very bottom is half of a torn note.'));
          ctx.give('note_left');
        } else ctx.say(L('只剩一些揉皺的星表草稿。', 'Only crumpled drafts of star tables.'));
      },
    },
    {
      id: 's_window', room: 'study', name: L('窗戶', 'Window'),
      examine(ctx) { ctx.say(L('窗框被人從外面釘死了。窗外，雨後的星星一顆一顆亮了起來。', 'The window has been nailed shut from outside. Beyond it, after the rain, the stars are coming out one by one.')); },
    },
    {
      id: 's_exit', room: 'study', name: L('回到門廳', 'Back to the Foyer'),
      examine(ctx) { ctx.goto('foyer'); },
    },

    /* ---------------- 溫室 ---------------- */
    {
      id: 'g_tools', room: 'greenhouse', name: L('工具架', 'Tool Rack'),
      examine(ctx) {
        if (!ctx.flag('trowelTaken')) {
          ctx.set('trowelTaken');
          ctx.say(L('工具架上掛著水壺、剪刀和一把小鏟子。你取下了小鏟子。', 'A watering can, shears and a small trowel hang on the tool rack. You take the trowel.'));
          ctx.give('trowel');
        } else ctx.say(L('工具架上掛著水壺和剪刀。', 'A watering can and shears hang on the tool rack.'));
      },
    },
    {
      id: 'g_pots', room: 'greenhouse', name: L('花盆架', 'Pot Shelf'),
      examine(ctx) {
        if (ctx.flag('keyDug')) { ctx.say(L('玫瑰盆的土被翻過了。其餘三盆安安靜靜地立著。', 'The soil in the rose pot has been turned over. The other three pots stand quietly.')); return; }
        ctx.note('pots_rule');
        ctx.open({ view: 'pots' });
      },
    },
    {
      id: 'g_rules', room: 'greenhouse', name: L('園丁守則', 'Gardener\'s Rules'),
      examine(ctx) { ctx.note('garden_rules'); ctx.open({ view: 'doc', id: 'garden_rules' }); },
    },
    {
      id: 'g_valves', room: 'greenhouse', name: L('灌溉系統', 'Irrigation System'),
      examine(ctx) {
        if (ctx.flag('waterOk')) { ctx.say(L('雨水桶和肥料桶靜靜地立著。月光花、蕨類都喝足了水，仙人掌的土依然乾燥。', 'The rainwater and fertilizer tanks stand quiet. The moonflower and the ferns have drunk their fill; the cactus bed is still dry.')); return; }
        ctx.note('garden_rules');
        ctx.open({ view: 'valves' });
      },
      use: {
        valve_wheel(ctx) {
          ctx.take('valve_wheel');
          ctx.set('wheelInstalled');
          ctx.say(L('你把黃銅手輪套上總閘的閥桿，轉了轉，很順手。', 'You fit the brass handwheel onto the main valve\'s stem and give it a turn. It turns smoothly.'), 'good');
        },
      },
    },
    {
      id: 'g_mirrors', room: 'greenhouse', name: L('天窗反光鏡', 'Skylight Mirrors'),
      examine(ctx) {
        if (ctx.flag('lightOk')) { ctx.say(L('月光經過一面面反光鏡，穩穩地落在月光花上。', 'Moonlight passes from mirror to mirror and falls squarely on the moonflower.')); return; }
        ctx.open({ view: 'mirrors' });
      },
    },
    {
      id: 'g_moonflower', room: 'greenhouse', name: L('月光花', 'Moonflower'),
      examine(ctx) {
        const water = ctx.flag('waterOk'), light = ctx.flag('lightOk');
        if (ctx.flag('moonTaken')) { ctx.say(L('月光花在月光下靜靜開著，潔白如雪。', 'The moonflower blooms quietly in the moonlight, white as snow.')); return; }
        if (water && light) {
          ctx.set('moonTaken');
          ctx.say(L('喝足了雨水、沐浴在月光裡，月光花一瓣一瓣地綻開——花心裡躺著一枚銀白色的徽章。', 'With rainwater to drink and moonlight to bathe in, the moonflower opens petal by petal — and in its heart lies a silvery emblem.'), 'event');
          ctx.give('emblem_moon');
          return;
        }
        const zh = [], en = [];
        if (!water) { zh.push('土壤乾裂，它渴了'); en.push('its soil is cracked and dry'); }
        if (!light) { zh.push('月光照不到這個角落'); en.push('no moonlight reaches this corner'); }
        ctx.say(L(`一株含苞的月光花，花苞緊緊閉著，裡面好像包著什麼發亮的東西。（${zh.join('；')}。）`,
          `A moonflower in bud, its petals tightly closed around something that glints. (${cap(en.join('; '))}.)`));
      },
    },
    {
      id: 'g_bench', room: 'greenhouse', name: L('工作台', 'Workbench'),
      examine(ctx) {
        if (ctx.flag('trapdoorFound')) { ctx.say(L('工作台底下的地板上，露出一扇活板門。', 'A trapdoor is set into the floor beneath the workbench.')); return; }
        ctx.say(L('工作台上散落著種子袋和麻繩。台面底下黑漆漆的，什麼也看不見。', 'Seed packets and twine are scattered across the workbench. Underneath it, it\'s pitch black.'));
      },
      use: {
        flashlight(ctx) {
          if (ctx.flag('trapdoorFound')) { ctx.say(L('活板門就在那裡。', 'The trapdoor is right there.')); return; }
          ctx.set('trapdoorFound');
          ctx.say(L('你趴下來用手電筒往工作台底下照——地板上有一扇方形的活板門，門上掛著四位數字鎖。', 'You get down on the floor and shine the flashlight under the workbench — there\'s a square trapdoor in the floor, fastened with a four-digit lock.'), 'event');
        },
        flashlight_dead(ctx) { ctx.say(DEAD_LIGHT); },
      },
    },
    {
      id: 'g_trapdoor', room: 'greenhouse', name: L('活板門', 'Trapdoor'),
      visible: s => !!s.flags.trapdoorFound,
      examine(ctx) {
        if (ctx.flag('trapdoorOpen')) { ctx.goto('darkroom'); return; }
        ctx.open({ view: 'lock', id: 'trapdoor' });
      },
    },
    {
      id: 'g_exit', room: 'greenhouse', name: L('回到門廳', 'Back to the Foyer'),
      examine(ctx) { ctx.goto('foyer'); },
    },

    /* ---------------- 天文台 ---------------- */
    {
      id: 'o_telescope', room: 'observatory', name: L('望遠鏡', 'Telescope'),
      examine(ctx) {
        ctx.note('telescope_note');
        if (!ctx.flag('eyepieceInstalled')) {
          ctx.say(L('黃銅鏡筒上貼著一張便條：「這支折射鏡看到的像是倒過來的——上下顛倒，左右也相反。」可是目鏡座是空的。',
            'A note is taped to the brass tube: "This refractor shows everything inverted — upside down, and left and right swapped too." But the eyepiece holder is empty.'));
          ctx.say(L('一旁的目鏡盒也是空的，盒蓋內側寫著：「目鏡又滾到地圖櫃底下去了。那裡太暗，下次記得帶燈。」',
            'The eyepiece box beside it is empty too. Written inside the lid: "The eyepiece has rolled under the map cabinet again. It\'s too dark under there — bring a light next time."'));
          ctx.note('eyepiece_box');
          return;
        }
        ctx.open({ view: 'eyepiece' });
      },
      use: {
        eyepiece(ctx) {
          ctx.take('eyepiece');
          ctx.set('eyepieceInstalled');
          ctx.say(L('你把目鏡旋進目鏡座。現在可以看望遠鏡了。', 'You screw the eyepiece into its holder. Now you can look through the telescope.'), 'good');
        },
      },
    },
    {
      id: 'o_dome', room: 'observatory', name: L('穹頂轉輪', 'Dome Wheel'),
      examine(ctx) { ctx.open({ view: 'dome' }); },
    },
    {
      id: 'o_dial', room: 'observatory', name: L('星盤', 'Star Dial'),
      examine(ctx) {
        ctx.note('dial_inscription');
        if (ctx.flag('starDialSolved')) { ctx.say(L('星盤的中心敞開著，裡面空了。', 'The center of the star dial stands open. It\'s empty.')); return; }
        ctx.open({ view: 'dial' });
      },
    },
    {
      id: 'o_poster', room: 'observatory', name: L('星座圖', 'Constellation Chart'),
      examine(ctx) { ctx.note('poster'); ctx.open({ view: 'poster' }); },
    },
    {
      id: 'o_almanac', room: 'observatory', name: L('月落時刻表', 'Moonset Table'),
      examine(ctx) { ctx.note('almanac'); ctx.open({ view: 'doc', id: 'almanac' }); },
    },
    {
      id: 'o_log', room: 'observatory', name: L('觀測日誌', 'Observation Log'),
      examine(ctx) {
        ctx.note('obs_log');
        if (!ctx.flag('logBookmark')) {
          ctx.set('logBookmark');
          ctx.say(L('你翻開觀測日誌，一張撕開的半張便條從書頁間滑了出來。', 'You open the observation log, and half of a torn note slides out from between the pages.'));
          ctx.give('note_right');
        }
        ctx.open({ view: 'doc', id: 'obs_log' });
      },
    },
    {
      id: 'o_lamp', room: 'observatory', name: L('紅光檯燈', 'Red Desk Lamp'),
      examine(ctx) {
        if (!ctx.flag('bulbTaken')) {
          ctx.set('bulbTaken');
          ctx.say(L('觀測桌上的檯燈裝著紅色燈泡，發出微弱的紅光。你把燈泡轉了下來，房間又暗了一些。', 'The lamp on the observing desk has a red bulb that gives off a faint red glow. You unscrew the bulb; the room grows a little darker.'));
          ctx.give('red_bulb');
        } else ctx.say(L('檯燈的燈座空著。', 'The lamp\'s socket is empty.'));
      },
    },
    {
      id: 'o_cabinet', room: 'observatory', name: L('地圖櫃', 'Map Cabinet'),
      examine(ctx) {
        if (!ctx.flag('transparencyTaken')) {
          ctx.set('transparencyTaken');
          ctx.say(L('地圖櫃的淺抽屜裡收著一疊星圖。最上面是一張透明膠片。', 'The shallow drawers of the map cabinet hold a stack of star charts. On top lies a sheet of clear film.'));
          ctx.give('transparency');
        } else ctx.say(L('抽屜裡是一疊疊手繪星圖。', 'The drawers are full of hand-drawn star charts.'));
      },
    },
    {
      id: 'o_under', room: 'observatory', name: L('地圖櫃底下', 'Under the Map Cabinet'),
      examine(ctx) {
        if (ctx.flag('eyepieceFound')) { ctx.say(L('櫃子底下只剩灰塵。', 'Nothing under the cabinet but dust.')); return; }
        ctx.say(L('地圖櫃和地板之間有一道窄縫，裡面黑漆漆的，好像有什麼東西閃了一下。', 'There\'s a narrow gap between the map cabinet and the floor. It\'s pitch black in there — something seems to glint.'));
      },
      use: {
        flashlight(ctx) {
          if (ctx.flag('eyepieceFound')) { ctx.say(L('櫃子底下只剩灰塵。', 'Nothing under the cabinet but dust.')); return; }
          ctx.set('eyepieceFound');
          ctx.say(L('手電筒一照，縫裡躺著一枚黃銅框的目鏡。你伸手把它撈了出來。', 'In the flashlight beam, a brass-rimmed eyepiece lies in the gap. You reach in and fish it out.'), 'good');
          ctx.give('eyepiece');
        },
        flashlight_dead(ctx) { ctx.say(DEAD_LIGHT); },
      },
    },
    {
      id: 'o_exit', room: 'observatory', name: L('下樓回門廳', 'Downstairs to the Foyer'),
      examine(ctx) { ctx.goto('foyer'); },
    },

    /* ---------------- 暗房 ---------------- */
    {
      id: 'd_socket', room: 'darkroom', name: L('牆上的燈座', 'Lamp Socket'),
      examine(ctx) {
        if (ctx.flag('darkroomLit')) { ctx.say(L('紅色安全燈靜靜亮著。', 'The red safelight glows steadily.')); return; }
        ctx.say(L('你在牆上摸到一個燈座，裡面沒有燈泡。', 'You feel a lamp socket on the wall. There\'s no bulb in it.'));
      },
      use: {
        red_bulb(ctx) {
          ctx.take('red_bulb');
          ctx.set('darkroomLit');
          ctx.say(L('你把紅色燈泡旋進燈座。暗紅色的光亮起來，暗房的輪廓一點一點浮現。', 'You screw the red bulb into the socket. A deep red glow comes up, and the darkroom slowly takes shape.'), 'event');
        },
      },
    },
    {
      id: 'd_ladder', room: 'darkroom', name: L('梯子（回溫室）', 'Ladder (to the Greenhouse)'),
      examine(ctx) { ctx.goto('greenhouse'); },
    },
    {
      id: 'd_shelf', room: 'darkroom', name: L('藥瓶架', 'Bottle Shelf'),
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) { ctx.note('bottle_card'); ctx.open({ view: 'doc', id: 'bottle_card' }); },
    },
    {
      id: 'd_tray', room: 'darkroom', name: L('顯影台', 'Developing Bench'),
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) {
        if (ctx.flag('plateDeveloped')) { ctx.say(L('顯影盤裡的藥水已經倒掉了。避光盒空著。', 'The developing trays have been emptied. The light-tight box is empty.')); return; }
        ctx.open({ view: 'develop' });
      },
    },
    {
      id: 'd_line', room: 'darkroom', name: L('晾片繩', 'Drying Line'),
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) {
        if (!ctx.flag('p4Taken')) {
          ctx.set('p4Taken');
          ctx.say(L('晾片繩上夾著幾張空白相紙，還有一頁從日記上撕下來的紙。', 'A few blank sheets of photo paper are pegged to the drying line — along with a page torn from a diary.'));
          ctx.give('page4');
        } else ctx.say(L('晾片繩上夾著幾張空白相紙。', 'A few blank sheets of photo paper are pegged to the drying line.'));
      },
    },
    {
      id: 'd_vent', room: 'darkroom', name: L('氣窗', 'Vent'),
      visible: s => !!s.flags.darkroomLit,
      examine(ctx) { ctx.say(L('牆角高處有一扇小氣窗，被黑布遮著，可是黑布有一角翹了起來。這盞紅燈，從外面看得見嗎？', 'High in the corner is a small vent covered with black cloth, but one corner of the cloth has curled up. Could this red light be seen from outside?')); },
    },
  ];
  const hotspotById = {};
  for (const h of hotspots) hotspotById[h.id] = h;

  /* ================================================================
   * 六、線索組合（物品欄中兩兩組合）
   * ================================================================ */
  const isPagey = id => PAGES.includes(id) || id === 'diary';
  const recipes = [
    {
      pair: ['flashlight_dead', 'battery'],
      run(ctx) {
        ctx.take('flashlight_dead'); ctx.take('battery');
        ctx.say(L('你把電池塞進手電筒，按下開關——一道白光射了出去。', 'You slot the batteries into the flashlight and press the switch — a beam of white light shoots out.'), 'good');
        ctx.give('flashlight');
      },
    },
    {
      pair: ['grid_paper', 'transparency'],
      run(ctx) {
        ctx.take('grid_paper'); ctx.take('transparency');
        ctx.say(L('你把透明膠片疊在方格紙上，讓四個角的十字一一對齊。三個圈起來的星星，正好落在三個數字上。', 'You lay the clear film over the grid paper and line up the crosses in all four corners. The three circled stars land exactly on three digits.'), 'good');
        ctx.give('overlay');
      },
    },
    {
      pair: ['note_left', 'note_right'],
      run(ctx) {
        ctx.take('note_left'); ctx.take('note_right');
        ctx.say(L('撕口的鋸齒完全吻合。兩半便條拼在一起，字句終於連貫了。', 'The jagged edges match perfectly. Pieced together, the note finally reads as a whole.'), 'good');
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
        ctx.say(L(`你按日期把殘頁裝訂在一起。日記現在有 ${list.length} / 4 頁。`, `You bind the pages together in date order. The diary now has ${list.length} / 4 pages.`), 'good');
      },
    },
  ];

  /* ================================================================
   * 七、謎題的判定（UI 只負責輸入，對錯一律在這裡判定）
   * ================================================================ */
  const inRoom = room => s => s.room === room;
  const LOCK_STUCK = L('鎖紋絲不動。', 'The lock doesn\'t budge.');
  const lockPuzzle = (opts) => ({
    available: opts.available,
    check(ctx, answer) {
      const code = String(answer == null ? '' : answer).replace(/\D/g, '');
      if (code === opts.code) { opts.success(ctx); return true; }
      ctx.wrong();
      ctx.say(opts.wrongText ? opts.wrongText(code) : LOCK_STUCK, 'bad');
      return false;
    },
  });

  const puzzles = {
    drawer: Object.assign(lockPuzzle({
      code: DRAWER_CODE,
      available: s => inRoom('study')(s) && !s.flags.drawerOpen,
      success(ctx) {
        ctx.set('drawerOpen');
        ctx.say(L('「喀」——抽屜彈開了。', 'Click — the drawer springs open.'), 'good');
        ctx.say(L('裡面有一把葉子形狀的鑰匙、一捆電池，還有一頁撕下來的日記。', 'Inside are a leaf-shaped key, a bundle of batteries, and a page torn from a diary.'));
        ctx.give('greenhouse_key'); ctx.give('battery'); ctx.give('page1');
      },
      wrongText: code => code === DRAWER_TRAP
        ? L('鎖紋絲不動。你數的好像是書在架上的位置——便條問的是「第幾卷」。', 'The lock doesn\'t budge. It looks like you counted the books\' positions on the shelf — the note asks which volume each one is.')
        : LOCK_STUCK,
    }), {
      digits: 4, title: L('書桌抽屜', 'Desk Drawer'),
      prompt: L('四位數字鎖。鎖旁的便條寫著：「紅、黃、藍、綠——照這個順序，它們各是第幾卷？」', 'A four-digit lock. The note beside it reads: "Red, yellow, blue, green — in that order: which volume is each one?"'),
    }),

    safe: Object.assign(lockPuzzle({
      code: SAFE_CODE,
      available: s => inRoom('study')(s) && s.flags.paintingMoved && !s.flags.safeOpen,
      success(ctx) {
        ctx.set('safeOpen');
        ctx.say(L('轉盤咬合，保險箱的門應聲而開。天鵝絨墊子上放著一枚太陽徽章。', 'The dial catches and the safe door swings open. On a velvet cushion lies a sun emblem.'), 'good');
        ctx.give('emblem_sun');
      },
    }), {
      digits: 3, title: L('保險箱', 'Wall Safe'),
      prompt: L('嵌在牆裡的保險箱，三位數字轉盤。畫框背面寫著：「星星會告訴你數字。」', 'A safe set into the wall, with a three-digit dial. On the back of the painting\'s frame: "The stars will tell you the numbers."'),
    }),

    trapdoor: Object.assign(lockPuzzle({
      code: TRAPDOOR_CODE,
      available: s => inRoom('greenhouse')(s) && s.flags.trapdoorFound && !s.flags.trapdoorOpen,
      success(ctx) {
        ctx.set('trapdoorOpen');
        ctx.say(L('數字鎖彈開了。你掀起活板門，一道窄梯通往漆黑的地下。', 'The combination lock springs open. You lift the trapdoor; a narrow ladder leads down into darkness.'), 'good');
      },
    }), {
      digits: 4, title: L('活板門', 'Trapdoor'),
      prompt: L('活板門上的四位數字鎖。鎖旁刻著一顆拖著尾巴的彗星。', 'A four-digit lock on the trapdoor. A comet with a tail is engraved beside it.'),
    }),

    pots: {
      available: s => inRoom('greenhouse')(s) && !s.flags.keyDug,
      check(ctx, potId) {
        const pot = POTS.find(p => p.id === potId);
        if (!pot) return null;
        if (!ctx.has('trowel')) { ctx.say(L('花盆裡的土壓得很實，徒手挖不動。得找把工具。', 'The soil in the pots is packed hard — you can\'t dig it with your bare hands. You need a tool.'), 'bad'); return false; }
        if (potId === POT_ANSWER) {
          ctx.set('keyDug');
          ctx.say(L(`你用小鏟子挖開${pot.name.zh}盆的土，鏟尖「叮」地碰到了金屬——一把黃銅鑰匙。`, `You dig into the ${pot.name.en} pot with the trowel, and the blade clinks against metal — a brass key.`), 'good');
          ctx.give('brass_key');
          return true;
        }
        ctx.wrong();
        ctx.say(L(`你挖開${pot.name.zh}盆的土，裡面除了根和泥什麼也沒有。你把土填了回去。`, `You dig through the ${pot.name.en} pot. Nothing but roots and soil. You put the soil back.`), 'bad');
        return false;
      },
    },

    clock: {
      available: s => inRoom('foyer')(s) && !s.flags.clockSolved,
      check(ctx, ans) {
        const h = Number(ans && ans.h), m = Number(ans && ans.m);
        if (h === CLOCK_ANSWER.h && m === CLOCK_ANSWER.m) {
          ctx.set('clockSolved');
          ctx.say(L('指針停在三點十五分的那一刻，鐘裡傳來「噹」的一聲，鐘擺箱的小門彈開了。', 'The hands come to rest at a quarter past three. A chime rings inside the clock, and the pendulum case door pops open.'), 'good');
          ctx.say(L('裡面放著一個黃銅手輪，還有一頁折起來的日記。', 'Inside are a brass handwheel and a folded diary page.'));
          ctx.give('valve_wheel'); ctx.give('page3');
          return true;
        }
        ctx.wrong();
        ctx.say(L('你撥好指針，等了一會兒。落地鐘毫無反應。', 'You set the hands and wait. The grandfather clock does nothing.'), 'bad');
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
        if (!ctx.flag('wheelInstalled')) { ctx.say(L('總閘上只剩一根光禿禿的閥桿——手輪不見了，轉不動。', 'Only a bare stem is left on the main valve — the handwheel is missing, and it won\'t turn.'), 'bad'); return false; }
        const clean = {};
        for (const v of VALVES) clean[v.id] = !!(cfg && cfg[v.id]);
        ctx.s.puz.valves = clean;
        const r = evalValves(clean);
        if (r.ok) {
          ctx.set('waterOk');
          ctx.say(L('你轉開總閘，水管裡響起汩汩的水聲。雨水流進月光花和蕨類的花床，肥料水只流向蕨類，仙人掌那一格滴水未沾。', 'You open the main valve and water gurgles through the pipes. Rainwater flows into the moonflower and fern beds, fertilizer water only to the ferns, and the cactus bed stays dry.'), 'good');
          if (ctx.flag('lightOk')) ctx.say(L('月光花的花苞輕輕顫動了一下。', 'The moonflower bud trembles slightly.'), 'event');
          return true;
        }
        ctx.wrong();
        ctx.say(L('你轉開總閘——', 'You open the main valve —'), 'bad');
        for (const p of r.problems) ctx.say(p, 'bad');
        ctx.say(L('你趕緊關上總閘。幸好沒造成損害。', 'You quickly shut the main valve. Luckily, no harm done.'), 'bad');
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
          ctx.say(L('月光在鏡面間折了幾折，終於落在月光花上。花苞微微發亮。', 'The moonlight bends from mirror to mirror and finally falls on the moonflower. The bud glows faintly.'), 'good');
          if (ctx.flag('waterOk')) ctx.say(L('月光花的花苞輕輕顫動了一下。', 'The moonflower bud trembles slightly.'), 'event');
          return true;
        }
        return false;
      },
    },

    dome: {
      available: inRoom('observatory'),
      silent: true,
      check(ctx, dir) {
        const d = DIRECTIONS.find(x => x.id === dir);
        if (!d) return null;
        ctx.s.puz.dome = dir;
        ctx.say(L(`你轉動轉輪，穹頂隆隆作響，觀測窗轉向了${d.name.zh}方。`, `You turn the wheel. The dome rumbles round until the slit faces ${d.name.en}.`));
        return true;
      },
    },

    dial: {
      available: s => inRoom('observatory')(s) && !s.flags.starDialSolved,
      check(ctx, ans) {
        const pick = Array.isArray(ans) ? ans.slice(0, 3) : [];
        if (pick.join() === DIAL_ANSWER.join()) {
          ctx.set('starDialSolved');
          ctx.say(L('三個環同時「喀」地卡進定位，星盤中心像花瓣一樣向外翻開——裡面是一枚深藍色的星徽。', 'All three rings click into place at once, and the center of the dial opens like petals — inside is a deep-blue star emblem.'), 'good');
          ctx.give('emblem_star');
          return true;
        }
        ctx.wrong();
        const sameSet = pick.length === 3 && pick.slice().sort().join() === DIAL_ANSWER.slice().sort().join();
        ctx.say(sameSet
          ? L('星盤卡了一下，又鬆開了。這三個星座似乎沒錯，但順序不對。', 'The dial catches for a moment, then slips. The three constellations seem right, but the order is wrong.')
          : L('星盤紋絲不動。', 'The dial doesn\'t budge.'), 'bad');
        return false;
      },
    },

    develop: {
      available: s => inRoom('darkroom')(s) && s.flags.darkroomLit && !s.flags.plateDeveloped,
      check(ctx, seq) {
        const pick = Array.isArray(seq) ? seq.slice(0, 4) : [];
        if (pick.join() === DEVELOP_ANSWER.join()) {
          ctx.set('plateDeveloped');
          ctx.say(L('你先用一張廢片試了一次——影像清清楚楚地浮現出來。順序對了。', 'First you try a scrap of film — the image comes up crisp and clear. The order is right.'), 'good');
          ctx.say(L('你打開避光盒，取出那張封存了二十年的玻璃底片，依序浸過四個藥盤。紅光下，群星一顆顆浮現，星群之間，是一顆拖著短尾的彗星。', 'You open the light-tight box, take out the glass plate sealed away for twenty years, and pass it through the four trays in turn. Under the red light the stars appear one by one — and among them, a comet with a short tail.'), 'event');
          ctx.give('plate');
          return true;
        }
        ctx.wrong();
        ctx.say(L('你先拿一張廢片試了試——片子上一片模糊。順序不對。幸好沒有直接用那張底片。', 'You try it on a scrap of film first — the result is a blur. Wrong order. Good thing you didn\'t use the real plate.'), 'bad');
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
          ctx.say(L('「……你會後悔的。」電話被狠狠地掛斷了。過了一會兒，門外傳來汽車發動、駛遠的聲音。', '"…You\'ll regret this." The line goes dead with a slam. A moment later, a car engine starts outside the door and fades away.'), 'event');
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
      title: L('陸觀彗星', 'Comet Lu Guan'), rank: L('真結局', 'True Ending'),
      text: L([
        '你把底片和那本拼完整的日記一起帶出了大門。',
        '三個月後，天文學會公布了調查結果：底片上彗星與群星的相對位置，精確對應 1999 年 12 月 8 日的夜空——比韓嶽宣稱的發現早了整整兩天；而韓嶽當年發表的坐標裡，那個抄錯後又被照抄的「7」，只可能來自陸觀的原始紀錄。',
        '那顆彗星被正式更名為「陸觀彗星」。',
        '公布的那天晚上，你回到老宅，在天文台架起望遠鏡，把穹頂轉向東南。目鏡裡的星空是倒過來的。你笑了——這一次，你知道該怎麼看。',
      ], [
        'You carry the plate and the completed diary out through the front door together.',
        'Three months later, the Astronomical Society publishes its findings: the comet\'s position against the stars on the plate matches the sky of 8 December 1999 exactly — two full days before Han Yue\'s claimed discovery. And the miscopied "7" in the coordinates Han Yue published could only have come from Lu Guan\'s original records.',
        'The comet is officially renamed Comet Lu Guan.',
        'On the night of the announcement, you return to the old house, set up the telescope in the observatory and turn the dome to the southeast. The sky in the eyepiece is upside down. You smile — this time, you know how to read it.',
      ]),
    },
    A: {
      title: L('破曉', 'Daybreak'), rank: L('普通結局', 'Normal Ending'),
      text: L([
        '三枚徽章各歸其位，門內傳來一連串齒輪咬合的聲音。大門緩緩向外打開，山間的晨霧湧了進來。',
        '你回頭望了一眼。書房、溫室、天文台——你走遍了它們，卻沒有帶走那個「光照不到的地方」裡的東西。',
        '許多年後，教科書上那顆彗星依然叫做「韓嶽彗星」。偶爾在失眠的夜裡，你會想起信上那句話，想知道那裡究竟藏著什麼。',
        '你始終沒有回去。',
      ], [
        'The three emblems settle into place, and a chain of gears engages inside the door. The great door swings slowly outward, and the morning mist of the mountains drifts in.',
        'You look back once. The study, the greenhouse, the observatory — you walked through them all, yet you left behind whatever lay "where the light cannot reach".',
        'Years later, the textbooks still call that comet Comet Han Yue. On sleepless nights you sometimes remember that line in the letter and wonder what was hidden there.',
        'You never went back.',
      ]),
    },
    C: {
      title: L('孤證', 'A Single Witness'), rank: L('未竟結局', 'Unfinished Ending'),
      text: L([
        '你把底片交給了天文學會。底片上的彗星清清楚楚，可韓嶽的律師一口咬定：一張來歷不明的舊底片，誰能證明它不是事後偽造的？',
        '你說不出更多細節。陸觀的日記你只找到了一部分，缺掉的那幾頁裡，也許正寫著讓這張底片無可辯駁的關鍵。',
        '爭論拖了兩年，最後不了了之。',
        '（屋子裡還有你沒找到的日記殘頁。）',
      ], [
        'You hand the plate to the Astronomical Society. The comet on it is perfectly clear — but Han Yue\'s lawyers insist: an old plate of unknown origin — who can prove it wasn\'t forged after the fact?',
        'You can\'t offer more details. You found only part of Lu Guan\'s diary, and the missing pages may hold exactly what would have made the plate undeniable.',
        'The dispute drags on for two years and quietly fizzles out.',
        '(There are diary pages in the house you never found.)',
      ]),
    },
    E: {
      title: L('沉睡的星', 'The Sleeping Star'), rank: L('抉擇結局', 'Choice Ending'),
      text: L([
        '你站在敞開的大門前，看了很久手裡的底片。',
        '最後，你走回暗房，把它放回避光盒，鎖上活板門，獨自走出了大門。',
        '真相還在那裡，只是從今以後，由你來守護。也許有一天你會回來帶走它，也許永遠不會。',
        '陸觀說過：由你決定。',
      ], [
        'You stand at the open door and look at the plate in your hands for a long time.',
        'In the end, you walk back to the darkroom, return it to the light-tight box, lock the trapdoor, and step out through the door alone.',
        'The truth is still there — only now, it is yours to keep. Perhaps one day you\'ll come back for it. Perhaps you never will.',
        'Lu Guan said the choice was yours.',
      ]),
    },
    D: {
      title: L('交易', 'The Deal'), rank: L('壞結局', 'Bad Ending'),
      text: L([
        '你把底片塞出了信件口。',
        '門外傳來一聲輕笑，接著是打火機「喀嚓」一響。幾分鐘後，門從外面被打開了。韓嶽把一張支票塞進你手裡；在他身後的石階上，一小團灰燼正被夜風吹散。',
        '你得到了想要的一切。',
        '只是從那以後，你再也沒有抬頭看過星空。',
      ], [
        'You push the plate out through the mail slot.',
        'A soft laugh outside, then the click of a lighter. A few minutes later, the door is opened from outside. Han Yue presses a check into your hand; on the stone steps behind him, a small heap of ash scatters in the night wind.',
        'You got everything you wanted.',
        'You just never looked up at the stars again.',
      ]),
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
    return L(`${back.join('、')} 設成「\\」，${fwd.join('、')} 設成「/」。光線依序經過 ${order.join('→')}，從右側照進月光花。`,
      `Set ${back.join(', ')} to "\\" and ${fwd.join(', ')} to "/". The beam then passes ${order.join(' → ')} and enters the moonflower from the right.`);
  }
  const F = (s, k) => !!s.flags[k];
  const has = (s, id) => s.inv.includes(id);
  const seen = (s, note) => s.notes.includes(note);
  const roomOpen = (s, r) => rooms[r].accessible(s);

  // 「還沒仔細看過的地方」：依常見的探索順序，列出玩家可以到達、卻還沒調查過的重要物件。
  // 提示的標題與內容只會提到玩家已經能看見的東西，不會預告還沒發現的機關或獎勵。
  const DISCOVERIES = [
    { hs: 'f_coat', done: s => F(s, 'coatSearched') },
    { hs: 's_shelf', done: s => seen(s, 'bookshelf') },
    { hs: 's_drawer', done: s => seen(s, 'drawer_note') || F(s, 'drawerOpen') },
    { hs: 's_clipping', done: s => seen(s, 'clipping') },
    { hs: 's_desk', done: s => F(s, 'gridTaken') },
    { hs: 's_painting', done: s => F(s, 'paintingMoved') },
    { hs: 's_waste', done: s => F(s, 'wasteSearched') },
    { hs: 'f_clock', done: s => seen(s, 'clock_inscription') || F(s, 'clockSolved') },
    { hs: 'g_tools', done: s => F(s, 'trowelTaken') },
    { hs: 'g_pots', done: s => seen(s, 'pots_rule') || F(s, 'keyDug') },
    { hs: 'g_valves', done: s => seen(s, 'garden_rules') },
    { hs: 'o_telescope', done: s => seen(s, 'telescope_note') },
    { hs: 'o_dial', done: s => seen(s, 'dial_inscription') },
    { hs: 'o_poster', done: s => seen(s, 'poster') },
    { hs: 'o_log', done: s => F(s, 'logBookmark') },
    { hs: 'o_almanac', done: s => seen(s, 'almanac') },
    { hs: 'o_cabinet', done: s => F(s, 'transparencyTaken') },
    { hs: 'o_lamp', done: s => F(s, 'bulbTaken') },
    { hs: 'd_shelf', done: s => !F(s, 'darkroomLit') || seen(s, 'bottle_card') },
    { hs: 'd_line', done: s => !F(s, 'darkroomLit') || F(s, 'p4Taken') },
  ].map(d => Object.assign(d, { room: hotspotById[d.hs].room, name: hotspotById[d.hs].name }));
  const nextDiscovery = s => DISCOVERIES.find(d => roomOpen(s, d.room) && !d.done(s));
  const ALL_SEEN = L('你已經把能到的地方都看過了。', 'You\'ve already looked at everything you can reach.');

  const hints = [
    {
      id: 'explore', title: L('還沒仔細看過的地方', 'Places You Haven\'t Examined'),
      avail: s => !!nextDiscovery(s), done: s => !nextDiscovery(s),
      texts: [
        L('有些已經能到達的地方，你還沒仔細看過。每個房間裡的物件都點點看，讀過的文件會記進線索筆記。', 'There are places you can already reach that you haven\'t looked at closely. Try every object in each room; anything you read goes into your notebook.'),
        s => { const d = nextDiscovery(s); return d ? L(`去${rooms[d.room].name.zh}再看看。`, `Take another look around the ${rooms[d.room].name.en.toLowerCase()}.`) : ALL_SEEN; },
        s => { const d = nextDiscovery(s); return d ? L(`${rooms[d.room].name.zh}的「${d.name.zh}」。`, `The ${d.name.en} in the ${rooms[d.room].name.en.toLowerCase()}.`) : ALL_SEEN; },
      ],
    },
    {
      id: 'drawer', title: L('書桌抽屜的鎖', 'The Desk Drawer Lock'),
      avail: s => seen(s, 'drawer_note'), done: s => F(s, 'drawerOpen'),
      texts: [
        L('鎖旁的便條提到四種顏色，還問「第幾卷」。屋裡哪裡有分卷的東西？', 'The note by the lock names four colors and asks "which volume". What in this house comes in volumes?'),
        L('仔細看書房的書架：書脊下方印著卷數。書並不是按卷數排的——問的是卷數，不是位置。', 'Look closely at the study\'s bookshelf: each spine has its volume number near the bottom. The books are not shelved in order — the note wants volume numbers, not positions.'),
        L(`紅＝第 3 卷、黃＝第 7 卷、藍＝第 5 卷、綠＝第 1 卷。密碼是 ${DRAWER_CODE}。`, `Red = Vol. 3, yellow = Vol. 7, blue = Vol. 5, green = Vol. 1. The code is ${DRAWER_CODE}.`),
      ],
    },
    {
      id: 'flashlight', title: L('沒電的手電筒', 'The Dead Flashlight'),
      avail: s => has(s, 'flashlight_dead'), done: s => has(s, 'flashlight'),
      texts: [
        L('屋裡有好幾個太暗、看不清的角落。這支手電筒需要電。', 'Several corners of this house are too dark to see into. This flashlight needs power.'),
        L('書桌抽屜裡有一捆電池。', 'There\'s a bundle of batteries in the desk drawer.'),
        L('在物品欄選中手電筒，按「組合…」，再點電池。', 'Select the flashlight in your inventory, press "Combine…", then click the batteries.'),
      ],
    },
    {
      id: 'greenhouse', title: L('打開溫室', 'Opening the Greenhouse'),
      avail: s => has(s, 'greenhouse_key'), done: s => F(s, 'greenhouseOpen'),
      texts: [
        L('抽屜裡那把鑰匙的握柄是葉子形狀。', 'The key from the drawer has a leaf-shaped bow.'),
        L('門廳右邊溫室門的鑰匙孔旁，也刻著一片葉子。', 'A leaf is carved beside the keyhole of the greenhouse door, on the right side of the foyer.'),
        L('在物品欄選中溫室鑰匙，再點門廳的「溫室門」。', 'Select the greenhouse key, then click the Greenhouse Door in the foyer.'),
      ],
    },
    {
      id: 'pots', title: L('四個花盆', 'The Four Pots'),
      avail: s => seen(s, 'pots_rule'), done: s => F(s, 'keyDug'),
      texts: [
        L('木牌說：四句話裡只有一句是真的。挖土需要工具——看看溫室的工具架。', 'The sign says only one of the four sentences is true. You\'ll need a tool to dig — check the greenhouse tool rack.'),
        L('逐一假設東西埋在每個盆裡，數數看那時有幾句話成立。只有一種假設恰好讓一句話成立。', 'Suppose the item is buried in each pot in turn, and count how many sentences would be true. Only one supposition makes exactly one sentence true.'),
        L('答案是玫瑰盆：東西在玫瑰盆時，只有薰衣草盆那句「鑰匙不在我這裡」是真的。', 'It\'s the rose pot: if the key is there, only the lavender pot\'s "The key is not in me" is true.'),
      ],
    },
    {
      id: 'gate', title: L('樓梯鐵門', 'The Stair Gate'),
      avail: s => has(s, 'brass_key'), done: s => F(s, 'gateOpen'),
      texts: [
        L('黃銅鑰匙的匙柄刻著樓梯。', 'A staircase is engraved on the brass key\'s bow.'),
        L('門廳的樓梯鐵門掛著一把黃銅掛鎖。', 'The stair gate in the foyer has a brass padlock.'),
        L('選中黃銅鑰匙，再點門廳的「樓梯鐵門」。', 'Select the brass key, then click the Stair Gate in the foyer.'),
      ],
    },
    {
      id: 'eyepiece', title: L('望遠鏡的目鏡', 'The Telescope Eyepiece'),
      avail: s => seen(s, 'eyepiece_box'), done: s => F(s, 'eyepieceInstalled'),
      texts: [
        L('目鏡盒蓋內側寫著目鏡滾到哪裡去了。', 'The inside of the eyepiece box lid says where the eyepiece rolled.'),
        L('地圖櫃底下太暗，需要一支能亮的手電筒。', 'It\'s too dark under the map cabinet — you need a working flashlight.'),
        L('對「地圖櫃底下」使用能亮的手電筒拿到目鏡，再對望遠鏡使用目鏡。', 'Use the working flashlight on "Under the Map Cabinet" to get the eyepiece, then use the eyepiece on the telescope.'),
      ],
    },
    {
      id: 'dial', title: L('星盤', 'The Star Dial'),
      avail: s => seen(s, 'dial_inscription'), done: s => F(s, 'starDialSolved'),
      texts: [
        L('星盤要你對準「彗星初次現身的方位」上的三個星座。哪些文件提到過彗星出現在哪個方向？', 'The dial wants the three constellations in the direction where the comet first appeared. Which documents mention the direction the comet appeared in?'),
        L('日記殘頁（一）和書房的剪報都寫著「東南方」。用穹頂轉輪把觀測窗轉向東南，再看望遠鏡。目鏡裡的山稜和樹影掛在上方——成像上下顛倒，最靠近地平線的星座才是最低的。三環按天空中的高低對應，不是按離視野中心的遠近。星座圖上註明了每個星座的星數。',
          'Diary Page I and the clipping in the study both say "southeast". Turn the dome wheel to southeast and look through the telescope. The ridge and trees hang at the top of the eyepiece — the image is upside down, so the constellation nearest the horizon is the lowest. The rings go by height in the sky, not by distance from the center of the view. The constellation chart lists how many stars each one has.'),
        L('東南方的目鏡裡由上而下是：鳥（4 星）、舟（5 星）、鑰（6 星）。倒回真實天空，由高到低是鑰、舟、鳥。外環＝鑰、中環＝舟、內環＝鳥。',
          'Facing southeast, the eyepiece shows, top to bottom: Bird (4 stars), Boat (5), Key (6). Flipped back to the real sky, highest to lowest is Key, Boat, Bird. Outer = Key, middle = Boat, inner = Bird.'),
      ],
    },
    {
      id: 'safe', title: L('牆裡的保險箱', 'The Wall Safe'),
      avail: s => F(s, 'paintingMoved'), done: s => F(s, 'safeOpen'),
      texts: [
        L('畫框背面寫著：「星星會告訴你數字。」保險箱要三位數。', 'The back of the frame says: "The stars will tell you the numbers." The safe needs three digits.'),
        L('書桌上的數字方格紙和天文台地圖櫃裡的星圖膠片，四個角都有小十字——試著把它們組合。', 'The number grid from the desk and the star-chart film from the observatory\'s map cabinet both have small crosses in their corners — try combining them.'),
        L(`疊合後，①②③ 依序落在 ${SAFE_CODE.split('').join('、')} 上。保險箱密碼是 ${SAFE_CODE}。`, `Overlaid, ①②③ fall on ${SAFE_CODE.split('').join(', ')}. The safe code is ${SAFE_CODE}.`),
      ],
    },
    {
      id: 'clock', title: L('落地鐘', 'The Grandfather Clock'),
      avail: s => seen(s, 'clock_inscription'), done: s => F(s, 'clockSolved'),
      texts: [
        L('鐘上刻著：「讓指針回到我最後一次觀測開始的那一刻。」陸觀的觀測紀錄會放在哪裡？', 'The clock reads: "Turn the hands back to the moment my last observation began." Where would Lu Guan keep his observing records?'),
        L('天文台的觀測日誌寫了最後一次觀測的日期和規矩；牆上的月落時刻表列著那天月亮落下的時刻。', 'The observation log in the observatory gives the date and the rule for his last observation; the moonset table on the wall gives that night\'s moonset.'),
        L('十月三日月落 02:15，再過整整一小時就是 3:15。把落地鐘撥到 3 點 15 分。', 'Moonset on 3 October was 02:15; one full hour later is 3:15. Set the clock to a quarter past three.'),
      ],
    },
    {
      id: 'wheel', title: L('溫室的總閘', 'The Greenhouse Main Valve'),
      avail: s => seen(s, 'garden_rules') && !has(s, 'valve_wheel'), done: s => F(s, 'wheelInstalled') || has(s, 'valve_wheel'),
      texts: [
        L('總閘少了手輪，轉不動。陸觀把它藏起來了。', 'The main valve is missing its handwheel and won\'t turn. Lu Guan hid it.'),
        L('手輪被藏在某個需要解開的機關裡——門廳的落地鐘還沒打開。', 'The handwheel is locked inside one of the house\'s mechanisms — the grandfather clock in the foyer hasn\'t been opened yet.'),
        L('解開落地鐘就能拿到閥門手輪（見「落地鐘」的提示）。', 'Solve the grandfather clock to get the valve handwheel (see the clock\'s hints).'),
      ],
    },
    {
      id: 'wheel_use', title: L('閥門手輪', 'The Valve Handwheel'),
      avail: s => has(s, 'valve_wheel'), done: s => F(s, 'wheelInstalled'),
      texts: [
        L('手輪背面貼著紙條：「溫室總閘」。', 'The slip on the back of the handwheel reads "Greenhouse main valve".'),
        L('溫室的灌溉系統上有一根光禿禿的閥桿。', 'The greenhouse irrigation system has a bare valve stem.'),
        L('選中閥門手輪，再點溫室的「灌溉系統」。', 'Select the valve handwheel, then click the Irrigation System in the greenhouse.'),
      ],
    },
    {
      id: 'valves', title: L('灌溉管線', 'The Irrigation Pipes'),
      avail: s => F(s, 'wheelInstalled'), done: s => F(s, 'waterOk'),
      texts: [
        L('牆上的園丁守則寫著三種植物各需要什麼水。', 'The gardener\'s rules on the wall say what water each plant needs.'),
        L('逐一看每個閥門通往哪些花床。仙人掌一滴水都不能有，月光花不能碰肥料，蕨類兩樣都要。', 'Trace which beds each valve feeds. The cactus gets nothing, the moonflower no fertilizer, the ferns both.'),
        L('打開 V2、V4、V5，關閉 V1、V3，然後轉開總閘。', 'Open V2, V4 and V5, close V1 and V3, then open the main valve.'),
      ],
    },
    {
      id: 'mirrors', title: L('天窗反光鏡', 'The Skylight Mirrors'),
      avail: s => seen(s, 'garden_rules') || F(s, 'greenhouseOpen'), done: s => F(s, 'lightOk'),
      texts: [
        L('園丁守則說月光花只在月光照到時開花。天窗下的反光鏡可以轉動。', 'The gardener\'s rules say the moonflower only blooms in moonlight. The mirrors under the skylight can be turned.'),
        L('點擊鏡子會切換斜向，光線會即時顯示。從光線第一個碰到的鏡子開始，一面一面往花的方向修正。', 'Clicking a mirror flips its angle, and the beam updates live. Start from the first mirror the light hits and correct them one by one toward the flower.'),
        mirrorHint(),
      ],
    },
    {
      id: 'moon', title: L('月光花', 'The Moonflower'),
      avail: s => F(s, 'waterOk') && F(s, 'lightOk'), done: s => F(s, 'moonTaken'),
      texts: [
        L('月光花有了雨水，也有了月光。', 'The moonflower has rainwater and moonlight now.'),
        L('去看看月光花。', 'Go and look at the moonflower.'),
        L('點擊溫室裡的「月光花」。', 'Click the Moonflower in the greenhouse.'),
      ],
    },
    {
      id: 'door', title: L('把徽章嵌回大門', 'Setting the Emblems'),
      avail: s => EMBLEMS.some(e => has(s, e)), done: s => allInserted(s),
      texts: [
        L('大門的黃銅面板上有日、月、星三個凹槽。', 'The brass panel on the front door has three sockets: Sun, Moon and Star.'),
        L('選中徽章，再點門廳的大門。', 'Select an emblem, then click the Front Door in the foyer.'),
        L('三枚都嵌好之後，再點一次大門就能離開。', 'Once all three are set, click the door again to leave.'),
      ],
    },
    {
      id: 'exit', title: L('離開之前', 'Before You Leave'),
      avail: s => allInserted(s), done: () => false,
      texts: [
        s => {
          const n = countPages(s), plate = s.inv.includes('plate');
          return L(`大門已經可以打開了。你目前有日記 ${n} / 4 頁${plate ? '，也帶著底片' : '，還沒找到信裡說的真相'}。`,
            `The door can open now. You have ${n} / 4 diary pages${plate ? ' and the glass plate' : ', but you haven\'t found the truth the letter mentioned'}.`);
        },
        L('信裡說，真相藏在「光照不到的地方」。完整的日記會讓真相更有分量。', 'The letter says the truth is hidden "where the light cannot reach". A complete diary gives the truth more weight.'),
        L('離開前若想看到真結局：取得暗房裡的玻璃底片，並收齊四頁日記，然後選擇公開真相。', 'For the true ending: get the glass plate from the darkroom, collect all four diary pages, then choose to make the truth public.'),
      ],
    },
    {
      id: 'darkroom', title: L('光照不到的地方（選擇性）', 'Where the Light Cannot Reach (Optional)'),
      avail: s => F(s, 'drawerOpen'), done: s => F(s, 'trapdoorOpen'),
      texts: [
        L('信裡說，二十年前的真相藏在「光照不到的地方」。哪裡又暗、又沒人會去看？', 'The letter says the truth from twenty years ago is hidden "where the light cannot reach". Where is it dark, and where would no one think to look?'),
        s => (has(s, 'note_left') || has(s, 'note_right') || has(s, 'note_full'))
          ? L('撕成兩半的便條要拼起來才讀得懂：一半在書房的廢紙簍，一半夾在天文台的觀測日誌裡。溫室工作台底下很暗，用能亮的手電筒照照看。', 'The torn note only makes sense in one piece: one half is in the study\'s wastebasket, the other tucked into the observatory\'s log. It\'s dark under the greenhouse workbench — try a working flashlight there.')
          : L('書房的廢紙簍和天文台的觀測日誌裡各有半張便條。溫室工作台底下很暗，用能亮的手電筒照照看。', 'The study\'s wastebasket and the observatory\'s log each hold half of a note. It\'s dark under the greenhouse workbench — try a working flashlight there.'),
        L(`用手電筒照溫室的工作台底下，會找到活板門；密碼在拼好的便條上：${TRAPDOOR_CODE}。`, `Shine the flashlight under the greenhouse workbench to find a trapdoor. The code is on the mended note: ${TRAPDOOR_CODE}.`),
      ],
    },
    {
      id: 'bulb', title: L('暗房的燈（選擇性）', 'Lighting the Darkroom (Optional)'),
      avail: s => F(s, 'trapdoorOpen'), done: s => F(s, 'darkroomLit'),
      texts: [
        L('暗房只准開紅燈，手電筒的白光不行。', 'The darkroom allows red light only — not the flashlight\'s white beam.'),
        L('天文台觀測桌上的檯燈，用的就是紅色燈泡。', 'The lamp on the observatory\'s desk uses a red bulb.'),
        L('拿走天文台的紅色燈泡，對暗房「牆上的燈座」使用它。', 'Take the red bulb from the observatory and use it on the Lamp Socket in the darkroom.'),
      ],
    },
    {
      id: 'develop', title: L('沖洗底片（選擇性）', 'Developing the Plate (Optional)'),
      avail: s => F(s, 'darkroomLit'), done: s => F(s, 'plateDeveloped'),
      texts: [
        L('拼好的便條寫了沖洗順序；藥瓶架上的卡片能推出每個瓶子裝的是什麼。', 'The mended note gives the developing order; the card on the bottle shelf tells you what is in each bottle.'),
        L('先用卡片第四條和第一條確定清水的位置，再用第二條和第三條排出其他三瓶。', 'Use rules 4 and 1 on the card to place the water first, then rules 2 and 3 for the other three bottles.'),
        L('紅＝清水、藍＝定影液、黃＝顯影液、白＝停影液。依序倒：黃 → 白 → 藍 → 紅。', 'Red = water, blue = fixer, yellow = developer, white = stop bath. Pour in this order: yellow → white → blue → red.'),
      ],
    },
    {
      id: 'diary', title: L('陸觀的日記（選擇性）', 'Lu Guan\'s Diary (Optional)'),
      avail: s => countPages(s) > 0, done: s => countPages(s) >= 4,
      texts: [
        s => L(`日記一共四頁，你找到了 ${countPages(s)} 頁。殘頁散落在屋子各處，有的藏在很暗的地方。`, `The diary has four pages; you have found ${countPages(s)}. They are scattered around the house, some in very dark places.`),
        L('還沒找到的頁面，可能在：書桌抽屜、落地鐘、書房壁爐的煙囪、暗房的晾片繩。', 'The pages are in: the desk drawer, the grandfather clock, the study\'s chimney, and the darkroom\'s drying line.'),
        L('煙囪那一頁要用能亮的手電筒照壁爐；暗房那一頁要先點亮紅燈。', 'For the chimney page, use a working flashlight on the fireplace; for the darkroom page, light the red lamp first.'),
      ],
    },
  ];

  /* ================================================================
   * 十、開場
   * ================================================================ */
  const intro = L([
    '十月的最後一個雨夜，你——沈遙——收到一封沒有郵戳的信。',
    '寫信的人是你的老師，業餘天文學家陸觀。三週前，他在山上的老宅裡病逝了。信封裡只有一張卡片：「來宅邸吧，我留了東西給你。」',
    '你推開老宅的大門。門在身後「喀」地一聲，自己鎖上了。',
    '門內的地毯上，端端正正地放著第二封信。',
  ], [
    'On the last rainy night of October, you — Shen Yao — receive a letter with no postmark.',
    'It is from your teacher, the amateur astronomer Lu Guan. Three weeks ago he died in his old house in the mountains. The envelope holds a single card: "Come to the house. I\'ve left something for you."',
    'You push open the front door of the old house. Behind you it clicks shut — and locks itself.',
    'On the rug just inside, neatly placed, lies a second letter.',
  ]);

  return {
    title: L('觀星者之屋', 'The Stargazer\'s House'),
    subtitle: L('最後的觀測', 'The Last Observation'),
    saveVersion: 1,
    startRoom: 'foyer',
    startItems: ['letter'],
    roomOrder: ['foyer', 'study', 'greenhouse', 'observatory', 'darkroom'],
    rooms, items, docs, hotspots, recipes, puzzles, endings, ENDING_ORDER, hints, intro,
    // 共用謎題資料（UI 繪圖與測試用）
    BOOKS, COLOR_NAMES, DRAWER_CODE, DRAWER_TRAP, GRID_DIGITS, TRANSPARENCY_STARS, SAFE_CODE, POTS, POT_ANSWER,
    MOONSET, CLOCK_ANSWER, VALVES, BEDS, evalValves, MIRROR_GRID, traceBeam, MIRROR_SOLUTIONS,
    CONSTELLATIONS, CONSTELLATION_ORDER, DIRECTIONS, SKY_FIELDS, COMET_DIRECTION, DIAL_ANSWER,
    NOTE_LINES, NOTE_ORDER_TEXT, TRAPDOOR_CODE, BOTTLES, CHEM_NAMES, DEVELOP_SEQUENCE, DEVELOP_ANSWER,
    EMBLEMS, EMBLEM_SHORT, PAGES, countPages, allInserted, DISCOVERIES, L,
  };
}));
