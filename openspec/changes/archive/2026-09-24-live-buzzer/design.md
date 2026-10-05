## Context

本文件記錄已確認並實作的最終設計，行為契約以三份 specs 為準。採本機 Node.js 與服務帳號直接呼叫 Google Sheets API；先前 Apps Script 規劃已撤回且未實作。

單一課堂、同時開放多題、學號免密碼登入、先填回答再搶答、教師看全部回答、每題只匯出第一名。不使用資料庫，服務重啟會清空暫存課堂。Google 憑證與教師設定已完成，2026-09-23 完成工作表1!C19 真實驗收並還原，2026-09-24 完成新版教師介面驗收。證據見 docs/verification.md。

## Goals / Non-Goals

**Goals:**
- 在單一服務程序內可靠裁決各題第一名，同時保留其他學生有效回答。
- 將權限、課堂狀態、即時事件及匯出分成可獨立測試的模組。
- 本機可啟動展示，手機及電腦可在同一網路參與。
- 將已確認設計拆分為可逐項核對的實作與驗收任務。

**Non-Goals:**
- 資料庫、持久課堂資料檔、重啟恢復、跨程序叢集或多間教室。
- 分組功能、學籍驗證、自動判分、教師改選第一名或修改學生原回答。
- 代建 Google 帳號、轉換雲端檔案、修改指定 Sequence 以外的資料或格式、自動公開部署。

## Decisions

### 1. 技術架構與部署邊界

採用 Node.js 24、原生 HTTP 與 ES modules，前端採 HTML/CSS/JavaScript modules。由同一服務提供頁面、REST API 及 SSE，減少跨來源設定與建置步驟。教師手動匯出時，Node.js 使用服務帳號 JSON 與官方 google-auth-library 取得權杖，透過 HTTPS 直接呼叫 Google Sheets API；測試使用 Node.js 內建測試工具。

教師端、學生端、登入、全部回答、第一名裁決及 SSE 都留在使用者電腦上的 Node.js 服務。Google 端只接收指定儲存格寫入，不部署額外 Apps Script。localhost 可在服務所在電腦開啟；其他學生裝置須使用該電腦的區域網路 IP。區域網路模式需設定 HOST、APP_ORIGIN 與適當防火牆規則，所有瀏覽器使用設定的相同來源網址。只有匯出依賴對外 Google 連線；雲端不需反向連入本機，也不要求公開本機服務。

不採用 React/Vue 是因為此版只有兩種角色頁面，元件可直接以模組組織，仍能保留輸入及局部更新。不採用 WebSocket 是因為學生提交可由 REST 處理，伺服器推播使用 SSE 即可；不需要雙向長連線協定。

只部署一個 Node.js 程序與一份記憶體狀態。不得啟用 cluster、多個副本或 serverless 多實例；不把「單執行緒」誤當成跨程序保證。

```text
Student UI -- POST answer --> Node.js / Memory <-- REST controls -- Teacher UI
Student UI <-- SSE public --- Node.js / Memory -- SSE all answers -> Teacher UI
                                    |
                             Teacher export request
                                    |
                     Google Sheets API (HTTPS / RAW)
```

### 2. 模組與專案結構

下列為最終專案主要結構；Google 設定指南放在 README.md：

```text
public/
  teacher.html
  student.html
  css/app.css
  css/teacher-dashboard.css
  js/api.js
  js/events.js
  js/teacher.js
  js/student.js
  js/components/
    question-editor.js
    question-controls.js
    teacher-view.js
    response-list.js  # 保留的舊回答元件，目前教師入口不使用
    export-panel.js
    answer-card.js
src/
  server.js
  config.js
  http.js
  auth.js
  classroom.js
  projections.js
  events.js
  sheets.js
  routes/
    teacher.js
    student.js
tests/
  classroom.test.js
  api.test.js
  events.test.js
  sheets.test.js
  contract.test.js
docs/
  openapi.json
  verification.md
  openspec-verification.md
  RESUME.md
.env.example
package.json
README.md
```

classroom 是記憶體狀態的唯一修改入口；routes 只負責驗證請求及呼叫操作；projections 明確決定角色可取得哪些欄位；sheets 的 exporter 從 store 取得第一名快照，Google writer 只接收此快照，不匯出其他學生回答，負責授權、呼叫 Google Sheets API 與核對更新儲存格數。server 可注入記憶體 store 與匯出 writer，測試不需真實 Google 授權。

### 3. 記憶體模型

| 資料 | 欄位／索引 | 用途 |
| --- | --- | --- |
| questions | Map<questionId, Question> | 所有尚未刪除題目 |
| caseIndex | Map<caseNumber, questionId> | 確保 Case 1–6 不重複 |
| Question | id、caseNumber、content、status、submissions、winnerKey | 每題各自管理狀態 |
| submissions | Map<studentNumber, Submission> | 同題同學號僅存首次有效回答 |
| Submission | studentNumber、answer、acceptedOrder | 學號與回答字串、後端接受順序 |
| winnerKey | studentNumber 或 null | 指向同題 submissions 中唯一第一名 |
| sessions | 雜湊 token 對應 role、studentNumber／username、expiresAt | 教師與學生登入狀態 |
| exportState | inFlight、目前快照 | 匯出期間的操作鎖及不可變資料 |
| event clients | 角色、工作階段、連線、最後已送投影 | 即時資料隔離與連線清理 |

questionId 使用隨機 UUID，與顯示用 caseNumber 分開；刪除 Case 1 再重建時取得新的 UUID。所有指向舊 UUID 的請求都不能作用於新題。

學號僅去除前後空白，不轉數字或自動改大小寫，保留前導零。answer 驗證去除前後空白後的長度，保存這份經正規化的文字及內部換行。acceptedOrder 在同題首次接受時遞增，時間戳不參與裁決。winnerKey 不複製另一份可修改答案，匯出時從對應提交產生副本。

題目、回答、工作階段不寫入資料檔、瀏覽器持久儲存或應用紀錄。部署設定、程式與套件鎖檔不屬於課堂資料。

### 4. 搶答與併發裁決

先完成 HTTP body 讀取與解析，由 studentRoute 驗證工作階段及欄位，再同步呼叫課堂提交操作。提交操作確認 answer 合法、題目仍存在且開放、學號尚未提交，然後保存提交；只有 winnerKey 為 null 時才將它設為該學號。檢查、寫入及第一名設定之間不得有 await、外部 I/O 或可重新進入的外部回呼。

Node.js 同一 JavaScript 執行緒上的這段同步操作會先執行完畢才處理另一個提交，因此後續有效提交會看到已設定的第一名，但仍被加入 submissions。第一名是完成解析驗證後進入此操作的第一個有效請求，不承諾等於實體點擊或網路封包抵達時間。[Node.js 事件迴圈文件](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick)

提交順序：
1. 驗證角色、請求格式、回答長度。
2. 在同一同步操作內判斷目前題目、去重、保存回答及設定第一名。
3. 回傳固定 202 與 received=true。
4. 更新教師投影與提交者的學生投影。通知錯誤不回滾已接受的提交。

停止、刪除及重新開放也透過同步 store 操作，與搶答依實際處理順序生效。同題同學號的後續提交不改寫首次回答。各題的 Map 與 winnerKey 獨立，不設全班只能有一個第一名的全域欄位。

題目狀態採 draft、open、stopped。start 可由 draft／stopped 進入 open；對已 open 再次 start 為無害操作。stop 將指定題目設為 stopped，不影響其他題。出現第一名不改 status。修改題目文字不重置提交或第一名，介面提醒教師；刪除題目則清除該題記憶體紀錄且不重新編號。

### 5. 身分驗證與請求邊界

教師帳號與密碼由 TEACHER_USERNAME、TEACHER_PASSWORD 環境設定提供。兩者缺少時不啟動可用的管理服務，不預置公開管理密碼；設定範例只提供占位文字。比較憑證時使用固定長度摘要與定時安全比較，登入失敗統一回報。原始憑證不寫入日誌或前端。

教師與學生使用分開的 HttpOnly、SameSite=Strict cookies，分別對應 teacher_session、student_session。token 為隨機不可猜測值，後端只在記憶體保存雜湊；有效期預設 12 小時。HTTPS 部署啟用 Secure，HTTP 本機示範不啟用 Secure。同一瀏覽器可以分頁展示兩種角色。

學生登入接收 studentNumber。這是自填身分，不做真實學籍驗證。同一學號新登入可建立新工作階段，但所有工作階段共享同題同學號的提交去重狀態，不因重登入獲得第二次提交機會。學生 API 不回傳已保存的答案，避免單靠輸入他人學號就讀出回答；僅提供自己的 submitted 狀態。

寫入端點要求 application/json，驗證 Origin 為設定的同源網址；瀏覽器跨來源請求拒絕。若非瀏覽器客戶端不帶 Origin，仍須有效工作階段。前後端均限制輸入長度，HTTP body 上限 64 KiB，可容納規格的 5000 字元回答。超過傳輸限制回傳 413，錯誤格式或欄位回傳 400。學生 buzz body 僅接受 answer，不接受覆寫 studentNumber 或 winner 的欄位。

僅 public 靜態目錄能對外提供檔案。回答及學號顯示以 textContent 或等效文字節點處理，不以 HTML 插入。

### 6. 角色投影與 SSE

教師投影按 caseNumber 排序，每題含全部 submissions 及由 winnerKey 計算的 winner；回答按 acceptedOrder 顯示，不需額外公布完整名次。學生投影只含 studentNumber 與開放題目陣列，每題只含 id、caseNumber、content、submitted。

不直接序列化內部 store，也不以「傳出完整物件後讓前端隱藏」實作保密。

- 教師與學生使用各自的 events URL，建立 SSE 前先驗證角色。
- 連線註冊及初始快照在同一次同步流程完成；重連始終取得完整快照，不依賴歷史事件保存。
- SSE 事件名稱固定為 snapshot；不附上包含提交人數或全域結果版本的 event id。
- 每次新回答，只更新教師與該學號連線；其他學生不收到有人作答的事件。
- 題目新增、修改、開始、停止或刪除時重新計算相關投影；資料未改變不重送快照。
- 定時傳送固定頻率 heartbeat 註解並檢查工作階段有效期。逾期以 auth-required 事件終止，前端回登入畫面。
- 斷線自動重連，前端顯示連線狀態。若重連因 401 失敗，透過自身查詢端點確認後回登入，避免永久重試。
- 慢速連線不累積無界資料，保留最新快照或關閉後重連。反向代理需關閉 SSE buffering。

這是訊息內容與事件行為的隔離，不宣稱能排除所有網路時間側通道。

### 7. 教師端介面

使用者已確認套用版型提案 A。教師登入保留帳號密碼；登入後以約 280px 左側題目清單與可伸展的右側閱讀區呈現，保留米白、深綠及暖黃配色。新增題目表單按需展開，頁首摘要顯示開放題數、回答總數及有第一名的題數。

題目選取以 UUID 管理；可切換所有題目總覽與單題完整回答。總覽顯示各題狀態、回答數、第一名及查看入口；單題提供開始／停止、編輯與刪除、第一名摘要及全部回答表格。勝負僅限教師端。選取題目被刪除時回總覽，新建同 Case 不沿用舊 UUID 狀態。

新增表單與各題編輯表單保持 DOM／草稿穩定，SSE 不重建正在輸入的表單；切換題目仍保留未儲存編輯，工作階段失效則清空。提供舒適／精簡閱讀間距與收合側欄；收合後仍可回總覽選題。窄螢幕改上下配置，避免長學號或回答造成水平溢出。

上方固定工具列提供匯出入口，先顯示預期寫入範圍與第一名文字；教師確認後才呼叫既有 POST 匯出。預覽不充當後端快照，對話框開啟期間資料更新即重新計算提示，正式寫入仍以後端接受匯出時的快照為準。匯出中禁止重複匯出及題目管理，仍可閱讀新回答；成功／失敗明確顯示且失敗可重試。

樣式放在教師專用 teacher-dashboard.css，不改學生共用樣式。獨立 public/previews 頁面保留為歷史設計參考，正式入口 /teacher 不含合成資料。

### 8. 學生端介面

登入後頁首顯示自己的學號及連線狀態。開放題目以 Case 題號排序，每題是一張卡片，包含題號、完整題目、回答 textarea、醒目的「搶答！」按鈕及自己的提交訊息。不顯示人數、其他學號、其他回答或勝負提示。

每張卡片以 questionId 保存前端狀態：
- editable：可填回答，空白答案不可送出。
- sending：立即鎖定該題，凍結本次 answer 快照。
- sent：確認後顯示已送出，維持鎖定。
- retryable：連線錯誤提示「未確認送出，請重試」，只重送凍結的同一份回答。

SSE 更新採 questionId 局部合併，不覆蓋 editable 的草稿或其他題目操作。若有效提交快照比 REST 回應先到，submitted=true 同樣可將該題設為 sent。400 輸入錯誤可回 editable 修正；401 回登入；網路錯誤不擅自宣告成功。

教師停止或刪除某題時移除該作答卡，不移除其他題。無開放題目顯示「等待老師發布題目...」。未送出草稿只存在頁面記憶體，重新整理可能消失；已有效提交的鎖定狀態由後端恢復。對過期題目收到 received=true 只表示動作已送達，後續以後端公開狀態為準，不顯示勝負。

### 9. Google Sheet 寫入與匯出鎖

使用 GOOGLE_SHEET_ID、GOOGLE_SHEET_NAME（預設工作表1）、GOOGLE_APPLICATION_CREDENTIALS（服務帳號 JSON 路徑）。Google Cloud 專案啟用 Sheets API，目標試算表另分享給服務帳號並授予編輯權限；不需專案 Editor 角色或網域全權委派。JSON 僅放本機非公開位置，排除版控，不放入 public、URL 或日誌。

GoogleAuth 以 spreadsheets scope 取得權杖，後端直接呼叫 spreadsheets.values.batchUpdate。每個 Sequence 精確為 answer + "_" + studentNumber，例如 Single element_00123；保留內部換行及學號前導零。以 row=18+caseNumber 計算 Case 1–6 的 C19–C24，正確引用分頁名稱。valueInputOption=RAW，所有有第一名的題目合併成一次批次，不 append、不改格式，沒有第一名的格不動。範圍及內容只來自後端第一名快照，前端匯出 body 為空物件。

匯出流程：
1. 驗證教師、確認未在匯出，同步設 inFlight 並複製第一名快照。
2. 沒有結果則回 writtenCount=0、ranges=[]，不呼叫 Google。
3. 有資料但缺少 Sheet ID 或憑證路徑回 503；憑證無效、授權／寫入／配額錯誤、逾時或無效確認回 502。授權與寫入整體預設最多等待 15 秒。
4. 等待期間學生繼續提交，新結果不加入本次快照；管理操作與第二次匯出回 409。
5. API 成功且 totalUpdatedCells 等於本次格數才回報成功；ranges 來自後端實際送出的固定範圍。HTTP 200 本身不足以判斷成功。所有路徑於 finally 解鎖，不清除回答。

不無限自動重試，教師可手動重試相同格。逾時不能證明遠端未寫入；固定位置覆寫避免重複列，但不宣稱 exactly-once。Google 原始錯誤與憑證不回傳前端。

配額及費用（2026-09-23 查核）：標準使用目前不額外收費，寫入預設每使用者／每專案每分鐘 60 次、每專案合計 300 次；單次 API 處理上限 180 秒，本系統仍採較短的 15 秒等待。六題合併算一次 API 請求。官方公告 2026 年稍後將對超額使用計費，因此不承諾永久免費或無限制；本案維持標準額度，不申請付費擴額。遇配額錯誤保留回答，稍後手動重試。[Google 官方限制與費用](https://developers.google.com/workspace/sheets/api/limits)

### 10. API 合約與未來組別變更

遵循三份 Specs 的所有路由，學生使用複數 /api/student/questions，不再使用單題 current 路由。已交付 OpenAPI 3.1 JSON，描述 username/password、studentNumber、answer、TeacherQuestion、StudentQuestion、統一錯誤及 SSE 投影。

目前所有對外欄位仍為 studentNumber，不預先加入 groupId 或組別 API。內部將「取得參與者識別」「回答內容」「匯出格式」分開；未來以組別取代學號時，需同時確認登入、去重粒度、同組多人的競爭與 Sequence 標籤，不能只把 UI 改字。

### 11. 驗證設計

下列驗收方式已由自動測試、瀏覽器操作及經授權的 Case 1 真實 Google 測試核對；逐項證據見 docs/verification.md，正式規格對照見 docs/openspec-verification.md：

| 重點 | 驗證方式 |
| --- | --- |
| 同題併發 | 100 個不同學號同時提交，保存 100 份回答且僅一名第一名；第一名對應 acceptedOrder 最小者 |
| 多題併發 | 混合提交多題，逐題核對回答集合及各自第一名 |
| 去重 | 同學號多連線、重登入及修改後重送，只保留同題首次回答 |
| 停止與重開 | 關閉題目後不接受提交；重開保留第一名，其他題目不中斷 |
| 刪除與重建 | 同 Case 新 UUID，舊請求不能寫入新題 |
| 權限及隱私 | 學生不能讀教師 API/SSE；學生 REST、SSE 名稱、標頭與資料無其他人資訊 |
| 推播與草稿 | 模擬教師、兩名學生及多題操作，未送出草稿不被事件清除 |
| 匯出 | 注入測試 writer，核對僅第一名、C19–C24、RAW、回答_學號精確格式、回答原有換行及學號前導零 |
| 外部失敗 | 模擬 403、逾時、回應遺失及重試，未確認不顯示成功且本地資料不清除 |
| 匯出期間 | 操作鎖拒絕管理及第二次匯出，學生後續回答仍可見 |
| 重啟 | 建立新服務實例，舊 cookie 失效、狀態清空，外部已寫入內容不被操作 |

真實 Sheet 驗收已限定於獲授權的 Case 1，完成後還原原值；其餘 Case 的映射由自動測試及程式核對。未來換憑證或目標試算表時需重新確認測試範圍；模擬 writer 通過不等於再次驗證雲端授權。

## Risks / Trade-offs

- [單程序限制] → 以單一 Node.js 程序部署；若未來要多副本，須重新設計共用裁決與狀態，本版維持無資料庫。
- [免密碼學號可冒用] → 明確定位為課堂工具，不宣稱真實身分驗證；未來需要更強驗證再修訂登入規格。
- [服務中斷會遺失回答] → 使用者已接受；教師在課堂期間適時手動匯出，部署更新安排於課後。匯出只保存第一名，其他回答不因此持久化。
- [HTTP 到達順序受網路影響] → 依後端有效處理順序裁決，不採信裝置時間或宣稱實體同時公平。
- [直接修改題目內容] → 既有回答不重設，教師介面提醒修改不會重新開始比賽。
- [完整教師快照隨回答增多] → 本版最多六題，先用快照減少重連錯誤；測試確保慢連線不累積無界緩衝。
- [Sheet 顯示可能受原有列高影響] → 保留原始格式與完整文字值，不擅自調整列高或儲存格格式。
- [Google 設定變更] → 目前憑證、權限與 Case 1 真實驗收已完成；日後更換憑證或目標 Sheet，應另行確認範圍並驗收。
- [配額與政策變更] → 使用標準額度、手動批次匯出，失敗保留回答；部署前核對官方限制，不開啟付費擴額。
- [學校帳號禁止建立金鑰或外部分享] → 先確認管理政策與可用設定；不透過公開編輯繞過 API 授權。

## Migration Plan

初次啟動與 Google 設定見 README.md。Apps Script 未實作，因此沒有雲端腳本遷移或資料庫遷移。新版教師介面只需重新整理，後端與學生 API 契約保持一致。

正式服務依使用者要求已於 2026-09-24 停止。下次在專案目錄執行 npm start；既有 .env 與憑證不需重建。停止或重啟會清空課堂記憶體，已匯出的 Sheet 內容保留。

同網路學生需使用教師主機 IP 並設定 HOST、APP_ORIGIN；公開 HTTPS 部署另需 Secure cookie 及 SSE 代理設定，尚未實地驗收。

## Open Questions

本次功能範圍沒有待決需求。原生 Sheet、Case 映射、輸出格式、服務帳號與獲准的真實驗收均已確認。實體教室網路驗收及未來組別方案保留為後續工作，不計入已完成範圍。
