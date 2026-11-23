# 課堂即時搶答系統

教師從 Google Sheet 匯入題目，可同時開放多個單題或題組、設定每個單題／整組倒數、查看全部學生回答與組別優先權排名。學生以學號及數字組別登入；題組須填妥所有小題，經一次確認彈窗送出整組回答。學生在結算前不見名次，結算後可見該單題或整組第一名的學號與 G 組別。教師預覽實際答案格位並確認後，將第一名的 `回答_G組別` 寫入 Sheet；題組各小題格位寫入同一位第一名的對應回答。

系統使用 Node.js 24+、原生 HTML/CSS/JavaScript、REST、SSE 與 Google Sheets API。**沒有資料庫**：題目、回答、登入狀態與已確認匯出帳本只在單一 Node 程序記憶體中；重啟即清空，不會從 Sheet 恢復。

## 啟動

在專案資料夾執行：

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

已有 `.env` 時不要再次複製覆蓋。需填 `TEACHER_USERNAME`、`TEACHER_PASSWORD`、`GOOGLE_APPLICATION_CREDENTIALS`；`GOOGLE_SHEET_ID` 與 `GOOGLE_SHEET_NAME` 應分別設定為下列目標 ID 與「學習單」。修改設定後重啟；正式課堂使用 `npm start`，`npm run dev` 會因改檔重啟並清空課堂。

- 教師端：<http://localhost:3000/teacher>
- 學生端：<http://localhost:3000/student>
- 停止：啟動終端機按 `Ctrl+C`。
- 同一區域網路使用時，設定 `HOST=0.0.0.0`、`APP_ORIGIN=http://主機IP:3000`，師生使用同一個網址。主機防火牆需允許該埠。

## Google Sheet 準備

目標為[這份 Google Sheet](https://docs.google.com/spreadsheets/d/1X7YNIcyvPMsbUnTuBdJ5lwmkZmIHj2-wO-S7CdpEwo0/edit)，分頁名稱「學習單」。使用已啟用 Google Sheets API 的服務帳號 JSON 金鑰，將試算表明確分享給該服務帳號電子郵件並授予編輯權；「知道連結的人可編輯」不取代服務帳號分享。金鑰檔放在 `credentials/` 等非公開位置，路徑填入 `.env`，不要提交金鑰或教師密碼。

```dotenv
GOOGLE_SHEET_ID=1X7YNIcyvPMsbUnTuBdJ5lwmkZmIHj2-wO-S7CdpEwo0
GOOGLE_SHEET_NAME=學習單
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json
```

### 佔位符

題目由 **題目儲存格的備註** 定位：單題 Case 4 用 `$q_4$`，題組 Case 1 的第一小題用 `$q_1_1$`，格內只保留完整題目文字。同一題的答案格起初以文字 `$a_4$` 或 `$a_1_1$` 標示。首次匯出後，系統在同一批 Google Sheets API 請求將純文字答案寫入格值，並把答案佔位符保存到**該答案格的備註**；下次就從備註定位，不按固定座標猜測。

**現有六題搬移步驟：** 先備份整份 Sheet。逐一將 C5 的 `$q_1_1$`、C6 的 `$q_1_2$`、C8 的 `$q_2_1$`、C9 的 `$q_2_2$`、C11 的 `$q_3$`、C13 的 `$q_4$` 從各題文字尾端剪下，放進**同一格的備註**，題目格只留下題目。答案標記分別留在 H5、H6、H8、H9、G11、G13 的格內文字，系統首次匯出才移至備註。請用 Google Sheet 的「插入備註」，不是留言／註解。匯入只讀；若題目文字仍有 q 標記，會指出格位並拒絕整批匯入，不會自動改表。

佔位符編號用無前導零的正整數。同一 Case 只能是單題或小題組，q 鍵須有唯一同號 a 鍵；重複、缺漏、空題目、格式錯誤或合併格非左上角都會安全停止。新增題目或搬動格位請在 Sheet 編輯，不在教師頁手動建題；不需按 Case 號排列在固定列。

## 教師與學生操作

1. 教師登入後按「從 Google Sheet 匯入題目」。新單題或題組預設 60 秒；教師可修改草稿單題／整組秒數 1–3600。再匯入只更新草稿文字，不重設秒數；已開始題組的小題集合鎖定。若 Sheet 新增已開始題組的小題，整批匯入回傳衝突，課堂不變。這次 Sheet 缺少的既有題保留並提示。重啟服務後須重新匯入。
2. Case 編號與小題編號直接取自佔位符，刪題不遞補其他題號。題組標題顯示「題組 N」；教師對整組設定一次倒數與開放、暫停、繼續、結算。題組開始後不能單獨刪除小題，但可刪除整組；重新匯入可恢復仍在 Sheet 的題目。
3. 學生輸入完整學號與數字組別，如 `2` 顯示 `G2`。同一學號在本次服務運行期間固定組別。單題填一份回答；題組每小題都必填，按一次「搶答！」後在同一彈窗確認全部回答，才送出並鎖定整組。同一學號在同一單題／題組只保留首次有效提交。
4. 教師可見所有學號、組別、回答與目前排名。排序先比同組在其他已結算題目的有效第一名次數，再比伺服器接受順序；開放中即時更新，結算後固定。取消亂答者資格後由下一位有效回答遞補，失格者同題不能重送。學生端在開放中不顯示暫定第一名或名次，結算後只顯示第一名學號與組別，不顯示他人回答。
5. 按「彙整至 Google Sheet」先讀取最新答案佔位符與課堂結果，顯示實際格位、`回答_G組別` 或清空項；按確認才寫入。若預覽後有人改動 Sheet 或第一名，會要求重新預覽。只匯出已結算單題／題組的有效第一名；題組各 `$a_N_M$` 格使用同一位第一名的對應小題回答。第一名整組失格後，下次手動匯出以候補者全部小題回答覆寫；全員失格或刪整組則清空本堂課已匯出格值，保留 a 鍵備註。重啟後帳本消失，**不會自動清空上堂課的舊答案**。

老師可同時開放多題。倒數到零或按「提早結算」後不可重開。學生提交的 `202 received=true` 只表示收到請求，不表示取得第一名。網路失敗可重試凍結的同一份回答。各角色 Cookie 分開；測試多名學生請使用不同裝置或獨立瀏覽器設定檔。

## 測試與專案檔案

```powershell
npm test
node scripts/openapi.mjs
openspec validate sheet-placeholder-question-sync --strict
```

`npm test` 使用合成 Sheet、模擬 Google 寫入、真實本機 HTTP、可注入時鐘，不需正式金鑰，也不連線 Google。可用 `npm run preview:test` 啟動隔離的本機模擬頁面；測試帳號 `teacher`／`test-password-only`，先按匯入即可取得六題合成資料。模擬服務不讀正式 `.env`。可在終端機輸入 `fail-next-export`、`lose-next-buzz`、`disconnect`、`restart` 或 `stop` 模擬故障。

| 路徑 | 用途 |
| --- | --- |
| `src/classroom.js` | 單程序課堂狀態、倒數、組別優先權及來源鍵索引 |
| `src/sheet-grid.js`、`src/sheets.js` | 佔位符解析、Google Sheets API、匯入與安全匯出 |
| `src/routes/`、`src/projections.js`、`src/events.js` | 角色 API、隱私投影與 SSE |
| `public/teacher.html`、`public/js/teacher.js` | 教師控制台 |
| `public/student.html`、`public/js/student.js` | 學生端 |
| `scripts/openapi.mjs`、`docs/openapi.json` | 可重產的 OpenAPI 3.1 合約 |
| `openspec/changes/sheet-placeholder-question-sync/` | 本次變更的 Proposal、Specs、Design、Tasks |

現行程序必須只有一個 Node 實例；多副本會分離記憶體裁決。真實 Google 寫入驗收需指定可改動的答案格、備份與還原方式；目前本次變更的自動驗收只使用模擬資料。
