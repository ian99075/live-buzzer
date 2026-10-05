# 課堂即時搶答系統

使用 JavaScript、Node.js 24、HTML/CSS 開發的單一課堂工具。教師可同時開放多題、查看每位學生的首次回答，並將每題第一名的 `回答_學號` 寫入 Google Sheet 指定 Sequence。學生先輸入回答再搶答，只能看到自己的提交狀態。

**沒有資料庫。** 題目、回答、登入與連線資料只存在一個 Node.js 程序的記憶體；服務停止、重啟或開發模式自動重載後全部清空。Google 已寫入內容不受影響，系統不會從 Sheet 恢復課堂。頁面重新整理不會重啟服務，已接受回答仍在，但未提交草稿會消失。

## 快速啟動

需要 Node.js 24 或更新版本，在專案目錄執行：

```powershell
npm ci
Copy-Item .env.example .env
```

用文字編輯器開啟 `.env`，自行填入 `TEACHER_USERNAME` 與 `TEACHER_PASSWORD`。沒有內建正式教師帳密。包含 `#`、空白等特殊字元的密碼請用雙引號包住整個值。Google 欄位可先留空。

```powershell
npm start
```

- 教師端：<http://localhost:3000/teacher>
- 學生端：<http://localhost:3000/student>
- 使用 `.env` 中的教師帳密登入；學生只填學號。
- 若要停用服務，在啟動的終端機按 `Ctrl+C`。
- 已有 `.env` 時不要再次複製覆蓋。若連接埠被測試預覽占用，先關閉測試預覽。

`npm run dev` 會在程式修改時重新啟動，**正式上課請使用 `npm start`**。

### 不需設定的測試預覽

```powershell
npm run preview:test
```

開啟 <http://127.0.0.1:3000/teacher>，測試帳號 `teacher`，密碼 `test-password-only`。學生端為 <http://127.0.0.1:3000/student>。

這是僅綁定本機的測試入口，頁面明確標示「測試預覽」，不讀 `.env`、不連 Google、不能用來正式匯出。模擬匯出會等待約 1.2 秒。以下控制字串可在該終端機輸入後按 Enter：

| 指令 | 測試情境 |
| --- | --- |
| `fail-next-export` | 下一次有資料的匯出回傳錯誤，之後可重試 |
| `lose-next-buzz` | 下一次搶答被接受，但丟棄 HTTP 與提交者即時確認，驗證凍結回答重試 |
| `disconnect` | 中斷即時連線，瀏覽器應自動重連並保留草稿 |
| `restart` | 清空全部記憶體並重啟，舊登入失效 |
| `stop` | 關閉測試服務 |

## 課堂操作

1. 教師選擇 Case 1–6 並填寫題目，新增後按「開始搶答」。各題獨立，可同時開放多題。
2. 學生以完整學號登入；前導零會保留。開放題目出現後，先填回答，再按「搶答！」。
3. 同題同學號僅保存首次有效回答。後續重送、切換學號後再登入原學號，都不能覆寫原答案。
4. 教師即時看到所有有效回答，第一位另外標示。出現第一名不會停止收集後續學生回答。
5. 按「停止搶答」只關閉該題。再次開始或修改題目不會清除原回答、第一名。刪除會移除該題暫存紀錄；同 Case 重建會取得新題目 ID。
6. 按「彙整至 Google Sheet」先檢查第一名清單與目標儲存格，再按「確認匯出」寫入；取消不會寫入。清單會隨即時回答更新，實際以確認時伺服器取得的快照為準。只輸出每題第一名，匯出中管理按鈕暫時鎖定，但學生仍可回答，教師監控繼續更新。

教師端左側可選題，右側切換各題總覽或單題全部回答；「新增題目」可展開／收合。上方可選舒適／精簡間距或收合題目欄；收合後仍可按「全部題目」返回總覽。未儲存編輯在切題與即時更新時保留，重新整理或登入失效則清除。

學生不會收到第一名、名次、回答總數、其他學號或其他人的回答。送出的 `202 received=true` 僅代表請求送達；對剛被停止或刪除的過期題目，也不會透露裁決結果。網路錯誤顯示「未確認送出」，重試只能發送凍結的同一份答案。

同一瀏覽器可同時開教師端與學生端，兩個角色使用不同 cookie。**測試不同學生請使用不同瀏覽器／獨立瀏覽器設定檔或不同裝置**；同一設定檔的學生分頁共用登入 cookie。單一分頁可用「切換學號」依序測試；此操作不是身分驗證。學號目前由學生自填，不能驗證真實學籍，也無法阻止冒用。

## Google Sheet 設定

本方案由本機 Node.js 直接使用 Google Sheets API，不需要 Apps Script、Google Cloud CLI 或額外桌面程式，但需下載一份服務帳號 JSON 憑證。服務帳號是供程式使用的 Google 身分，不是教師登入帳號。

使用者已提供[原生 Google Sheet](https://docs.google.com/spreadsheets/d/1R0a6MuSJAd5YIIsY_69KvXFR9KuH4El_cJ_RtXW4DgI/edit)。已唯讀核對「工作表1」Case 1–6 的 Sequence 為 C19–C24，不必再轉換 Excel。**已於 2026-09-23 完成 Case 1 真實寫入與重試驗收，並還原原值；詳細結果見 [驗收紀錄](docs/verification.md)。**

### 1. 建立專案並啟用 API

開啟 [Google Cloud Console](https://console.cloud.google.com/)，登入你的 Google 帳號。從頁首專案選單建立專案，例如 classroom-buzzer，完成後選取該專案。到「API 和服務 → 程式庫」，搜尋 **Google Sheets API**，進入後按「啟用」。只需 Sheets API，不需要啟用 Drive API。[官方啟用流程](https://developers.google.com/workspace/guides/enable-apis)

本案使用標準額度，不需為此啟用付費擴額或購買雲端主機。若畫面要求付費升級，先確認是否選到其他服務，不要為完成此流程直接付費。

### 2. 建立服務帳號

到「IAM 與管理 → 服務帳戶 → 建立服務帳戶」，名稱可填 buzzer-sheet-writer。建立後，授予專案角色與其他使用者存取權的選填步驟可略過，按完成。**不需授予專案 Owner／Editor，也不需網域全權委派**；Sheet 編輯權在第 4 步設定。記下服務帳號的電子郵件，格式類似 buzzer-sheet-writer@專案ID.iam.gserviceaccount.com。[官方服務帳號說明](https://developers.google.com/workspace/guides/create-credentials#service-account-credentials)

### 3. 下載 JSON 金鑰

點開剛建立的服務帳號，進入「金鑰 → 新增金鑰 → 建立新金鑰」，選 JSON 並建立，瀏覽器會下載檔案。將檔案放在本專案 credentials 資料夾，重新命名為 service-account.json（沒有資料夾就自行建立）。

JSON 是程式憑證，不是安裝程式。不必傳給我，也不要貼出 private_key；勿放入 public 或公開雲端資料夾。若學校帳號顯示「禁止建立服務帳號金鑰」，需確認組織管理政策，不自行關閉安全政策。[官方金鑰建立流程](https://docs.cloud.google.com/iam/docs/keys-create-delete)

### 4. 授予指定試算表編輯權

開啟上述原生 Sheet，按右上角「共用」，新增服務帳號電子郵件，權限選「編輯者」並儲存。即使現在已設定「知道連結的人可編輯」，仍請明確分享給服務帳號。本程式不依賴公開編輯權限；完成分享後可依你的需要將一般存取權改為受限制。不要把 JSON 檔上傳到試算表或分享視窗。[Google 官方文件分享方式](https://developers.google.com/workspace/guides/create-credentials#access-google-workspace-files-directly-with-a-service-account)

### 5. 設定本機 .env

若尚無 .env，先複製 .env.example 為 .env；已有則直接編輯，不要覆蓋教師帳號密碼。填入：

```dotenv
GOOGLE_SHEET_ID=1R0a6MuSJAd5YIIsY_69KvXFR9KuH4El_cJ_RtXW4DgI
GOOGLE_SHEET_NAME=工作表1
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json
```

Sheet ID 不是網址中的 gid。程式使用的是憑證檔案路徑，不是將整份 JSON 貼入 .env。TEACHER_USERNAME 與 TEACHER_PASSWORD 仍需依快速啟動章節設定。

### 6. 啟動與驗收

在專案目錄執行 npm start，使用正式教師端登入；npm run preview:test 是模擬版，不會寫入 Google。若服務已啟動，需先停止再啟動套用設定；這會清空課堂記憶體，請在上課前完成。

先確認可覆寫的 Case 及合成測試資料，再建立題目、開放、以學生送出回答，最後教師按「彙整至 Google Sheet」。這會覆寫相應 Sequence，須核對精確的回答_學號、未選中的格及原有格式。專案已完成一次獲授權的 Case 1 真實驗收並還原原值；日後換憑證或目標試算表時，再依確認範圍驗收。設定完成後，只需告知已完成及可測試 Case，不需提供私鑰。

### 費用、配額與常見問題

截至 2026-09-23，Sheets API 標準使用不額外收費，寫入預設每使用者／每專案每分鐘 60 次、每專案合計 300 次。六題合併匯出算一次批次請求。Google 公告預計於 2026 年稍後對超額使用計費，因此本案維持標準額度、不申請付費擴額，不宣稱永久免費或無限制。[官方限制與費用](https://developers.google.com/workspace/sheets/api/limits)

- 本機顯示 503：核對 Sheet ID 與憑證路徑是否填入，以及是否已重啟。
- 本機顯示 502：核對 JSON 路徑／內容、Sheets API 是否已啟用、服務帳號是否有編輯權、工作表名稱與網路。Google 的權限或配額錯誤會統一轉成此訊息。
- 配額超限：稍後再手動匯出；本機回答在服務未重啟時仍保留。
- 本系統等待上限為 15 秒；Google API 本身單次處理上限為 180 秒。逾時不代表遠端必定未寫入，應先核對後再重試。

本程式使用官方 `google-auth-library` 授權，呼叫 [Sheets values.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate)，採用 `RAW`，不呼叫 append、不建立欄位、不更動格式。

| 題目 | 固定 Sequence 位置 |
| --- | --- |
| Case 1 | `'工作表1'!C19` |
| Case 2 | `'工作表1'!C20` |
| Case 3 | `'工作表1'!C21` |
| Case 4 | `'工作表1'!C22` |
| Case 5 | `'工作表1'!C23` |
| Case 6 | `'工作表1'!C24` |

例如回答 `Single element`、學號 `00123`，儲存格內容精確為 `Single element_00123`。不加標籤、引號或分隔換行，答案內原有換行保留。RAW 也避免把以 `=` 開頭的答案當成公式。

沒有第一名的格不會清空或改寫；沒有任何可匯出資料時不呼叫 Google。有資料但設定缺失回 `503`；授權、寫入失敗或 15 秒內無法確認回 `502`。逾時可能已寫入遠端，手動重試會覆寫同一位置，不追加重複列。每次匯出只採開始當下的第一名快照，等待期間新產生的第一名留待下次匯出。

`.env`、`credentials/` 和服務帳號憑證已排除版本控制。請勿將真實憑證放入 `public/`。

## 架構與第一名裁決

```text
學生 HTML/JS ── REST 回答 ──> Node.js 單一程序 <── REST 操作 ── 教師 HTML/JS
             <── 私有 SSE ──  記憶體 Maps   ── 教師 SSE ──>
                                  │
                          手動匯出第一名快照
                                  ↓
                           Google Sheets API
```

`src/classroom.js` 的 `submit()` 在一個同步操作中完成：檢查題目開放、學號去重、保存答案、若無第一名則設定 `winnerKey`。中間沒有 `await` 或外部 I/O。同一程序的下一個請求只能在這段操作完成後執行，因此每題只會有一位第一名；之後的有效回答仍加入 Map。

第一名是伺服器完成解析驗證後**最先接受的有效提交**，不以學生裝置時間或實體按下順序判定。必須維持單一程序，不能啟用 cluster、多副本或多實例 serverless；若未來需要擴充，需重新設計共用裁決機制。

| 位置 | 用途 |
| --- | --- |
| `public/teacher.html`、`public/student.html` | 教師與學生頁面 |
| `public/css/app.css` | 桌面、手機共用樣式 |
| `public/css/teacher-dashboard.css`、`public/js/teacher.js` | 新版教師排版、選題、草稿與即時更新 |
| `public/js/components/teacher-view.js`、`export-panel.js` | 題目總覽、回答表格、匯出確認清單 |
| `public/js/components/` | 題目編輯、控制、回答列表、匯出、學生作答卡 |
| `src/routes/` | 角色 API 與欄位驗證 |
| `src/auth.js`、`src/http.js` | Cookie 工作階段、輸入邊界及統一錯誤 |
| `src/classroom.js` | 唯一課堂狀態修改入口與同步裁決 |
| `src/projections.js`、`src/events.js` | 白名單資料投影、角色 SSE、重連與慢連線處理 |
| `src/sheets.js` | 第一名快照、Google writer 與匯出鎖 |
| `docs/openapi.json` | 完整 OpenAPI 3.1 API 合約 |
| `openspec/specs/` | 已同步的三份主規格，作為後續需求基準 |
| `openspec/changes/archive/2026-09-24-live-buzzer/` | 已封存的 Proposal、Specs、Design、Tasks |
| `openspec/config.yaml` | 技術棧、專案慣例及規劃規則 |

API 摘要：

| 方法與路由 | 用途 |
| --- | --- |
| `POST /api/teacher/session` | 教師帳密登入 |
| `POST /api/student/session` | 學號登入 |
| `GET /api/teacher/questions` | 所有題目、全部回答、第一名 |
| `POST /api/teacher/questions` | 新增題目 |
| `GET/PATCH/DELETE /api/teacher/questions/{questionId}` | 讀取、修改文字、刪除 |
| `POST /api/teacher/questions/{questionId}/start` 或 `/stop` | 獨立開放／停止 |
| `GET /api/student/questions` | 開放題目與該學號提交狀態 |
| `POST /api/student/questions/{questionId}/buzz` | 僅傳 `{ "answer": "回答" }` |
| `GET /api/teacher/events`、`GET /api/student/events` | 角色專用 SSE |
| `POST /api/teacher/exports/google-sheet` | 匯出第一名 |

沒有其他欄位的寫入仍須傳送 JSON `{}`（包含 DELETE）。所有寫入要求 `Content-Type: application/json`，body 上限 64 KiB，同源瀏覽器 Origin。題目最多 2000 字、回答最多 5000 字、學號最多 80 字。完整 request、response、cookie、錯誤碼與 SSE 契約見 `docs/openapi.json`；文件不透過公開靜態目錄提供。

## 區域網路與 HTTPS 部署

教室學生使用手機時，`localhost` 指的是學生自己的裝置。請把 `HOST` 改為 `0.0.0.0`，`APP_ORIGIN` 改成學生能連到的主機網址，例如 `http://192.168.1.20:3000`（替換為實際 IP），讓所有人使用**同一個網址**。主機需允許該連接埠，Wi-Fi 也不能阻擋裝置彼此連線。

對外部署使用 HTTPS 反向代理，`APP_ORIGIN` 設定為公開 HTTPS 網址，`COOKIE_SECURE=true`。後端只開一個 Node 程序。代理必須關閉 SSE buffering／快取，並將讀取逾時設為大於 15 秒心跳，例如 60 秒；不要用會緩衝整個回應的代理模式。Nginx 可在代理 location 設定 `proxy_buffering off; proxy_read_timeout 60s;`。

工作階段預設 12 小時到期。登入 token 只在 HttpOnly、SameSite=Strict cookie；伺服器保留雜湊，不把教師密碼或回答寫進應用日誌。停機更新前先完成需要的匯出；匯出僅保存第一名，不會備份其他人的回答。

## 驗證與接續開發

目前已完成 26/26 項 OpenSpec 任務（包含新版教師介面）。14 項自動測試通過，新版的桌面／手機尺寸、即時草稿及模擬匯出流程已驗收。正式啟動、服務帳號授權及 Case 1 真實 Google 寫入／重試／還原先前已完成；本次介面驗收未再次寫入雲端。程式採本機直接呼叫 Google Sheets API 的服務帳號方案。

```powershell
npm test
node scripts/openapi.mjs
openspec validate --specs --strict
```

`npm test` 不需要 Google 憑證，也不連 Google。包含真實 HTTP 的 100 位合成學生、200 個交錯雙題提交、角色隱私、重送、重啟、SSE、固定格 RAW 匯出及錯誤重試。`scripts/openapi.mjs` 可重新產生 API 合約。

瀏覽器與真實 Google 驗收結果見 [docs/verification.md](docs/verification.md)。任務 8.4 已完成，測試儲存格已還原，測試題目已清除。實際教室裝置連線仍需依使用環境設定區域網路；OpenSpec 已於 2026-09-24 完成 Verify、三份主規格同步與歸檔；詳見 [正式核對報告](docs/openspec-verification.md)。

未來若從學號改為組別，請先確認登入方式、同組提交去重、同組多人的先後裁決與匯出識別，再同步修改 OpenSpec 與程式；目前沒有預先加入組別行為。
