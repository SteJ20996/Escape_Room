'use strict';
/*
 * 打包：把 index.html 引用的 CSS 與 JS 全部內嵌，產生兩個單檔版本
 *   dist/stargazer.html  可離線雙擊開啟的完整網頁
 *   dist/artifact.html   給 claude.ai Artifact 發布用（不含 <!doctype>/<html>/<head>/<body> 外殼）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function between(src, start, end) {
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a < 0 || b < 0) throw new Error('找不到打包標記：' + start);
  return src.slice(a + start.length, b).trim();
}
function inline(fragment) {
  return fragment
    .replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, f) =>
      `<style>\n${fs.readFileSync(path.join(ROOT, f), 'utf8')}</style>`)
    .replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) =>
      `<script>\n${fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);
}

const head = inline(between(html, '<!-- build:head -->', '<!-- /build:head -->'));
const body = inline(between(html, '<!-- build:body -->', '<!-- /build:body -->'));
if (/src="js\/|href="css\//.test(head + body)) throw new Error('仍有未內嵌的本地檔案引用');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const full = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'dist', 'stargazer.html'), full);
fs.writeFileSync(path.join(ROOT, 'dist', 'artifact.html'), `${head}\n${body}\n`);
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`dist/stargazer.html ${kb(Buffer.byteLength(full))}，dist/artifact.html ${kb(Buffer.byteLength(head + body))}`);
