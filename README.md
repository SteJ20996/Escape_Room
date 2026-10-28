# 觀星者之屋 · The Stargazer's House

一款完整的瀏覽器密室逃脫遊戲，**中文／English 雙語**。雨後的山中老宅，亡師用機關鎖住了大門——找回日、月、星三枚徽章才能離開；屋裡還藏著二十年前一顆彗星的真名。

- **兩種難度**：
  - **新手**：5 個相互關聯的房間（門廳、書房、溫室、天文台，以及一間隱藏的暗房）、11 道類型各異的謎題（主線必經 8 道）；答錯時會告訴你哪裡不對
  - **資深**：再加上閣樓與屋子邊緣的儲物間、兩位新角色（園丁周伯、陸觀的女兒陸晴）、4 道新謎題（天平、對山谷打燈號、相框牆、音樂盒），花盆與藥瓶各升級為八個、反光鏡升級為十六面且平常看不見光路；答錯只說「不對」，第一階段沒有提示；八個花盆挖錯三盆就失敗、整局作廢
- 全部謎題只靠遊戲內線索就能推理；**拿到線索才能作答**——重玩時直接輸入背下來的答案沒有用
- **物品收集與線索組合**：撕開的便條、疊合的星圖、裝上電池的手電筒、裝訂成冊的日記
- **5 種結局**，取決於你找到了什麼、又做了什麼選擇
- **存檔**：自動存檔、三個手動欄位、可攜帶的存檔碼、結局前的回溯點
- **中文與英文**：標題畫面、遊戲中的「選單」或右上角按鈕隨時切換，進度與存檔不受影響；預設跟隨瀏覽器語言，也可以用網址 `?lang=en` 指定
- **可跳過的操作教學**；右上角的**階段提示**會偵測你走到哪一階段，完成一個階段時亮起來告訴你下一步，卡關時可以一段一段展開提示
- 線索筆記、結局圖鑑（標出資深模式達成的結局）；可用鍵盤操作；手機也能玩
- 純 HTML／CSS／JavaScript，沒有任何相依套件，美術全部是內嵌 SVG（場景、謎題圖、物品圖示）

## 開始玩

直接用瀏覽器開啟 `index.html`，或開啟打包好的單一檔案 `dist/stargazer.html`（可離線、可單獨傳給別人）。

不需要安裝任何東西。字型從 Google Fonts 載入；離線時會改用系統字型，遊戲功能不受影響。

## 怎麼玩

| 動作 | 操作 |
| --- | --- |
| 查看 | 點擊場景中的物件，或場景下方的物件名稱 |
| 使用物品 | 在物品欄點選物品（拿在手上），再點場景物件 |
| 組合線索 | 點選物品 → 「組合…」→ 點另一個物品 |
| 移動 | 點門，或使用場景下方的房間按鈕 |
| 重讀文件 | 「線索筆記」 |
| 卡關 | 右上角「提示」：目前階段與目標；每個提示三段，從方向到答案（資深模式第一階段不開放） |
| 操作教學 | 開新遊戲時勾選；遊戲中可從「選單」重看 |
| 鍵盤 | Tab 移動、Enter 選擇、Esc 關閉視窗／放下物品；數字鎖可直接打數字 |

## 專案結構

```
index.html          入口（開發版，引用下列檔案）
css/style.css       樣式（單一夜色主題）
js/data.js          遊戲內容與規則：房間、熱點、物品、線索、謎題、組合、結局、提示
js/engine.js        純邏輯引擎：可序列化狀態、動作驗證、提示、存檔驗證
js/storage.js       存檔：localStorage（失敗時退回記憶體）與存檔碼
js/i18n.js          介面文字（中文／English）
js/art.js           所有場景、謎題圖與物品圖示（內嵌 SVG，圖中文字隨語言切換）
js/ui.js            介面：畫面、物品欄、對話框、存讀檔、結局
tools/build.js      打包成單一 HTML（dist/）
tests/              謎題唯一解、全結局腳本、狀態空間窮舉、隨機遊走、端對端測試
docs/DESIGN.md      遊戲設計文件（含完整解法，有雷）
docs/TEST_REPORT.md 測試報告
```

## 測試

需要 Node.js 18 以上。

```bash
npm test            # 邏輯測試 117 項：兩種難度各自的謎題唯一解、線索門檻、五個結局、狀態空間窮舉（無死局）、隨機遊走、存檔、提示、雙語完整性（約 1.5 分鐘）
npm run test:e2e    # 打包後用 Playwright 只透過點擊介面，中文、英文 × 新手、資深，各玩完五個結局（開發版與單檔版各一次，約 10 分鐘）
npm run build       # 重新產生 dist/stargazer.html 與 dist/artifact.html
```

測試方法與結果見 [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md)，設計與完整解法見 [`docs/DESIGN.md`](docs/DESIGN.md)（有雷）。

## English

*The Stargazer's House* is a complete browser escape room, playable in Chinese or English. Your late teacher, the astronomer Lu Guan, has locked you inside his house on a rainy mountain night: recover the Sun, Moon and Star emblems to open the door — and decide what to do with the twenty-year-old secret of a comet.

- Two difficulties. **Novice**: 5 connected rooms, 11 puzzles (8 on the main path), wrong answers explain what went wrong. **Veteran**: adds the attic and the storeroom on the edge of the house, two new characters (Old Zhou the gardener and Lu Guan's daughter Qing), 4 new puzzles (a balance scale, signalling across the valley, a wall of photo frames, a music box), eight pots, eight bottles and sixteen mirrors whose light you can't see until you open the skylight; wrong answers only say "not right", there are no hints in the first stage, and digging up three wrong pots of the eight loses the game.
- Every puzzle can be reasoned out from in-game clues, and a puzzle only accepts answers once you hold its clues — typing in remembered answers on a replay doesn't work.
- Item combination, 5 endings, autosave + 3 slots + portable save codes, a skippable tutorial, and stage-aware hints that light up when you finish a stage.
- Every puzzle is solvable from in-game clues alone. Switch language at any time from the title screen, the Menu, or the button at the top right; your progress is kept. Add `?lang=en` to the URL to start in English.
- Open `index.html` or the single-file `dist/stargazer.html` in any modern browser. No install needed.
