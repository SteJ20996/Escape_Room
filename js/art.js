/*
 * 觀星者之屋 — 美術（全部為內嵌 SVG，不依賴任何外部圖檔）
 * 房間場景：Art.scene(roomId, view) → SVG 字串；熱點以 <g class="hs" data-hs="…"> 包起來。
 * 謎題圖：書架、星座圖、目鏡、管線、反光鏡、時鐘、方格紙、膠片、便條、底片……
 */
(function (root) {
  'use strict';
  const G = root.GAME_DATA;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 確定性亂數（讓星空每次長得一樣）
  function rng(seed) {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  function starfield(seed, n, x0, y0, w, h, opts = {}) {
    const r = rng(seed);
    let out = '';
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * w, y = y0 + r() * h, rad = (opts.min || 0.6) + r() * (opts.var || 1.2);
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="${opts.color || '#f3ecd6'}" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
    }
    return out;
  }

  /* ------------------------------------------------------------
   * 房間場景
   * v = { s, vis(id), label(id) }
   * ------------------------------------------------------------ */
  function H(v, id, inner) {
    if (!v.vis(id)) return '';
    const name = esc(v.label(id));
    return `<g class="hs" data-hs="${id}" tabindex="0" role="button" aria-label="${name}"><title>${name}</title>${inner}</g>`;
  }
  const hit = (x, y, w, h) => `<rect class="hit" x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent"/>`;

  function clockHands(cx, cy, r, h, m) {
    const ha = ((h % 12) + m / 60) * 30 * Math.PI / 180, ma = m * 6 * Math.PI / 180;
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.sin(ha) * r * 0.5).toFixed(1)}" y2="${(cy - Math.cos(ha) * r * 0.5).toFixed(1)}" stroke="#1b1408" stroke-width="2.6" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${(cx + Math.sin(ma) * r * 0.8).toFixed(1)}" y2="${(cy - Math.cos(ma) * r * 0.8).toFixed(1)}" stroke="#1b1408" stroke-width="1.6" stroke-linecap="round"/>`;
  }

  function foyer(v) {
    const f = v.s.flags;
    const socket = (x, e, glyph) => f['inserted_' + e]
      ? `<circle cx="${x}" cy="262" r="11" fill="url(#fy-brass)" stroke="#f3d68f" stroke-width="1.2"/><text x="${x}" y="266.5" text-anchor="middle" font-size="12" fill="#3b2a10" font-weight="700">${glyph}</text>`
      : `<circle cx="${x}" cy="262" r="11" fill="#120c06" stroke="#8a6a32" stroke-width="1.5"/><text x="${x}" y="266" text-anchor="middle" font-size="10" fill="#8a6a32">${glyph}</text>`;
    const open = G.allInserted(v.s);
    return `
    <defs>
      <linearGradient id="fy-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121a2c"/><stop offset="1" stop-color="#1d2740"/></linearGradient>
      <linearGradient id="fy-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241a12"/><stop offset="1" stop-color="#110c08"/></linearGradient>
      <linearGradient id="fy-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3b2516"/><stop offset=".5" stop-color="#4a2f1c"/><stop offset="1" stop-color="#34200f"/></linearGradient>
      <radialGradient id="fy-brass" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#f6dc95"/><stop offset="1" stop-color="#a87b2e"/></radialGradient>
      <radialGradient id="fy-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9c77a" stop-opacity=".35"/><stop offset="1" stop-color="#e9c77a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="960" height="540" fill="url(#fy-wall)"/>
    <rect y="300" width="960" height="120" fill="#1f2a44" opacity=".55"/>
    ${[60, 180, 600, 720].map(x => `<rect x="${x}" y="315" width="100" height="90" fill="none" stroke="#2c3a5c" stroke-width="2"/>`).join('')}
    <rect y="420" width="960" height="120" fill="url(#fy-floor)"/>
    ${[440, 465, 495, 530].map(y => `<line x1="0" y1="${y}" x2="960" y2="${y}" stroke="#2e2218" stroke-width="1"/>`).join('')}
    <ellipse cx="480" cy="478" rx="190" ry="40" fill="#4a1d22"/><ellipse cx="480" cy="478" rx="170" ry="32" fill="none" stroke="#a5783a" stroke-width="2" stroke-dasharray="6 5"/>
    <!-- 吊燈 -->
    <line x1="480" y1="0" x2="480" y2="40" stroke="#6b5530" stroke-width="2"/>
    <path d="M430 60 Q480 90 530 60" fill="none" stroke="#8a6a32" stroke-width="3"/>
    ${[430, 455, 480, 505, 530].map(x => `<rect x="${x - 3}" y="${x === 480 ? 46 : 50}" width="6" height="12" fill="#d8ccb0" opacity=".6"/>`).join('')}
    <!-- 高窗 -->
    ${H(v, 'f_window', `<rect x="595" y="80" width="60" height="90" fill="#0a1020" stroke="#4a3a24" stroke-width="5"/>
      <circle cx="635" cy="104" r="9" fill="#e9e3cc" opacity=".85"/>${starfield(11, 6, 600, 85, 50, 80)}
      ${[607, 619, 631, 643].map(x => `<line x1="${x}" y1="82" x2="${x}" y2="168" stroke="#2a2a2e" stroke-width="3"/>`).join('')}${hit(590, 75, 70, 100)}`)}
    <!-- 衣帽架 -->
    ${H(v, 'f_coat', `<line x1="85" y1="150" x2="85" y2="415" stroke="#4a2f1c" stroke-width="7"/>
      <path d="M60 415 L85 395 L110 415" fill="none" stroke="#4a2f1c" stroke-width="6"/>
      <path d="M68 160 L85 150 L102 160" fill="none" stroke="#8a6a32" stroke-width="3"/>
      ${f.coatSearched ? '' : ''}<path d="M62 175 Q85 160 108 175 L114 330 Q85 342 56 330 Z" fill="#2f4334"/>
      <path d="M85 172 L85 330" stroke="#22322a" stroke-width="2"/><rect x="92" y="250" width="16" height="22" rx="3" fill="#263a2c"/>${hit(50, 145, 70, 275)}`)}
    ${H(v, 'f_umbrella', `<rect x="118" y="372" width="26" height="46" rx="4" fill="#3c4660"/><line x1="128" y1="372" x2="124" y2="320" stroke="#161616" stroke-width="3"/><path d="M118 336 Q124 300 134 336 Z" fill="#161616"/>${hit(112, 315, 38, 105)}`)}
    <!-- 落地鐘 -->
    ${H(v, 'f_clock', `<path d="M150 135 Q185 105 220 135 L220 205 L150 205 Z" fill="url(#fy-wood)"/>
      <circle cx="185" cy="168" r="26" fill="#efe4c8" stroke="#a5783a" stroke-width="3"/>
      ${[...Array(12)].map((_, i) => { const a = i * 30 * Math.PI / 180; return `<circle cx="${(185 + Math.sin(a) * 21).toFixed(1)}" cy="${(168 - Math.cos(a) * 21).toFixed(1)}" r="1.3" fill="#3b2a10"/>`; }).join('')}
      ${f.clockSolved ? clockHands(185, 168, 26, 3, 15) : clockHands(185, 168, 26, 7, 40)}
      <rect x="156" y="205" width="58" height="190" fill="url(#fy-wood)"/>
      <rect x="168" y="225" width="34" height="120" rx="3" fill="${f.clockSolved ? '#0d0805' : '#1b120a'}" stroke="#a5783a" stroke-width="2"/>
      ${f.clockSolved ? '' : `<line x1="185" y1="228" x2="185" y2="320" stroke="#a5783a" stroke-width="2"/><circle cx="185" cy="322" r="9" fill="url(#fy-brass)"/>`}
      <rect x="150" y="395" width="70" height="22" fill="#2e1c10"/>${hit(145, 108, 80, 312)}`)}
    <!-- 書房門 -->
    ${H(v, 'f_study_door', `<rect x="250" y="180" width="92" height="240" fill="#2b1a0f" stroke="#5a3d22" stroke-width="5"/>
      <polygon points="255,185 330,195 330,415 255,415" fill="url(#fy-wood)"/>
      <rect x="335" y="185" width="4" height="230" fill="#e9c77a" opacity=".55"/>
      <circle cx="318" cy="305" r="4.5" fill="url(#fy-brass)"/>
      <rect x="270" y="200" width="44" height="16" rx="2" fill="#a5783a"/><text x="292" y="212.5" text-anchor="middle" font-size="11" fill="#2b1a0f">書房</text>${hit(245, 175, 102, 250)}`)}
    <!-- 大門 -->
    ${H(v, 'f_door', `<path d="M392 420 L392 190 Q480 100 568 190 L568 420 Z" fill="#20140b" stroke="#6b4b26" stroke-width="6"/>
      <path d="M402 418 L402 194 Q480 116 558 194 L558 418 Z" fill="url(#fy-wood)"/>
      <line x1="480" y1="140" x2="480" y2="418" stroke="#22140a" stroke-width="3"/>
      ${[[412, 200, 58, 40], [490, 200, 58, 40], [412, 290, 58, 110], [490, 290, 58, 110]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#2a190c" stroke-width="3"/>`).join('')}
      <circle cx="466" cy="320" r="5" fill="url(#fy-brass)"/><circle cx="494" cy="320" r="5" fill="url(#fy-brass)"/>
      <rect x="432" y="244" width="96" height="36" rx="8" fill="#7a5a26" stroke="#e3c27a" stroke-width="1.5"/>
      ${socket(452, 'emblem_sun', '日')}${socket(480, 'emblem_moon', '月')}${socket(508, 'emblem_star', '星')}
      ${open ? `<path d="M402 418 L402 194 Q480 116 558 194 L558 418 Z" fill="url(#fy-glow)"/>` : ''}${hit(392, 120, 176, 300)}`)}
    ${H(v, 'f_mailslot', `<rect x="452" y="358" width="56" height="12" rx="2" fill="#a87b2e" stroke="#f3d68f" stroke-width="1"/><rect x="458" y="362" width="44" height="4" fill="#1a1006"/>${hit(446, 350, 68, 26)}`)}
    <!-- 電話 -->
    <rect x="585" y="368" width="70" height="8" fill="#4a2f1c"/><line x1="592" y1="376" x2="592" y2="418" stroke="#4a2f1c" stroke-width="5"/><line x1="648" y1="376" x2="648" y2="418" stroke="#4a2f1c" stroke-width="5"/>
    ${H(v, 'f_phone', `<path d="M596 368 L600 344 L640 344 L644 368 Z" fill="#141414"/><circle cx="620" cy="356" r="8" fill="#2a2a2a" stroke="#777" stroke-width="1"/>
      <path d="M598 340 Q620 326 642 340" fill="none" stroke="#141414" stroke-width="7" stroke-linecap="round"/>
      ${f.phoneRinging ? `<g class="ring"><path d="M584 334 q-8 -10 0 -20" fill="none" stroke="#e3c27a" stroke-width="2"/><path d="M656 334 q8 -10 0 -20" fill="none" stroke="#e3c27a" stroke-width="2"/></g>` : ''}${hit(580, 318, 80, 54)}`)}
    <!-- 溫室門 -->
    ${H(v, 'f_gh_door', `<rect x="670" y="180" width="86" height="240" fill="#1a2b22" stroke="#5a3d22" stroke-width="5"/>
      <rect x="678" y="188" width="70" height="225" fill="${f.greenhouseOpen ? '#2f5a3f' : '#203a2c'}" opacity=".9"/>
      ${[713].map(x => `<line x1="${x}" y1="188" x2="${x}" y2="413" stroke="#5a3d22" stroke-width="3"/>`).join('')}
      ${[245, 300, 355].map(y => `<line x1="678" y1="${y}" x2="748" y2="${y}" stroke="#5a3d22" stroke-width="3"/>`).join('')}
      <path d="M690 230 q10 -18 20 0 q-10 8 -20 0" fill="#6aa279" opacity=".7"/><path d="M724 330 q12 -20 22 2 q-12 8 -22 -2" fill="#6aa279" opacity=".6"/>
      <circle cx="742" cy="305" r="4.5" fill="url(#fy-brass)"/>
      ${f.greenhouseOpen ? '' : `<path d="M738 318 l4 -6 l4 6 z" fill="#a5783a"/>`}${hit(665, 175, 96, 250)}`)}
    <!-- 樓梯與鐵門 -->
    <polygon points="780,420 960,420 960,120 900,120" fill="#2a1d12"/>
    ${[...Array(8)].map((_, i) => `<line x1="${790 + i * 21}" y1="${420 - i * 37}" x2="960" y2="${420 - i * 37}" stroke="#3d2a19" stroke-width="3"/>`).join('')}
    <line x1="800" y1="260" x2="950" y2="80" stroke="#5a3d22" stroke-width="6"/>
    ${H(v, 'f_gate', f.gateOpen
      ? `<g opacity=".9">${[0, 1, 2, 3, 4].map(i => `<line x1="${788 + i * 6}" y1="${250 + i * 2}" x2="${788 + i * 6}" y2="${420 - i * 2}" stroke="#2a2a2e" stroke-width="4"/>`).join('')}</g><text x="870" y="300" font-size="15" fill="#c9a24f">↑ 天文台</text>${hit(780, 240, 140, 182)}`
      : `<rect x="785" y="245" width="110" height="175" fill="none" stroke="#2a2a2e" stroke-width="5"/>
        ${[...Array(9)].map((_, i) => `<line x1="${797 + i * 12}" y1="245" x2="${797 + i * 12}" y2="420" stroke="#34343a" stroke-width="4"/>`).join('')}
        <rect x="826" y="318" width="26" height="22" rx="4" fill="url(#fy-brass)"/><path d="M831 318 v-8 a8 8 0 0 1 16 0 v8" fill="none" stroke="#c9a24f" stroke-width="3"/>${hit(780, 240, 120, 182)}`)}
    `;
  }

  function study(v) {
    const f = v.s.flags;
    const shelfBooks = (y, seed, h0) => {
      const r = rng(seed); let x = 52, out = '';
      while (x < 285) {
        const w = 12 + Math.floor(r() * 10), h = h0 - Math.floor(r() * 16);
        const c = ['#5b3a2a', '#3e4a5e', '#5d5236', '#3f2c22', '#4e3b46', '#2f4136'][Math.floor(r() * 6)];
        out += `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${c}"/>`;
        x += w + 2;
      }
      return out;
    };
    const colorOf = { yellow: '#d8b546', blue: '#3f6fb0', green: '#4f8a5b', red: '#b5473f', brown: '#6b4a32' };
    const vols = G.BOOKS.map((b, i) => `<rect x="${54 + i * 26}" y="${206}" width="22" height="62" fill="${colorOf[b.color]}"/><rect x="${54 + i * 26}" y="${214}" width="22" height="3" fill="#e3c27a" opacity=".6"/>`).join('');
    return `
    <defs>
      <linearGradient id="st-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14221f"/><stop offset="1" stop-color="#1c2e2a"/></linearGradient>
      <linearGradient id="st-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d14"/><stop offset="1" stop-color="#140d08"/></linearGradient>
      <radialGradient id="st-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f2d590" stop-opacity=".45"/><stop offset="1" stop-color="#f2d590" stop-opacity="0"/></radialGradient>
      <linearGradient id="st-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f3320"/><stop offset="1" stop-color="#2f1d11"/></linearGradient>
      <radialGradient id="st-sky" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#2a3d6e"/><stop offset="1" stop-color="#0b1226"/></radialGradient>
    </defs>
    <rect width="960" height="540" fill="url(#st-wall)"/>
    ${[...Array(24)].map((_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="430" stroke="#182824" stroke-width="10" opacity=".5"/>`).join('')}
    <rect y="430" width="960" height="110" fill="url(#st-floor)"/>
    <ellipse cx="600" cy="270" rx="200" ry="150" fill="url(#st-lamp)"/>
    <!-- 書架 -->
    ${H(v, 's_shelf', `<rect x="40" y="70" width="262" height="362" fill="#2d1b10"/>
      <rect x="48" y="78" width="246" height="346" fill="#1a100a"/>
      ${[118, 198, 272, 350, 424].map(y => `<rect x="44" y="${y}" width="254" height="8" fill="#4a2f1c"/>`).join('')}
      ${shelfBooks(118, 3, 36)}${vols}${shelfBooks(350, 5, 70)}${shelfBooks(424, 9, 66)}
      <circle cx="270" cy="105" r="10" fill="#6b8bb5" opacity=".6"/><rect x="262" y="104" width="16" height="14" fill="#4a2f1c"/>
      ${hit(38, 68, 266, 366)}`)}
    <!-- 剪報 -->
    ${H(v, 's_clipping', `<rect x="330" y="104" width="54" height="68" fill="#d9ceb2" transform="rotate(-4 357 138)"/>
      <g transform="rotate(-4 357 138)">${[116, 124, 132, 140, 148, 156].map(y => `<line x1="336" y1="${y}" x2="378" y2="${y}" stroke="#6b6250" stroke-width="2"/>`).join('')}<circle cx="370" cy="132" r="6" fill="none" stroke="#b5473f" stroke-width="1.8"/></g>
      <circle cx="357" cy="104" r="3" fill="#b5473f"/>${hit(325, 96, 66, 82)}`)}
    <!-- 油畫 / 保險箱 -->
    ${f.paintingMoved
      ? `${H(v, 's_safe', `<rect x="452" y="96" width="100" height="96" rx="4" fill="#4b5058" stroke="#2a2d32" stroke-width="4"/>
          <rect x="462" y="106" width="80" height="76" fill="none" stroke="#6c727c" stroke-width="2"/>
          <circle cx="502" cy="144" r="20" fill="#2d3036" stroke="#9aa1ab" stroke-width="2"/>${[...Array(10)].map((_, i) => { const a = i * 36 * Math.PI / 180; return `<line x1="${(502 + Math.sin(a) * 15).toFixed(1)}" y1="${(144 - Math.cos(a) * 15).toFixed(1)}" x2="${(502 + Math.sin(a) * 19).toFixed(1)}" y2="${(144 - Math.cos(a) * 19).toFixed(1)}" stroke="#c7ccd4" stroke-width="1.5"/>`; }).join('')}
          ${f.safeOpen ? `<rect x="452" y="96" width="100" height="96" fill="#0d0e10" opacity=".85"/>` : ''}${hit(446, 90, 112, 108)}`)}
        ${H(v, 's_painting', `<g transform="rotate(-12 650 380)"><rect x="600" y="320" width="120" height="86" fill="#7a5a26"/><rect x="608" y="328" width="104" height="70" fill="url(#st-sky)"/>${starfield(7, 10, 612, 332, 96, 62)}</g>${hit(596, 304, 130, 112)}`)}`
      : H(v, 's_painting', `<rect x="420" y="78" width="170" height="130" fill="#8a6a32" stroke="#e3c27a" stroke-width="2"/>
          <rect x="432" y="90" width="146" height="106" fill="url(#st-sky)"/>${starfield(7, 26, 434, 92, 142, 100)}
          ${[[460, 120], [480, 128], [500, 124], [518, 134], [532, 158], [556, 152], [552, 128]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff6d8"/>`).join('')}
          <path d="M432 196 Q505 168 578 196 Z" fill="#141a14"/>${hit(415, 74, 180, 138)}`)}
    <!-- 窗戶 -->
    ${H(v, 's_window', `<rect x="618" y="70" width="64" height="104" fill="#0a1226" stroke="#3a2a1c" stroke-width="6"/>${starfield(21, 9, 622, 74, 56, 96)}<line x1="650" y1="70" x2="650" y2="174" stroke="#3a2a1c" stroke-width="4"/><line x1="618" y1="122" x2="682" y2="122" stroke="#3a2a1c" stroke-width="4"/>
      <line x1="614" y1="90" x2="686" y2="110" stroke="#6b5530" stroke-width="3"/><line x1="614" y1="150" x2="686" y2="140" stroke="#6b5530" stroke-width="3"/>${hit(612, 64, 76, 116)}`)}
    <!-- 壁爐 -->
    <rect x="720" y="0" width="160" height="230" fill="#22201f"/>
    ${H(v, 's_fireplace', `<rect x="696" y="222" width="208" height="20" fill="#5c534c"/>
      <rect x="708" y="242" width="184" height="190" fill="#3d3733"/>
      <path d="M740 432 L740 300 Q800 260 860 300 L860 432 Z" fill="#0b0908"/>
      <path d="M760 432 q20 -20 40 -6 q20 -16 40 6 z" fill="#2a2420"/>${[[772, 424], [796, 420], [820, 426]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#4a2a1a"/>`).join('')}
      ${hit(692, 216, 216, 220)}`)}
    <!-- 書桌 -->
    <ellipse cx="500" cy="438" rx="170" ry="12" fill="#000" opacity=".35"/>
    <rect x="370" y="316" width="16" height="116" fill="#2f1d11"/><rect x="614" y="316" width="16" height="116" fill="#2f1d11"/>
    ${H(v, 's_desk', `<rect x="356" y="300" width="288" height="18" fill="url(#st-wood)"/>
      ${f.gridTaken ? '' : `<rect x="430" y="286" width="48" height="16" fill="#e8e1cc" transform="skewX(-25)"/>`}
      <rect x="500" y="288" width="40" height="12" fill="#c9bfa4" transform="skewX(-20)"/>
      <rect x="600" y="262" width="6" height="38" fill="#a5783a"/><path d="M584 262 L622 262 L612 244 L594 244 Z" fill="#2f5a3f"/>${hit(352, 240, 296, 80)}`)}
    ${H(v, 's_drawer', `<rect x="440" y="324" width="120" height="40" fill="#4a2f1c" stroke="#2a190c" stroke-width="2"/>
      <rect x="486" y="334" width="28" height="18" rx="3" fill="${f.drawerOpen ? '#2a190c' : '#a87b2e'}"/>${f.drawerOpen ? '' : `<rect x="491" y="339" width="18" height="8" fill="#1a1006"/>`}${hit(436, 320, 128, 48)}`)}
    <!-- 廢紙簍 -->
    ${H(v, 's_waste', `<path d="M652 392 L690 392 L684 436 L658 436 Z" fill="#6b5536"/>${[0, 1, 2, 3].map(i => `<line x1="${658 + i * 8}" y1="394" x2="${660 + i * 7}" y2="434" stroke="#4a3a22" stroke-width="2"/>`).join('')}
      <circle cx="664" cy="388" r="7" fill="#e5dcc4"/><circle cx="678" cy="386" r="6" fill="#d8ceb4"/>${hit(646, 374, 50, 66)}`)}
    <!-- 出口 -->
    ${H(v, 's_exit', `<rect x="910" y="210" width="44" height="222" fill="#2b1a0f" stroke="#5a3d22" stroke-width="4"/><text x="932" y="320" font-size="13" fill="#c9a24f" text-anchor="middle" writing-mode="tb">門廳</text>${hit(904, 204, 56, 232)}`)}
    `;
  }

  function greenhouse(v) {
    const f = v.s.flags;
    const bloom = f.moonTaken || (f.waterOk && f.lightOk);
    return `
    <defs>
      <linearGradient id="gh-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1730"/><stop offset="1" stop-color="#1b3346"/></linearGradient>
      <linearGradient id="gh-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2a1f"/><stop offset="1" stop-color="#0e140e"/></linearGradient>
      <linearGradient id="gh-beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9efff" stop-opacity=".35"/><stop offset="1" stop-color="#e9efff" stop-opacity="0"/></linearGradient>
      <radialGradient id="gh-bloom" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".7"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="960" height="540" fill="url(#gh-sky)"/>
    ${starfield(31, 60, 0, 0, 960, 260)}
    <circle cx="96" cy="44" r="18" fill="#f2efe0"/>
    ${[...Array(13)].map((_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80}" y2="440" stroke="#2c3a3a" stroke-width="3"/>`).join('')}
    ${[120, 240].map(y => `<line x1="0" y1="${y}" x2="960" y2="${y}" stroke="#2c3a3a" stroke-width="3"/>`).join('')}
    <polygon points="60,0 130,0 260,440 120,440" fill="url(#gh-beam)"/>
    <rect y="430" width="960" height="110" fill="url(#gh-floor)"/>
    ${H(v, 'g_mirrors', `<rect x="150" y="34" width="250" height="6" fill="#4b5560"/>
      ${[170, 210, 250, 290, 330, 370].map((x, i) => `<line x1="${x}" y1="40" x2="${x}" y2="62" stroke="#4b5560" stroke-width="2"/><rect x="${x - 14}" y="62" width="28" height="36" rx="3" fill="#9fb6cc" stroke="#d7e4ef" stroke-width="1.5" transform="rotate(${i % 2 ? 30 : -30} ${x} 80)"/>`).join('')}
      ${f.lightOk ? `<polyline points="96,60 170,80 330,80 300,330" fill="none" stroke="#f3f6ff" stroke-width="3" opacity=".7"/>` : ''}${hit(144, 28, 262, 82)}`)}
    <!-- 桶與閥門 -->
    ${H(v, 'g_valves', `<rect x="30" y="262" width="62" height="118" rx="8" fill="#2f5277"/><text x="61" y="318" text-anchor="middle" font-size="14" fill="#d9e6f2">雨水</text>
      <rect x="100" y="262" width="62" height="118" rx="8" fill="#6b4a26"/><text x="131" y="318" text-anchor="middle" font-size="14" fill="#f0dcc0">肥料</text>
      ${[276, 300, 340, 366].map(y => `<line x1="30" y1="${y}" x2="162" y2="${y}" stroke="#1a1a1a" stroke-width="2" opacity=".4"/>`).join('')}
      <rect x="170" y="276" width="62" height="66" rx="4" fill="#3a3f45" stroke="#8a929b" stroke-width="2"/>
      ${[0, 1, 2, 3, 4].map(i => `<circle cx="${182 + (i % 3) * 19}" cy="${292 + Math.floor(i / 3) * 20}" r="6" fill="${f.waterOk ? '#6fae7d' : '#b9a06a'}"/>`).join('')}
      ${f.wheelInstalled ? `<circle cx="220" cy="328" r="9" fill="none" stroke="#e3c27a" stroke-width="3"/>` : `<line x1="220" y1="322" x2="220" y2="334" stroke="#8a929b" stroke-width="3"/>`}
      <path d="M162 300 L170 300 M162 330 L170 330" stroke="#8a929b" stroke-width="4"/>
      <path d="M232 320 L250 320 L250 410" fill="none" stroke="#5c6670" stroke-width="5"/>${hit(26, 256, 210, 128)}`)}
    ${H(v, 'g_rules', `<rect x="196" y="176" width="2" height="90" fill="#4a3a22"/><rect x="176" y="168" width="44" height="54" fill="#e5dcc4" transform="rotate(3 198 195)"/>
      ${[178, 186, 194, 202, 210].map(y => `<line x1="182" y1="${y}" x2="214" y2="${y}" stroke="#7a6f58" stroke-width="2"/>`).join('')}${hit(170, 160, 56, 70)}`)}
    <!-- 花床 -->
    <rect x="250" y="400" width="130" height="44" fill="#3a2a1a"/><rect x="398" y="400" width="112" height="44" fill="#3a2a1a"/><rect x="528" y="400" width="100" height="44" fill="#3a2a1a"/>
    ${[[408, 390], [430, 380], [452, 388], [474, 382], [492, 392]].map(([x, y]) => `<path d="M${x} 402 q4 -26 ${-10} -40 M${x} 402 q6 -24 14 -36" fill="none" stroke="${f.waterOk ? '#5ea36b' : '#4a7a52'}" stroke-width="3"/>`).join('')}
    <rect x="566" y="350" width="22" height="52" rx="10" fill="#4f7a4a"/><rect x="552" y="368" width="14" height="10" rx="5" fill="#4f7a4a"/><rect x="588" y="360" width="14" height="10" rx="5" fill="#4f7a4a"/>
    <text x="315" y="460" text-anchor="middle" font-size="12" fill="#9fb59a">月光花</text><text x="454" y="460" text-anchor="middle" font-size="12" fill="#9fb59a">蕨類</text><text x="578" y="460" text-anchor="middle" font-size="12" fill="#9fb59a">仙人掌</text>
    ${H(v, 'g_moonflower', `<path d="M315 402 C312 370 318 350 314 320" fill="none" stroke="#5e8f5e" stroke-width="4"/>
      <path d="M314 372 q-26 -6 -34 -20 q22 0 34 14" fill="#4f8a5b"/><path d="M316 356 q24 -8 34 -22 q-22 2 -34 16" fill="#4f8a5b"/>
      ${bloom
        ? `<circle cx="314" cy="306" r="40" fill="url(#gh-bloom)"/>${[0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="314" cy="290" rx="9" ry="18" fill="#f8f9ff" transform="rotate(${a} 314 306)"/>`).join('')}<circle cx="314" cy="306" r="7" fill="${f.moonTaken ? '#e8e2a8' : '#dfe6f5'}"/>`
        : `<path d="M314 324 q-12 -14 0 -34 q12 20 0 34" fill="#d7e2cf"/><path d="M314 324 q-6 -12 0 -28" fill="none" stroke="#9ab090" stroke-width="1.5"/>`}
      ${hit(270, 262, 90, 142)}`)}
    <!-- 花盆架 -->
    ${H(v, 'g_pots', `<rect x="652" y="318" width="250" height="10" fill="#5a3d22"/><rect x="660" y="328" width="8" height="34" fill="#4a2f1c"/><rect x="886" y="328" width="8" height="34" fill="#4a2f1c"/>
      ${[['#c44f5c', 680], ['#8a7bc8', 740], ['#8aa89a', 800], ['#6fbf8a', 860]].map(([c, x], i) => `<path d="M${x - 22} 276 L${x + 22} 276 L${x + 16} 318 L${x - 16} 318 Z" fill="${f.keyDug && i === 0 ? '#7a4a2a' : '#a3613a'}"/>
        <rect x="${x - 24}" y="270" width="48" height="8" fill="#8a4f2e"/>${[-10, 0, 10].map(d => `<circle cx="${x + d}" cy="${258 - Math.abs(d) / 2}" r="7" fill="${c}"/>`).join('')}<path d="M${x} 270 v-10" stroke="#4f7a4a" stroke-width="3"/>`).join('')}
      ${hit(648, 236, 258, 128)}`)}
    <!-- 工作台 -->
    ${H(v, 'g_bench', `<rect x="652" y="380" width="250" height="14" fill="#6b4a2c"/><rect x="662" y="394" width="10" height="44" fill="#4a2f1c"/><rect x="882" y="394" width="10" height="44" fill="#4a2f1c"/>
      <rect x="672" y="394" width="210" height="44" fill="#070a07" opacity=".85"/>
      <rect x="700" y="366" width="26" height="16" fill="#c9b27a"/><rect x="734" y="370" width="22" height="12" fill="#b59a5e"/><circle cx="830" cy="374" r="7" fill="none" stroke="#c9b27a" stroke-width="3"/>${hit(648, 360, 258, 80)}`)}
    ${H(v, 'g_trapdoor', `<rect x="716" y="448" width="124" height="54" fill="${f.trapdoorOpen ? '#050505' : '#4a3320'}" stroke="#2a1c10" stroke-width="3"/>
      ${f.trapdoorOpen ? `<text x="778" y="481" text-anchor="middle" font-size="13" fill="#c9a24f">↓ 暗房</text>` : `<line x1="716" y1="475" x2="840" y2="475" stroke="#2a1c10" stroke-width="2"/><rect x="768" y="466" width="20" height="18" rx="3" fill="#8a929b"/>`}${hit(712, 444, 132, 62)}`)}
    <!-- 工具架 -->
    ${H(v, 'g_tools', `<rect x="770" y="96" width="120" height="104" fill="#5a4630"/>${[0, 1, 2, 3, 4].map(i => `<circle cx="${784 + i * 23}" cy="110" r="2" fill="#2a1c10"/>`).join('')}
      <path d="M786 112 v40 M778 152 h16 v24 h-16 z" stroke="#9aa1ab" stroke-width="3" fill="#7a828c"/>
      <path d="M832 114 l-8 40 m16 -40 l8 40" stroke="#9aa1ab" stroke-width="3"/>
      ${f.trowelTaken ? '' : `<path d="M868 112 v34" stroke="#6b4a2c" stroke-width="5"/><path d="M860 146 h16 l-8 26 z" fill="#9aa1ab"/>`}${hit(764, 90, 132, 116)}`)}
    ${H(v, 'g_exit', `<rect x="912" y="200" width="42" height="236" fill="#1a2b22" stroke="#5a3d22" stroke-width="4"/><text x="933" y="320" font-size="13" fill="#c9a24f" text-anchor="middle" writing-mode="tb">門廳</text>${hit(906, 194, 54, 246)}`)}
    `;
  }

  function observatory(v) {
    const f = v.s.flags;
    const dir = G.DIRECTIONS.find(d => d.id === (v.s.puz.dome || 'N'));
    return `
    <defs>
      <radialGradient id="ob-dome" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#1d2440"/><stop offset="1" stop-color="#0b0f1e"/></radialGradient>
      <linearGradient id="ob-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7c77e"/><stop offset="1" stop-color="#93692a"/></linearGradient>
      <radialGradient id="ob-red" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff4a3a" stop-opacity=".5"/><stop offset="1" stop-color="#ff4a3a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="960" height="540" fill="#0a0d18"/>
    <path d="M0 440 L0 260 Q480 -120 960 260 L960 440 Z" fill="url(#ob-dome)"/>
    ${[160, 320, 640, 800].map(x => `<path d="M${x} 440 Q${(x + 480) / 2} ${x < 480 ? 60 : 60} 480 30" fill="none" stroke="#252c48" stroke-width="3"/>`).join('')}
    <path d="M440 440 L440 60 Q480 20 520 60 L520 440" fill="#060812"/>
    ${starfield(41, 30, 444, 50, 72, 260)}
    <rect y="440" width="960" height="100" fill="#141522"/>
    ${[460, 490, 520].map(y => `<line x1="0" y1="${y}" x2="960" y2="${y}" stroke="#1e2032" stroke-width="2"/>`).join('')}
    <!-- 星座圖、月落表 -->
    ${H(v, 'o_poster', `<rect x="40" y="96" width="150" height="150" fill="#e3d9bd"/>${G.CONSTELLATION_ORDER.map((id, i) => miniConst(id, 50 + (i % 4) * 35, 106 + Math.floor(i / 4) * 66, 28)).join('')}<text x="115" y="240" text-anchor="middle" font-size="11" fill="#5a4a30">星座圖</text>${hit(36, 92, 158, 158)}`)}
    ${H(v, 'o_almanac', `<rect x="210" y="104" width="72" height="96" fill="#d9ceb2"/><text x="246" y="122" text-anchor="middle" font-size="10" fill="#4a3a22">月落表</text>${[134, 146, 158, 170, 182].map(y => `<line x1="218" y1="${y}" x2="274" y2="${y}" stroke="#7a6f58" stroke-width="2"/>`).join('')}${hit(206, 100, 80, 104)}`)}
    <!-- 觀測桌 -->
    <rect x="36" y="350" width="262" height="14" fill="#4a2f1c"/><rect x="48" y="364" width="10" height="76" fill="#3a2414"/><rect x="276" y="364" width="10" height="76" fill="#3a2414"/>
    ${H(v, 'o_log', `<path d="M80 350 L84 330 L150 330 L156 350 Z" fill="#6b2a2a"/><path d="M118 332 L118 350" stroke="#3a1414" stroke-width="2"/>${f.logBookmark ? '' : `<rect x="132" y="322" width="8" height="12" fill="#e5dcc4"/>`}${hit(74, 316, 90, 38)}`)}
    ${H(v, 'o_lamp', `${f.bulbTaken ? '' : `<circle cx="230" cy="300" r="46" fill="url(#ob-red)"/>`}<rect x="226" y="312" width="8" height="38" fill="#8a6a32"/><path d="M210 312 L250 312 L240 290 L220 290 Z" fill="#3a3a3a"/>
      ${f.bulbTaken ? '' : `<circle cx="230" cy="316" r="6" fill="#ff5a48"/>`}<rect x="216" y="346" width="28" height="6" fill="#8a6a32"/>${hit(200, 270, 60, 84)}`)}
    <!-- 穹頂轉輪 -->
    ${H(v, 'o_dome', `<rect x="324" y="330" width="10" height="110" fill="#3a3f45"/><circle cx="329" cy="322" r="26" fill="none" stroke="url(#ob-brass)" stroke-width="5"/>
      ${[0, 60, 120].map(a => `<line x1="329" y1="322" x2="${(329 + Math.cos(a * Math.PI / 180) * 26).toFixed(1)}" y2="${(322 + Math.sin(a * Math.PI / 180) * 26).toFixed(1)}" stroke="#c9a24f" stroke-width="3" transform="rotate(${a} 329 322)"/>`).join('')}
      <circle cx="329" cy="322" r="5" fill="#e7c77e"/><circle cx="355" cy="322" r="4" fill="#e7c77e"/>
      <rect x="296" y="268" width="66" height="20" rx="3" fill="#2a2d3d" stroke="#6b4a1e"/><text x="329" y="282.5" text-anchor="middle" font-size="12" fill="#e7c77e">窗朝${dir.name}</text>${hit(292, 264, 74, 178)}`)}
    <!-- 望遠鏡 -->
    ${H(v, 'o_telescope', `<path d="M470 440 L490 330 L510 440" fill="none" stroke="#5a5f66" stroke-width="8"/><path d="M455 440 L490 330" stroke="#4a4f56" stroke-width="7"/>
      <circle cx="490" cy="328" r="12" fill="#3a3f45"/>
      <g transform="rotate(-32 490 320)"><rect x="380" y="302" width="250" height="36" rx="6" fill="url(#ob-brass)"/><rect x="610" y="296" width="30" height="48" rx="4" fill="#b88e3e"/>
        <rect x="360" y="310" width="22" height="20" rx="3" fill="${f.eyepieceInstalled ? '#c9a24f' : '#1a1a1a'}"/>${[430, 500, 570].map(x => `<rect x="${x}" y="300" width="6" height="40" fill="#8a6a32"/>`).join('')}</g>
      <rect x="452" y="372" width="40" height="22" fill="#e9e3cc" transform="rotate(-8 472 383)"/>${hit(350, 170, 300, 272)}`)}
    <!-- 星盤 -->
    ${H(v, 'o_dial', `<rect x="672" y="370" width="56" height="70" fill="#2d2f3a"/><rect x="660" y="362" width="80" height="10" fill="#3a3d4a"/>
      <ellipse cx="700" cy="342" rx="54" ry="26" fill="#6b4a1e"/><ellipse cx="700" cy="338" rx="50" ry="23" fill="url(#ob-brass)"/>
      <ellipse cx="700" cy="338" rx="36" ry="16" fill="none" stroke="#6b4a1e" stroke-width="2"/><ellipse cx="700" cy="338" rx="22" ry="10" fill="none" stroke="#6b4a1e" stroke-width="2"/>
      ${f.starDialSolved ? `<ellipse cx="700" cy="338" rx="10" ry="5" fill="#0b0f1e"/>` : `<circle cx="700" cy="338" r="4" fill="#3a2a10"/>`}<path d="M700 312 l-5 -9 h10 z" fill="#e7c77e"/>${hit(642, 300, 116, 142)}`)}
    <!-- 地圖櫃 -->
    ${H(v, 'o_cabinet', `<rect x="790" y="250" width="142" height="160" fill="#3a2414"/>${[270, 300, 330, 360, 390].map(y => `<rect x="798" y="${y - 14}" width="126" height="24" fill="#4f3320" stroke="#2a190c" stroke-width="2"/><rect x="852" y="${y - 6}" width="18" height="6" rx="2" fill="#c9a24f"/>`).join('')}${hit(786, 246, 150, 168)}`)}
    ${H(v, 'o_under', `<rect x="796" y="410" width="130" height="26" fill="#030305"/>${f.eyepieceFound ? '' : `<circle cx="902" cy="424" r="2.4" fill="#e7c77e" class="glint"/>`}${hit(790, 408, 142, 32)}`)}
    ${H(v, 'o_exit', `<path d="M600 458 L760 458 L740 520 L620 520 Z" fill="#05060a" stroke="#2a2d3d" stroke-width="3"/>${[474, 490, 506].map(y => `<line x1="${612 + (y - 458) / 3}" y1="${y}" x2="${748 - (y - 458) / 3}" y2="${y}" stroke="#2a2d3d" stroke-width="2"/>`).join('')}<text x="680" y="452" text-anchor="middle" font-size="12" fill="#c9a24f">↓ 下樓</text>${hit(596, 436, 168, 90)}`)}
    `;
  }

  function darkroom(v) {
    const f = v.s.flags;
    if (!f.darkroomLit) {
      return `
      <rect width="960" height="540" fill="#030303"/>
      <polygon points="40,0 150,0 170,540 20,540" fill="#1a1a14" opacity=".35"/>
      ${H(v, 'd_ladder', `${[60, 120].map(x => `<line x1="${x}" y1="0" x2="${x + 6}" y2="520" stroke="#3a3326" stroke-width="6"/>`).join('')}${[...Array(10)].map((_, i) => `<line x1="60" y1="${30 + i * 50}" x2="126" y2="${30 + i * 50}" stroke="#3a3326" stroke-width="5"/>`).join('')}${hit(40, 0, 110, 530)}`)}
      ${H(v, 'd_socket', `<circle cx="480" cy="92" r="16" fill="none" stroke="#2e2a24" stroke-width="3"/><line x1="480" y1="40" x2="480" y2="76" stroke="#2e2a24" stroke-width="3"/>${hit(450, 36, 60, 76)}`)}
      <text x="480" y="300" text-anchor="middle" font-size="16" fill="#3b372f">伸手不見五指。</text>
      `;
    }
    return `
    <defs>
      <radialGradient id="dk-light" cx=".5" cy=".15" r=".9"><stop offset="0" stop-color="#7a1712"/><stop offset="1" stop-color="#140303"/></radialGradient>
    </defs>
    <rect width="960" height="540" fill="url(#dk-light)"/>
    <rect y="440" width="960" height="100" fill="#170404"/>
    ${H(v, 'd_ladder', `${[60, 120].map(x => `<line x1="${x}" y1="0" x2="${x + 6}" y2="520" stroke="#4a1a14" stroke-width="6"/>`).join('')}${[...Array(10)].map((_, i) => `<line x1="60" y1="${30 + i * 50}" x2="126" y2="${30 + i * 50}" stroke="#4a1a14" stroke-width="5"/>`).join('')}${hit(40, 0, 110, 530)}`)}
    ${H(v, 'd_socket', `<line x1="480" y1="30" x2="480" y2="76" stroke="#3a0d0a" stroke-width="3"/><path d="M460 76 L500 76 L494 100 L466 100 Z" fill="#2a0a08"/><circle cx="480" cy="104" r="12" fill="#ff3b2a"/><circle cx="480" cy="104" r="40" fill="#ff3b2a" opacity=".18"/>${hit(452, 28, 56, 120)}`)}
    ${H(v, 'd_line', `<path d="M160 130 Q420 160 700 130" fill="none" stroke="#5a2a20" stroke-width="2"/>${[230, 330, 520, 620].map(x => `<rect x="${x - 4}" y="${136}" width="8" height="10" fill="#8a3a2a"/><rect x="${x - 22}" y="146" width="44" height="54" fill="#d9b5a5" opacity=".55"/>`).join('')}
      ${f.p4Taken ? '' : `<rect x="398" y="146" width="40" height="56" fill="#f0d6c8" opacity=".85"/>${[156, 164, 172, 180, 188].map(y => `<line x1="404" y1="${y}" x2="432" y2="${y}" stroke="#7a3a2a" stroke-width="1.5"/>`).join('')}`}${hit(150, 120, 560, 90)}`)}
    ${H(v, 'd_vent', `<rect x="820" y="40" width="90" height="50" fill="#050101"/><path d="M820 40 L910 40 L910 90 L850 90 Z" fill="#140404"/><path d="M850 90 L910 90 L895 70 Z" fill="#2a0806"/>${hit(814, 34, 102, 62)}`)}
    ${H(v, 'd_shelf', `<rect x="740" y="250" width="190" height="10" fill="#3a0d0a"/>
      ${G.BOTTLES.map((b, i) => `<rect x="${756 + i * 44}" y="196" width="28" height="54" rx="5" fill="#2a0a08" stroke="#5a1a14" stroke-width="2"/><rect x="${760 + i * 44}" y="186" width="20" height="12" rx="2" fill="${({ red: '#ff5a48', blue: '#7a8fc9', yellow: '#f0c95a', white: '#f4e6e0' })[b.id]}"/><text x="${770 + i * 44}" y="232" text-anchor="middle" font-size="12" fill="#e8b8a8">${b.name[0]}</text>`).join('')}
      <rect x="760" y="262" width="60" height="38" fill="#e8c8b8" opacity=".8" transform="rotate(-4 790 281)"/>${hit(736, 180, 198, 126)}`)}
    ${H(v, 'd_tray', `<rect x="230" y="320" width="460" height="16" fill="#3a0d0a"/><rect x="250" y="336" width="12" height="104" fill="#2a0806"/><rect x="658" y="336" width="12" height="104" fill="#2a0806"/>
      ${[270, 380, 490].map(x => `<rect x="${x}" y="302" width="90" height="18" rx="3" fill="#120303" stroke="#6a2018" stroke-width="2"/>`).join('')}
      <rect x="600" y="280" width="70" height="40" rx="3" fill="#0a0a0a" stroke="#5a1a14" stroke-width="2"/><text x="635" y="305" text-anchor="middle" font-size="10" fill="#c88">避光盒</text>${hit(226, 270, 470, 172)}`)}
    `;
  }

  const ROOM_ART = { foyer, study, greenhouse, observatory, darkroom };
  function scene(room, v) {
    return `<svg class="scene-svg" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc(G.rooms[room].name)}" font-family="'Noto Serif TC','Songti TC','PMingLiU',serif">${ROOM_ART[room](v)}</svg>`;
  }

  /* ------------------------------------------------------------
   * 謎題圖
   * ------------------------------------------------------------ */
  function miniConst(id, x, y, size) {
    const c = G.CONSTELLATIONS[id], k = size / 100;
    return `<g>${c.lines.map(([a, b]) => `<line x1="${x + c.stars[a][0] * k}" y1="${y + c.stars[a][1] * k}" x2="${x + c.stars[b][0] * k}" y2="${y + c.stars[b][1] * k}" stroke="#7a6a4a" stroke-width=".8"/>`).join('')}${c.stars.map(([sx, sy]) => `<circle cx="${x + sx * k}" cy="${y + sy * k}" r="1.3" fill="#2a2418"/>`).join('')}</g>`;
  }

  const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function poster() {
    const cell = (id, i) => {
      const c = G.CONSTELLATIONS[id];
      const x = 20 + (i % 4) * 160, y = 20 + Math.floor(i / 4) * 190, k = 1.1;
      return `<g><rect x="${x}" y="${y}" width="148" height="176" rx="4" fill="#efe6cf" stroke="#cbbd99"/>
        ${c.lines.map(([a, b]) => `<line x1="${x + 19 + c.stars[a][0] * k}" y1="${y + 14 + c.stars[a][1] * k}" x2="${x + 19 + c.stars[b][0] * k}" y2="${y + 14 + c.stars[b][1] * k}" stroke="#a8946a" stroke-width="1.4" stroke-dasharray="3 2"/>`).join('')}
        ${c.stars.map(([sx, sy]) => `<circle cx="${x + 19 + sx * k}" cy="${y + 14 + sy * k}" r="4" fill="#2b2418"/>`).join('')}
        <text x="${x + 74}" y="${y + 160}" text-anchor="middle" font-size="18" fill="#2b2418" font-weight="700">${c.name}<tspan font-size="13" font-weight="400" fill="#6b5a3a">　${NUM[c.stars.length]}星</tspan></text></g>`;
    };
    return `<svg viewBox="0 0 660 400" class="art" role="img" aria-label="手繪星座圖：八個星座">${G.CONSTELLATION_ORDER.map(cell).join('')}</svg>`;
  }

  // 真實天空中由高到低三個星座的位置（各自分在上、中、下三個高度帶，間距約 40px）
  const EYE_CENTERS = [[160, 86], [235, 194], [165, 300]];
  const EYE_SCALE = 0.66;
  // 地平線（以真實天空的座標畫在下方，整組旋轉 180° 後就出現在目鏡上方，成為倒掛的山稜與樹影）
  // 地面在最低星座（x 125–205）正下方是山谷，兩側是山丘；樹只長在山丘上，不會擋到星星
  const EYE_GROUND = 'M0 340 Q60 330 110 346 Q165 360 210 350 Q260 334 300 340 T400 330 L400 400 L0 400 Z';
  const EYE_TREES = [[92, 344, 6, 18], [108, 347, 7, 24], [232, 344, 9, 34], [252, 340, 7, 26], [272, 338, 11, 42], [296, 341, 8, 28]];
  const EYE_GROUND_CLEAR = 344; // 最低星座下方地面的最高點（真實座標）
  const eyeFlip = ([x, y]) => [400 - x, 400 - y];
  // 目鏡中每顆星的位置（已倒像）；與真實天空的座標一起回傳，供測試檢查
  function eyepieceStars(dir) {
    const half = 50 * EYE_SCALE;
    const out = [];
    G.SKY_FIELDS[dir].forEach((id, i) => {
      const [cx, cy] = EYE_CENTERS[i];
      for (const [sx, sy] of G.CONSTELLATIONS[id].stars) {
        const real = [cx - half + sx * EYE_SCALE, cy - half + sy * EYE_SCALE];
        const [x, y] = eyeFlip(real);
        out.push({ id, rank: i, x, y, realX: real[0], realY: real[1] });
      }
    });
    return out;
  }
  function eyepiece(dir) {
    const flip = eyeFlip;
    const half = 50 * EYE_SCALE;
    const boxes = EYE_CENTERS.map(([cx, cy]) => [cx - half - 8, cy - half - 8, cx + half + 8, cy + half + 8]);
    const stars = eyepieceStars(dir).map(({ x, y }) =>
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#fff6d8" opacity=".18"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="#fffaf0"/>`).join('');
    // 背景暗星：避開星座範圍與地面
    const r = rng(dir.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    let faint = '';
    for (let n = 0; n < 70; n++) {
      const x = 20 + r() * 360, y = 20 + r() * 360;
      const [fx, fy] = flip([x, y]);
      const rad = (0.5 + r() * 0.6).toFixed(2), op = (0.25 + r() * 0.3).toFixed(2);
      if (y > 326 || boxes.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) continue;
      faint += `<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="${rad}" fill="#c8cfe6" opacity="${op}"/>`;
    }
    const trees = EYE_TREES.map(([x, y, w, h]) => `<path d="M${x - w} ${y + 2} L${x} ${y - h} L${x + w} ${y + 2} Z"/><path d="M${x - w * 0.7} ${y - h * 0.45} L${x} ${y - h - 6} L${x + w * 0.7} ${y - h * 0.45} Z"/>`).join('');
    return `<svg viewBox="0 0 400 400" class="art eyepiece" role="img" aria-label="望遠鏡目鏡中的星空：三團明亮的星群上下排開；視野上方看得到倒掛的山稜與樹影">
      <defs><clipPath id="eye-clip"><circle cx="200" cy="200" r="180"/></clipPath>
      <radialGradient id="eye-bg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0d1430"/><stop offset="1" stop-color="#03050c"/></radialGradient>
      <linearGradient id="eye-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f86b8" stop-opacity="0"/><stop offset="1" stop-color="#8f86b8" stop-opacity=".32"/></linearGradient></defs>
      <rect width="400" height="400" fill="#000"/>
      <g clip-path="url(#eye-clip)"><rect width="400" height="400" fill="url(#eye-bg)"/>
        <g transform="rotate(180 200 200)"><rect x="0" y="286" width="400" height="74" fill="url(#eye-glow)"/></g>
        ${faint}${stars}
        <g transform="rotate(180 200 200)" fill="#04060b"><path d="${EYE_GROUND}" stroke="#3a4266" stroke-width="1.5"/>${trees}</g>
        <line x1="200" y1="20" x2="200" y2="380" stroke="#3a4a7a" stroke-width=".6" opacity=".5"/><line x1="20" y1="200" x2="380" y2="200" stroke="#3a4a7a" stroke-width=".6" opacity=".5"/></g>
      <circle cx="200" cy="200" r="182" fill="none" stroke="#a5783a" stroke-width="8"/><circle cx="200" cy="200" r="190" fill="none" stroke="#5a3d16" stroke-width="6"/>
    </svg>`;
  }

  function bookshelf() {
    const colorOf = { yellow: '#d8b546', blue: '#3f6fb0', green: '#4f8a5b', red: '#b5473f', brown: '#6b4a32' };
    const heights = [236, 224, 240, 230, 220, 238, 226, 234, 228];
    const books = G.BOOKS.map((b, i) => {
      const x = 24 + i * 66, h = heights[i], y = 270 - h, c = colorOf[b.color];
      const ink = b.color === 'yellow' ? '#3b2a10' : '#f3ecd6';
      return `<g><rect x="${x}" y="${y}" width="58" height="${h}" rx="3" fill="${c}"/>
        <rect x="${x}" y="${y + 16}" width="58" height="4" fill="#e3c27a" opacity=".7"/><rect x="${x}" y="${y + h - 22}" width="58" height="4" fill="#e3c27a" opacity=".7"/>
        <text x="${x + 29}" y="${y + 44}" text-anchor="middle" font-size="15" fill="${ink}" writing-mode="tb" letter-spacing="3">星空圖鑑</text>
        ${b.color === 'brown' ? '' : `<circle cx="${x + 29}" cy="${y + h - 96}" r="12" fill="#f3ecd6" stroke="${ink}" stroke-width="1"/><text x="${x + 29}" y="${y + h - 91.5}" text-anchor="middle" font-size="13" fill="#3b2a10">${({ yellow: '黃', blue: '藍', green: '綠', red: '紅' })[b.color]}</text>`}
        <rect x="${x + 6}" y="${y + h - 74}" width="46" height="44" rx="3" fill="#f3ecd6"/>
        <text x="${x + 29}" y="${y + h - 56}" text-anchor="middle" font-size="12" fill="#3b2a10">第</text>
        <text x="${x + 29}" y="${y + h - 36}" text-anchor="middle" font-size="19" font-weight="700" fill="#3b2a10">${b.vol}卷</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 640 300" class="art" role="img" aria-label="書架上的九卷《星空圖鑑》，由左到右：${G.BOOKS.map(b => ({ yellow: '黃', blue: '藍', green: '綠', red: '紅', brown: '棕' })[b.color] + '色第' + b.vol + '卷').join('、')}">
      <rect width="640" height="300" fill="#1a100a"/>${books}<rect x="0" y="270" width="640" height="30" fill="#4a2f1c"/></svg>`;
  }

  // 方格紙 / 膠片 / 疊合
  function gridSvg({ digits = true, stars = false }) {
    const cs = 64, ox = 40, oy = 40;
    let out = '';
    const cross = (x, y) => `<path d="M${x - 9} ${y} h18 M${x} ${y - 9} v18" stroke="#b5473f" stroke-width="2"/>`;
    if (digits) {
      out += `<rect x="${ox - 20}" y="${oy - 20}" width="${cs * 5 + 40}" height="${cs * 5 + 40}" fill="#f2ecdc"/>`;
      for (let r = 0; r <= 5; r++) out += `<line x1="${ox}" y1="${oy + r * cs}" x2="${ox + cs * 5}" y2="${oy + r * cs}" stroke="#9fb0c8" stroke-width="1.2"/><line x1="${ox + r * cs}" y1="${oy}" x2="${ox + r * cs}" y2="${oy + cs * 5}" stroke="#9fb0c8" stroke-width="1.2"/>`;
      G.GRID_DIGITS.forEach((row, r) => row.forEach((d, c) => {
        out += `<text x="${ox + c * cs + cs / 2}" y="${oy + r * cs + cs / 2 + 9}" text-anchor="middle" font-size="27" fill="#2b2418" font-family="'JetBrains Mono',monospace">${d}</text>`;
      }));
    } else {
      out += `<rect x="${ox - 20}" y="${oy - 20}" width="${cs * 5 + 40}" height="${cs * 5 + 40}" fill="#cfe0f0" opacity=".25" stroke="#9fb0c8" stroke-dasharray="4 4"/>`;
    }
    if (stars) {
      for (const st of G.TRANSPARENCY_STARS) {
        const x = ox + st.c * cs + cs / 2, y = oy + st.r * cs + cs / 2;
        const sx = x - 19, sy = y - 19; // 星星畫在格子左上角，不遮住數字
        out += `<path d="M${sx} ${sy - 8} L${sx + 2.5} ${sy - 2.5} L${sx + 8} ${sy} L${sx + 2.5} ${sy + 2.5} L${sx} ${sy + 8} L${sx - 2.5} ${sy + 2.5} L${sx - 8} ${sy} L${sx - 2.5} ${sy - 2.5} Z" fill="#2d4f8a" opacity=".9"/>`;
        if (st.mark) {
          out += `<circle cx="${x}" cy="${y}" r="26" fill="none" stroke="#2d4f8a" stroke-width="2.5"/>
            <circle cx="${x + 22}" cy="${y - 22}" r="11" fill="#2d4f8a"/><text x="${x + 22}" y="${y - 17.5}" text-anchor="middle" font-size="13" fill="#fff" font-weight="700">${st.mark}</text>`;
        }
      }
    }
    for (const [x, y] of [[ox - 8, oy - 8], [ox + cs * 5 + 8, oy - 8], [ox - 8, oy + cs * 5 + 8], [ox + cs * 5 + 8, oy + cs * 5 + 8]]) out += cross(x, y);
    const label = digits && stars ? '疊合的星圖' : digits ? '數字方格紙' : '星圖膠片';
    return `<svg viewBox="0 0 400 400" class="art" role="img" aria-label="${label}">${out}</svg>`;
  }

  // 撕開的便條：沿一道斜向的撕口分成左右兩半
  function note(which) {
    const lines = G.NOTE_LINES, n = lines.length;
    const lh = 34, top = 24, W = 440, H = top + n * lh + 16;
    const tearAt = i => 150 + i * 16;                                    // 第 i 行的撕口位置
    const by = k => top + k * lh;                                        // 第 k 條行界
    const tx = k => tearAt(k - 0.5) + (k % 2 ? 3 : -3);                  // 行界上的撕口（鋸齒）
    const tear = [];
    for (let k = 0; k <= n; k++) tear.push([tx(k), k === 0 ? 12 : k === n ? H - 8 : by(k)]);
    const leftPoly = [[16, 12], ...tear, [16, H - 8]].map(p => p.join(',')).join(' ');
    const rightPoly = [...tear, [W - 16, H - 8], [W - 16, 12]].map(p => p.join(',')).join(' ');
    const font = `font-size="21" fill="#2b2418" font-family="'LXGW WenKai TC','Kaiti TC','Noto Serif TC',serif"`;
    let out = '';
    if (which !== 'right') {
      out += `<polygon points="${leftPoly}" fill="#efe6cf"/>`;
      lines.forEach(([l], i) => { if (l) out += `<text x="${tearAt(i) - 8}" y="${by(i) + 26}" text-anchor="end" ${font}>${esc(l)}</text>`; });
    }
    if (which !== 'left') {
      out += `<g transform="translate(${which === 'full' ? 3 : 0} 0)"><polygon points="${rightPoly}" fill="#e9dfc4"/>`;
      lines.forEach(([, r], i) => { if (r) out += `<text x="${tearAt(i) + 8}" y="${by(i) + 26}" ${font}>${esc(r)}</text>`; });
      out += '</g>';
    }
    const maxTear = Math.max(...tear.map(p => p[0])), minTear = Math.min(...tear.map(p => p[0]));
    const vb = which === 'left' ? `0 0 ${maxTear + 16} ${H}` : which === 'right' ? `${minTear - 16} 0 ${W - minTear + 16} ${H}` : `0 0 ${W + 4} ${H}`;
    const label = { left: '便條左半：' + lines.map(l => l[0]).filter(Boolean).join('／'), right: '便條右半：' + lines.map(l => l[1]).filter(Boolean).join('／'), full: '拼好的便條' }[which];
    return `<svg viewBox="${vb}" class="art note-art note-${which}" role="img" aria-label="${esc(label)}">${out}</svg>`;
  }

  function plate() {
    const hand = `font-family="'LXGW WenKai TC','Kaiti TC','Noto Serif TC',serif"`;
    const mono = `font-family="'JetBrains Mono',ui-monospace,monospace"`;
    const cw = 18 * 0.6; // 等寬字一格的寬度
    return `<svg viewBox="0 0 400 430" class="art" role="img" aria-label="玻璃底片：群星之間一顆拖著短尾的彗星，片角刻著 1999.12.08 陸觀。紙套背面寫著：1999.12.08 22:40 東南方，赤經 5h27m，赤緯負十七度的 7 被劃掉，改成負十六度。">
      <defs><linearGradient id="pl-tail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffbe8" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></linearGradient></defs>
      <rect x="10" y="10" width="380" height="280" rx="6" fill="#0c0f16" stroke="#9aa6b8" stroke-width="3"/>
      ${starfield(77, 90, 20, 20, 360, 260)}
      <path d="M150 150 Q240 130 330 100 L334 112 Q244 146 152 158 Z" fill="url(#pl-tail)"/>
      <circle cx="150" cy="154" r="7" fill="#fffbe8"/><circle cx="150" cy="154" r="16" fill="#fffbe8" opacity=".25"/>
      <text x="374" y="280" text-anchor="end" font-size="13" fill="#c9cfdb" ${mono}>1999.12.08　陸觀</text>
      <rect x="10" y="302" width="380" height="120" rx="4" fill="#e9dfc4"/>
      <text x="26" y="326" font-size="13" fill="#6b5a3a">紙套背面（陸觀的筆跡）</text>
      <text x="26" y="354" font-size="18" fill="#2b2418" ${hand}>1999.12.08　22:40　東南方</text>
      <text x="26" y="382" font-size="18" fill="#2b2418" ${hand}>赤經</text><text x="72" y="382" font-size="18" fill="#2b2418" ${mono}>5h27m</text>
      <text x="26" y="410" font-size="18" fill="#2b2418" ${hand}>赤緯</text>
      <text x="72" y="410" font-size="18" fill="#2b2418" ${mono}>−1</text>
      <text x="${72 + cw * 2}" y="410" font-size="18" fill="#2b2418" ${mono}>7</text>
      <line x1="${70 + cw * 2}" y1="406" x2="${74 + cw * 3}" y2="400" stroke="#8a2a20" stroke-width="1.8"/>
      <text x="${78 + cw * 3}" y="410" font-size="18" fill="#2b2418" ${mono}>6°</text></svg>`;
  }

  // 灌溉管線圖
  // 每個閥門的管線走向（座標已核對：任兩條管線只在 CROSSINGS 處「跨越」，只在 dots 處「分岔」）
  const PIPE_ROUTES = {
    V5: { color: 'rain', vx: 70, segs: [[[70, 92], [70, 330]]] },
    V1: { color: 'rain', vx: 110, segs: [[[110, 92], [110, 230], [530, 230], [530, 330]], [[110, 230], [110, 330]]], dots: [[110, 230]] },
    V2: { color: 'rain', vx: 150, segs: [[[150, 92], [150, 200], [290, 200], [290, 330]]] },
    V3: { color: 'fert', vx: 500, segs: [[[500, 92], [500, 268], [170, 268], [170, 330]], [[320, 268], [320, 330]]], dots: [[320, 268]] },
    V4: { color: 'fert', vx: 548, segs: [[[548, 92], [548, 178], [350, 178], [350, 330]]] },
  };
  const CROSSINGS = [[290, 230], [350, 230], [500, 230], [290, 268], [350, 268], [500, 178]];
  function valvesSvg(open, water) {
    const col = { rain: '#5b8fc9', fert: '#b07a3a' };
    let pipes = '', valves = '';
    for (const v of G.VALVES) {
      const R = PIPE_ROUTES[v.id];
      for (const seg of R.segs) pipes += `<polyline points="${seg.map(p => p.join(',')).join(' ')}" fill="none" stroke="${col[R.color]}" stroke-width="7" stroke-linejoin="round" opacity="${open[v.id] ? 1 : 0.55}"/>`;
      for (const [x, y] of R.dots || []) pipes += `<circle cx="${x}" cy="${y}" r="7" fill="${col[R.color]}"/>`;
      const on = !!open[v.id];
      valves += `<g class="valve" data-valve="${v.id}" tabindex="0" role="switch" aria-checked="${on}" aria-label="閥門 ${v.id}：${on ? '開' : '關'}">
        <circle cx="${R.vx}" cy="140" r="17" fill="${on ? '#1f3a2a' : '#3a1f1c'}" stroke="${on ? '#7fc28f' : '#c96a5a'}" stroke-width="3"/>
        <text x="${R.vx}" y="145.5" text-anchor="middle" font-size="15" font-weight="700" fill="${on ? '#bfe8c8' : '#f0b8ae'}">${on ? '開' : '關'}</text>
        <text x="${R.vx}" y="112" text-anchor="middle" font-size="13" fill="#d8dee8" font-weight="700">${v.id}</text></g>`;
    }
    // 交叉處（不相連）畫成「跨越」的小拱
    const crossings = CROSSINGS;
    let hops = '';
    for (const [x, y] of crossings) hops += `<circle cx="${x}" cy="${y}" r="9" fill="#14181e"/>`;
    // 重畫垂直管線穿過交叉點，形成「上方跨越」效果
    let over = '';
    for (const v of G.VALVES) {
      const R = PIPE_ROUTES[v.id];
      for (const seg of R.segs) {
        for (let i = 0; i < seg.length - 1; i++) {
          const [[x1, y1], [x2, y2]] = [seg[i], seg[i + 1]];
          if (x1 === x2) for (const [cx, cy] of crossings) if (cx === x1 && cy > Math.min(y1, y2) && cy < Math.max(y1, y2)) {
            over += `<line x1="${cx}" y1="${cy - 12}" x2="${cx}" y2="${cy + 12}" stroke="${col[R.color]}" stroke-width="7" opacity="${open[v.id] ? 1 : 0.55}"/>`;
          }
        }
      }
    }
    const bed = (x, label, key) => `<rect x="${x}" y="330" width="140" height="44" rx="6" fill="#3a2a1a" stroke="${water ? '#6fae7d' : '#5a4630'}" stroke-width="2"/><text x="${x + 70}" y="358" text-anchor="middle" font-size="16" fill="#e6dcc4">${label}</text>`;
    return `<svg viewBox="0 0 640 400" class="art valves-art" role="group" aria-label="灌溉管線圖">
      <rect width="640" height="400" fill="#14181e"/>
      <rect x="40" y="16" width="140" height="76" rx="10" fill="#2f5277"/><text x="110" y="60" text-anchor="middle" font-size="18" fill="#e6eef6">雨水桶</text>
      <rect x="460" y="16" width="140" height="76" rx="10" fill="#6b4a26"/><text x="530" y="60" text-anchor="middle" font-size="18" fill="#f6e8d6">肥料桶</text>
      ${pipes}${hops}${over}
      ${bed(60, '月光花')}${bed(250, '蕨類')}${bed(460, '仙人掌')}
      ${valves}
      <g font-size="12" fill="#aab3c2"><rect x="232" y="20" width="14" height="6" fill="${col.rain}"/><text x="252" y="27">雨水管</text><rect x="232" y="38" width="14" height="6" fill="${col.fert}"/><text x="252" y="45">肥料水管</text>
        <path d="M230 60 h18 M239 60 v8" stroke="#aab3c2" stroke-width="3"/><circle cx="239" cy="60" r="4" fill="#aab3c2"/><text x="252" y="64">分岔：圓點處相連</text>
        <path d="M230 80 h5 M243 80 h5" stroke="#aab3c2" stroke-width="3"/><path d="M239 71 v18" stroke="#aab3c2" stroke-width="3"/><text x="252" y="84">跨越：斷開處不相連</text></g>
    </svg>`;
  }

  // 月光反光鏡
  function mirrorsSvg(cfg) {
    const g = G.MIRROR_GRID, cs = 64, ox = 40, oy = 60;
    const W = ox * 2 + g.cols * cs + 60, Hh = oy + g.rows * cs + 40;
    const tr = G.traceBeam(cfg);
    const center = ({ c, r }) => [ox + c * cs + cs / 2, oy + r * cs + cs / 2];
    const pts = tr.path.map((p, i) => {
      if (i === 0) return [ox + p.c * cs + cs / 2, oy - 40];
      const inside = p.c >= 0 && p.c < g.cols && p.r >= 0 && p.r < g.rows;
      if (inside) return center(p);
      const [x, y] = center(p);
      return [Math.max(ox - 20, Math.min(ox + g.cols * cs + (tr.hit ? 40 : 20), x)), Math.max(oy - 20, Math.min(oy + g.rows * cs + 20, y))];
    });
    let cells = '';
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) cells += `<rect x="${ox + c * cs}" y="${oy + r * cs}" width="${cs}" height="${cs}" fill="#101826" stroke="#1f2a3d"/>`;
    const blocks = g.blocks.map(b => { const [x, y] = center(b); return `<g><rect x="${x - 22}" y="${y - 22}" width="44" height="44" rx="6" fill="#4a3a2a"/><path d="M${x - 12} ${y + 10} q12 -30 24 0" fill="#4f7a4a"/></g>`; }).join('');
    const mirrors = g.mirrors.map(m => {
      const [x, y] = center(m);
      const d = (cfg && cfg[m.id]) || g.initial[m.id];
      const [x1, y1, x2, y2] = d === '/' ? [x - 22, y + 22, x + 22, y - 22] : [x - 22, y - 22, x + 22, y + 22];
      return `<g class="mirror" data-mirror="${m.id}" tabindex="0" role="button" aria-label="反光鏡 ${m.id}，目前「${d}」，點擊切換">
        <rect x="${x - cs / 2 + 3}" y="${y - cs / 2 + 3}" width="${cs - 6}" height="${cs - 6}" rx="8" fill="#1a2436" stroke="#3a4a66"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d7e4ef" stroke-width="6" stroke-linecap="round"/>
        <text x="${x - cs / 2 + 7}" y="${y + 4.5}" font-size="12" font-weight="700" fill="#b9c8de">${m.id}</text></g>`;
    }).join('');
    const fx = ox + g.cols * cs + 30, fy = oy + g.target.r * cs + cs / 2;
    return `<svg viewBox="0 0 ${W} ${Hh}" class="art mirrors-art" role="group" aria-label="反光鏡格子">
      <rect width="${W}" height="${Hh}" fill="#0a0f1a"/>
      ${cells}
      <rect x="${ox + g.entry.c * cs + 8}" y="${oy - 46}" width="${cs - 16}" height="20" rx="4" fill="#cfe0ff" opacity=".85"/><text x="${ox + g.entry.c * cs + cs / 2}" y="${oy - 50}" text-anchor="middle" font-size="12" fill="#cfe0ff">天窗</text>
      ${blocks}
      <polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#f3f6ff" stroke-width="10" opacity=".18" stroke-linejoin="round"/>
      <polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#f3f6ff" stroke-width="3" stroke-linejoin="round"/>
      ${mirrors}
      <g>${tr.hit ? `<circle cx="${fx}" cy="${fy}" r="30" fill="#ffffff" opacity=".25"/>` : ''}${[0, 72, 144, 216, 288].map(a => `<ellipse cx="${fx}" cy="${fy - 12}" rx="6" ry="12" fill="${tr.hit ? '#ffffff' : '#c9d4c0'}" transform="rotate(${a} ${fx} ${fy})"/>`).join('')}<circle cx="${fx}" cy="${fy}" r="5" fill="#e8e2a8"/>
        <text x="${fx}" y="${fy + 34}" text-anchor="middle" font-size="12" fill="#c9d4c0">月光花</text></g>
    </svg>`;
  }

  function clockSvg(h, m) {
    let ticks = '';
    for (let i = 1; i <= 12; i++) {
      const a = i * 30 * Math.PI / 180;
      ticks += `<text x="${(150 + Math.sin(a) * 100).toFixed(1)}" y="${(150 - Math.cos(a) * 100 + 8).toFixed(1)}" text-anchor="middle" font-size="22" fill="#2b2418">${i}</text>`;
    }
    for (let i = 0; i < 60; i++) {
      const a = i * 6 * Math.PI / 180, r1 = i % 5 ? 120 : 114;
      ticks += `<line x1="${(150 + Math.sin(a) * r1).toFixed(1)}" y1="${(150 - Math.cos(a) * r1).toFixed(1)}" x2="${(150 + Math.sin(a) * 126).toFixed(1)}" y2="${(150 - Math.cos(a) * 126).toFixed(1)}" stroke="#2b2418" stroke-width="${i % 5 ? 1 : 2.5}"/>`;
    }
    const ha = ((h % 12) + m / 60) * 30 * Math.PI / 180, ma = m * 6 * Math.PI / 180;
    return `<svg viewBox="0 0 300 300" class="art clock-art" role="img" aria-label="落地鐘鐘面：${h} 點 ${m} 分">
      <circle cx="150" cy="150" r="140" fill="#8a6a32"/><circle cx="150" cy="150" r="130" fill="#efe4c8"/>${ticks}
      <line x1="150" y1="150" x2="${(150 + Math.sin(ha) * 62).toFixed(1)}" y2="${(150 - Math.cos(ha) * 62).toFixed(1)}" stroke="#1b1408" stroke-width="7" stroke-linecap="round"/>
      <line x1="150" y1="150" x2="${(150 + Math.sin(ma) * 98).toFixed(1)}" y2="${(150 - Math.cos(ma) * 98).toFixed(1)}" stroke="#1b1408" stroke-width="4" stroke-linecap="round"/>
      <circle cx="150" cy="150" r="7" fill="#1b1408"/></svg>`;
  }

  function dialSvg(sel) {
    const ring = (r, id, label) => `<circle cx="150" cy="150" r="${r}" fill="none" stroke="#6b4a1e" stroke-width="30" opacity=".35"/>
      <text x="150" y="${150 - r + 7}" text-anchor="middle" font-size="20" font-weight="700" fill="#2b1a08">${G.CONSTELLATIONS[id].name}</text>
      <text x="${150 + r * 0.72}" y="${150 + r * 0.72}" text-anchor="middle" font-size="10" fill="#5a3d16">${label}</text>`;
    return `<svg viewBox="0 -18 300 318" class="art dial-art" role="img" aria-label="星盤：外環${G.CONSTELLATIONS[sel[0]].name}、中環${G.CONSTELLATIONS[sel[1]].name}、內環${G.CONSTELLATIONS[sel[2]].name}">
      <circle cx="150" cy="150" r="146" fill="#c9a24f"/><circle cx="150" cy="150" r="140" fill="#dcbc72"/>
      ${ring(118, sel[0], '外環')}${ring(80, sel[1], '中環')}${ring(42, sel[2], '內環')}
      <circle cx="150" cy="150" r="14" fill="#6b4a1e"/>
      <line x1="150" y1="16" x2="150" y2="150" stroke="#7a1c14" stroke-width="1" stroke-dasharray="3 4" opacity=".45"/>
      <path d="M150 1 l-10 -16 h20 z" fill="#7a1c14" stroke="#f3d68f" stroke-width="1"/></svg>`;
  }

  function bottleSvg(b) {
    const cap = { red: '#d94a3a', blue: '#4f6fc0', yellow: '#e6b93a', white: '#f2ece6' }[b.id];
    return `<svg viewBox="0 0 60 100" class="bottle" aria-hidden="true"><rect x="12" y="24" width="36" height="70" rx="8" fill="#3a1a14" stroke="#6a2a20" stroke-width="2"/><rect x="18" y="8" width="24" height="18" rx="3" fill="${cap}" stroke="#2a0a08"/></svg>`;
  }

  root.Art = { scene, poster, eyepiece, eyepieceStars, EYE_GROUND_CLEAR, bookshelf, gridSvg, note, plate, valvesSvg, mirrorsSvg, clockSvg, dialSvg, bottleSvg, esc };
}(typeof self !== 'undefined' ? self : this));
