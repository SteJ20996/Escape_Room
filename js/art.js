/*
 * 觀星者之屋 The Stargazer's House — 美術（全部為內嵌 SVG，不依賴任何外部圖檔）
 * 房間場景：Art.scene(roomId, view) → SVG 字串；熱點以 <g class="hs" data-hs="…"> 包起來。
 * 謎題圖：書架、星座圖、目鏡、管線、反光鏡、時鐘、方格紙、膠片、便條、底片……
 * 物品圖示：Art.icon(itemId)。
 * 圖中的文字依 Art.setLang('zh' | 'en') 切換語言。熱點的位置與大小兩種語言完全相同。
 */
(function (root) {
  'use strict';
  const G = root.GAME_DATA;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const L = (zh, en) => ({ zh, en });
  let LANG = 'zh';
  const t = x => (x == null ? '' : typeof x === 'object' ? (x[LANG] != null ? x[LANG] : x.zh) : String(x));
  const isEn = () => LANG === 'en';

  // 確定性亂數（讓星空與紋理每次長得一樣）
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
  const pts = arr => arr.map(p => p.map(v => (+v).toFixed(1)).join(',')).join(' ');

  // 透視地板：從消失點放射的棋盤格
  function perspectiveTiles(y0, y1, vpx, vpy, n, colA, colB, rows) {
    const xAt = (xb, y) => vpx + (xb - vpx) * (y - vpy) / (y1 - vpy);
    let out = '';
    for (let r = 0; r < rows.length - 1; r++) {
      const ya = rows[r], yb = rows[r + 1];
      for (let j = 0; j < n; j++) {
        const xb0 = -480 + j * 1920 / n, xb1 = xb0 + 1920 / n;
        out += `<polygon points="${pts([[xAt(xb0, ya), ya], [xAt(xb1, ya), ya], [xAt(xb1, yb), yb], [xAt(xb0, yb), yb]])}" fill="${(r + j) % 2 ? colA : colB}"/>`;
      }
    }
    return out;
  }
  // 透視木地板：放射狀的木板縫
  function perspectivePlanks(y0, y1, vpx, vpy, n, stroke) {
    const xAt = (xb, y) => vpx + (xb - vpx) * (y - vpy) / (y1 - vpy);
    let out = '';
    for (let j = 0; j <= n; j++) {
      const xb = -480 + j * 1920 / n;
      out += `<line x1="${xAt(xb, y0).toFixed(1)}" y1="${y0}" x2="${xb.toFixed(1)}" y2="${y1}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    return out;
  }

  // 日、月、星的小圖樣（門上的凹槽、狀態列、徽章圖示共用）
  function emblemGlyph(kind, cx, cy, r, color) {
    if (kind === 'emblem_sun') {
      let rays = '';
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        rays += `<line x1="${(cx + Math.cos(a) * r * 0.62).toFixed(1)}" y1="${(cy + Math.sin(a) * r * 0.62).toFixed(1)}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}" stroke="${color}" stroke-width="${(r * 0.16).toFixed(2)}" stroke-linecap="round"/>`;
      }
      return `<circle cx="${cx}" cy="${cy}" r="${(r * 0.42).toFixed(2)}" fill="${color}"/>${rays}`;
    }
    if (kind === 'emblem_moon') {
      return `<path d="M${cx + r * 0.3} ${cy - r * 0.9} A${r * 0.92} ${r * 0.92} 0 1 0 ${cx + r * 0.3} ${cy + r * 0.9} A${r * 0.7} ${r * 0.7} 0 1 1 ${cx + r * 0.3} ${cy - r * 0.9} Z" fill="${color}"/>`;
    }
    const p = [];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 8, rr = i % 2 ? r * 0.42 : r;
      p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return `<polygon points="${pts(p)}" fill="${color}"/>`;
  }

  /* ------------------------------------------------------------
   * 房間場景
   * v = { s, vis(id), label(id) }   label 已經是目前語言的字串
   * ------------------------------------------------------------ */
  function H(v, id, inner) {
    if (!v.vis(id)) return '';
    const name = esc(v.label(id));
    return `<g class="hs" data-hs="${id}" tabindex="0" role="button" aria-label="${name}"><title>${name}</title>${inner}</g>`;
  }
  const hit = (x, y, w, h) => `<rect class="hit" x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent"/>`;
  const shadow = (cx, cy, rx, ry, op = 0.4) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="${op}"/>`;
  // 門牌寬度隨文字長度調整（中文字約 13px、英文字約 7px）
  const plaqueW = label => Math.max(68, [...label].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? 13 : 7), 0) + 16);
  const exitPlaque = (x, y, label) => { const w = plaqueW(label); return `<rect x="${x - w / 2}" y="${y - 13}" width="${w}" height="20" rx="3" fill="#2a1a0f" stroke="#8a6a32"/><text x="${x}" y="${y + 2}" text-anchor="middle" font-size="12" fill="#e3c27a">${esc(label)}</text>`; };

  function clockHands(cx, cy, r, h, m) {
    const ha = ((h % 12) + m / 60) * 30 * Math.PI / 180, ma = m * 6 * Math.PI / 180;
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.sin(ha) * r * 0.5).toFixed(1)}" y2="${(cy - Math.cos(ha) * r * 0.5).toFixed(1)}" stroke="#1b1408" stroke-width="2.6" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${(cx + Math.sin(ma) * r * 0.8).toFixed(1)}" y2="${(cy - Math.cos(ma) * r * 0.8).toFixed(1)}" stroke="#1b1408" stroke-width="1.6" stroke-linecap="round"/>`;
  }

  /* ---------------- 門廳 ---------------- */
  function foyer(v) {
    const f = v.s.flags;
    const open = G.allInserted(v.s);
    const socket = (x, e) => {
      const on = f['inserted_' + e];
      return `<circle cx="${x}" cy="262" r="11" fill="${on ? 'url(#fy-brass)' : '#120c06'}" stroke="${on ? '#f3d68f' : '#8a6a32'}" stroke-width="1.4"/>${emblemGlyph(e, x, 262, 6.5, on ? '#3b2a10' : '#7a5a2a')}`;
    };
    const fan = [...Array(7)].map((_, i) => { const a = Math.PI + (i + 1) * Math.PI / 8; return `<line x1="480" y1="196" x2="${(480 + Math.cos(a) * 64).toFixed(1)}" y2="${(196 + Math.sin(a) * 64).toFixed(1)}" stroke="#5a3d1e" stroke-width="2"/>`; }).join('');
    const crystals = [438, 452, 466, 480, 494, 508, 522].map((x, i) => `<path d="M${x} ${66 + (i % 2) * 6} l3 6 l-3 7 l-3 -7 z" fill="#cfd8ec" opacity=".55"/>`).join('');
    const balusters = [...Array(7)].map((_, i) => { const x = 812 + i * 20, top = 246 - i * 24; return `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + 48}" stroke="#4a3220" stroke-width="3"/>`; }).join('');
    return `
    <defs>
      <linearGradient id="fy-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101729"/><stop offset="1" stop-color="#1d2740"/></linearGradient>
      <pattern id="fy-damask" width="48" height="56" patternUnits="userSpaceOnUse"><path d="M24 8 C31 18 31 27 24 34 C17 27 17 18 24 8 Z M0 36 C6 44 6 50 0 56 M48 36 C42 44 42 50 48 56" fill="#c8d2f0" opacity=".045"/><circle cx="24" cy="44" r="2" fill="#c8d2f0" opacity=".05"/></pattern>
      <linearGradient id="fy-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3b2516"/><stop offset=".5" stop-color="#4f3320"/><stop offset="1" stop-color="#34200f"/></linearGradient>
      <radialGradient id="fy-brass" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#f6dc95"/><stop offset="1" stop-color="#a87b2e"/></radialGradient>
      <radialGradient id="fy-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9c77a" stop-opacity=".4"/><stop offset="1" stop-color="#e9c77a" stop-opacity="0"/></radialGradient>
      <linearGradient id="fy-moon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d6ff" stop-opacity=".16"/><stop offset="1" stop-color="#c9d6ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="fy-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>
      <linearGradient id="fy-ghglass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f7a58"/><stop offset="1" stop-color="#1c3a2a"/></linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#fy-wall)"/>
    <rect y="14" width="960" height="286" fill="url(#fy-damask)"/>
    <rect width="960" height="14" fill="#242d47"/><rect y="14" width="960" height="2" fill="#8a6a32" opacity=".6"/>
    <rect y="296" width="960" height="124" fill="#1f2a44" opacity=".6"/><rect y="294" width="960" height="4" fill="#3a2a1a"/>
    ${[60, 180, 600, 720].map(x => `<rect x="${x}" y="312" width="100" height="94" fill="none" stroke="#2c3a5c" stroke-width="2"/><rect x="${x + 6}" y="318" width="88" height="82" fill="none" stroke="#151d33" stroke-width="1"/>`).join('')}
    <!-- 大理石地板 -->
    ${perspectiveTiles(420, 540, 480, 250, 24, '#211a14', '#2c241c', [420, 434, 452, 476, 506, 546])}
    <rect y="420" width="960" height="120" fill="url(#fy-gloss)"/>
    <rect y="418" width="960" height="4" fill="#3a2a1a"/>
    <!-- 月光從高窗灑下 -->
    <polygon points="595,170 655,170 610,540 470,540" fill="url(#fy-moon)"/>
    <ellipse cx="540" cy="512" rx="78" ry="16" fill="#c9d6ff" opacity=".06"/>
    <!-- 地毯 -->
    <ellipse cx="480" cy="480" rx="196" ry="42" fill="#3f181d"/><ellipse cx="480" cy="480" rx="178" ry="34" fill="none" stroke="#a5783a" stroke-width="2" stroke-dasharray="6 5"/>
    <ellipse cx="480" cy="480" rx="150" ry="26" fill="#4d1f25"/><path d="M480 462 l28 18 l-28 18 l-28 -18 z" fill="none" stroke="#a5783a" stroke-width="1.5"/><path d="M480 470 l14 10 l-14 10 l-14 -10 z" fill="#7a3a2a"/>
    <!-- 吊燈 -->
    <line x1="480" y1="0" x2="480" y2="36" stroke="#6b5530" stroke-width="2"/>
    <path d="M424 58 Q480 92 536 58 M440 52 Q480 74 520 52" fill="none" stroke="#8a6a32" stroke-width="3"/>
    <circle cx="480" cy="40" r="6" fill="url(#fy-brass)"/>
    ${[424, 452, 480, 508, 536].map(x => `<rect x="${x - 3}" y="${x === 480 ? 44 : 48}" width="6" height="12" fill="#d8ccb0" opacity=".55"/><line x1="${x}" y1="${x === 480 ? 44 : 48}" x2="${x}" y2="${x === 480 ? 40 : 44}" stroke="#2a2418" stroke-width="1.5"/>`).join('')}
    ${crystals}
    <!-- 壁燈 -->
    ${[372, 588].map(x => `<path d="M${x} 230 q-10 10 -2 20 h4 q8 -10 -2 -20" fill="url(#fy-brass)" opacity=".8"/><rect x="${x - 3}" y="214" width="6" height="16" fill="#d8ccb0" opacity=".5"/>`).join('')}
    <!-- 高窗 -->
    ${H(v, 'f_window', `<rect x="595" y="80" width="60" height="90" fill="#0a1020" stroke="#4a3a24" stroke-width="5"/>
      <circle cx="635" cy="104" r="12" fill="#e9e3cc" opacity=".12"/><circle cx="635" cy="104" r="9" fill="#e9e3cc" opacity=".9"/>${starfield(11, 6, 600, 85, 50, 80)}
      ${[607, 619, 631, 643].map(x => `<line x1="${x}" y1="82" x2="${x}" y2="168" stroke="#2a2a2e" stroke-width="3"/>`).join('')}<rect x="590" y="170" width="70" height="6" fill="#3a2a1a"/>${hit(590, 75, 70, 100)}`)}
    <!-- 衣帽架 -->
    ${shadow(85, 418, 34, 5)}
    ${H(v, 'f_coat', `<line x1="85" y1="150" x2="85" y2="415" stroke="#4a2f1c" stroke-width="7"/>
      <path d="M60 415 L85 395 L110 415" fill="none" stroke="#4a2f1c" stroke-width="6"/>
      <path d="M68 160 L85 150 L102 160" fill="none" stroke="#8a6a32" stroke-width="3"/>
      <ellipse cx="85" cy="148" rx="20" ry="5" fill="#1d1d22"/><path d="M73 148 q12 -22 24 0 z" fill="#26262c"/>
      <path d="M62 175 Q85 160 108 175 L114 330 Q85 342 56 330 Z" fill="#2f4334"/>
      <path d="M72 172 L85 196 L98 172" fill="none" stroke="#22322a" stroke-width="3"/>
      <path d="M85 196 L85 330" stroke="#22322a" stroke-width="2"/>${[214, 240, 266].map(y => `<circle cx="80" cy="${y}" r="2" fill="#a5783a"/>`).join('')}
      <rect x="92" y="250" width="16" height="22" rx="3" fill="#263a2c"/>${hit(50, 120, 70, 300)}`)}
    ${H(v, 'f_umbrella', `<rect x="118" y="372" width="26" height="46" rx="4" fill="#3c4660"/><rect x="118" y="380" width="26" height="3" fill="#5a6788"/><line x1="128" y1="372" x2="124" y2="320" stroke="#161616" stroke-width="3"/><path d="M118 336 Q124 300 134 336 Z" fill="#161616"/><circle cx="131" cy="420" r="1.6" fill="#7fa0d0" opacity=".7"/>${hit(112, 315, 38, 105)}`)}
    <!-- 落地鐘 -->
    ${shadow(185, 418, 44, 6)}
    ${H(v, 'f_clock', `<path d="M146 136 Q185 100 224 136 L220 205 L150 205 Z" fill="url(#fy-wood)"/><circle cx="185" cy="108" r="5" fill="url(#fy-brass)"/>
      <circle cx="185" cy="168" r="27" fill="#a5783a"/><circle cx="185" cy="168" r="24" fill="#efe4c8"/>
      ${[...Array(12)].map((_, i) => { const a = i * 30 * Math.PI / 180; return `<circle cx="${(185 + Math.sin(a) * 19.5).toFixed(1)}" cy="${(168 - Math.cos(a) * 19.5).toFixed(1)}" r="1.3" fill="#3b2a10"/>`; }).join('')}
      ${f.clockSolved ? clockHands(185, 168, 24, 3, 15) : clockHands(185, 168, 24, 7, 40)}
      <path d="M170 152 q8 -8 20 -6" stroke="#fff" stroke-width="2" opacity=".35" fill="none"/>
      <rect x="156" y="205" width="58" height="190" fill="url(#fy-wood)"/><rect x="156" y="205" width="6" height="190" fill="#000" opacity=".2"/>
      <rect x="168" y="225" width="34" height="120" rx="3" fill="${f.clockSolved ? '#0d0805' : '#1b120a'}" stroke="#a5783a" stroke-width="2"/>
      ${f.clockSolved ? '' : `<line x1="185" y1="228" x2="185" y2="320" stroke="#a5783a" stroke-width="2"/><circle cx="185" cy="322" r="9" fill="url(#fy-brass)"/>`}
      <rect x="150" y="395" width="70" height="22" fill="#2e1c10"/>${hit(145, 100, 80, 320)}`)}
    <!-- 書房門 -->
    ${H(v, 'f_study_door', `<rect x="250" y="180" width="92" height="240" fill="#2b1a0f" stroke="#5a3d22" stroke-width="5"/>
      <polygon points="255,185 330,195 330,415 255,415" fill="url(#fy-wood)"/>
      <rect x="265" y="230" width="52" height="70" fill="none" stroke="#2a190c" stroke-width="2"/><rect x="265" y="315" width="52" height="88" fill="none" stroke="#2a190c" stroke-width="2"/>
      <rect x="335" y="185" width="5" height="230" fill="#e9c77a" opacity=".6"/><polygon points="340,420 380,540 352,540 336,420" fill="#e9c77a" opacity=".07"/>
      <circle cx="318" cy="305" r="4.5" fill="url(#fy-brass)"/>
      ${exitPlaque(292, 206, t(G.rooms.study.name))}${hit(245, 175, 102, 250)}`)}
    <!-- 大門 -->
    ${shadow(480, 422, 110, 8, 0.5)}
    ${H(v, 'f_door', `<path d="M386 422 L386 188 Q480 92 574 188 L574 422 Z" fill="#20140b" stroke="#6b4b26" stroke-width="6"/>
      <path d="M402 418 L402 194 Q480 116 558 194 L558 418 Z" fill="url(#fy-wood)"/>
      <path d="M414 196 Q480 130 546 196 Z" fill="#16223c"/>${fan}<path d="M414 196 Q480 130 546 196" fill="none" stroke="#5a3d1e" stroke-width="3"/>
      <line x1="402" y1="198" x2="558" y2="198" stroke="#2a190c" stroke-width="4"/>
      <line x1="480" y1="198" x2="480" y2="418" stroke="#22140a" stroke-width="3"/>
      ${[[412, 206, 58, 34], [490, 206, 58, 34], [412, 290, 58, 112], [490, 290, 58, 112]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#2a190c" stroke-width="3"/><line x1="${x + 2}" y1="${y + 2}" x2="${x + w - 2}" y2="${y + 2}" stroke="#7a5236" stroke-width="1"/>`).join('')}
      ${[[400, 230], [400, 370], [556, 230], [556, 370]].map(([x, y]) => `<rect x="${x - 4}" y="${y}" width="8" height="18" rx="2" fill="url(#fy-brass)"/>`).join('')}
      <circle cx="466" cy="320" r="5" fill="url(#fy-brass)"/><circle cx="494" cy="320" r="5" fill="url(#fy-brass)"/>
      <rect x="432" y="244" width="96" height="36" rx="8" fill="#7a5a26" stroke="#e3c27a" stroke-width="1.5"/>
      ${socket(452, 'emblem_sun')}${socket(480, 'emblem_moon')}${socket(508, 'emblem_star')}
      ${open ? `<path d="M402 418 L402 194 Q480 116 558 194 L558 418 Z" fill="url(#fy-glow)"/>` : ''}${hit(386, 110, 188, 310)}`)}
    ${H(v, 'f_mailslot', `<rect x="452" y="358" width="56" height="12" rx="2" fill="#a87b2e" stroke="#f3d68f" stroke-width="1"/><rect x="458" y="362" width="44" height="4" fill="#1a1006"/>${hit(446, 350, 68, 26)}`)}
    <!-- 電話桌 -->
    ${shadow(620, 419, 40, 4)}
    <rect x="583" y="366" width="74" height="10" rx="2" fill="#4a2f1c"/><rect x="590" y="376" width="60" height="12" fill="#3a2414"/><circle cx="620" cy="382" r="2" fill="#a5783a"/>
    <line x1="592" y1="388" x2="590" y2="418" stroke="#4a2f1c" stroke-width="5"/><line x1="648" y1="388" x2="650" y2="418" stroke="#4a2f1c" stroke-width="5"/>
    ${H(v, 'f_phone', `<path d="M596 366 L600 344 L640 344 L644 366 Z" fill="#141414"/><circle cx="620" cy="355" r="8" fill="#2a2a2a" stroke="#888" stroke-width="1"/>${[...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return `<circle cx="${(620 + Math.cos(a) * 5).toFixed(1)}" cy="${(355 + Math.sin(a) * 5).toFixed(1)}" r="1" fill="#777"/>`; }).join('')}
      <path d="M598 340 Q620 326 642 340" fill="none" stroke="#141414" stroke-width="7" stroke-linecap="round"/><path d="M644 352 q14 4 10 18 q-4 10 6 14" fill="none" stroke="#141414" stroke-width="1.5"/>
      ${f.phoneRinging ? `<g class="ring"><path d="M584 334 q-8 -10 0 -20" fill="none" stroke="#e3c27a" stroke-width="2"/><path d="M576 338 q-12 -14 0 -28" fill="none" stroke="#e3c27a" stroke-width="2" opacity=".6"/><path d="M656 334 q8 -10 0 -20" fill="none" stroke="#e3c27a" stroke-width="2"/><path d="M664 338 q12 -14 0 -28" fill="none" stroke="#e3c27a" stroke-width="2" opacity=".6"/></g>` : ''}${hit(570, 318, 100, 54)}`)}
    <!-- 溫室門 -->
    ${H(v, 'f_gh_door', `<rect x="670" y="180" width="86" height="240" fill="#1a2b22" stroke="#5a3d22" stroke-width="5"/>
      <rect x="678" y="188" width="70" height="225" fill="url(#fy-ghglass)" opacity="${f.greenhouseOpen ? 1 : 0.75}"/>
      <path d="M684 230 q14 -26 28 0 q-14 10 -28 0 M700 300 q12 -30 30 -4 q-14 12 -30 4 M690 380 q16 -24 30 2 q-16 8 -30 -2" fill="#0f2418" opacity=".7"/>
      <line x1="713" y1="188" x2="713" y2="413" stroke="#5a3d22" stroke-width="3"/>
      ${[245, 300, 355].map(y => `<line x1="678" y1="${y}" x2="748" y2="${y}" stroke="#5a3d22" stroke-width="3"/>`).join('')}
      <path d="M684 196 l18 0 l-30 60 z" fill="#fff" opacity=".05"/>
      <circle cx="742" cy="305" r="4.5" fill="url(#fy-brass)"/>
      ${f.greenhouseOpen ? `<polygon points="756,420 800,540 770,540 750,420" fill="#7fc79a" opacity=".06"/>` : `<path d="M738 318 q4 -10 8 0 q-4 4 -8 0" fill="#a5783a"/>`}${hit(665, 175, 96, 250)}`)}
    <!-- 樓梯與鐵門 -->
    <polygon points="780,420 960,420 960,120 900,120" fill="#2a1d12"/>
    ${[...Array(8)].map((_, i) => `<line x1="${790 + i * 21}" y1="${420 - i * 37}" x2="960" y2="${420 - i * 37}" stroke="#4a3220" stroke-width="3"/><line x1="${792 + i * 21}" y1="${417 - i * 37}" x2="960" y2="${417 - i * 37}" stroke="#6b4a2c" stroke-width="1" opacity=".6"/>`).join('')}
    ${balusters}
    <line x1="800" y1="260" x2="950" y2="80" stroke="#5a3d22" stroke-width="7"/><line x1="800" y1="257" x2="950" y2="77" stroke="#8a6a32" stroke-width="1.5" opacity=".6"/>
    ${H(v, 'f_hatch', f.atticOpen
      ? `<path d="M864 18 L950 18 L942 46 L872 46 Z" fill="#05060a" stroke="#4a3220" stroke-width="3"/>
        <g stroke="#6b4a2c" stroke-width="4"><line x1="884" y1="46" x2="866" y2="190"/><line x1="932" y1="46" x2="914" y2="190"/></g>
        ${[0, 1, 2, 3, 4, 5].map(i => `<line x1="${880 - i * 3}" y1="${70 + i * 22}" x2="${928 - i * 3}" y2="${70 + i * 22}" stroke="#6b4a2c" stroke-width="3"/>`).join('')}
        ${exitPlaque(905, 104, '↑ ' + t(G.rooms.attic.name))}${hit(856, 12, 100, 184)}`
      : `<path d="M864 18 L950 18 L942 44 L872 44 Z" fill="#2a1d12" stroke="#4a3220" stroke-width="3"/><path d="M880 22 L934 22" stroke="#4a3220" stroke-width="2"/>
        <line x1="907" y1="44" x2="907" y2="56" stroke="#8a8f99" stroke-width="2"/><circle cx="907" cy="63" r="7" fill="none" stroke="#a9b2bc" stroke-width="2.5"/>${hit(856, 12, 100, 62)}`)}
    ${H(v, 'f_gate', f.gateOpen
      ? `<g opacity=".9">${[0, 1, 2, 3, 4].map(i => `<line x1="${788 + i * 6}" y1="${250 + i * 2}" x2="${788 + i * 6}" y2="${420 - i * 2}" stroke="#2a2a2e" stroke-width="4"/>`).join('')}</g>${exitPlaque(870, 296, '↑ ' + t(G.rooms.observatory.name))}${hit(780, 240, 140, 182)}`
      : `<rect x="785" y="245" width="110" height="175" fill="none" stroke="#2a2a2e" stroke-width="5"/>
        ${[...Array(9)].map((_, i) => `<line x1="${797 + i * 12}" y1="245" x2="${797 + i * 12}" y2="420" stroke="#34343a" stroke-width="4"/><circle cx="${797 + i * 12}" cy="243" r="3" fill="#34343a"/>`).join('')}
        <rect x="826" y="318" width="26" height="22" rx="4" fill="url(#fy-brass)"/><path d="M831 318 v-8 a8 8 0 0 1 16 0 v8" fill="none" stroke="#c9a24f" stroke-width="3"/><circle cx="839" cy="328" r="2.5" fill="#3b2a10"/>${hit(780, 240, 120, 182)}`)}
    `;
  }

  /* ---------------- 書房 ---------------- */
  function study(v) {
    const f = v.s.flags;
    const shelfBooks = (y, seed, h0) => {
      const r = rng(seed); let x = 52, out = '';
      while (x < 285) {
        const w = 12 + Math.floor(r() * 10), h = h0 - Math.floor(r() * 16);
        const c = ['#5b3a2a', '#3e4a5e', '#5d5236', '#3f2c22', '#4e3b46', '#2f4136'][Math.floor(r() * 6)];
        out += `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${c}"/><rect x="${x}" y="${y - h + 6}" width="${w}" height="2" fill="#e3c27a" opacity=".25"/>`;
        x += w + 2;
      }
      return out;
    };
    const colorOf = { yellow: '#d8b546', blue: '#3f6fb0', green: '#4f8a5b', red: '#b5473f', brown: '#6b4a32' };
    const vols = G.BOOKS.map((b, i) => `<rect x="${54 + i * 26}" y="206" width="22" height="62" fill="${colorOf[b.color]}"/><rect x="${54 + i * 26}" y="214" width="22" height="3" fill="#e3c27a" opacity=".6"/><rect x="${54 + i * 26}" y="206" width="3" height="62" fill="#000" opacity=".15"/>`).join('');
    return `
    <defs>
      <linearGradient id="st-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121e1c"/><stop offset="1" stop-color="#1c2e2a"/></linearGradient>
      <linearGradient id="st-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22170f"/><stop offset="1" stop-color="#3a2717"/></linearGradient>
      <radialGradient id="st-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f2d590" stop-opacity=".42"/><stop offset="1" stop-color="#f2d590" stop-opacity="0"/></radialGradient>
      <linearGradient id="st-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc95" stop-opacity=".35"/><stop offset="1" stop-color="#f6dc95" stop-opacity="0"/></linearGradient>
      <linearGradient id="st-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3a24"/><stop offset="1" stop-color="#2f1d11"/></linearGradient>
      <radialGradient id="st-sky" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#2a3d6e"/><stop offset="1" stop-color="#0b1226"/></radialGradient>
      <linearGradient id="st-moon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d6ff" stop-opacity=".12"/><stop offset="1" stop-color="#c9d6ff" stop-opacity="0"/></linearGradient>
      <pattern id="st-brick" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="#3a2e28"/><path d="M0 13.5 H28 M14 0 V7 M0 7 H28 M0 7 V14 M28 7 V14" stroke="#241b17" stroke-width="1.4"/></pattern>
      <pattern id="st-wicker" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#6b5536"/><path d="M0 0 L6 6 M6 0 L0 6" stroke="#4a3a22" stroke-width="1"/></pattern>
    </defs>
    <rect width="960" height="540" fill="url(#st-wall)"/>
    ${[...Array(24)].map((_, i) => `<rect x="${i * 40}" y="0" width="12" height="430" fill="#0f1a18" opacity=".55"/>`).join('')}
    <rect y="0" width="960" height="12" fill="#0d1615"/><rect y="296" width="960" height="5" fill="#2a1d14"/>
    <!-- 木地板 -->
    <rect y="430" width="960" height="110" fill="url(#st-floor)"/>
    ${perspectivePlanks(430, 540, 480, 250, 30, '#1a110a')}
    <rect y="428" width="960" height="4" fill="#2a1d14"/>
    <!-- 地毯 -->
    <polygon points="318,446 682,446 744,530 256,530" fill="#3d1a1f"/><polygon points="334,452 666,452 722,524 278,524" fill="none" stroke="#a5783a" stroke-width="2" stroke-dasharray="7 5"/>
    <polygon points="380,462 620,462 650,512 350,512" fill="#4d2228"/>
    <!-- 窗外的月光 -->
    <polygon points="618,174 682,174 640,540 520,540" fill="url(#st-moon)"/>
    <ellipse cx="600" cy="270" rx="210" ry="160" fill="url(#st-lamp)"/>
    <!-- 書架 -->
    ${shadow(171, 434, 140, 7)}
    ${H(v, 's_shelf', `<rect x="34" y="58" width="274" height="16" fill="#3a2414"/><rect x="34" y="72" width="274" height="3" fill="#8a6a32" opacity=".5"/>
      <rect x="40" y="72" width="262" height="360" fill="#2d1b10"/>
      <rect x="48" y="78" width="246" height="346" fill="#170e08"/>
      ${[118, 198, 272, 350, 424].map(y => `<rect x="44" y="${y}" width="254" height="8" fill="#4a2f1c"/><rect x="44" y="${y}" width="254" height="2" fill="#7a5236" opacity=".6"/><rect x="48" y="${y + 8}" width="246" height="6" fill="#000" opacity=".35"/>`).join('')}
      ${shelfBooks(118, 3, 36)}${vols}${shelfBooks(350, 5, 70)}${shelfBooks(424, 9, 66)}
      <circle cx="268" cy="100" r="11" fill="#5d7fae" opacity=".75"/><path d="M258 98 q10 -6 20 0 M262 106 q6 3 12 0" stroke="#3e8a5b" stroke-width="2" fill="none"/><rect x="262" y="110" width="12" height="8" fill="#4a2f1c"/>
      <rect x="64" y="284" width="60" height="10" fill="#6b4a32" transform="rotate(-4 94 289)"/><rect x="70" y="276" width="52" height="9" fill="#3e4a5e" transform="rotate(-4 96 280)"/>
      <rect x="40" y="72" width="8" height="360" fill="#000" opacity=".25"/>${hit(34, 58, 274, 376)}`)}
    <!-- 剪報 -->
    ${H(v, 's_clipping', `<rect x="330" y="104" width="54" height="68" fill="#d9ceb2" transform="rotate(-4 357 138)"/>
      <g transform="rotate(-4 357 138)"><rect x="336" y="110" width="42" height="6" fill="#6b6250"/>${[122, 130, 138, 146, 154, 162].map(y => `<line x1="336" y1="${y}" x2="378" y2="${y}" stroke="#7b725e" stroke-width="2"/>`).join('')}<circle cx="370" cy="138" r="6" fill="none" stroke="#b5473f" stroke-width="1.8"/></g>
      <circle cx="357" cy="104" r="3" fill="#b5473f"/>${hit(325, 96, 66, 82)}`)}
    <!-- 油畫 / 保險箱 -->
    ${f.paintingMoved
      ? `${H(v, 's_safe', `<rect x="446" y="90" width="112" height="108" fill="#121a18"/><rect x="452" y="96" width="100" height="96" rx="4" fill="#4b5058" stroke="#2a2d32" stroke-width="4"/>
          <rect x="462" y="106" width="80" height="76" fill="none" stroke="#6c727c" stroke-width="2"/>
          <circle cx="502" cy="144" r="20" fill="#2d3036" stroke="#9aa1ab" stroke-width="2"/>${[...Array(10)].map((_, i) => { const a = i * 36 * Math.PI / 180; return `<line x1="${(502 + Math.sin(a) * 15).toFixed(1)}" y1="${(144 - Math.cos(a) * 15).toFixed(1)}" x2="${(502 + Math.sin(a) * 19).toFixed(1)}" y2="${(144 - Math.cos(a) * 19).toFixed(1)}" stroke="#c7ccd4" stroke-width="1.5"/>`; }).join('')}
          <rect x="530" y="138" width="14" height="12" rx="2" fill="#8a929b"/>
          ${f.safeOpen ? `<rect x="452" y="96" width="100" height="96" fill="#0d0e10" opacity=".85"/><path d="M552 96 L590 104 L590 186 L552 192 Z" fill="#3a3e45"/>` : ''}${hit(446, 90, 112, 108)}`)}
        ${H(v, 's_painting', `<g transform="rotate(-12 650 380)"><rect x="600" y="320" width="120" height="86" fill="#7a5a26"/><rect x="608" y="328" width="104" height="70" fill="url(#st-sky)"/>${starfield(7, 10, 612, 332, 96, 62)}</g>${hit(596, 304, 130, 112)}`)}`
      : H(v, 's_painting', `${shadow(505, 214, 80, 4, 0.3)}<rect x="416" y="74" width="178" height="138" fill="#6b4a1e"/><rect x="420" y="78" width="170" height="130" fill="#8a6a32" stroke="#e3c27a" stroke-width="2"/>
          <rect x="432" y="90" width="146" height="106" fill="url(#st-sky)"/>${starfield(7, 26, 434, 92, 142, 100)}
          ${[[460, 120], [480, 128], [500, 124], [518, 134], [532, 158], [556, 152], [552, 128]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff6d8"/>`).join('')}
          <polyline points="460,120 480,128 500,124 518,134 532,158 556,152 552,128 518,134" fill="none" stroke="#fff6d8" stroke-width=".6" opacity=".4"/>
          <path d="M432 196 Q505 168 578 196 Z" fill="#141a14"/>${hit(412, 70, 186, 146)}`)}
    <!-- 窗戶 -->
    ${H(v, 's_window', `<rect x="618" y="70" width="64" height="104" fill="#0a1226" stroke="#3a2a1c" stroke-width="6"/>${starfield(21, 9, 622, 74, 56, 96)}<circle cx="666" cy="92" r="7" fill="#e9e3cc" opacity=".85"/><line x1="650" y1="70" x2="650" y2="174" stroke="#3a2a1c" stroke-width="4"/><line x1="618" y1="122" x2="682" y2="122" stroke="#3a2a1c" stroke-width="4"/>
      <line x1="614" y1="90" x2="686" y2="110" stroke="#6b5530" stroke-width="4"/><line x1="614" y1="150" x2="686" y2="140" stroke="#6b5530" stroke-width="4"/>${[[620, 91], [680, 108], [620, 149], [680, 141]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#a5a5a5"/>`).join('')}${hit(612, 64, 76, 116)}`)}
    <!-- 壁爐 -->
    <rect x="720" y="0" width="160" height="226" fill="url(#st-brick)"/><rect x="720" y="0" width="160" height="226" fill="#000" opacity=".25"/>
    ${H(v, 's_fireplace', `<rect x="690" y="216" width="220" height="12" rx="2" fill="#6b5f55"/><rect x="696" y="226" width="208" height="16" fill="#5c534c"/>
      ${[[724, 196], [880, 196]].map(([x, y]) => `<rect x="${x - 4}" y="${y}" width="8" height="20" fill="#d8ccb0" opacity=".7"/><rect x="${x - 7}" y="${y + 18}" width="14" height="4" fill="url(#st-wood)"/>`).join('')}
      <path d="M786 216 l14 -16 l36 -6 l4 4 l-36 8 l-14 10 z" fill="#c9a24f" opacity=".85"/>
      <rect x="708" y="242" width="184" height="190" fill="url(#st-brick)"/>
      <path d="M740 432 L740 300 Q800 260 860 300 L860 432 Z" fill="#0b0908"/>
      <ellipse cx="800" cy="428" rx="52" ry="8" fill="#5a1a0e" opacity=".35"/>
      <path d="M760 432 q20 -20 40 -6 q20 -16 40 6 z" fill="#2a2420"/>${[[772, 424], [796, 420], [820, 426]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#7a2a14" opacity=".8"/>`).join('')}
      <path d="M756 432 v-24 m0 0 h-8 M844 432 v-24 m0 0 h8" stroke="#3a3a3a" stroke-width="4"/>
      ${hit(692, 196, 216, 240)}`)}
    <!-- 書桌 -->
    ${shadow(500, 440, 176, 12)}
    <rect x="370" y="316" width="16" height="118" fill="#2f1d11"/><rect x="614" y="316" width="16" height="118" fill="#2f1d11"/>
    <polygon points="560,300 640,300 610,246 590,246" fill="url(#st-cone)"/>
    ${H(v, 's_desk', `<rect x="356" y="300" width="288" height="18" fill="url(#st-wood)"/><rect x="356" y="300" width="288" height="2" fill="#8a6a32" opacity=".6"/>
      <rect x="380" y="292" width="200" height="8" fill="#2f4a3a" opacity=".85"/>
      ${f.gridTaken ? '' : `<rect x="430" y="286" width="48" height="16" fill="#e8e1cc" transform="skewX(-25)"/>${G.isAdv(v.s.mode) ? `<path d="M462 300 q0 -12 10 -12 q10 0 10 12 z" fill="url(#fy-brass)"/><circle cx="472" cy="286" r="2.5" fill="#c9a24f"/>` : ''}`}
      <rect x="500" y="288" width="40" height="12" fill="#c9bfa4" transform="skewX(-20)"/>
      <rect x="392" y="280" width="34" height="8" fill="#5b3a2a"/><rect x="394" y="272" width="30" height="8" fill="#3e4a5e"/>
      <path d="M548 300 l-4 -12 h14 l-4 12 z" fill="#1d1d22"/><path d="M552 290 l18 -30" stroke="#e8e1cc" stroke-width="2"/><path d="M566 262 q10 -6 8 4 q-6 6 -8 -4" fill="#e8e1cc"/>
      <rect x="600" y="262" width="6" height="38" fill="#a5783a"/><rect x="590" y="296" width="26" height="5" rx="2" fill="#a5783a"/><path d="M584 262 L622 262 L612 244 L594 244 Z" fill="#2f5a3f"/><path d="M588 262 L618 262" stroke="#f6dc95" stroke-width="2" opacity=".7"/>${hit(352, 236, 296, 84)}`)}
    ${H(v, 's_drawer', `<rect x="440" y="324" width="120" height="40" fill="#4a2f1c" stroke="#2a190c" stroke-width="2"/><rect x="446" y="330" width="108" height="28" fill="none" stroke="#5a3a24" stroke-width="1"/>
      <rect x="486" y="334" width="28" height="18" rx="3" fill="${f.drawerOpen ? '#2a190c' : '#a87b2e'}"/>${f.drawerOpen ? '' : `<rect x="491" y="339" width="18" height="8" fill="#1a1006"/>${[0, 1, 2, 3].map(i => `<line x1="${494 + i * 4}" y1="339" x2="${494 + i * 4}" y2="347" stroke="#a87b2e" stroke-width="1"/>`).join('')}`}${hit(436, 320, 128, 48)}`)}
    <!-- 廢紙簍 -->
    ${shadow(671, 437, 22, 3)}
    ${H(v, 's_waste', `<path d="M652 392 L690 392 L684 436 L658 436 Z" fill="url(#st-wicker)"/><path d="M652 392 L690 392" stroke="#8a6a42" stroke-width="3"/>
      <circle cx="664" cy="388" r="7" fill="#e5dcc4"/><circle cx="678" cy="386" r="6" fill="#d8ceb4"/><path d="M660 384 l6 6 M674 382 l5 6" stroke="#b9ad90" stroke-width="1"/>${hit(646, 374, 50, 66)}`)}
    <!-- 出口 -->
    ${H(v, 's_exit', `<rect x="910" y="210" width="44" height="222" fill="#2b1a0f" stroke="#5a3d22" stroke-width="4"/><circle cx="918" cy="324" r="3" fill="url(#fy-brass)"/>
      <rect x="904" y="184" width="54" height="20" rx="3" fill="#2a1a0f" stroke="#8a6a32"/><text x="931" y="199" text-anchor="middle" font-size="11" fill="#e3c27a">← ${esc(t(G.rooms.foyer.name))}</text>${hit(900, 180, 60, 256)}`)}
    `;
  }

  /* ---------------- 溫室 ---------------- */
  function greenhouse(v) {
    const f = v.s.flags;
    const vet = G.isAdv(v.s.mode);
    const bloom = f.moonTaken || (f.waterOk && f.lightOk);
    const r = rng(73);
    let drops = '';
    for (let i = 0; i < 70; i++) { const x = r() * 960, y = r() * 240; drops += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 1).toFixed(1)}" y2="${(y + 4 + r() * 8).toFixed(1)}" stroke="#bcd0e6" stroke-width="1" opacity="${(0.15 + r() * 0.25).toFixed(2)}"/>`; }
    const ivy = (x, len, seed) => {
      const q = rng(seed); let d = `M${x} 0`, leaves = '';
      for (let y = 18; y < len; y += 18) {
        const dx = (q() - 0.5) * 10;
        d += ` Q${x + dx * 2} ${y - 9} ${x + dx} ${y}`;
        leaves += `<ellipse cx="${(x + dx + (y % 36 ? 6 : -6)).toFixed(1)}" cy="${y}" rx="6" ry="3.5" fill="#2f5a3a" transform="rotate(${y % 36 ? 30 : -30} ${(x + dx).toFixed(1)} ${y})"/>`;
      }
      return `<path d="${d}" fill="none" stroke="#284a30" stroke-width="2"/>${leaves}`;
    };
    const bigLeaf = (x, y, s, rot) => `<path d="M${x} ${y} q${-30 * s} ${-40 * s} 0 ${-90 * s} q${30 * s} ${50 * s} 0 ${90 * s} z" fill="#0f2418" transform="rotate(${rot} ${x} ${y})"/>`;
    return `
    <defs>
      <linearGradient id="gh-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1730"/><stop offset="1" stop-color="#1b3346"/></linearGradient>
      <linearGradient id="gh-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a241c"/><stop offset="1" stop-color="#0c120d"/></linearGradient>
      <linearGradient id="gh-beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9efff" stop-opacity=".32"/><stop offset="1" stop-color="#e9efff" stop-opacity="0"/></linearGradient>
      <radialGradient id="gh-bloom" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".7"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="gh-halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f2efe0" stop-opacity=".35"/><stop offset="1" stop-color="#f2efe0" stop-opacity="0"/></radialGradient>
      <linearGradient id="gh-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb8c8" stop-opacity="0"/><stop offset="1" stop-color="#9fb8c8" stop-opacity=".12"/></linearGradient>
      <linearGradient id="gh-tank-r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#25425f"/><stop offset=".5" stop-color="#3a6690"/><stop offset="1" stop-color="#22405c"/></linearGradient>
      <linearGradient id="gh-tank-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#553a1e"/><stop offset=".5" stop-color="#7d5a30"/><stop offset="1" stop-color="#4f361c"/></linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#gh-sky)"/>
    ${starfield(31, 60, 0, 0, 960, 260)}
    <circle cx="96" cy="44" r="46" fill="url(#gh-halo)"/><circle cx="96" cy="44" r="18" fill="#f2efe0"/><circle cx="90" cy="40" r="4" fill="#d8d4c2" opacity=".6"/>
    ${bigLeaf(470, 430, 1.4, -12)}${bigLeaf(520, 430, 1.1, 18)}${vet ? '' : bigLeaf(640, 300, 1.2, -20)}${bigLeaf(380, 420, 1, 10)}${bigLeaf(930, 300, 1.3, 15)}
    ${drops}
    ${[...Array(13)].map((_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80}" y2="440" stroke="#2c3a3a" stroke-width="3"/>`).join('')}
    ${[120, 240].map(y => `<line x1="0" y1="${y}" x2="960" y2="${y}" stroke="#2c3a3a" stroke-width="3"/>`).join('')}
    ${[0, 2, 5, 9, 11].map(i => `<path d="M${i * 80 + 10} 10 l40 0 l-60 100 l-20 0 z" fill="#fff" opacity=".035"/>`).join('')}
    ${ivy(240, 120, 3)}${ivy(560, 90, 7)}${ivy(720, 150, 11)}
    <polygon points="60,0 130,0 260,440 120,440" fill="url(#gh-beam)"/>
    <!-- 石板地 -->
    ${perspectiveTiles(430, 540, 480, 260, 20, '#18211a', '#202b22', [430, 448, 472, 504, 546])}
    <rect y="380" width="960" height="160" fill="url(#gh-mist)"/>
    ${H(v, 'g_mirrors', `<rect x="150" y="34" width="250" height="6" fill="#4b5560"/>
      ${[170, 210, 250, 290, 330, 370].map((x, i) => `<line x1="${x}" y1="40" x2="${x}" y2="62" stroke="#4b5560" stroke-width="2"/><rect x="${x - 14}" y="62" width="28" height="36" rx="3" fill="#9fb6cc" stroke="#d7e4ef" stroke-width="1.5" transform="rotate(${i % 2 ? 30 : -30} ${x} 80)"/><rect x="${x - 10}" y="66" width="6" height="28" fill="#fff" opacity=".35" transform="rotate(${i % 2 ? 30 : -30} ${x} 80)"/>`).join('')}
      ${f.lightOk ? `<polyline points="96,60 170,80 330,80 300,330" fill="none" stroke="#f3f6ff" stroke-width="3" opacity=".7"/><polyline points="96,60 170,80 330,80 300,330" fill="none" stroke="#f3f6ff" stroke-width="10" opacity=".15"/>` : ''}${hit(144, 28, 262, 82)}`)}
    <!-- 桶與閥門 -->
    ${shadow(130, 382, 110, 6)}
    ${H(v, 'g_valves', `<rect x="30" y="262" width="62" height="118" rx="8" fill="url(#gh-tank-r)"/><ellipse cx="61" cy="264" rx="31" ry="6" fill="#4a7aa8"/><text x="61" y="320" text-anchor="middle" font-size="${isEn() ? 11 : 14}" fill="#d9e6f2">${esc(t(L('雨水', 'Rain')))}</text>
      <rect x="100" y="262" width="62" height="118" rx="8" fill="url(#gh-tank-f)"/><ellipse cx="131" cy="264" rx="31" ry="6" fill="#8a6a3a"/><text x="131" y="320" text-anchor="middle" font-size="${isEn() ? 11 : 14}" fill="#f0dcc0">${esc(t(L('肥料', 'Feed')))}</text>
      ${[284, 360].map(y => `<rect x="28" y="${y}" width="66" height="4" fill="#1a1a1a" opacity=".5"/><rect x="98" y="${y}" width="66" height="4" fill="#1a1a1a" opacity=".5"/>`).join('')}
      <rect x="170" y="276" width="62" height="66" rx="4" fill="#3a3f45" stroke="#8a929b" stroke-width="2"/>
      ${[0, 1, 2, 3, 4].map(i => `<circle cx="${182 + (i % 3) * 19}" cy="${292 + Math.floor(i / 3) * 20}" r="6" fill="${f.waterOk ? '#6fae7d' : '#b9a06a'}"/>`).join('')}
      ${f.wheelInstalled ? `<circle cx="220" cy="328" r="9" fill="none" stroke="#e3c27a" stroke-width="3"/><path d="M211 328 h18 M220 319 v18" stroke="#e3c27a" stroke-width="2"/>` : `<line x1="220" y1="322" x2="220" y2="334" stroke="#8a929b" stroke-width="3"/>`}
      <path d="M162 300 L170 300 M162 330 L170 330" stroke="#8a929b" stroke-width="4"/>
      <path d="M232 320 L250 320 L250 410" fill="none" stroke="#5c6670" stroke-width="5"/>${hit(26, 256, 210, 128)}`)}
    ${H(v, 'g_rules', `<rect x="196" y="176" width="3" height="90" fill="#4a3a22"/><rect x="176" y="168" width="44" height="54" fill="#e5dcc4" transform="rotate(3 198 195)"/>
      <g transform="rotate(3 198 195)"><rect x="182" y="174" width="32" height="5" fill="#7a6f58"/>${[184, 192, 200, 208].map(y => `<line x1="182" y1="${y}" x2="214" y2="${y}" stroke="#9a8f78" stroke-width="2"/>`).join('')}</g><circle cx="198" cy="170" r="2.5" fill="#8a929b"/>${hit(170, 160, 56, 70)}`)}
    <!-- 儲物間的門（資深） -->
    ${H(v, 'g_storedoor', `<rect x="598" y="222" width="52" height="178" fill="${f.storeroomOpen ? '#0a0806' : '#4a3220'}" stroke="#2a1c10" stroke-width="3"/>
      ${f.storeroomOpen ? `<path d="M598 222 L578 230 L578 396 L598 400 Z" fill="#5a3d22"/>` : `${[612, 626, 640].map(x => `<line x1="${x}" y1="226" x2="${x}" y2="396" stroke="#3a2614" stroke-width="1.5"/>`).join('')}<rect x="606" y="236" width="36" height="16" fill="#e5dcc4"/><text x="624" y="248" text-anchor="middle" font-size="10" fill="#4a3a22">${esc(t(L('周', 'ZHOU')))}</text><rect x="636" y="306" width="10" height="14" rx="2" fill="#8a929b"/>`}
      ${f.storeroomOpen ? exitPlaque(624, 214, t(G.rooms.storeroom.name) + ' →') : ''}${hit(592, 200, 64, 204)}`)}
    <!-- 花床 -->
    ${[[250, 130], [398, 112], [528, 100]].map(([x, w]) => `<rect x="${x}" y="400" width="${w}" height="44" fill="#3a2a1a"/><rect x="${x}" y="400" width="${w}" height="6" fill="#2a1d12"/><rect x="${x - 3}" y="396" width="${w + 6}" height="6" fill="#5a4630"/>`).join('')}
    ${[[408, 390], [430, 380], [452, 388], [474, 382], [492, 392]].map(([x]) => `<path d="M${x} 402 q4 -26 ${-10} -40 M${x} 402 q6 -24 14 -36 M${x} 402 q-4 -20 -16 -26" fill="none" stroke="${f.waterOk ? '#5ea36b' : '#4a7a52'}" stroke-width="3"/>`).join('')}
    <rect x="566" y="350" width="22" height="52" rx="10" fill="#4f7a4a"/><rect x="552" y="368" width="14" height="10" rx="5" fill="#4f7a4a"/><rect x="588" y="360" width="14" height="10" rx="5" fill="#4f7a4a"/>${[[570, 358], [580, 372], [574, 388]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#d8e8c8"/>`).join('')}
    <text x="315" y="462" text-anchor="middle" font-size="12" fill="#9fb59a">${esc(t(G.BEDS.moon.name))}</text><text x="454" y="462" text-anchor="middle" font-size="12" fill="#9fb59a">${esc(t(G.BEDS.fern.name))}</text><text x="578" y="462" text-anchor="middle" font-size="12" fill="#9fb59a">${esc(t(G.BEDS.cactus.name))}</text>
    ${H(v, 'g_moonflower', `<path d="M315 402 C312 370 318 350 314 320" fill="none" stroke="#5e8f5e" stroke-width="4"/>
      <path d="M314 372 q-26 -6 -34 -20 q22 0 34 14" fill="#4f8a5b"/><path d="M316 356 q24 -8 34 -22 q-22 2 -34 16" fill="#4f8a5b"/><path d="M314 388 q-18 2 -26 -8 q16 -4 26 6" fill="#3f7a4b"/>
      ${bloom
        ? `<circle cx="314" cy="306" r="44" fill="url(#gh-bloom)"/>${[0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="314" cy="290" rx="9" ry="18" fill="#f8f9ff" transform="rotate(${a} 314 306)"/>`).join('')}${[30, 90, 150, 210, 270, 330].map(a => `<ellipse cx="314" cy="294" rx="6" ry="13" fill="#e6ecf8" transform="rotate(${a} 314 306)"/>`).join('')}<circle cx="314" cy="306" r="7" fill="${f.moonTaken ? '#e8e2a8' : '#dfe6f5'}"/>`
        : `<path d="M314 324 q-12 -14 0 -34 q12 20 0 34" fill="#d7e2cf"/><path d="M314 324 q-6 -12 0 -28" fill="none" stroke="#9ab090" stroke-width="1.5"/><circle cx="314" cy="306" r="3" fill="#fff" opacity="${f.lightOk || f.waterOk ? 0.5 : 0.2}"/>`}
      ${hit(270, 262, 90, 142)}`)}
    <!-- 花盆架 -->
    ${H(v, 'g_pots', `<rect x="652" y="318" width="250" height="10" fill="#5a3d22"/><rect x="652" y="318" width="250" height="2" fill="#8a6a42"/><rect x="660" y="328" width="8" height="34" fill="#4a2f1c"/><rect x="886" y="328" width="8" height="34" fill="#4a2f1c"/>
      ${vet
        ? G.variant(v.s).pots.map((p, i) => { const x = 668 + i * 31, c = ['#c44f5c', '#8a7bc8', '#8aa89a', '#6fbf8a', '#b97ab0', '#6f8fc0', '#4f9a5b', '#efe6a8'][i]; return `<path d="M${x - 12} 286 L${x + 12} 286 L${x + 9} 318 L${x - 9} 318 Z" fill="${f.keyDug && p.id === G.variant(v.s).potAnswer ? '#7a4a2a' : '#a3613a'}"/><rect x="${x - 13}" y="282" width="26" height="6" fill="#8a4f2e"/>${[-5, 0, 5].map(d => `<circle cx="${x + d}" cy="${272 - Math.abs(d)}" r="4.5" fill="${c}"/>`).join('')}<path d="M${x} 282 v-8" stroke="#4f7a4a" stroke-width="2"/><text x="${x}" y="308" text-anchor="middle" font-size="10" font-weight="700" fill="#f3e2c8">${p.n}</text>`; }).join('')
        : [['#c44f5c', 680], ['#8a7bc8', 740], ['#8aa89a', 800], ['#6fbf8a', 860]].map(([c, x], i) => `<path d="M${x - 22} 276 L${x + 22} 276 L${x + 16} 318 L${x - 16} 318 Z" fill="${f.keyDug && i === 0 ? '#7a4a2a' : '#a3613a'}"/><path d="M${x - 18} 280 L${x - 14} 316" stroke="#c98a5a" stroke-width="2" opacity=".5"/>
        <rect x="${x - 24}" y="270" width="48" height="8" fill="#8a4f2e"/>${[-10, 0, 10].map(d => `<circle cx="${x + d}" cy="${258 - Math.abs(d) / 2}" r="7" fill="${c}"/>`).join('')}<path d="M${x} 270 v-10 M${x - 6} 268 l-4 -8 M${x + 6} 268 l4 -8" stroke="#4f7a4a" stroke-width="2.5"/>`).join('')}
      ${hit(648, 236, 258, 128)}`)}
    <!-- 工作台 -->
    ${H(v, 'g_bench', `<rect x="652" y="380" width="250" height="14" fill="#6b4a2c"/><rect x="652" y="380" width="250" height="2" fill="#9a7048"/><rect x="662" y="394" width="10" height="44" fill="#4a2f1c"/><rect x="882" y="394" width="10" height="44" fill="#4a2f1c"/>
      <rect x="672" y="394" width="210" height="44" fill="#050805" opacity=".9"/>
      <rect x="700" y="366" width="26" height="16" fill="#c9b27a"/><rect x="702" y="368" width="22" height="5" fill="#a54a3a"/><rect x="734" y="370" width="22" height="12" fill="#b59a5e"/><circle cx="830" cy="374" r="7" fill="none" stroke="#c9b27a" stroke-width="3"/><circle cx="830" cy="374" r="3" fill="none" stroke="#c9b27a" stroke-width="2"/>${hit(648, 360, 258, 80)}`)}
    ${H(v, 'g_trapdoor', `<rect x="716" y="448" width="124" height="54" fill="${f.trapdoorOpen ? '#050505' : '#4a3320'}" stroke="#2a1c10" stroke-width="3"/>
      ${f.trapdoorOpen ? `<text x="778" y="481" text-anchor="middle" font-size="13" fill="#c9a24f">↓ ${esc(t(G.rooms.darkroom.name))}</text>` : `${[730, 760, 790, 820].map(x => `<line x1="${x}" y1="450" x2="${x}" y2="500" stroke="#3a2614" stroke-width="1.5"/>`).join('')}<line x1="716" y1="475" x2="840" y2="475" stroke="#2a1c10" stroke-width="2"/><rect x="768" y="466" width="20" height="18" rx="3" fill="#8a929b"/>`}${hit(712, 444, 132, 62)}`)}
    <!-- 工具架 -->
    ${H(v, 'g_tools', `<rect x="770" y="96" width="120" height="104" fill="#5a4630"/><rect x="770" y="96" width="120" height="104" fill="none" stroke="#3a2a1a" stroke-width="3"/>${[0, 1, 2, 3, 4].map(i => `<circle cx="${784 + i * 23}" cy="110" r="2" fill="#2a1c10"/>`).join('')}
      <path d="M786 112 v40 M778 152 h16 v24 h-16 z" stroke="#9aa1ab" stroke-width="3" fill="#7a828c"/>
      <path d="M832 114 l-8 40 m16 -40 l8 40" stroke="#9aa1ab" stroke-width="3"/><circle cx="824" cy="158" r="5" fill="none" stroke="#a54a3a" stroke-width="2"/><circle cx="848" cy="158" r="5" fill="none" stroke="#a54a3a" stroke-width="2"/>
      ${f.trowelTaken ? '' : `<path d="M868 112 v34" stroke="#6b4a2c" stroke-width="5"/><path d="M860 146 h16 l-8 26 z" fill="#9aa1ab"/>`}${hit(764, 90, 132, 116)}`)}
    ${H(v, 'g_exit', `<rect x="912" y="200" width="42" height="236" fill="#1a2b22" stroke="#5a3d22" stroke-width="4"/><rect x="918" y="210" width="30" height="80" fill="#2f5a3f" opacity=".5"/>
      <rect x="904" y="174" width="54" height="20" rx="3" fill="#2a1a0f" stroke="#8a6a32"/><text x="931" y="189" text-anchor="middle" font-size="11" fill="#e3c27a">← ${esc(t(G.rooms.foyer.name))}</text>${hit(900, 170, 60, 270)}`)}
    `;
  }

  /* ---------------- 天文台 ---------------- */
  function observatory(v) {
    const f = v.s.flags;
    const dir = G.DIRECTIONS.find(d => d.id === (v.s.puz.dome || 'N'));
    const rivets = [];
    for (const x of [160, 320, 640, 800]) for (let k = 1; k < 8; k++) {
      const tt = k / 8, x1 = x, y1 = 440, cx = (x + 480) / 2, cy = 60, x2 = 480, y2 = 30;
      const px = (1 - tt) * (1 - tt) * x1 + 2 * (1 - tt) * tt * cx + tt * tt * x2, py = (1 - tt) * (1 - tt) * y1 + 2 * (1 - tt) * tt * cy + tt * tt * y2;
      if (px < 440 || px > 520) rivets.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="1.6" fill="#3a4266"/>`);
    }
    const rose = [...Array(8)].map((_, i) => { const a = i * Math.PI / 4, l = i % 2 ? 50 : 110; return `<polygon points="${pts([[480, 496], [480 + Math.cos(a - 0.12) * 18, 496 + Math.sin(a - 0.12) * 4], [480 + Math.cos(a) * l, 496 + Math.sin(a) * l * 0.22], [480 + Math.cos(a + 0.12) * 18, 496 + Math.sin(a + 0.12) * 4]])}" fill="${i % 2 ? '#2a2d40' : '#3a3a52'}"/>`; }).join('');
    const slitLabel = isEn() ? `Slit: ${dir.id}` : `窗朝${t(dir.name)}`;
    return `
    <defs>
      <radialGradient id="ob-dome" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#1d2440"/><stop offset="1" stop-color="#0b0f1e"/></radialGradient>
      <linearGradient id="ob-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d38c"/><stop offset=".5" stop-color="#c9a24f"/><stop offset="1" stop-color="#8a6324"/></linearGradient>
      <radialGradient id="ob-red" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff4a3a" stop-opacity=".5"/><stop offset="1" stop-color="#ff4a3a" stop-opacity="0"/></radialGradient>
      <linearGradient id="ob-milky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8c4ff" stop-opacity="0"/><stop offset=".5" stop-color="#b8c4ff" stop-opacity=".22"/><stop offset="1" stop-color="#b8c4ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="ob-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121320"/><stop offset="1" stop-color="#1c1d2c"/></linearGradient>
    </defs>
    <rect width="960" height="540" fill="#0a0d18"/>
    <path d="M0 440 L0 260 Q480 -120 960 260 L960 440 Z" fill="url(#ob-dome)"/>
    ${[80, 160, 240, 320, 640, 720, 800, 880].map(x => `<path d="M${x} 440 Q${(x + 480) / 2} 60 480 30" fill="none" stroke="#1c2340" stroke-width="2"/>`).join('')}
    ${[160, 320, 640, 800].map(x => `<path d="M${x} 440 Q${(x + 480) / 2} 60 480 30" fill="none" stroke="#2a3254" stroke-width="4"/>`).join('')}
    ${rivets.join('')}
    <path d="M440 440 L440 60 Q480 20 520 60 L520 440" fill="#05070f"/>
    <rect x="440" y="40" width="80" height="400" fill="url(#ob-milky)"/>
    ${starfield(41, 30, 444, 50, 72, 260)}${starfield(43, 60, 444, 50, 72, 260, { min: 0.3, var: 0.5 })}
    <path d="M440 440 L440 60 Q480 20 520 60 L520 440" fill="none" stroke="#2a3254" stroke-width="5"/>
    <rect y="430" width="960" height="14" fill="#232742"/><rect y="430" width="960" height="2" fill="#3a4266"/>
    <rect y="444" width="960" height="96" fill="url(#ob-floor)"/>
    ${perspectivePlanks(444, 540, 480, 300, 26, '#0c0d16')}
    <ellipse cx="480" cy="496" rx="124" ry="30" fill="none" stroke="#3a3a52" stroke-width="2"/>${rose}
    <!-- 牆上的星圖 -->
    <rect x="300" y="150" width="50" height="64" fill="#cfc4a6" opacity=".55" transform="rotate(-3 325 182)"/>
    <rect x="590" y="140" width="56" height="70" fill="#cfc4a6" opacity=".5" transform="rotate(4 618 175)"/>${starfield(9, 8, 596, 148, 44, 54, { color: '#3a3020' })}
    ${H(v, 'o_poster', `<rect x="38" y="94" width="154" height="154" fill="#bfb293"/><rect x="40" y="96" width="150" height="150" fill="#e3d9bd"/>${G.CONSTELLATION_ORDER.map((id, i) => miniConst(id, 50 + (i % 4) * 35, 106 + Math.floor(i / 4) * 66, 28)).join('')}<text x="115" y="240" text-anchor="middle" font-size="11" fill="#5a4a30">${esc(t(L('星座圖', 'Constellations')))}</text><circle cx="115" cy="98" r="3" fill="#b5473f"/>${hit(36, 92, 158, 158)}`)}
    ${H(v, 'o_almanac', `<rect x="210" y="104" width="72" height="96" fill="#d9ceb2"/><text x="246" y="122" text-anchor="middle" font-size="10" fill="#4a3a22">${esc(t(L('月落表', 'Moonset')))}</text>${[134, 146, 158, 170, 182].map(y => `<line x1="218" y1="${y}" x2="274" y2="${y}" stroke="#7a6f58" stroke-width="2"/>`).join('')}<circle cx="246" cy="106" r="2.5" fill="#8a929b"/>${hit(206, 100, 80, 104)}`)}
    <!-- 觀測桌 -->
    ${shadow(167, 442, 140, 6)}
    <rect x="36" y="350" width="262" height="14" fill="#4a2f1c"/><rect x="36" y="350" width="262" height="2" fill="#7a5236"/><rect x="48" y="364" width="10" height="76" fill="#3a2414"/><rect x="276" y="364" width="10" height="76" fill="#3a2414"/>
    <rect x="168" y="340" width="30" height="10" fill="#d9ceb2" transform="rotate(-6 183 345)"/><rect x="60" y="342" width="14" height="8" fill="#5b3a2a"/>
    ${H(v, 'o_log', `<path d="M80 350 L84 330 L150 330 L156 350 Z" fill="#6b2a2a"/><path d="M84 330 L150 330" stroke="#8a3a3a" stroke-width="2"/><path d="M118 332 L118 350" stroke="#3a1414" stroke-width="2"/>${f.logBookmark ? '' : `<rect x="132" y="322" width="8" height="12" fill="#e5dcc4"/>`}${hit(74, 316, 90, 38)}`)}
    ${H(v, 'o_lamp', `${f.bulbTaken ? '' : `<circle cx="230" cy="300" r="56" fill="url(#ob-red)"/>`}<rect x="226" y="312" width="8" height="38" fill="#8a6a32"/><path d="M210 312 L250 312 L240 290 L220 290 Z" fill="#3a3a3a"/>
      ${f.bulbTaken ? '' : `<circle cx="230" cy="316" r="6" fill="#ff5a48"/>`}<rect x="216" y="346" width="28" height="6" fill="#8a6a32"/>${hit(200, 270, 60, 84)}`)}
    <!-- 穹頂轉輪 -->
    ${H(v, 'o_dome', `<rect x="324" y="330" width="10" height="110" fill="#3a3f45"/><circle cx="329" cy="322" r="26" fill="none" stroke="url(#ob-brass)" stroke-width="5"/>
      ${[0, 60, 120].map(a => `<line x1="329" y1="322" x2="${(329 + Math.cos(a * Math.PI / 180) * 26).toFixed(1)}" y2="${(322 + Math.sin(a * Math.PI / 180) * 26).toFixed(1)}" stroke="#c9a24f" stroke-width="3" transform="rotate(${a} 329 322)"/>`).join('')}
      <circle cx="329" cy="322" r="5" fill="#e7c77e"/><circle cx="355" cy="322" r="4" fill="#e7c77e"/>
      <rect x="292" y="268" width="74" height="20" rx="3" fill="#2a2d3d" stroke="#6b4a1e"/><text x="329" y="282.5" text-anchor="middle" font-size="12" fill="#e7c77e">${esc(slitLabel)}</text>${hit(288, 264, 82, 178)}`)}
    <!-- 望遠鏡 -->
    ${shadow(490, 442, 60, 6)}
    ${H(v, 'o_telescope', `<path d="M470 440 L490 330 L510 440" fill="none" stroke="#5a5f66" stroke-width="8"/><path d="M455 440 L490 330" stroke="#4a4f56" stroke-width="7"/>
      <circle cx="490" cy="328" r="12" fill="#3a3f45"/><rect x="484" y="316" width="12" height="40" fill="#2a2d33"/><circle cx="490" cy="364" r="8" fill="#4a4f56"/>
      <g transform="rotate(-32 490 320)"><rect x="380" y="302" width="250" height="36" rx="6" fill="url(#ob-brass)"/><rect x="380" y="306" width="250" height="5" fill="#fff" opacity=".25"/><rect x="610" y="296" width="30" height="48" rx="4" fill="#b88e3e"/><ellipse cx="640" cy="320" rx="4" ry="22" fill="#0b0f1e"/>
        <rect x="360" y="310" width="22" height="20" rx="3" fill="${f.eyepieceInstalled ? '#c9a24f' : '#1a1a1a'}"/><circle cx="400" cy="342" r="5" fill="#8a6a32"/>${[430, 500, 570].map(x => `<rect x="${x}" y="300" width="6" height="40" fill="#8a6a32"/>`).join('')}</g>
      <rect x="452" y="372" width="40" height="22" fill="#e9e3cc" transform="rotate(-8 472 383)"/>${hit(350, 170, 300, 272)}`)}
    <!-- 星盤 -->
    ${shadow(700, 442, 44, 5)}
    ${H(v, 'o_dial', `<rect x="672" y="370" width="56" height="70" fill="#2d2f3a"/><rect x="672" y="370" width="8" height="70" fill="#000" opacity=".25"/><rect x="660" y="362" width="80" height="10" fill="#3a3d4a"/>
      <ellipse cx="700" cy="342" rx="54" ry="26" fill="#6b4a1e"/><ellipse cx="700" cy="338" rx="50" ry="23" fill="url(#ob-brass)"/>
      <ellipse cx="700" cy="338" rx="36" ry="16" fill="none" stroke="#6b4a1e" stroke-width="2"/><ellipse cx="700" cy="338" rx="22" ry="10" fill="none" stroke="#6b4a1e" stroke-width="2"/>
      ${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return `<circle cx="${(700 + Math.cos(a) * 43).toFixed(1)}" cy="${(338 + Math.sin(a) * 19.5).toFixed(1)}" r="1.4" fill="#6b4a1e"/>`; }).join('')}
      ${f.starDialSolved ? `<ellipse cx="700" cy="338" rx="10" ry="5" fill="#0b0f1e"/>` : `<circle cx="700" cy="338" r="4" fill="#3a2a10"/>`}<path d="M700 312 l-5 -9 h10 z" fill="#e7c77e"/>${hit(642, 300, 116, 142)}`)}
    <!-- 地圖櫃 -->
    ${H(v, 'o_cabinet', `<rect x="786" y="244" width="150" height="8" fill="#4a2f1c"/><rect x="790" y="250" width="142" height="160" fill="#3a2414"/>${[270, 300, 330, 360, 390].map(y => `<rect x="798" y="${y - 14}" width="126" height="24" fill="#4f3320" stroke="#2a190c" stroke-width="2"/><rect x="798" y="${y - 14}" width="126" height="2" fill="#7a5236" opacity=".6"/><rect x="852" y="${y - 6}" width="18" height="6" rx="2" fill="#c9a24f"/>`).join('')}
      <rect x="820" y="236" width="40" height="8" fill="#cfc4a6" transform="rotate(-3 840 240)"/>${hit(786, 236, 150, 178)}`)}
    ${H(v, 'o_under', `<rect x="796" y="410" width="130" height="26" fill="#020204"/>${f.eyepieceFound ? '' : `<circle cx="902" cy="424" r="2.4" fill="#e7c77e" class="glint"/>`}${hit(790, 408, 142, 32)}`)}
    ${H(v, 'o_exit', `<path d="M600 458 L760 458 L740 520 L620 520 Z" fill="#05060a" stroke="#2a2d3d" stroke-width="3"/>${[474, 490, 506].map(y => `<line x1="${612 + (y - 458) / 3}" y1="${y}" x2="${748 - (y - 458) / 3}" y2="${y}" stroke="#2a2d3d" stroke-width="2"/>`).join('')}
      ${exitPlaque(680, 448, '↓ ' + t(L('下樓', 'Downstairs')))}${hit(596, 432, 168, 94)}`)}
    `;
  }

  /* ---------------- 暗房 ---------------- */
  function darkroom(v) {
    const f = v.s.flags;
    const capLetter = { red: L('紅', 'R'), blue: L('藍', 'B'), yellow: L('黃', 'Y'), white: L('白', 'W'), green: L('綠', 'G'), black: L('黑', 'K') };
    const vet = G.isAdv(v.s.mode), master = v.s.mode === 'master';
    if (!f.darkroomLit) {
      const r = rng(5);
      let dust = '';
      for (let i = 0; i < 26; i++) dust += `<circle cx="${(50 + r() * 110).toFixed(1)}" cy="${(r() * 520).toFixed(1)}" r="${(0.6 + r()).toFixed(1)}" fill="#d8d0b0" opacity="${(0.1 + r() * 0.25).toFixed(2)}"/>`;
      return `
      <defs><linearGradient id="dk-shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8d0b0" stop-opacity=".22"/><stop offset="1" stop-color="#d8d0b0" stop-opacity="0"/></linearGradient></defs>
      <rect width="960" height="540" fill="#030303"/>
      <polygon points="40,0 150,0 190,540 10,540" fill="url(#dk-shaft)"/>${dust}
      <rect x="220" y="320" width="460" height="14" fill="#0b0a09"/><rect x="740" y="250" width="190" height="8" fill="#0b0a09"/>
      ${H(v, 'd_ladder', `${[60, 120].map(x => `<line x1="${x}" y1="0" x2="${x + 6}" y2="520" stroke="#3a3326" stroke-width="6"/>`).join('')}${[...Array(10)].map((_, i) => `<line x1="60" y1="${30 + i * 50}" x2="126" y2="${30 + i * 50}" stroke="#3a3326" stroke-width="5"/>`).join('')}${hit(40, 0, 110, 530)}`)}
      ${H(v, 'd_socket', `<circle cx="480" cy="92" r="16" fill="none" stroke="#2e2a24" stroke-width="3"/><line x1="480" y1="40" x2="480" y2="76" stroke="#2e2a24" stroke-width="3"/>${hit(450, 36, 60, 76)}`)}
      <text x="480" y="300" text-anchor="middle" font-size="16" fill="#3b372f">${esc(t(L('伸手不見五指。', 'Pitch black.')))}</text>
      `;
    }
    const prints = [230, 330, 520, 620].map((x, i) => `<rect x="${x - 4}" y="136" width="8" height="10" fill="#8a3a2a"/><rect x="${x - 22}" y="146" width="44" height="54" fill="#d9b5a5" opacity=".55"/>${i === 2 ? `<path d="M${x - 14} 180 q10 -12 26 -20" stroke="#5a1a14" stroke-width="2" fill="none" opacity=".6"/><circle cx="${x - 14}" cy="180" r="2.5" fill="#5a1a14" opacity=".6"/>` : i === 0 ? `<path d="M${x - 18} 190 l12 -14 l8 8 l14 -18" stroke="#5a1a14" stroke-width="2" fill="none" opacity=".5"/>` : ''}`).join('');
    const headlights = f.plateDeveloped && !f.phoneDone;
    return `
    <defs>
      <radialGradient id="dk-light" cx=".5" cy=".15" r=".9"><stop offset="0" stop-color="#7a1712"/><stop offset="1" stop-color="#120303"/></radialGradient>
      <linearGradient id="dk-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3b2a" stop-opacity=".22"/><stop offset="1" stop-color="#ff3b2a" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#dk-light)"/>
    <polygon points="462,104 498,104 700,540 260,540" fill="url(#dk-cone)"/>
    <rect y="440" width="960" height="100" fill="#160404"/>
    ${H(v, 'd_ladder', `${[60, 120].map(x => `<line x1="${x}" y1="0" x2="${x + 6}" y2="520" stroke="#4a1a14" stroke-width="6"/>`).join('')}${[...Array(10)].map((_, i) => `<line x1="60" y1="${30 + i * 50}" x2="126" y2="${30 + i * 50}" stroke="#4a1a14" stroke-width="5"/>`).join('')}${hit(40, 0, 110, 530)}`)}
    ${H(v, 'd_socket', `<line x1="480" y1="30" x2="480" y2="76" stroke="#3a0d0a" stroke-width="3"/><path d="M460 76 L500 76 L494 100 L466 100 Z" fill="#2a0a08"/><circle cx="480" cy="104" r="12" fill="#ff3b2a"/><circle cx="480" cy="104" r="44" fill="#ff3b2a" opacity=".16"/>${hit(452, 28, 56, 120)}`)}
    ${H(v, 'd_line', `<path d="M160 130 Q420 160 700 130" fill="none" stroke="#5a2a20" stroke-width="2"/>${prints}
      ${f.p4Taken ? '' : `<rect x="398" y="146" width="40" height="56" fill="#f0d6c8" opacity=".85"/>${[156, 164, 172, 180, 188].map(y => `<line x1="404" y1="${y}" x2="432" y2="${y}" stroke="#7a3a2a" stroke-width="1.5"/>`).join('')}`}${hit(150, 120, 560, 90)}`)}
    ${H(v, 'd_vent', `<rect x="820" y="40" width="90" height="50" fill="#050101"/><path d="M820 40 L910 40 L910 72 L882 90 L820 90 Z" fill="#140404"/>${[50, 60, 70].map(y => `<line x1="826" y1="${y}" x2="${y < 72 ? 904 : 896}" y2="${y}" stroke="#2a0806" stroke-width="2"/>`).join('')}<path d="M882 90 L910 72 L910 90 Z" fill="#050101"/>${headlights ? `<circle cx="901" cy="85" r="7" fill="#ffe9a8" opacity=".25"/><circle cx="897" cy="86" r="2" fill="#ffe9a8"/><circle cx="905" cy="86" r="2" fill="#ffe9a8"/>` : ''}<path d="M882 90 L910 72" stroke="#3a0d0a" stroke-width="2"/>${hit(814, 34, 102, 62)}`)}
    ${H(v, 'd_shelf', vet
      ? `<rect x="700" y="250" width="240" height="10" fill="#3a0d0a"/><rect x="700" y="250" width="240" height="2" fill="#6a2018"/>
        ${G.BOTTLES_V.map((b, i) => `<rect x="${708 + i * 38}" y="198" width="26" height="52" rx="5" fill="#2a0a08" stroke="#5a1a14" stroke-width="2"/><rect x="${711 + i * 38}" y="202" width="5" height="42" fill="#ff6a50" opacity=".15"/><rect x="${710 + i * 38}" y="188" width="22" height="11" rx="2" fill="${CAP_COLORS[b.id]}"/><text x="${721 + i * 38}" y="232" text-anchor="middle" font-size="12" fill="#e8b8a8">${esc(t(capLetter[b.id]))}</text>${master && b.id === 'black' ? crustPath(708 + i * 38, 198, 26) : ''}`).join('')}
        <rect x="760" y="262" width="60" height="38" fill="#e8c8b8" opacity=".8" transform="rotate(-4 790 281)"/>${hit(696, 180, 248, 126)}`
      : `<rect x="740" y="250" width="190" height="10" fill="#3a0d0a"/><rect x="740" y="250" width="190" height="2" fill="#6a2018"/>
      ${G.BOTTLES.map((b, i) => `<rect x="${756 + i * 44}" y="196" width="28" height="54" rx="5" fill="#2a0a08" stroke="#5a1a14" stroke-width="2"/><rect x="${759 + i * 44}" y="200" width="5" height="44" fill="#ff6a50" opacity=".15"/><rect x="${760 + i * 44}" y="186" width="20" height="12" rx="2" fill="${CAP_COLORS[b.id]}"/><text x="${770 + i * 44}" y="232" text-anchor="middle" font-size="12" fill="#e8b8a8">${esc(t(capLetter[b.id]))}</text>`).join('')}
      <rect x="760" y="262" width="60" height="38" fill="#e8c8b8" opacity=".8" transform="rotate(-4 790 281)"/>${hit(736, 180, 198, 126)}`)}
    ${H(v, 'd_card2', `<g transform="rotate(-5 750 136)"><rect x="722" y="110" width="58" height="50" fill="#efe2c4" opacity=".9"/><rect x="722" y="110" width="58" height="9" fill="#b0453a" opacity=".85"/><text x="770" y="155" text-anchor="end" font-size="13" fill="#9a3a2a" opacity=".55" class="t-mono">17</text>${[126, 134, 142].map(y => `<line x1="728" y1="${y}" x2="764" y2="${y}" stroke="#7a3a2a" stroke-width="1.4" opacity=".6"/>`).join('')}</g><circle cx="750" cy="112" r="2.5" fill="#8a929b"/>${hit(714, 102, 74, 66)}`)}
    ${H(v, 'd_chart', `<rect x="610" y="34" width="84" height="74" fill="#e8c8b8" opacity=".78" transform="rotate(2 652 71)"/><g transform="rotate(2 652 71)"><rect x="618" y="42" width="52" height="6" fill="#7a3a2a" opacity=".7"/>${[56, 66, 76, 86, 96].map(y => `<line x1="618" y1="${y}" x2="686" y2="${y}" stroke="#7a3a2a" stroke-width="1.5" opacity=".6"/>`).join('')}</g><circle cx="652" cy="36" r="2.5" fill="#8a929b"/>${hit(604, 28, 96, 86)}`)}
    ${H(v, 'd_tray', `<rect x="230" y="320" width="460" height="16" fill="#3a0d0a"/><rect x="230" y="320" width="460" height="2" fill="#6a2018"/><rect x="250" y="336" width="12" height="104" fill="#2a0806"/><rect x="658" y="336" width="12" height="104" fill="#2a0806"/>
      <rect x="236" y="250" width="10" height="70" fill="#2a0806"/><path d="M226 250 h40 v24 h-40 z" fill="#3a0d0a"/><rect x="238" y="274" width="16" height="10" fill="#1a0404"/><rect x="226" y="314" width="34" height="6" fill="#2a0806"/>
      ${[270, 380, 490].map(x => `<rect x="${x}" y="302" width="90" height="18" rx="3" fill="#120303" stroke="#6a2018" stroke-width="2"/><rect x="${x + 6}" y="306" width="78" height="4" fill="#ff6a50" opacity=".12"/>`).join('')}
      <rect x="600" y="280" width="70" height="40" rx="3" fill="#0a0a0a" stroke="#5a1a14" stroke-width="2"/><text x="635" y="305" text-anchor="middle" font-size="10" fill="#c88">${esc(t(L('避光盒', 'Plate box')))}</text>${hit(222, 246, 474, 196)}`)}
    `;
  }

  /* ---------------- 儲物間（資深） ---------------- */
  function storeroom(v) {
    const f = v.s.flags;
    const r = rng(91);
    let dust = '';
    for (let i = 0; i < 22; i++) dust += `<circle cx="${(400 + r() * 260).toFixed(1)}" cy="${(220 + r() * 220).toFixed(1)}" r="${(0.6 + r()).toFixed(1)}" fill="#e8dcc0" opacity="${(0.08 + r() * 0.2).toFixed(2)}"/>`;
    // 大師：雜物架被插進地板的鐵栓卡住；三枚徽章歸位、架子推開後，露出老水道的鐵門
    const master = v.s.mode === 'master', moved = master && !!f.tunnelFound, bolt = master && !moved && !G.allInserted(v.s);
    const tin = (x, y, body, lid, label) => `<rect x="${x}" y="${y}" width="26" height="30" rx="3" fill="${body}"/><rect x="${x - 1}" y="${y - 4}" width="28" height="6" rx="2" fill="${lid}"/><rect x="${x + 4}" y="${y + 10}" width="18" height="10" fill="#e8dcc0" opacity=".8"/><text x="${x + 13}" y="${y + 18.5}" text-anchor="middle" font-size="7" fill="#3b2a10">${label}</text>`;
    const drawers = [];
    for (let rr = 0; rr < 6; rr++) for (let c = 0; c < 4; c++) {
      const x = 682 + c * 36, y = 186 + rr * 36;
      drawers.push(`<rect x="${x}" y="${y}" width="32" height="32" fill="#5a3d22" stroke="#2f1d11" stroke-width="2"/><rect x="${x + 12}" y="${y + 14}" width="8" height="4" rx="1" fill="#c9a24f"/><rect x="${x + 4}" y="${y + 4}" width="24" height="7" fill="#e8dcc0" opacity=".55"/>`);
    }
    return `
    <defs>
      <linearGradient id="sr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d140d"/><stop offset="1" stop-color="#33231a"/></linearGradient>
      <linearGradient id="sr-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241a12"/><stop offset="1" stop-color="#140e09"/></linearGradient>
      <linearGradient id="sr-moon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d6ff" stop-opacity=".2"/><stop offset="1" stop-color="#c9d6ff" stop-opacity="0"/></linearGradient>
      <radialGradient id="sr-cottage" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd98a" stop-opacity=".8"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
      <linearGradient id="sr-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d38c"/><stop offset="1" stop-color="#8a6324"/></linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#sr-wall)"/>
    ${[...Array(25)].map((_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="440" stroke="#140d08" stroke-width="2"/><line x1="${i * 40 + 18}" y1="0" x2="${i * 40 + 18}" y2="440" stroke="#2a1d14" stroke-width="1" opacity=".5"/>`).join('')}
    <!-- 斜屋頂與椽木 -->
    <polygon points="0,0 960,0 960,120 0,36" fill="#120c08"/>
    ${[0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="${i * 160}" y1="${36 + i * 13.3}" x2="${i * 160 + 10}" y2="0" stroke="#2a1d12" stroke-width="10"/>`).join('')}
    <line x1="0" y1="36" x2="960" y2="120" stroke="#3a2818" stroke-width="12"/>
    <!-- 泥土地 -->
    <rect y="440" width="960" height="100" fill="url(#sr-floor)"/>
    ${perspectivePlanks(440, 540, 480, 300, 18, '#0e0a06')}
    <rect y="436" width="960" height="6" fill="#2a1d12"/>
    <!-- 月光 -->
    <polygon points="444,222 540,222 660,540 380,540" fill="url(#sr-moon)"/>${dust}
    <!-- 大師：老水道的鐵門（雜物架推開之後才看得到） -->
    ${moved ? `<rect x="92" y="250" width="100" height="186" fill="#0d0907"/><path d="M92 250 q50 -34 100 0" fill="#0d0907"/>` : ''}
    ${H(v, 't_tunnel', `<path d="M100 436 L100 262 q42 -28 84 0 L184 436 Z" fill="#050403" stroke="#4a4f55" stroke-width="4"/>
      ${f.tunnelOpen
        ? `<path d="M100 262 L72 274 L72 432 L100 436 Z" fill="#2a2d31" stroke="#4a4f55" stroke-width="3"/>${[80, 88].map(x => `<line x1="${x}" y1="272" x2="${x}" y2="432" stroke="#4a4f55" stroke-width="3"/>`).join('')}<path d="M110 436 q32 -40 64 0" fill="#1a2a3a" opacity=".55"/><path d="M118 430 q24 -14 48 0" fill="none" stroke="#9ab6d8" stroke-width="1.5" opacity=".5"/>`
        : `${[114, 128, 142, 156, 170].map(x => `<line x1="${x}" y1="${x === 142 ? 250 : 258}" x2="${x}" y2="436" stroke="#5a5f66" stroke-width="4"/>`).join('')}<line x1="100" y1="320" x2="184" y2="320" stroke="#5a5f66" stroke-width="4"/><rect x="132" y="330" width="22" height="26" rx="3" fill="#8a929b" stroke="#c7ccd4"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${134 + i * 4}" y="340" width="3" height="9" fill="#1a1a1a"/>`).join('')}`}
      ${hit(92, 236, 100, 204)}`)}
    <!-- 雜物架 -->
    ${H(v, 't_shelf', `<g ${moved ? 'transform="translate(-96 0)"' : ''}><rect x="30" y="110" width="140" height="322" fill="#2a1c12"/>${[150, 230, 310, 390].map(y => `<rect x="26" y="${y}" width="148" height="8" fill="#5a3d22"/>`).join('')}
      ${[44, 70, 96, 124].map((x, i) => `<rect x="${x}" y="${126 + (i % 2) * 4}" width="18" height="${24 - (i % 2) * 4}" rx="3" fill="${['#6b5a3a', '#4f6a5a', '#7a5a3a', '#5a5a6a'][i]}"/>`).join('')}
      <circle cx="70" cy="214" r="13" fill="none" stroke="#b59a5e" stroke-width="5"/><circle cx="70" cy="214" r="6" fill="none" stroke="#b59a5e" stroke-width="3"/>
      <rect x="104" y="196" width="50" height="34" fill="#4a3a22"/><path d="M104 196 l25 -10 l25 10" fill="#5a4630"/>
      ${[0, 1, 2, 3, 4].map(i => `<line x1="${48 + i * 6}" y1="${310 - 70}" x2="${52 + i * 6}" y2="310" stroke="#a89060" stroke-width="3"/>`).join('')}
      <rect x="100" y="270" width="56" height="40" fill="#3a2a1a"/><rect x="104" y="274" width="48" height="10" fill="#6b5a3a"/>
      <path d="M40 390 h120 l-8 -40 h-104 z" fill="#4a3220"/>${[50, 76, 102, 128].map(x => `<ellipse cx="${x + 10}" cy="350" rx="11" ry="5" fill="#6b4a2c"/>`).join('')}
      <line x1="160" y1="120" x2="176" y2="420" stroke="#6b5a3a" stroke-width="5"/><path d="M168 118 l18 -10 l4 8 z" fill="#8a929b"/>
      ${bolt ? `<rect x="92" y="424" width="12" height="18" rx="2" fill="#8a929b" stroke="#c7ccd4"/><rect x="88" y="420" width="20" height="5" rx="2" fill="#5a5f66"/>` : ''}</g>
      ${moved ? hit(0, 104, 92, 330) : hit(26, 104, 160, 330)}`)}
    <!-- 小窗：山谷對面的燈 -->
    ${H(v, 't_window', `<rect x="436" y="124" width="112" height="104" fill="#3a2818" stroke="#5a3d22" stroke-width="5"/>
      <rect x="444" y="132" width="96" height="88" fill="#0b1226"/>${starfield(17, 14, 446, 134, 92, 46)}
      <path d="M444 196 Q470 168 498 182 Q520 170 540 186 L540 220 L444 220 Z" fill="#060a16"/>
      <circle cx="510" cy="186" r="9" fill="url(#sr-cottage)"/><rect x="506" y="183" width="7" height="6" fill="#ffd98a"/><path d="M503 184 l7 -6 l7 6" fill="none" stroke="#1a1408" stroke-width="1.5"/>
      <line x1="492" y1="132" x2="492" y2="220" stroke="#5a3d22" stroke-width="4"/><line x1="444" y1="176" x2="540" y2="176" stroke="#5a3d22" stroke-width="4"/>
      <rect x="432" y="226" width="120" height="7" fill="#4a3220"/>${hit(430, 118, 124, 118)}`)}
    <!-- 舊月曆 -->
    ${H(v, 't_calendar', `<rect x="590" y="116" width="62" height="82" fill="#e5dcc4" transform="rotate(-2 621 157)"/>
      <g transform="rotate(-2 621 157)"><rect x="590" y="116" width="62" height="16" fill="#a5473f"/><text x="621" y="128" text-anchor="middle" font-size="10" fill="#f6ecd6" class="t-mono">1999.12</text>
      ${[0, 1, 2, 3, 4].map(rr => [0, 1, 2, 3, 4, 5, 6].map(c => `<rect x="${594 + c * 8}" y="${138 + rr * 11}" width="6" height="7" fill="#b9ad90" opacity=".6"/>`).join('')).join('')}
      <circle cx="${594 + 3 * 8 + 3}" cy="${138 + 1 * 11 + 3.5}" r="6" fill="none" stroke="#c0392b" stroke-width="1.5"/></g>
      <circle cx="621" cy="112" r="2.5" fill="#8a929b"/>${hit(584, 106, 74, 98)}`)}
    <!-- 工作台：天平、種子罐、砝碼盒 -->
    ${shadow(330, 438, 160, 8)}
    <rect x="190" y="304" width="290" height="14" fill="#5a3d22"/><rect x="190" y="304" width="290" height="3" fill="#8a6a42"/>
    <rect x="200" y="318" width="12" height="118" fill="#3a2414"/><rect x="458" y="318" width="12" height="118" fill="#3a2414"/><rect x="212" y="390" width="246" height="8" fill="#3a2414"/>
    ${H(v, 't_balance', `<rect x="316" y="292" width="40" height="12" rx="2" fill="#3a3f45"/><rect x="332" y="200" width="8" height="94" fill="url(#sr-brass)"/><circle cx="336" cy="200" r="6" fill="#c9a24f"/>
      <line x1="266" y1="204" x2="406" y2="196" stroke="#c9a24f" stroke-width="5" stroke-linecap="round"/><path d="M336 196 l-4 -14 h8 z" fill="#e7c77e"/>
      ${[[266, 204], [406, 196]].map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x - 18}" y2="${y + 50}" stroke="#a5a5a5" stroke-width="1.2"/><line x1="${x}" y1="${y}" x2="${x + 18}" y2="${y + 50}" stroke="#a5a5a5" stroke-width="1.2"/><path d="M${x - 24} ${y + 50} h48 q-4 10 -24 10 q-20 0 -24 -10 z" fill="url(#sr-brass)"/>`).join('')}
      ${tin(208, 272, '#6f8fb8', '#9fb6d8', esc(t(L('月', 'MOON'))))}${tin(240, 272, '#4f8a5b', '#7fb08a', esc(t(L('蕨', 'FERN'))))}${tin(426, 272, '#c9a46a', '#e3c99a', esc(t(L('仙', 'CACT'))))}
      ${hit(200, 176, 260, 132)}`)}
    ${H(v, 't_weights', `<rect x="366" y="284" width="52" height="20" fill="#6b4a2c" stroke="#3a2414" stroke-width="2"/><path d="M366 284 l8 -14 h52 l-8 14 z" fill="#7a5a36"/>
      <path d="M378 284 q4 -10 8 0 z" fill="url(#sr-brass)"/><ellipse cx="400" cy="291" rx="6" ry="3" fill="#1a1006"/>${hit(362, 266, 60, 42)}`)}
    <!-- 種子櫃 -->
    ${shadow(756, 438, 92, 7)}
    ${H(v, 't_cabinet', `<rect x="672" y="170" width="168" height="264" fill="#3a2414" stroke="#2a190c" stroke-width="3"/><rect x="668" y="164" width="176" height="10" fill="#5a3d22"/>
      ${drawers.join('')}
      ${f.cabinetOpen
        ? `<rect x="682" y="186" width="68" height="212" fill="#120a06"/><path d="M682 186 L652 196 L652 392 L682 398 Z" fill="#5a3d22" stroke="#2f1d11" stroke-width="2"/><line x1="700" y1="194" x2="736" y2="392" stroke="#7a5a36" stroke-width="5"/>`
        : `<rect x="736" y="396" width="40" height="26" rx="3" fill="#8a929b" stroke="#c7ccd4"/>${[0, 1, 2].map(i => `<rect x="${741 + i * 11}" y="402" width="9" height="14" fill="#1a1a1a"/>`).join('')}`}
      ${hit(664, 160, 184, 278)}`)}
    <!-- 出口 -->
    ${H(v, 't_exit', `<rect x="882" y="214" width="66" height="222" fill="#1a2b22" stroke="#5a3d22" stroke-width="4"/><rect x="890" y="224" width="50" height="70" fill="#2f5a3f" opacity=".5"/><circle cx="892" cy="330" r="3.5" fill="#c9a24f"/>
      ${exitPlaque(915, 200, '← ' + t(G.rooms.greenhouse.name))}${hit(876, 182, 78, 258)}`)}
    <!-- 柴堆 -->
    ${[0, 1, 2].map(row => [0, 1, 2, 3].map(c => `<circle cx="${210 + c * 22 + (row % 2) * 11}" cy="${432 - row * 18}" r="10" fill="#4a3220" stroke="#2a1c10" stroke-width="2"/><circle cx="${210 + c * 22 + (row % 2) * 11}" cy="${432 - row * 18}" r="4" fill="#6b4a2c"/>`).join('')).join('')}
    `;
  }

  /* ---------------- 閣樓（資深） ---------------- */
  function attic(v) {
    const f = v.s.flags;
    const r = rng(29);
    let dust = '';
    for (let i = 0; i < 30; i++) dust += `<circle cx="${(400 + r() * 200).toFixed(1)}" cy="${(160 + r() * 280).toFixed(1)}" r="${(0.6 + r()).toFixed(1)}" fill="#e8dcc0" opacity="${(0.08 + r() * 0.25).toFixed(2)}"/>`;
    const marks = [[380, 3], [352, 5], [322, 7], [292, 9], [236, 13]];
    const frames = G.PHOTO_ORDER.map((id, i) => {
      const x = 196 + i * 42, y = 226;
      const inside = f.photosSolved ? `<g transform="translate(${x + 3} ${y + 3}) scale(${30 / 160} ${36 / 120})">${photoScene(G.PHOTOS.find(p => p.id === id), true)}</g>` : `<rect x="${x + 3}" y="${y + 3}" width="30" height="36" fill="#120c08"/>`;
      return `<rect x="${x}" y="${y}" width="36" height="42" fill="#6b4a1e" stroke="#2a1a0c" stroke-width="2"/>${inside}<circle cx="${x + 18}" cy="${y - 6}" r="1.6" fill="#8a929b"/><path d="M${x + 6} ${y} L${x + 18} ${y - 6} L${x + 30} ${y}" fill="none" stroke="#8a929b" stroke-width=".8"/>`;
    }).join('');
    return `
    <defs>
      <linearGradient id="at-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a130d"/><stop offset="1" stop-color="#2e2117"/></linearGradient>
      <linearGradient id="at-moon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d6ff" stop-opacity=".22"/><stop offset="1" stop-color="#c9d6ff" stop-opacity="0"/></linearGradient>
      <radialGradient id="at-sky" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#22305a"/><stop offset="1" stop-color="#0a1022"/></radialGradient>
    </defs>
    <rect width="960" height="540" fill="#0e0a07"/>
    <!-- 山牆與斜屋頂 -->
    <polygon points="150,440 150,190 480,24 810,190 810,440" fill="url(#at-wall)"/>
    ${[...Array(17)].map((_, i) => `<line x1="${150 + i * 41}" y1="440" x2="${150 + i * 41}" y2="${Math.max(24 + Math.abs(480 - (150 + i * 41)) * 0.503, 30)}" stroke="#140d08" stroke-width="2"/>`).join('')}
    <polygon points="0,0 480,0 480,24 150,190 0,265" fill="#120c08"/><polygon points="960,0 480,0 480,24 810,190 960,265" fill="#120c08"/>
    ${[0, 1, 2, 3].map(i => `<line x1="${i * 45}" y1="${265 - i * 22}" x2="${150 + i * 110}" y2="${190 - i * 55}" stroke="#2a1d12" stroke-width="6"/><line x1="${960 - i * 45}" y1="${265 - i * 22}" x2="${810 - i * 110}" y2="${190 - i * 55}" stroke="#2a1d12" stroke-width="6"/>`).join('')}
    <path d="M150 190 L480 24 L810 190" fill="none" stroke="#3a2818" stroke-width="10"/>
    <rect x="0" y="440" width="960" height="100" fill="#1e150e"/>
    ${perspectivePlanks(440, 540, 480, 280, 22, '#0f0a06')}
    <rect y="436" width="960" height="6" fill="#2a1d12"/>
    <polygon points="440,190 520,190 640,540 330,540" fill="url(#at-moon)"/>${dust}
    <!-- 圓窗 -->
    ${H(v, 'a_window', `<circle cx="480" cy="140" r="52" fill="#3a2818"/><circle cx="480" cy="140" r="44" fill="url(#at-sky)"/>${starfield(37, 16, 444, 104, 72, 72)}
      <circle cx="502" cy="120" r="6" fill="#efe9d2" opacity=".9"/><line x1="436" y1="140" x2="524" y2="140" stroke="#3a2818" stroke-width="4"/><line x1="480" y1="96" x2="480" y2="184" stroke="#3a2818" stroke-width="4"/>
      <circle cx="480" cy="140" r="46" fill="none" stroke="#6b4a2c" stroke-width="3"/>${hit(426, 86, 108, 108)}`)}
    <!-- 相框牆 -->
    ${H(v, 'a_frame', `${frames}<rect x="190" y="276" width="252" height="10" rx="2" fill="#2a1c12"/><text x="316" y="284.5" text-anchor="middle" font-size="8" fill="#c9a24f">${esc(t(L('從前 → 現在', 'past → present')))}</text>${hit(188, 210, 258, 80)}`)}
    <!-- 身高刻度的柱子 -->
    ${H(v, 'a_marks', `<rect x="734" y="80" width="28" height="360" fill="#4a3220"/><rect x="734" y="80" width="6" height="360" fill="#000" opacity=".2"/>
      ${marks.map(([y, a]) => `<line x1="736" y1="${y}" x2="760" y2="${y}" stroke="#e8dcc0" stroke-width="1.6"/><text x="748" y="${y - 3}" text-anchor="middle" font-size="7" fill="#e8dcc0">${a}</text>`).join('')}${hit(728, 76, 40, 368)}`)}
    <!-- 木馬 -->
    <path d="M44 430 q50 22 100 0" fill="none" stroke="#3a2818" stroke-width="6"/><path d="M70 420 l10 -40 h40 l10 40 M80 380 l-6 -20 q-4 -14 10 -18 q10 0 8 12 l-4 8" fill="#3a2818" stroke="#3a2818" stroke-width="4"/>
    <!-- 玩具箱 -->
    ${shadow(268, 442, 74, 6)}
    ${H(v, 'a_chest', `<rect x="200" y="368" width="136" height="70" rx="4" fill="#5a3a24" stroke="#2a190c" stroke-width="3"/><path d="M200 368 q68 -22 136 0" fill="#6b4a2c" stroke="#2a190c" stroke-width="3"/>
      ${[[226, 398], [268, 410], [310, 396]].map(([x, y]) => emblemGlyph('emblem_star', x, y, 7, '#e8c97f')).join('')}<rect x="262" y="364" width="12" height="12" rx="2" fill="#c9a24f"/>${hit(196, 344, 144, 98)}`)}
    <!-- 相片盒 -->
    ${H(v, 'a_photobox', `<rect x="356" y="408" width="86" height="30" fill="#4a3220"/><rect x="368" y="384" width="62" height="24" rx="2" fill="#8a929b" stroke="#c7ccd4"/><rect x="368" y="384" width="62" height="6" fill="#a9b2bc"/>
      ${f.photosTaken ? '' : `<rect x="376" y="374" width="20" height="14" fill="#d9c9a5" transform="rotate(-8 386 381)"/>`}${hit(352, 366, 94, 76)}`)}
    <!-- 音樂盒與小桌 -->
    ${shadow(628, 442, 70, 6)}
    <rect x="566" y="338" width="124" height="10" fill="#5a3d22"/><rect x="576" y="348" width="8" height="90" fill="#3a2414"/><rect x="672" y="348" width="8" height="90" fill="#3a2414"/>
    ${H(v, 'a_musicbox', `<rect x="590" y="304" width="76" height="34" rx="3" fill="#6b3a24" stroke="#2a190c" stroke-width="2"/>
      ${f.crankInserted || f.musicSolved ? `<path d="M590 304 L600 274 L676 274 L666 304 Z" fill="#7a4a2c" stroke="#2a190c" stroke-width="2"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<line x1="${600 + i * 6}" y1="312" x2="${600 + i * 6}" y2="${326 - i * 0.8}" stroke="#d8dee8" stroke-width="2"/>`).join('')}` : `<rect x="588" y="298" width="80" height="8" rx="2" fill="#7a4a2c"/>${[[606, 302], [628, 302], [650, 302]].map(([x, y]) => emblemGlyph('emblem_star', x, y, 3, '#e8c97f')).join('')}`}
      <circle cx="${f.crankInserted ? 672 : 670}" cy="320" r="3" fill="#1a1006"/>${f.crankInserted ? `<path d="M672 320 h10 m0 -6 v12" stroke="#c9a24f" stroke-width="3"/>` : ''}
      ${f.musicSolved ? `<rect x="604" y="338" width="48" height="8" fill="#2a190c"/>` : ''}${hit(584, 268, 104, 76)}`)}
    <!-- 箱子 -->
    <rect x="830" y="350" width="100" height="88" fill="#4a3220" stroke="#2a190c" stroke-width="2"/><rect x="846" y="296" width="76" height="56" fill="#5a3d22" stroke="#2a190c" stroke-width="2"/><path d="M830 394 h100 M846 324 h76" stroke="#2a190c" stroke-width="2"/>
    <!-- 下樓的梯口 -->
    ${H(v, 'a_exit', `<path d="M760 470 L900 470 L930 530 L740 530 Z" fill="#050403" stroke="#3a2818" stroke-width="3"/><line x1="800" y1="470" x2="790" y2="530" stroke="#6b4a2c" stroke-width="5"/><line x1="860" y1="470" x2="870" y2="530" stroke="#6b4a2c" stroke-width="5"/>
      ${[486, 508].map(y => `<line x1="${797 - (y - 470) / 6}" y1="${y}" x2="${863 + (y - 470) / 6}" y2="${y}" stroke="#6b4a2c" stroke-width="3"/>`).join('')}
      ${exitPlaque(830, 458, '↓ ' + t(G.rooms.foyer.name))}${hit(736, 440, 200, 96)}`)}
    `;
  }

  const CAP_COLORS = { red: '#ff5a48', blue: '#7a8fc9', yellow: '#f0c95a', white: '#f4e6e0', green: '#5fb86e', black: '#1c1c1c' };
  const ROOM_ART = { foyer, study, greenhouse, observatory, darkroom, storeroom, attic };
  function scene(room, v) {
    // 模板裡的 <!-- 註解 --> 只是給讀程式的人看的，不放進畫面
    return `<svg class="scene-svg" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc(t(G.rooms[room].name))}">${ROOM_ART[room](v).replace(/<!--[\s\S]*?-->/g, '')}</svg>`;
  }

  /* ------------------------------------------------------------
   * 物品圖示（48×48）
   * ------------------------------------------------------------ */
  const INK = '#e8dcc0', BRASS = '#d9b45e', DIM = '#8a7f6a';
  const page = (num) => `<path d="M12 6 h20 l6 6 v30 h-26 z" fill="#e8dcc0"/><path d="M32 6 v6 h6" fill="#cfc2a2"/>${[16, 21, 26, 31].map(y => `<line x1="16" y1="${y}" x2="33" y2="${y}" stroke="#a89c80" stroke-width="1.4"/>`).join('')}<text x="25" y="41" text-anchor="middle" font-size="8" font-weight="700" fill="#6b5a3a" class="t-serif">${num}</text>`;
  const ICONS = {
    letter: `<rect x="6" y="13" width="36" height="24" rx="2" fill="#e8dcc0"/><path d="M6 13 l18 14 l18 -14" fill="none" stroke="#a89c80" stroke-width="1.6"/><circle cx="24" cy="28" r="5" fill="#a83a2a"/><circle cx="24" cy="28" r="2.4" fill="#d05a46"/>`,
    flashlight_dead: `<g transform="rotate(-35 24 24)"><rect x="8" y="20" width="22" height="9" rx="2" fill="#7a828c"/><path d="M30 18 h8 l2 -2 v17 l-2 -2 h-8 z" fill="#5a626c"/><rect x="14" y="18" width="4" height="3" fill="#3a3f45"/><circle cx="40" cy="24.5" r="1.5" fill="#2a2d33"/></g>`,
    battery: `<rect x="9" y="12" width="12" height="26" rx="2" fill="#3a6a4a"/><rect x="12" y="9" width="6" height="3" fill="#bbb"/><rect x="25" y="12" width="12" height="26" rx="2" fill="#3a6a4a"/><rect x="28" y="9" width="6" height="3" fill="#bbb"/><path d="M15 18 v6 M12 21 h6 M31 18 v6 M28 21 h6" stroke="#e8dcc0" stroke-width="1.5"/><rect x="7" y="28" width="32" height="3" fill="#a83a2a" opacity=".8"/>`,
    flashlight: `<polygon points="30,15 46,4 46,30" fill="#fff6c8" opacity=".55"/><g transform="rotate(-35 24 24)"><rect x="8" y="20" width="22" height="9" rx="2" fill="#a9b2bc"/><path d="M30 18 h8 l2 -2 v17 l-2 -2 h-8 z" fill="#8a929b"/><rect x="14" y="18" width="4" height="3" fill="#3a3f45"/><circle cx="40" cy="24.5" r="2" fill="#fffbe0"/></g>`,
    grid_paper: `<rect x="8" y="8" width="32" height="32" fill="#f2ecdc"/>${[16, 24, 32].map(p => `<line x1="${p}" y1="8" x2="${p}" y2="40" stroke="#9fb0c8" stroke-width="1"/><line x1="8" y1="${p}" x2="40" y2="${p}" stroke="#9fb0c8" stroke-width="1"/>`).join('')}<path d="M6 6 h4 M8 4 v4 M38 6 h4 M40 4 v4 M6 42 h4 M8 40 v4 M38 42 h4 M40 40 v4" stroke="#b5473f" stroke-width="1.4"/>`,
    transparency: `<rect x="8" y="8" width="32" height="32" fill="#bcd4f0" opacity=".35" stroke="#9fb0c8" stroke-dasharray="3 2"/>${emblemGlyph('emblem_star', 18, 18, 3.5, '#2d4f8a')}${emblemGlyph('emblem_star', 30, 30, 3.5, '#2d4f8a')}<circle cx="30" cy="30" r="6" fill="none" stroke="#2d4f8a" stroke-width="1.5"/>${emblemGlyph('emblem_star', 32, 14, 2.5, '#2d4f8a')}<path d="M6 6 h4 M8 4 v4 M38 42 h4 M40 40 v4" stroke="#b5473f" stroke-width="1.4"/>`,
    overlay: `<rect x="6" y="10" width="30" height="30" fill="#f2ecdc"/>${[16, 26].map(p => `<line x1="${p}" y1="10" x2="${p}" y2="40" stroke="#9fb0c8"/><line x1="6" y1="${p}" x2="36" y2="${p}" stroke="#9fb0c8"/>`).join('')}<rect x="12" y="6" width="30" height="30" fill="#bcd4f0" opacity=".4" stroke="#7a95b8"/><circle cx="21" cy="21" r="5" fill="none" stroke="#2d4f8a" stroke-width="1.6"/><circle cx="31" cy="29" r="5" fill="none" stroke="#2d4f8a" stroke-width="1.6"/>`,
    greenhouse_key: `<path d="M12 8 q14 2 12 16 q-14 -2 -12 -16 z" fill="#6aa279"/><path d="M13 9 l10 14" stroke="#3f6a4a" stroke-width="1.2"/><rect x="21" y="22" width="4" height="20" fill="#9aa1ab"/><path d="M25 34 h6 v3 h-6 M25 39 h4" stroke="#9aa1ab" stroke-width="3"/>`,
    trowel: `<rect x="21" y="4" width="6" height="16" rx="3" fill="#8a5a32"/><rect x="23" y="20" width="2" height="6" fill="#9aa1ab"/><path d="M14 26 h20 q0 12 -10 18 q-10 -6 -10 -18 z" fill="#a9b2bc"/><path d="M24 28 v12" stroke="#7a828c" stroke-width="1.2"/>`,
    brass_key: `<circle cx="15" cy="15" r="8" fill="none" stroke="${BRASS}" stroke-width="4"/><path d="M20 20 l18 18" stroke="${BRASS}" stroke-width="4" stroke-linecap="round"/><path d="M31 31 l5 -5 M35 35 l4 -4" stroke="${BRASS}" stroke-width="3.5"/><circle cx="34" cy="10" r="2" fill="#6b4a2c"/>`,
    valve_wheel: `<circle cx="24" cy="24" r="15" fill="none" stroke="${BRASS}" stroke-width="4"/>${[0, 45, 90, 135].map(a => `<line x1="${24 + Math.cos(a * Math.PI / 180) * 15}" y1="${24 + Math.sin(a * Math.PI / 180) * 15}" x2="${24 - Math.cos(a * Math.PI / 180) * 15}" y2="${24 - Math.sin(a * Math.PI / 180) * 15}" stroke="${BRASS}" stroke-width="2.5"/>`).join('')}<circle cx="24" cy="24" r="5" fill="#a87b2e"/><rect x="34" y="34" width="8" height="6" fill="#e8dcc0" transform="rotate(20 38 37)"/>`,
    eyepiece: `<rect x="15" y="12" width="18" height="26" rx="3" fill="${BRASS}"/><rect x="15" y="16" width="18" height="3" fill="#8a6324"/><rect x="15" y="30" width="18" height="3" fill="#8a6324"/><ellipse cx="24" cy="12" rx="9" ry="3.5" fill="#2a3a5a"/><ellipse cx="22" cy="11.5" rx="3" ry="1" fill="#9fc0ff" opacity=".8"/><rect x="18" y="38" width="12" height="5" fill="#8a6324"/>`,
    red_bulb: `<path d="M24 6 c-9 0 -13 7 -13 13 c0 6 6 9 7 14 h12 c1 -5 7 -8 7 -14 c0 -6 -4 -13 -13 -13 z" fill="#e8483a"/><circle cx="20" cy="15" r="3" fill="#ff9a8a" opacity=".7"/><rect x="18" y="33" width="12" height="9" fill="#a9b2bc"/>${[35, 38].map(y => `<line x1="18" y1="${y}" x2="30" y2="${y}" stroke="#6a727c"/>`).join('')}`,
    note_left: `<path d="M8 8 h20 l-3 6 l4 6 l-4 6 l3 6 l-4 6 l4 4 h-20 z" fill="#e8dcc0"/>${[15, 21, 27, 33].map(y => `<line x1="12" y1="${y}" x2="24" y2="${y}" stroke="#a89c80" stroke-width="1.4"/>`).join('')}`,
    note_right: `<path d="M40 8 h-20 l3 6 l-4 6 l4 6 l-3 6 l4 6 l-4 4 h20 z" fill="#e5d8b8"/>${[15, 21, 27, 33].map(y => `<line x1="25" y1="${y}" x2="36" y2="${y}" stroke="#a89c80" stroke-width="1.4"/>`).join('')}`,
    note_full: `<rect x="6" y="8" width="36" height="34" fill="#e8dcc0"/><path d="M24 8 l-3 6 l4 6 l-4 6 l3 6 l-4 6 l4 4" fill="none" stroke="#a89c80" stroke-width="1.2"/>${[15, 21, 27, 33].map(y => `<line x1="10" y1="${y}" x2="38" y2="${y}" stroke="#a89c80" stroke-width="1.4"/>`).join('')}`,
    page1: page('I'), page2: page('II'), page3: page('III'), page4: page('IV'),
    diary: `<rect x="10" y="6" width="28" height="36" rx="2" fill="#6b2a2a"/><rect x="10" y="6" width="5" height="36" fill="#4a1a1a"/><rect x="18" y="12" width="16" height="10" fill="none" stroke="${BRASS}" stroke-width="1.2"/><path d="M30 6 v20 l3 -3 l3 3 v-20" fill="${BRASS}"/>`,
    emblem_sun: `<circle cx="24" cy="24" r="18" fill="url(#ic-brass)" stroke="#f3d68f" stroke-width="1.5"/>${emblemGlyph('emblem_sun', 24, 24, 11, '#5a3d10')}`,
    emblem_moon: `<circle cx="24" cy="24" r="18" fill="#c9d0dc" stroke="#f2f4f8" stroke-width="1.5"/>${emblemGlyph('emblem_moon', 23, 24, 11, '#4a5468')}`,
    emblem_star: `<circle cx="24" cy="24" r="18" fill="#22356a" stroke="#7a95d8" stroke-width="1.5"/>${emblemGlyph('emblem_star', 24, 24, 12, '#e8eeff')}`,
    // 資深模式
    storeroom_key: `<circle cx="14" cy="16" r="7" fill="none" stroke="#5a5f66" stroke-width="4"/><path d="M19 21 l16 16" stroke="#5a5f66" stroke-width="4" stroke-linecap="round"/><path d="M29 31 l4 -4 M33 35 l4 -4" stroke="#5a5f66" stroke-width="3"/><rect x="26" y="6" width="16" height="10" rx="2" fill="#e8dcc0" transform="rotate(20 34 11)"/><line x1="21" y1="12" x2="27" y2="9" stroke="#a89c80"/>`,
    paperweight: `<path d="M10 38 q0 -20 14 -20 q14 0 14 20 z" fill="url(#ic-brass)"/><rect x="8" y="36" width="32" height="5" rx="2" fill="#8a6324"/><circle cx="24" cy="16" r="4" fill="none" stroke="#d9b45e" stroke-width="2.5"/><text x="24" y="33" text-anchor="middle" font-size="10" font-weight="700" fill="#3b2a10">5</text>`,
    hook_pole: `<line x1="8" y1="42" x2="36" y2="10" stroke="#8a5a32" stroke-width="4" stroke-linecap="round"/><path d="M36 10 q8 -6 8 2 q0 6 -6 6" fill="none" stroke="#9aa1ab" stroke-width="3"/>`,
    code_card: `<rect x="6" y="10" width="36" height="28" rx="3" fill="#f2ecdc" stroke="#9fb0c8"/><circle cx="13" cy="18" r="2" fill="#2d4f8a"/><rect x="17" y="17" width="8" height="2.5" fill="#2d4f8a"/><circle cx="29" cy="18" r="2" fill="#2d4f8a"/><rect x="11" y="25" width="8" height="2.5" fill="#c0392b"/><rect x="21" y="25" width="8" height="2.5" fill="#c0392b"/><rect x="31" y="25" width="8" height="2.5" fill="#c0392b"/><circle cx="14" cy="32" r="2" fill="#2d4f8a"/><circle cx="20" cy="32" r="2" fill="#2d4f8a"/>`,
    photos: `<rect x="12" y="8" width="28" height="22" fill="#d9c9a5" stroke="#efe6cf" stroke-width="2" transform="rotate(10 26 19)"/><rect x="8" y="14" width="28" height="22" fill="#cbb48a" stroke="#efe6cf" stroke-width="2" transform="rotate(-6 22 25)"/><rect x="10" y="18" width="28" height="22" fill="#b59c72" stroke="#efe6cf" stroke-width="2"/><path d="M14 36 l7 -9 l5 5 l4 -4 l6 8 z" fill="#6a5236"/>`,
    photo_comet: `<rect x="8" y="10" width="32" height="28" fill="#6a5236" stroke="#efe6cf" stroke-width="2"/><circle cx="24" cy="22" r="9" fill="#2b2216"/><path d="M19 25 l9 -6" stroke="#f6ead0" stroke-width="1.6"/><circle cx="19" cy="25" r="1.6" fill="#f6ead0"/><text x="37" y="35" text-anchor="end" font-size="5" fill="#e8742a" class="t-mono">99 12 08</text>`,
    crank: `<circle cx="18" cy="18" r="9" fill="none" stroke="url(#ic-brass)" stroke-width="4"/>${emblemGlyph('emblem_star', 18, 18, 4, '#d9b45e')}<path d="M24 24 l12 12" stroke="#d9b45e" stroke-width="4" stroke-linecap="round"/><rect x="32" y="30" width="8" height="10" rx="1" fill="#a87b2e" transform="rotate(45 36 35)"/>`,
    qing_letter: `<rect x="6" y="13" width="36" height="24" rx="2" fill="#f2d9e0"/><path d="M6 13 l18 13 l18 -13" fill="none" stroke="#c9a0aa" stroke-width="1.6"/>${emblemGlyph('emblem_star', 33, 30, 5, '#e8b04f')}`,
    plate: `<rect x="6" y="10" width="36" height="28" rx="2" fill="#0c0f16" stroke="#9aa6b8" stroke-width="1.5"/>${starfield(5, 8, 8, 12, 32, 24, { min: 0.4, var: 0.6 })}<path d="M16 26 l18 -8 l1 2 l-18 8 z" fill="#fffbe8" opacity=".7"/><circle cx="16" cy="27" r="2.4" fill="#fffbe8"/>`,
  };
  function icon(id) {
    return `<svg viewBox="0 0 48 48" class="icon" aria-hidden="true"><defs><radialGradient id="ic-brass" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#f6dc95"/><stop offset="1" stop-color="#a87b2e"/></radialGradient></defs>${ICONS[id] || ''}</svg>`;
  }
  // 狀態列上的小徽章（尚未找到時只畫輪廓）
  function emblemChip(e, state) {
    const color = state === 'missing' ? '#59607a' : state === 'held' ? '#e8c97f' : '#2a1d08';
    return `<svg viewBox="0 0 24 24" class="emb-svg" aria-hidden="true">${emblemGlyph(e, 12, 12, 8, color)}</svg>`;
  }

  /* ------------------------------------------------------------
   * 謎題圖
   * ------------------------------------------------------------ */
  function miniConst(id, x, y, size) {
    const c = G.CONSTELLATIONS[id], k = size / 100;
    return `<g>${c.lines.map(([a, b]) => `<line x1="${x + c.stars[a][0] * k}" y1="${y + c.stars[a][1] * k}" x2="${x + c.stars[b][0] * k}" y2="${y + c.stars[b][1] * k}" stroke="#7a6a4a" stroke-width=".8"/>`).join('')}${c.stars.map(([sx, sy]) => `<circle cx="${x + sx * k}" cy="${y + sy * k}" r="1.3" fill="#2a2418"/>`).join('')}</g>`;
  }

  const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const starCount = n => isEn() ? `${n} stars` : `${NUM[n]}星`;
  function poster() {
    const cell = (id, i) => {
      const c = G.CONSTELLATIONS[id];
      const x = 20 + (i % 4) * 160, y = 20 + Math.floor(i / 4) * 190, k = 1.1;
      return `<g><rect x="${x}" y="${y}" width="148" height="176" rx="4" fill="#efe6cf" stroke="#cbbd99"/>
        ${c.lines.map(([a, b]) => `<line x1="${x + 19 + c.stars[a][0] * k}" y1="${y + 14 + c.stars[a][1] * k}" x2="${x + 19 + c.stars[b][0] * k}" y2="${y + 14 + c.stars[b][1] * k}" stroke="#a8946a" stroke-width="1.4" stroke-dasharray="3 2"/>`).join('')}
        ${c.stars.map(([sx, sy]) => `<circle cx="${x + 19 + sx * k}" cy="${y + 14 + sy * k}" r="4" fill="#2b2418"/>`).join('')}
        <text x="${x + 74}" y="${y + 160}" text-anchor="middle" font-size="18" fill="#2b2418" font-weight="700">${esc(t(c.name))}<tspan font-size="13" font-weight="400" fill="#6b5a3a">${isEn() ? ' · ' : '　'}${starCount(c.stars.length)}</tspan></text></g>`;
    };
    return `<svg viewBox="0 0 660 400" class="art" role="img" aria-label="${esc(t(L('手繪星座圖：八個星座', 'Hand-drawn chart of eight constellations')))}">${G.CONSTELLATION_ORDER.map(cell).join('')}</svg>`;
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
    return `<svg viewBox="0 0 400 400" class="art eyepiece" role="img" aria-label="${esc(t(L('望遠鏡目鏡中的星空：三團明亮的星群上下排開；視野上方看得到倒掛的山稜與樹影', 'The view through the eyepiece: three bright groups of stars, one above another; at the top of the view hang an upside-down ridge and trees')))}">
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
    const en = isEn();
    const books = G.BOOKS.map((b, i) => {
      const x = 24 + i * 66, h = heights[i], y = 270 - h, c = colorOf[b.color];
      const ink = b.color === 'yellow' ? '#3b2a10' : '#f3ecd6';
      const title = en
        ? `<text x="${x + 29}" y="${y + 74}" text-anchor="middle" font-size="12" fill="${ink}" letter-spacing="2" transform="rotate(-90 ${x + 29} ${y + 74})">STAR ATLAS</text>`
        : `<text x="${x + 29}" y="${y + 44}" text-anchor="middle" font-size="15" fill="${ink}" writing-mode="tb" letter-spacing="3">星空圖鑑</text>`;
      const tag = b.color === 'brown' ? '' : en
        ? `<rect x="${x + 5}" y="${y + h - 104}" width="48" height="16" rx="8" fill="#f3ecd6" stroke="${ink}" stroke-width="1"/><text x="${x + 29}" y="${y + h - 92.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#3b2a10" letter-spacing=".5">${t(G.COLOR_NAMES[b.color]).toUpperCase()}</text>`
        : `<circle cx="${x + 29}" cy="${y + h - 96}" r="12" fill="#f3ecd6" stroke="${ink}" stroke-width="1"/><text x="${x + 29}" y="${y + h - 91.5}" text-anchor="middle" font-size="13" fill="#3b2a10">${t(G.COLOR_NAMES[b.color])}</text>`;
      return `<g><rect x="${x}" y="${y}" width="58" height="${h}" rx="3" fill="${c}"/><rect x="${x}" y="${y}" width="6" height="${h}" fill="#000" opacity=".15"/><rect x="${x + 50}" y="${y}" width="4" height="${h}" fill="#fff" opacity=".08"/>
        <rect x="${x}" y="${y + 16}" width="58" height="4" fill="#e3c27a" opacity=".7"/><rect x="${x}" y="${y + h - 22}" width="58" height="4" fill="#e3c27a" opacity=".7"/>
        ${title}${tag}
        <rect x="${x + 6}" y="${y + h - 74}" width="46" height="44" rx="3" fill="#f3ecd6"/>
        <text x="${x + 29}" y="${y + h - 56}" text-anchor="middle" font-size="${en ? 10 : 12}" fill="#3b2a10">${en ? 'VOL.' : '第'}</text>
        <text x="${x + 29}" y="${y + h - 36}" text-anchor="middle" font-size="19" font-weight="700" fill="#3b2a10">${b.vol}${en ? '' : '卷'}</text></g>`;
    }).join('');
    const desc = G.BOOKS.map(b => en ? `${t(G.COLOR_NAMES[b.color])} Vol. ${b.vol}` : `${t(G.COLOR_NAMES[b.color])}色第${b.vol}卷`).join(en ? ', ' : '、');
    return `<svg viewBox="0 0 640 300" class="art" role="img" aria-label="${esc(en ? `Nine volumes of the Star Atlas on the shelf, left to right: ${desc}` : `書架上的九卷《星空圖鑑》，由左到右：${desc}`)}">
      <rect width="640" height="300" fill="#1a100a"/>${books}<rect x="0" y="270" width="640" height="30" fill="#4a2f1c"/><rect x="0" y="270" width="640" height="3" fill="#7a5236"/></svg>`;
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
        out += `<text class="t-mono" x="${ox + c * cs + cs / 2}" y="${oy + r * cs + cs / 2 + 9}" text-anchor="middle" font-size="27" fill="#2b2418">${d}</text>`;
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
    const label = digits && stars ? G.items.overlay.name : digits ? G.items.grid_paper.name : G.items.transparency.name;
    return `<svg viewBox="0 0 400 400" class="art" role="img" aria-label="${esc(t(label))}">${out}</svg>`;
  }

  // 撕開的便條：沿一道斜向的撕口分成左右兩半（兩種語言的字寬不同，版面各自設定）
  const NOTE_LAYOUT = { zh: { base: 150, step: 16, W: 440, size: 21 }, en: { base: 300, step: 10, W: 640, size: 20 } };
  function note(which, mode) {
    const all = G.noteLines(mode), lines = all[LANG] || all.zh, n = lines.length;
    const lay = NOTE_LAYOUT[LANG] || NOTE_LAYOUT.zh;
    const lh = 34, top = 24, W = lay.W, H = top + n * lh + 16;
    const tearAt = i => lay.base + i * lay.step;                         // 第 i 行的撕口位置
    const by = k => top + k * lh;                                        // 第 k 條行界
    const tx = k => tearAt(k - 0.5) + (k % 2 ? 3 : -3);                  // 行界上的撕口（鋸齒）
    const tear = [];
    for (let k = 0; k <= n; k++) tear.push([tx(k), k === 0 ? 12 : k === n ? H - 8 : by(k)]);
    const leftPoly = [[16, 12], ...tear, [16, H - 8]].map(p => p.join(',')).join(' ');
    const rightPoly = [...tear, [W - 16, H - 8], [W - 16, 12]].map(p => p.join(',')).join(' ');
    const font = `class="t-hand" font-size="${lay.size}" fill="#2b2418"`;
    let out = '';
    if (which !== 'right') {
      out += `<polygon points="${leftPoly}" fill="#efe6cf"/>`;
      lines.forEach(([l], i) => { if (l) out += `<text x="${tearAt(i) - 8}" y="${by(i) + 26}" text-anchor="end" ${font} xml:space="preserve">${esc(l)}</text>`; });
    }
    if (which !== 'left') {
      out += `<g transform="translate(${which === 'full' ? 3 : 0} 0)"><polygon points="${rightPoly}" fill="#e9dfc4"/>`;
      lines.forEach(([, r], i) => { if (r) out += `<text x="${tearAt(i) + 8}" y="${by(i) + 26}" ${font} xml:space="preserve">${esc(r)}</text>`; });
      out += '</g>';
    }
    const maxTear = Math.max(...tear.map(p => p[0])), minTear = Math.min(...tear.map(p => p[0]));
    const vb = which === 'left' ? `0 0 ${maxTear + 16} ${H}` : which === 'right' ? `${minTear - 16} 0 ${W - minTear + 16} ${H}` : `0 0 ${W + 4} ${H}`;
    const halves = { left: lines.map(l => l[0]).filter(Boolean).join(' / '), right: lines.map(l => l[1]).filter(Boolean).join(' / ') };
    const label = { left: t(L('便條左半：', 'Left half of the note: ')) + halves.left, right: t(L('便條右半：', 'Right half of the note: ')) + halves.right, full: t(G.items.note_full.name) }[which];
    return `<svg viewBox="${vb}" class="art note-art note-${which}" role="img" aria-label="${esc(label)}">${out}</svg>`;
  }

  function plate() {
    const cw = 18 * 0.6; // 等寬字一格的寬度
    const en = isEn();
    const sleeve = en ? 'Back of the sleeve (Lu Guan\'s hand)' : '紙套背面（陸觀的筆跡）';
    const line1 = en ? '1999.12.08   22:40   southeast' : '1999.12.08　22:40　東南方';
    const ra = en ? 'RA' : '赤經', dec = en ? 'Dec' : '赤緯';
    const aria = en
      ? 'Glass plate: among the stars, a comet with a short tail; etched in the corner, 1999.12.08 Lu Guan. On the back of the sleeve: 1999.12.08 22:40 southeast, RA 5h27m, declination with the 7 of minus seventeen struck out and corrected to minus sixteen.'
      : '玻璃底片：群星之間一顆拖著短尾的彗星，片角刻著 1999.12.08 陸觀。紙套背面寫著：1999.12.08 22:40 東南方，赤經 5h27m，赤緯負十七度的 7 被劃掉，改成負十六度。';
    return `<svg viewBox="0 0 400 430" class="art" role="img" aria-label="${esc(aria)}">
      <defs><linearGradient id="pl-tail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffbe8" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></linearGradient></defs>
      <rect x="10" y="10" width="380" height="280" rx="6" fill="#0c0f16" stroke="#9aa6b8" stroke-width="3"/>
      ${starfield(77, 90, 20, 20, 360, 250)}
      <path d="M150 150 Q240 130 330 100 L334 112 Q244 146 152 158 Z" fill="url(#pl-tail)"/>
      <circle cx="150" cy="154" r="7" fill="#fffbe8"/><circle cx="150" cy="154" r="16" fill="#fffbe8" opacity=".25"/>
      <text class="t-mono" x="374" y="280" text-anchor="end" font-size="13" fill="#c9cfdb">1999.12.08 ${en ? 'Lu Guan' : '陸觀'}</text>
      <rect x="10" y="302" width="380" height="120" rx="4" fill="#e9dfc4"/>
      <text x="26" y="326" font-size="13" fill="#6b5a3a">${esc(sleeve)}</text>
      <text class="t-hand" x="26" y="354" font-size="${en ? 20 : 18}" fill="#2b2418" xml:space="preserve">${esc(line1)}</text>
      <text class="t-hand" x="26" y="382" font-size="${en ? 20 : 18}" fill="#2b2418">${ra}</text><text class="t-mono" x="72" y="382" font-size="18" fill="#2b2418">5h27m</text>
      <text class="t-hand" x="26" y="410" font-size="${en ? 20 : 18}" fill="#2b2418">${dec}</text>
      <text class="t-mono" x="72" y="410" font-size="18" fill="#2b2418">−1</text>
      <text class="t-mono" x="${72 + cw * 2}" y="410" font-size="18" fill="#2b2418">7</text>
      <line x1="${70 + cw * 2}" y1="406" x2="${74 + cw * 3}" y2="400" stroke="#8a2a20" stroke-width="1.8"/>
      <text class="t-mono" x="${78 + cw * 3}" y="410" font-size="18" fill="#2b2418">6°</text></svg>`;
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
    const en = isEn();
    let pipes = '', valves = '';
    for (const v of G.VALVES) {
      const R = PIPE_ROUTES[v.id];
      for (const seg of R.segs) pipes += `<polyline points="${seg.map(p => p.join(',')).join(' ')}" fill="none" stroke="${col[R.color]}" stroke-width="7" stroke-linejoin="round" opacity="${open[v.id] ? 1 : 0.55}"/>`;
      for (const [x, y] of R.dots || []) pipes += `<circle cx="${x}" cy="${y}" r="7" fill="${col[R.color]}"/>`;
      const on = !!open[v.id];
      const state = on ? t(L('開', 'ON')) : t(L('關', 'OFF'));
      valves += `<g class="valve" data-valve="${v.id}" tabindex="0" role="switch" aria-checked="${on}" aria-label="${esc(en ? `Valve ${v.id}: ${on ? 'on' : 'off'}` : `閥門 ${v.id}：${on ? '開' : '關'}`)}">
        <circle cx="${R.vx}" cy="140" r="17" fill="${on ? '#1f3a2a' : '#3a1f1c'}" stroke="${on ? '#7fc28f' : '#c96a5a'}" stroke-width="3"/>
        <text x="${R.vx}" y="${en ? 144 : 145.5}" text-anchor="middle" font-size="${en ? 10.5 : 15}" font-weight="700" fill="${on ? '#bfe8c8' : '#f0b8ae'}">${state}</text>
        <text x="${R.vx}" y="112" text-anchor="middle" font-size="13" fill="#d8dee8" font-weight="700">${v.id}</text></g>`;
    }
    let hops = '';
    for (const [x, y] of CROSSINGS) hops += `<circle cx="${x}" cy="${y}" r="9" fill="#14181e"/>`;
    // 重畫垂直管線穿過交叉點，形成「上方跨越」效果
    let over = '';
    for (const v of G.VALVES) {
      const R = PIPE_ROUTES[v.id];
      for (const seg of R.segs) {
        for (let i = 0; i < seg.length - 1; i++) {
          const [[x1, y1], [x2, y2]] = [seg[i], seg[i + 1]];
          if (x1 === x2) for (const [cx, cy] of CROSSINGS) if (cx === x1 && cy > Math.min(y1, y2) && cy < Math.max(y1, y2)) {
            over += `<line x1="${cx}" y1="${cy - 12}" x2="${cx}" y2="${cy + 12}" stroke="${col[R.color]}" stroke-width="7" opacity="${open[v.id] ? 1 : 0.55}"/>`;
          }
        }
      }
    }
    const bed = (x, label) => `<rect x="${x}" y="330" width="140" height="44" rx="6" fill="#3a2a1a" stroke="${water ? '#6fae7d' : '#5a4630'}" stroke-width="2"/><text x="${x + 70}" y="358" text-anchor="middle" font-size="16" fill="#e6dcc4">${esc(t(label))}</text>`;
    const lg = { rain: L('雨水管', 'Rainwater pipe'), fert: L('肥料水管', 'Fertilizer pipe'), join: L('分岔：圓點處相連', 'Dot: pipes join'), cross: L('跨越：斷開處不相連', 'Gap: pipes cross, not joined') };
    return `<svg viewBox="0 0 640 400" class="art valves-art" role="group" aria-label="${esc(t(L('灌溉管線圖', 'Irrigation pipe diagram')))}">
      <rect width="640" height="400" fill="#14181e"/>
      <rect x="40" y="16" width="140" height="76" rx="10" fill="#2f5277"/><text x="110" y="60" text-anchor="middle" font-size="${en ? 16 : 18}" fill="#e6eef6">${esc(t(L('雨水桶', 'Rainwater')))}</text>
      <rect x="460" y="16" width="140" height="76" rx="10" fill="#6b4a26"/><text x="530" y="60" text-anchor="middle" font-size="${en ? 16 : 18}" fill="#f6e8d6">${esc(t(L('肥料桶', 'Fertilizer')))}</text>
      ${pipes}${hops}${over}
      ${bed(60, G.BEDS.moon.name)}${bed(250, G.BEDS.fern.name)}${bed(460, G.BEDS.cactus.name)}
      ${valves}
      <g font-size="${en ? 11 : 12}" fill="#aab3c2"><rect x="222" y="20" width="14" height="6" fill="${col.rain}"/><text x="242" y="27">${esc(t(lg.rain))}</text><rect x="222" y="38" width="14" height="6" fill="${col.fert}"/><text x="242" y="45">${esc(t(lg.fert))}</text>
        <path d="M220 60 h18 M229 60 v8" stroke="#aab3c2" stroke-width="3"/><circle cx="229" cy="60" r="4" fill="#aab3c2"/><text x="242" y="64">${esc(t(lg.join))}</text>
        <path d="M220 80 h5 M233 80 h5" stroke="#aab3c2" stroke-width="3"/><path d="M229 71 v18" stroke="#aab3c2" stroke-width="3"/><text x="242" y="84">${esc(t(lg.cross))}</text></g>
    </svg>`;
  }

  // 月光反光鏡
  // opts.grid：鏡子格子（預設新手的 7 面鏡）；opts.beam === false 時不畫光路（資深模式拉開天窗前）
  function mirrorsSvg(cfg, opts = {}) {
    const g = opts.grid || G.MIRROR_GRID, cs = 64, ox = 40, oy = 60;
    const W = ox * 2 + g.cols * cs + 60, Hh = oy + g.rows * cs + 40;
    const tr = G.traceBeam(cfg, g);
    const showBeam = opts.beam !== false;
    const center = ({ c, r }) => [ox + c * cs + cs / 2, oy + r * cs + cs / 2];
    const ps = tr.path.map((p, i) => {
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
      return `<g class="mirror" data-mirror="${m.id}" tabindex="0" role="button" aria-label="${esc(isEn() ? `Mirror ${m.id}, currently "${d}" — click to flip` : `反光鏡 ${m.id}，目前「${d}」，點擊切換`)}">
        <rect x="${x - cs / 2 + 3}" y="${y - cs / 2 + 3}" width="${cs - 6}" height="${cs - 6}" rx="8" fill="#1a2436" stroke="#3a4a66"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d7e4ef" stroke-width="6" stroke-linecap="round"/>
        <text x="${x - cs / 2 + 7}" y="${y + 4.5}" font-size="12" font-weight="700" fill="#b9c8de">${m.id}</text></g>`;
    }).join('');
    const fx = ox + g.cols * cs + 30, fy = oy + g.target.r * cs + cs / 2;
    return `<svg viewBox="0 0 ${W} ${Hh}" class="art mirrors-art" role="group" aria-label="${esc(t(L('反光鏡格子', 'Mirror grid')))}">
      <rect width="${W}" height="${Hh}" fill="#0a0f1a"/>
      ${cells}
      <rect x="${ox + g.entry.c * cs + 8}" y="${oy - 46}" width="${cs - 16}" height="20" rx="4" fill="#cfe0ff" opacity=".85"/><text x="${ox + g.entry.c * cs + cs / 2}" y="${oy - 50}" text-anchor="middle" font-size="12" fill="#cfe0ff">${esc(t(L('天窗', 'Skylight')))}</text>
      ${blocks}
      ${showBeam ? `<polyline class="beam" points="${ps.map(p => p.join(',')).join(' ')}" fill="none" stroke="#f3f6ff" stroke-width="10" opacity=".18" stroke-linejoin="round"/>
      <polyline class="beam" points="${ps.map(p => p.join(',')).join(' ')}" fill="none" stroke="#f3f6ff" stroke-width="3" stroke-linejoin="round"/>` : `<rect x="${ox + g.entry.c * cs + 8}" y="${oy - 46}" width="${cs - 16}" height="20" rx="4" fill="#2a3240"/>`}
      ${mirrors}
      <g>${tr.hit && showBeam ? `<circle cx="${fx}" cy="${fy}" r="30" fill="#ffffff" opacity=".25"/>` : ''}${[0, 72, 144, 216, 288].map(a => `<ellipse cx="${fx}" cy="${fy - 12}" rx="6" ry="12" fill="${tr.hit && showBeam ? '#ffffff' : '#c9d4c0'}" transform="rotate(${a} ${fx} ${fy})"/>`).join('')}<circle cx="${fx}" cy="${fy}" r="5" fill="#e8e2a8"/>
        <text x="${fx}" y="${fy + 34}" text-anchor="middle" font-size="12" fill="#c9d4c0">${esc(t(G.BEDS.moon.name))}</text></g>
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
    const aria = isEn() ? `Clock face: ${h}:${String(m).padStart(2, '0')}` : `落地鐘鐘面：${h} 點 ${m} 分`;
    return `<svg viewBox="0 0 300 300" class="art clock-art" role="img" aria-label="${aria}">
      <circle cx="150" cy="150" r="140" fill="#8a6a32"/><circle cx="150" cy="150" r="130" fill="#efe4c8"/>${ticks}
      <line x1="150" y1="150" x2="${(150 + Math.sin(ha) * 62).toFixed(1)}" y2="${(150 - Math.cos(ha) * 62).toFixed(1)}" stroke="#1b1408" stroke-width="7" stroke-linecap="round"/>
      <line x1="150" y1="150" x2="${(150 + Math.sin(ma) * 98).toFixed(1)}" y2="${(150 - Math.cos(ma) * 98).toFixed(1)}" stroke="#1b1408" stroke-width="4" stroke-linecap="round"/>
      <circle cx="150" cy="150" r="7" fill="#1b1408"/></svg>`;
  }

  function dialSvg(sel) {
    const rings = [L('外環', 'Outer'), L('中環', 'Middle'), L('內環', 'Inner')];
    const ring = (r, id, label) => `<circle cx="150" cy="150" r="${r}" fill="none" stroke="#6b4a1e" stroke-width="30" opacity=".35"/>
      <text x="150" y="${150 - r + 7}" text-anchor="middle" font-size="${isEn() ? 17 : 20}" font-weight="700" fill="#2b1a08">${esc(t(G.CONSTELLATIONS[id].name))}</text>
      <text x="${150 + r * 0.72}" y="${150 + r * 0.72}" text-anchor="middle" font-size="10" fill="#5a3d16">${esc(t(label))}</text>`;
    const names = sel.map(id => t(G.CONSTELLATIONS[id].name));
    const aria = isEn() ? `Star dial: outer ${names[0]}, middle ${names[1]}, inner ${names[2]}` : `星盤：外環${names[0]}、中環${names[1]}、內環${names[2]}`;
    return `<svg viewBox="0 -18 300 318" class="art dial-art" role="img" aria-label="${esc(aria)}">
      <circle cx="150" cy="150" r="146" fill="#c9a24f"/><circle cx="150" cy="150" r="140" fill="#dcbc72"/>
      ${ring(118, sel[0], rings[0])}${ring(80, sel[1], rings[1])}${ring(42, sel[2], rings[2])}
      <circle cx="150" cy="150" r="14" fill="#6b4a1e"/>
      <line x1="150" y1="16" x2="150" y2="150" stroke="#7a1c14" stroke-width="1" stroke-dasharray="3 4" opacity=".45"/>
      <path d="M150 1 l-10 -16 h20 z" fill="#7a1c14" stroke="#f3d68f" stroke-width="1"/></svg>`;
  }

  // crust：瓶口結了一圈褐色結晶（大師模式的黑蓋瓶——放久氧化的顯影液）
  function bottleSvg(b, { crust = false } = {}) {
    const cap = { red: '#d94a3a', blue: '#4f6fc0', yellow: '#e6b93a', white: '#f2ece6', green: '#4f9a5b', black: '#1c1c1c' }[b.id];
    return `<svg viewBox="0 0 60 100" class="bottle" aria-hidden="true"><rect x="12" y="24" width="36" height="70" rx="8" fill="#3a1a14" stroke="#6a2a20" stroke-width="2"/><rect x="16" y="30" width="6" height="56" fill="#ff7a60" opacity=".15"/><rect x="18" y="8" width="24" height="18" rx="3" fill="${cap}" stroke="#2a0a08"/>${crust ? crustPath(12, 24, 36) : ''}</svg>`;
  }
  // 一圈不規則的褐色結晶，貼在瓶肩上（x、y 是瓶身左上角，w 是瓶身寬）
  function crustPath(x, y, w) {
    const k = w / 36;
    return `<path d="M${x + 2 * k} ${y + 2 * k} q${4 * k} ${-4 * k} ${8 * k} 0 q${4 * k} ${-5 * k} ${8 * k} ${-1 * k} q${4 * k} ${-4 * k} ${8 * k} 0 q${4 * k} ${-4 * k} ${8 * k} ${1 * k} l0 ${5 * k} q${-4 * k} ${3 * k} ${-8 * k} 0 q${-4 * k} ${4 * k} ${-8 * k} 0 q${-4 * k} ${3 * k} ${-8 * k} 0 q${-4 * k} ${3 * k} ${-8 * k} 0 z" fill="#8a5a2a"/>` +
      [[8, 7, 1.6], [21, 8, 1.3], [30, 6, 1.5]].map(([dx, dy, r]) => `<circle cx="${x + dx * k}" cy="${y + dy * k}" r="${r * k}" fill="#c08a46"/>`).join('');
  }

  /* ------------------------------------------------------------
   * 資深模式的謎題圖
   * ------------------------------------------------------------ */
  // 一張老照片（160×120，棕褐色調）。屋子的圓頂、溫室、松樹高度、人物身形，都是判斷時間先後的線索。
  function photoScene(p, thumb) {
    const ink = '#3b2a16', mid = '#7a5f3c', light = '#d9c39a', paper = '#ead8b4';
    let out = `<rect width="160" height="120" fill="${paper}"/>`;
    if (p.indoor) {
      // 閣樓圓窗邊：大人指著窗外的彗星，身邊是九歲的晴
      out += `<rect width="160" height="120" fill="#6a5236"/><circle cx="80" cy="46" r="32" fill="#2b2216"/><circle cx="80" cy="46" r="27" fill="#4a3c2a"/>`;
      for (const [x, y] of [[64, 34], [92, 30], [70, 58], [98, 54], [84, 66]]) out += `<circle cx="${x}" cy="${y}" r="1" fill="${light}"/>`;
      out += `<path d="M66 40 L92 26" stroke="${light}" stroke-width="2.5" opacity=".7" stroke-linecap="round"/><circle cx="66" cy="40" r="3" fill="#f6ead0"/>`;
      out += `<path d="M30 120 L30 70 q0 -14 12 -14 q12 0 12 14 L54 120 Z" fill="${ink}"/><circle cx="42" cy="48" r="9" fill="${ink}"/><path d="M50 72 L66 44" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
      out += `<path d="M104 120 L104 90 q0 -10 9 -10 q9 0 9 10 L122 120 Z" fill="${ink}"/><circle cx="113" cy="72" r="7" fill="${ink}"/><path d="M106 72 q-4 8 0 14 M120 72 q4 8 0 14" stroke="${ink}" stroke-width="3" fill="none"/>`;
    } else {
      out += `<rect width="160" height="78" fill="#d8c6a0"/><rect y="78" width="160" height="42" fill="#b59c72"/>`;
      // 主屋（中間）與左邊的天文台塔樓
      out += `<rect x="50" y="46" width="62" height="34" fill="${mid}"/><path d="M46 46 L81 28 L116 46 Z" fill="${ink}"/>`;
      out += `<rect x="58" y="56" width="8" height="10" fill="${light}"/><rect x="74" y="56" width="8" height="10" fill="${light}"/><rect x="90" y="62" width="9" height="18" fill="${ink}"/>`;
      out += `<rect x="30" y="40" width="20" height="40" fill="${mid}"/>`;
      if (p.dome === 2) out += `<path d="M28 40 a12 12 0 0 1 24 0 Z" fill="${ink}"/><rect x="38" y="29" width="4" height="9" fill="${light}"/>`;
      if (p.dome === 1) out += `<path d="M28 40 a12 12 0 0 1 12 -12" fill="none" stroke="${ink}" stroke-width="3"/>${[24, 30, 36, 42, 48, 54].map(x => `<line x1="${x}" y1="22" x2="${x}" y2="80" stroke="${ink}" stroke-width="1"/>`).join('')}${[26, 36, 46, 56].map(y => `<line x1="22" y1="${y}" x2="56" y2="${y}" stroke="${ink}" stroke-width="1"/>`).join('')}`;
      // 右邊的溫室
      if (p.gh === 2) out += `<path d="M116 80 L116 58 L131 48 L146 58 L146 80 Z" fill="#c9d6c0" stroke="${ink}" stroke-width="1.4"/>${[121, 126, 131, 136, 141].map(x => `<line x1="${x}" y1="58" x2="${x}" y2="80" stroke="${ink}" stroke-width=".8"/>`).join('')}`;
      if (p.gh === 1) out += `<path d="M116 80 L116 58 L131 48 L146 58 L146 80" fill="none" stroke="${ink}" stroke-width="1.4"/>${[124, 131, 138].map(x => `<line x1="${x}" y1="${x === 131 ? 48 : 53}" x2="${x}" y2="80" stroke="${ink}" stroke-width="1"/>`).join('')}`;
      // 松樹（晴出生那年種下，一年比一年高）
      const ph = [0, 10, 20, 32, 46, 64][p.pine || 0], pw = ph * 0.32;
      if (ph) out += `<path d="M14 82 L${14 - pw} 82 L14 ${82 - ph} L${14 + pw} 82 Z" fill="#4a5a36"/><rect x="12.5" y="80" width="3" height="5" fill="${ink}"/>`;
      // 人物
      for (const who of p.people) {
        if (who === 'luguan_baby') out += `<path d="M70 120 L70 96 q0 -10 8 -10 q8 0 8 10 L86 120 Z" fill="${ink}"/><circle cx="78" cy="80" r="6" fill="${ink}"/><ellipse cx="80" cy="98" rx="7" ry="4" fill="#f2e6cc" stroke="${ink}" stroke-width="1"/><circle cx="86" cy="96" r="2.5" fill="#f2e6cc" stroke="${ink}" stroke-width=".8"/>`;
        if (who === 'zhou_ladder') out += `<line x1="18" y1="80" x2="28" y2="32" stroke="${ink}" stroke-width="2"/><line x1="24" y1="80" x2="34" y2="32" stroke="${ink}" stroke-width="2"/><circle cx="31" cy="30" r="4" fill="${ink}"/><path d="M28 34 h6 v12 h-6 z" fill="${ink}"/>`;
        if (who === 'toddler') out += `<circle cx="100" cy="102" r="3.5" fill="${ink}"/><path d="M97 106 h6 v8 h-6 z" fill="${ink}"/>`;
        if (who === 'girl7_telescope') out += `<circle cx="96" cy="94" r="4" fill="${ink}"/><path d="M93 98 h6 v14 h-6 z" fill="${ink}"/><line x1="106" y1="112" x2="112" y2="96" stroke="${ink}" stroke-width="1.4"/><line x1="118" y1="112" x2="112" y2="96" stroke="${ink}" stroke-width="1.4"/><rect x="104" y="90" width="16" height="4" fill="${ink}" transform="rotate(-25 112 92)"/>`;
        if (who === 'teen_suitcase') out += `<circle cx="96" cy="84" r="4.5" fill="${ink}"/><path d="M92 89 h8 v22 h-8 z" fill="${ink}"/><rect x="102" y="102" width="12" height="10" rx="1" fill="${ink}"/>`;
        if (who === 'zhou_grey') out += `<circle cx="124" cy="86" r="4.5" fill="#9a8a70"/><path d="M120 91 h8 v20 h-8 z" fill="${ink}"/>`;
      }
    }
    if (p.stamp) out += `<text x="154" y="114" text-anchor="end" font-size="${thumb ? 12 : 10}" fill="#e8742a" class="t-mono">${p.stamp}</text>`;
    out += `<rect width="160" height="120" fill="#7a5a2a" opacity=".12"/>`;
    return out;
  }
  function photoSvg(p, opts = {}) {
    const label = opts.label || '';
    if (opts.back) {
      const text = p.back ? esc(t(p.back)) : '';
      return `<svg viewBox="0 0 160 120" class="photo-svg" role="img" aria-label="${esc(label)}"><rect width="160" height="120" fill="#efe6cf"/><rect width="160" height="120" fill="none" stroke="#d7c8a6" stroke-width="6"/>
        ${text ? `<foreignObject x="10" y="16" width="140" height="92"><div xmlns="http://www.w3.org/1999/xhtml" class="photo-back">${text}</div></foreignObject>` : `<text x="80" y="66" text-anchor="middle" font-size="11" fill="#b9ab90">${esc(t(L('（背面沒有字）', '(nothing written)')))}</text>`}</svg>`;
    }
    return `<svg viewBox="0 0 160 120" class="photo-svg" role="img" aria-label="${esc(label)}"><rect width="160" height="120" fill="#f2ead6"/><g transform="translate(6 6) scale(${148 / 160} ${108 / 120})">${photoScene(p)}</g></svg>`;
  }

  const TIN_SHORT = { tin_moon: L('月光花', 'MOON'), tin_fern: L('蕨類', 'FERN'), tin_cactus: L('仙人掌', 'CACTUS') };
  // 天平：place[id] = 'L' | 'R'。左右重量不同時橫桿傾斜，相等時指針變綠。
  function balanceSvg(place) {
    const w = id => G.BALANCE_THINGS.find(x => x.id === id).w;
    let left = 0, right = 0;
    const onL = [], onR = [];
    for (const th of G.BALANCE_THINGS) {
      if (place[th.id] === 'L') { left += w(th.id); onL.push(th); }
      if (place[th.id] === 'R') { right += w(th.id); onR.push(th); }
    }
    const diff = right - left;
    const level = diff === 0;
    const ang = Math.max(-14, Math.min(14, diff * 3.5));
    const a = ang * Math.PI / 180, cx = 300, cy = 92, arm = 190;
    const ends = [[cx - arm * Math.cos(a), cy - arm * Math.sin(a)], [cx + arm * Math.cos(a), cy + arm * Math.sin(a)]];
    // 橫桿畫成「旋轉的長方形」而不是漸層描邊的線：水平線的外框高度為 0，漸層畫不出來，平衡時橫桿會整條消失
    const tinColor = { tin_moon: ['#6f8fb8', '#9fb6d8'], tin_fern: ['#4f8a5b', '#7fb08a'], tin_cactus: ['#c9a46a', '#e3c99a'] };
    const drawThing = (th, x, y) => {
      if (tinColor[th.id]) {
        const [body, lid] = tinColor[th.id];
        return `<rect x="${x - 15}" y="${y - 34}" width="30" height="34" rx="3" fill="${body}"/><rect x="${x - 16}" y="${y - 38}" width="32" height="6" rx="2" fill="${lid}"/><rect x="${x - 11}" y="${y - 24}" width="22" height="11" fill="#efe6cf"/><text x="${x}" y="${y - 15.5}" text-anchor="middle" font-size="7.5" fill="#3b2a10">${esc(t(TIN_SHORT[th.id]))}</text>`;
      }
      const big = th.w === 5;
      return `<path d="M${x - (big ? 13 : 9)} ${y} h${big ? 26 : 18} l-${big ? 4 : 3} -${big ? 20 : 14} h-${big ? 18 : 12} z" fill="url(#bl-brass)"/><circle cx="${x}" cy="${y - (big ? 24 : 17)}" r="${big ? 5 : 3.5}" fill="none" stroke="#c9a24f" stroke-width="2"/><text x="${x}" y="${y - 5}" text-anchor="middle" font-size="${big ? 10 : 8}" font-weight="700" fill="#3b2a10">${th.w}</text>`;
    };
    const pan = ([x, y], things) => {
      const py = y + 110;
      let s = `<line x1="${x}" y1="${y}" x2="${x - 44}" y2="${py}" stroke="#a5a5a5" stroke-width="1.5"/><line x1="${x}" y1="${y}" x2="${x + 44}" y2="${py}" stroke="#a5a5a5" stroke-width="1.5"/>`;
      things.forEach((th, i) => { s += drawThing(th, x - (things.length - 1) * 17 + i * 34, py); });
      s += `<path d="M${x - 58} ${py} h116 q-8 16 -58 16 q-50 0 -58 -16 z" fill="url(#bl-brass)"/>`;
      return s;
    };
    const aria = isEn()
      ? `Balance: left pan ${onL.map(th => t(th.name)).join(', ') || 'empty'}; right pan ${onR.map(th => t(th.name)).join(', ') || 'empty'}; ${level ? 'level' : diff > 0 ? 'right side lower' : 'left side lower'}`
      : `天平：左盤${onL.map(th => t(th.name)).join('、') || '空的'}；右盤${onR.map(th => t(th.name)).join('、') || '空的'}；${level ? '平衡' : diff > 0 ? '右邊比較低' : '左邊比較低'}`;
    return `<svg viewBox="0 0 600 300" class="art balance-art" role="img" aria-label="${esc(aria)}">
      <defs><linearGradient id="bl-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d38c"/><stop offset="1" stop-color="#8a6324"/></linearGradient></defs>
      <rect width="600" height="300" fill="#1d150e"/>
      <rect x="0" y="276" width="600" height="24" fill="#3a2414"/>
      <rect x="262" y="262" width="76" height="16" rx="3" fill="#3a3f45"/><rect x="294" y="${cy}" width="12" height="172" fill="url(#bl-brass)"/>
      ${pan(ends[0], onL)}${pan(ends[1], onR)}
      <rect class="balance-beam" x="${cx - arm - 4}" y="${cy - 4}" width="${arm * 2 + 8}" height="8" rx="4" fill="url(#bl-brass)" transform="rotate(${ang} ${cx} ${cy})"/>
      <circle cx="${cx}" cy="${cy}" r="9" fill="#c9a24f" stroke="#f3d68f" stroke-width="2"/>
      <path d="M${cx} ${cy} L${cx + Math.sin(a) * 56} ${cy - Math.cos(a) * 56}" stroke="${level ? '#8cc49a' : '#e39a8a'}" stroke-width="4" stroke-linecap="round"/>
      <path d="M${cx - 30} ${cy - 50} A58 58 0 0 1 ${cx + 30} ${cy - 50}" fill="none" stroke="#6b4a1e" stroke-width="2"/><line x1="${cx}" y1="${cy - 62}" x2="${cx}" y2="${cy - 52}" stroke="#e8dcc0" stroke-width="2"/>
      <text x="${cx}" y="${cy - 70}" text-anchor="middle" font-size="14" font-weight="700" fill="${level ? '#8cc49a' : '#e8dcc0'}">${level ? esc(t(L('平衡', 'Level'))) : ''}</text>
    </svg>`;
  }

  // 音樂盒的音齒：1（最長、最低）到 10（最短、最高），每一根都可以點
  function musicBoxSvg(lit) {
    let tines = '';
    for (let n = 1; n <= G.MUSIC_TINES; n++) {
      const x = 52 + (n - 1) * 46, len = 150 - (n - 1) * 9;
      tines += `<g class="tine ${lit === n ? 'lit' : ''}" data-tine="${n}" tabindex="0" role="button" aria-label="${esc(isEn() ? `Tine ${n}` : `第 ${n} 根音齒`)}">
        <rect x="${x - 18}" y="40" width="36" height="${len + 30}" fill="transparent"/>
        <rect x="${x - 7}" y="58" width="14" height="${len}" rx="3" fill="${lit === n ? '#f6dc95' : '#c7ccd4'}" stroke="#7a828c"/>
        <text x="${x}" y="${58 + len + 22}" text-anchor="middle" font-size="16" font-weight="700" fill="#e8c97f">${n}</text></g>`;
    }
    return `<svg viewBox="0 0 560 250" class="art musicbox-art" role="group" aria-label="${esc(t(L('音樂盒的音齒', 'Music box tines')))}">
      <rect width="560" height="250" fill="#2a160e"/><rect x="12" y="12" width="536" height="226" rx="10" fill="#5a2f1c" stroke="#8a5a36" stroke-width="3"/>
      <rect x="24" y="30" width="512" height="30" rx="6" fill="#8a929b"/>${[...Array(30)].map((_, i) => `<circle cx="${36 + i * 17}" cy="${38 + (i * 7) % 14}" r="1.6" fill="#e8dcc0"/>`).join('')}
      ${tines}</svg>`;
  }

  // 儲物間的小窗：山谷對面周伯家的燈（.zhou-lamp 由介面依燈號一亮一滅）
  function signalSvg() {
    return `<svg viewBox="0 0 560 260" class="art signal-art" role="img" aria-label="${esc(t(L('小窗外的山谷，對面山腰上有一盞燈', 'The valley through the window, with a single lamp on the far slope')))}">
      <defs><radialGradient id="sg-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
      <linearGradient id="sg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b1a"/><stop offset="1" stop-color="#18213d"/></linearGradient></defs>
      <rect width="560" height="260" fill="url(#sg-sky)"/>${starfield(55, 40, 0, 0, 560, 130)}
      <path d="M0 170 Q120 110 240 150 Q330 120 420 140 Q500 118 560 132 L560 260 L0 260 Z" fill="#0b0f1e"/>
      <path d="M0 210 Q160 170 300 200 Q430 176 560 196 L560 260 L0 260 Z" fill="#05070f"/>
      <g class="zhou-house"><path d="M386 146 l18 -14 l18 14 z" fill="#05070f"/><rect x="390" y="146" width="28" height="16" fill="#05070f"/>
        <circle class="zhou-glow" cx="404" cy="153" r="22" fill="url(#sg-lamp)"/><rect class="zhou-lamp" x="400" y="149" width="8" height="7" fill="#ffd98a"/></g>
      <rect x="0" y="0" width="560" height="260" fill="none" stroke="#3a2818" stroke-width="22"/><line x1="280" y1="0" x2="280" y2="260" stroke="#3a2818" stroke-width="8"/>
    </svg>`;
  }

  root.Art = {
    setLang(l) { LANG = l === 'en' ? 'en' : 'zh'; },
    get lang() { return LANG; },
    scene, icon, emblemChip, poster, eyepiece, eyepieceStars, EYE_GROUND_CLEAR, bookshelf, gridSvg, note, plate,
    valvesSvg, mirrorsSvg, clockSvg, dialSvg, bottleSvg, esc,
    photoSvg, photoScene, balanceSvg, musicBoxSvg, signalSvg,
  };
}(typeof self !== 'undefined' ? self : this));
