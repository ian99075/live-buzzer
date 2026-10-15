# 課堂即時搶答系統

使用 JavaScript、Node.js 24、HTML/CSS 開發的單一課堂工具。教師可同時開放多題、設定各題倒數、即時查看依組別優先權排列的全部回答，並將各題結算後的搶答第一名以 `{題目}_回答_G組別編號` 寫入 Google Sheet 指定 Sequence。學生只看到題目、倒數及自己的提交狀態。

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
- 使用 `.env` 中的教師帳密登入；學生填學號與數字組別編號，例如輸入 `2`，登入後顯示 `G2`。
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

1. 教師選「單題」或「題組」，Case 編號由伺服器從 1 起連續分配；表單上的預計編號僅供參考。題組需填標題與至少一個小題；每小題設定自己的內容與 1–3600 秒搶答時間（預設 60 秒），分別按「開始搶答」。各題可同時開放。
2. 學生以完整學號與正整數組別編號登入；學號前導零會保留，組別 `02` 會正規化為 `G2`。同一學號首次登入後，其組別在本次服務運行期間固定；再次登入不同組別會收到 409 提示，重啟服務才清除綁定。這是自填資料，不能驗證真實組員身分。開放題目出現後先填回答，按「搶答！」會開啟確認彈窗；取消不會送出，按「確認送出」才發送。倒數在彈窗中持續。
3. 同題同學號僅保存首次有效回答。後續重送、重新登入或被取消資格後，都不能覆寫原答案。網路失敗可重試同一份凍結回答。
4. 教師即時看到每位學生的學號、`G` 組別、回答與目前順位。同組不同學號各自保留回答；先比該組在其他已結算題目的有效搶答第一名次數（少者優先，每個小題各算一次），再比伺服器接受順序。其他題目結算或取消資格時，開放題順位會立即更新；學生看不到排名，也看不到其他人的組別。
5. 「暫停」保留剩餘時間與學生草稿，「繼續搶答」接著倒數。倒數到零或按「提早結算」才固定本題順位與搶答第一名；結算後不可重開。教師可取消亂答者資格，由下一位有效回答遞補；失格者同題不能重送。
6. 教師可把既有單題轉成題組；原題成為 1-1，已開始的倒數、回答與學生提交狀態不重置。可追加草稿小題、改題組標題、刪除小題或整組。刪除前面的 Case／小題會讓後面的編號自動遞補，但原題 ID、倒數和回答不變。按「彙整至 Google Sheet」先檢查後端產生的每格預覽，再確認匯出；先前已成功匯出的舊座標會在下次匯出時按新編號覆寫或清空。從未匯出的空題不動。匯出中教師修改暫時鎖定。

教師端左側將「建立題目」與「題目管理」分成兩張卡片。「新增題目/題組」開啟單題／題組建立彈窗；題目清單像資料夾，可展開 Case 小題，題目標題比 Case 編號醒目。點進題組大題頁會看到小題列表及「新增小題」「改題組標題」「刪除整組」；各小題卡片清楚區分尚未結算的目前第一名與結算後的搶答第一名，顯示其學號、組別及回答，回答字級小於學號。新增小題另有彈窗，需填內容與倒數秒數。點進小題則顯示該題控制與全部回答，麵包屑可回大題；單題可直接操作或轉為題組。上方可選舒適／精簡間距或收合題目欄。未儲存編輯在即時更新時保留，重新整理或登入失效則清除。

學生不會收到第一名、名次、先前第一名次數、回答總數、其他學號或組別、其他人的回答。送出的 `202 received=true` 僅代表請求送達；對暫停、到期、結算或刪除的題目，也不會透露裁決結果。確認前若題目已暫停或到期，彈窗會關閉且不發送。網路錯誤顯示「未確認送出」，重試只能發送凍結的同一份答案。

同一瀏覽器可同時開教師端與學生端，兩個角色使用不同 cookie。**測試不同學生請使用不同瀏覽器／獨立瀏覽器設定檔或不同裝置**；同一設定檔的學生分頁共用登入 cookie。單一分頁可用「切換學號」依序測試；此操作不是身分驗證。學號目前由學生自填，不能驗證真實學籍，也無法阻止冒用。

教師端右上角有「登出」，只結束目前教師工作階段。登出後需重新登入才能操作或接收教師即時事件。

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

先確認可覆寫的 Case 及合成測試資料，再建立題目、開放、以學生送出回答，最後教師按「彙整至 Google Sheet」。這會覆寫相應 Sequence，須核對精確的 `{題目}_回答_G組別編號`、未選中的格及原有格式。專案已完成一次獲授權的 Case 1 真實驗收並還原原值；日後換憑證或目標試算表時，再依確認範圍驗收。設定完成後，只需告知已完成及可測試 Case，不需提供私鑰。

### 費用、配額與常見問題

Google Sheets API 的配額及費用以[官方最新說明](https://developers.google.com/workspace/sheets/api/limits)為準。單次彙整的值更新使用批次請求；若需插列、標記或解除合併，會先執行結構讀取與批次修改，因此也會消耗額外的讀寫配額。

- 本機顯示 503：核對 Sheet ID 與憑證路徑是否填入，以及是否已重啟。
- 本機顯示 502：核對 JSON 路徑／內容、Sheets API 是否已啟用、服務帳號是否有編輯權、工作表名稱與網路。Google 的權限或配額錯誤會統一轉成此訊息。
- 配額超限：稍後再手動匯出；本機回答在服務未重啟時仍保留。
- 本系統等待上限為 15 秒；Google API 本身單次處理上限為 180 秒。逾時不代表遠端必定未寫入，應先核對後再重試。

本程式使用官方 `google-auth-library` 授權，以 [Sheets values.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate) 的 `RAW` 模式寫值。題組小題依序向右寫入；必要時先以 [spreadsheets.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate) 插入 Case 7 以後缺少的列、標記列，並只解除輸出格所在的合併區。不建立表頭。

| 題目 | Sequence 位置 |
| --- | --- |
| Case 1 | `'工作表1'!C19` |
| Case 2 | `'工作表1'!C20` |
| Case 3 | `'工作表1'!C21` |
| Case 4 | `'工作表1'!C22` |
| Case 5 | `'工作表1'!C23` |
| Case 6 | `'工作表1'!C24` |
| Case 7（首次匯出時若缺列） | 插入新列後 `'工作表1'!C25` |
| Case 1 的 1-2、1-3 | `'工作表1'!D19`、`'工作表1'!E19` |

例如題目內容 `什麼是元素？`、回答 `Single element`、組別 `G2`，儲存格內容精確為 `{什麼是元素？}_Single element_G2`，不含學號。題組使用該小題完整內容，並以字面上的大括號包住題目。答案內原有換行保留；RAW 也避免把以 `=` 開頭的答案當成公式。

只有已結算的有效搶答第一名會匯出。先前已成功匯出的題目若全員失格或遭刪除，下次會以空文字清空該格；從未匯出的空題不會改動。Case 7 及後續題號若已有本程式列標記，或對應 B 欄已有正確 Case 標籤，會沿用既有列；教師手動清除 Sequence 文字不會讓同一 Case 再插一列。Case 由後端連續編號，刪前題後仍保留已插入的後續 Case 列供下次重用。若列標記、標籤或位置矛盾，會停止寫入供教師檢查。沒有任何需覆寫或清空的格時不呼叫 Google。有資料但設定缺失回 `503`；授權、結構或寫入失敗、15 秒內無法確認回 `502`。逾時可能已在遠端插列或寫值；下次手動匯出先讀回可疑格，再依目前題號覆寫新格並清空已確認的舊格。清空前會核對舊格仍是本程式上次寫入的值，若已被人工修改則停止匯出。回應中的 `writtenCount` 包含清空格，`clearedCount` 是其子集。每次匯出只採開始當下的已結算快照。新題組結構尚未在真實 Google Sheet 上驗收，請先備份試算表並確認可改動的範圍。

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

`src/classroom.js` 的 `submit()` 在同步操作中完成截止檢查、學號去重、記錄學生組別、伺服器接受時間與唯一順序；中間沒有 `await` 或外部 I/O。開放期間依同組在其他已結算題目的有效搶答第一名次數即時排序，次數相同再按接受順序。結算時固定候選順位；取消資格只由後位有效候選者遞補。

時間先後以伺服器**接受有效提交的順序**為準，不以學生裝置時間或實體按下順序判定。必須維持單一程序，不能啟用 cluster、多副本或多實例 serverless；若未來需要擴充，需重新設計共用裁決機制。

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
| `DELETE /api/teacher/session` | 撤銷目前教師登入並關閉其即時連線 |
| `POST /api/student/session` | 學號登入 |
| `GET /api/teacher/questions` | 所有題目、全部回答、即時順位與搶答第一名 |
| `POST /api/teacher/questions` | 新增題目與倒數秒數 |
| `POST /api/teacher/groups` | 新增題組與草稿小題 |
| `PATCH/DELETE /api/teacher/groups/{groupId}` | 依穩定題組 ID 改標題／刪除整組 |
| `POST /api/teacher/groups/{groupId}/questions` | 追加草稿小題 |
| `POST /api/teacher/questions/{questionId}/convert-to-group` | 保留原題狀態並轉成 1-1 |
| `GET/PATCH/DELETE /api/teacher/questions/{questionId}` | 讀取、修改文字／草稿秒數、刪除 |
| `POST /api/teacher/questions/{questionId}/start`、`/pause`、`/resume`、`/stop` | 開始／暫停／繼續／提早結算 |
| `POST /api/teacher/questions/{questionId}/submissions/{submissionId}/disqualify` | 取消資格、候補遞補 |
| `GET /api/student/questions` | 開放與暫停題目、倒數資訊及該學號提交狀態 |
| `POST /api/student/questions/{questionId}/buzz` | 僅傳 `{ "answer": "回答" }` |
| `GET /api/teacher/events`、`GET /api/student/events` | 角色專用 SSE |
| `POST /api/teacher/exports/google-sheet` | 覆寫已結算搶答第一名或清空已失格舊值 |

沒有其他欄位的寫入仍須傳送 JSON `{}`（包含 DELETE）。所有寫入要求 `Content-Type: application/json`，body 上限 64 KiB，同源瀏覽器 Origin。題目最多 2000 字、回答最多 5000 字、學號最多 80 字。完整 request、response、cookie、錯誤碼與 SSE 契約見 `docs/openapi.json`；文件不透過公開靜態目錄提供。

## 區域網路與 HTTPS 部署

教室學生使用手機時，`localhost` 指的是學生自己的裝置。請把 `HOST` 改為 `0.0.0.0`，`APP_ORIGIN` 改成學生能連到的主機網址，例如 `http://192.168.1.20:3000`（替換為實際 IP），讓所有人使用**同一個網址**。主機需允許該連接埠，Wi-Fi 也不能阻擋裝置彼此連線。

對外部署使用 HTTPS 反向代理，`APP_ORIGIN` 設定為公開 HTTPS 網址，`COOKIE_SECURE=true`。後端只開一個 Node 程序。代理必須關閉 SSE buffering／快取，並將讀取逾時設為大於 15 秒心跳，例如 60 秒；不要用會緩衝整個回應的代理模式。Nginx 可在代理 location 設定 `proxy_buffering off; proxy_read_timeout 60s;`。

工作階段預設 12 小時到期。登入 token 只在 HttpOnly、SameSite=Strict cookie；伺服器保留雜湊，不把教師密碼或回答寫進應用日誌。停機更新前先完成需要的匯出；匯出僅保存第一名，不會備份其他人的回答。

## 驗證與接續開發

目前進行中的 `grouped-case-questions` change 曾對初版題組完成 [Verify](docs/grouped-case-questions-verification.md)；新增的連續編號與登出修訂已完成 Apply；使用者手測後需重新 Verify。自動測試、隔離瀏覽器與模擬 Google API 證據見 [驗收紀錄](docs/verification.md)。主規格同步與歸檔仍是後續步驟；本輪尚未對真實 Sheet 測試 Case 7 插列或題組解除合併。

原始系統的 `live-buzzer` change 已完成 26/26 項並歸檔。本次 `timed-priority-buzz` change 加入倒數、優先權、取消資格與學生確認彈窗；自動測試與模擬瀏覽器驗收結果見 [驗收紀錄](docs/verification.md)。本次未再次寫入真實 Google Sheet；2026-09-23 的 Case 1 真實寫入／還原仍是原始系統的整合證據。新 change 的 [Verify 已通過](docs/timed-priority-buzz-verification.md)，三份主規格已同步，並封存於 `openspec/changes/archive/2026-10-08-timed-priority-buzz/`。

```powershell
npm test
node scripts/openapi.mjs
openspec validate --specs --strict
```

`npm test` 不需要 Google 憑證，也不連 Google。包含真實 HTTP 的合成學生併發、倒數與優先權假時鐘測試、角色隱私、重送、重啟、SSE、題組座標、模擬 Google 插列／合併／覆寫／清空與錯誤重試。`scripts/openapi.mjs` 可重新產生 API 合約。

瀏覽器與真實 Google 的各輪驗收結果見 [docs/verification.md](docs/verification.md)。原始 change 已於 2026-09-24 完成 Verify、三份主規格同步與歸檔；詳見 [原始變更核對報告](docs/openspec-verification.md)。新 change 亦已完成 Verify、主規格同步與歸檔。

未來若從學號改為組別，請先確認登入方式、同組提交去重、同組多人的先後裁決與匯出識別，再同步修改 OpenSpec 與程式；目前沒有預先加入組別行為。
