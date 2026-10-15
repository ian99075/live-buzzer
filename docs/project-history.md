# 即時線上搶答系統：專案歷程與產出紀錄

## 2026-10-14：grouped-case-questions 完成同步與歸檔

最新 Verify 對照 31/31 任務、11 條需求及 45 個情境，44/44 自動測試與 OpenSpec 嚴格驗證通過；詳見 `docs/grouped-case-questions-verification.md`。三份差異規格已同步到 `openspec/specs/`，並封存於 `openspec/changes/archive/2026-10-14-grouped-case-questions/`；目前沒有進行中的 change。先前 Verify 提出的已匯出後「將匯出」文案提醒仍保留。本輪未寫入真實 Google Sheet。

## 2026-10-13：同一 grouped-case-questions change 的後續修訂與 Apply

因教師要求連續自動編號、刪題後遞補及登出，先在原 change 修訂 Proposal、Design、三份差異規格與 Tasks，再 Apply。產出包括後端與介面改動、OpenAPI／README／設定背景同步、模擬 Google 座標帳本及重試測試、教師／學生隔離瀏覽器驗收。`npm test` 44/44 與 OpenSpec 嚴格驗證通過；真實 Sheet 沒有寫入。此階段結束後仍待使用者手動測試與新版正式 Verify、主規格同步及歸檔。

建立日期：2026-10-07（Asia/Taipei）

紀錄範圍：本次對話中的 `live-buzzer` 搶答系統，自需求討論至 OpenSpec 封存、後續複核及區域網路討論。

專案位置：`C:\Users\Ian\Desktop\NCU\實驗室\SE_TA`

## 1. 紀錄依據與閱讀方式

本檔由既有對話、已封存的 OpenSpec 文件、程式檔案及驗收紀錄回溯整理，並非開發當時逐筆產生的操作日誌。

- 有明確日期的事件標出日期；無法確認單次操作日期的內容，以階段或期間表示，不推測精確時間。
- 「產出」包含新增或修訂的文件、程式、設定，以及執行時產生的資料；不表示每個檔案只在該步驟修改一次。
- 開發曾因額度及需求修改多次中斷、返回前一階段，因此下列步驟按工作脈絡整理，不代表全部工作嚴格一次完成。
- 測試結果均標明所屬驗收日期或階段。本次建立紀錄檔沒有重跑功能測試、啟動正式系統或寫入 Google Sheet。
- 不記錄教師密碼、服務帳號私鑰、存取權杖或真實學生回答。
- 本紀錄不取代目前主規格，也不修改已封存的歷史變更。

主要依據：

| 來源 | 可核對的內容 |
| --- | --- |
| [Proposal][proposal] | 問題、最終範圍、能力分類與方案變更 |
| [Design][design] | 架構、併發、角色隔離、介面與匯出設計 |
| [Tasks][tasks] | 26 項實作／驗收任務及歷史完成紀錄 |
| [專案驗收紀錄][verification] | 自動測試、瀏覽器操作、Google 真實寫入與還原 |
| [OpenSpec 核對報告][spec-verification] | 23 條需求、37 個情境、同步與封存結果 |
| [接續紀錄][resume] | 中斷後恢復工作的依據、完成狀態及後續邊界 |
| 本次對話 | 分階段確認、需求修訂、工具來源澄清與區域網路討論 |

## 2. 專案最後確認的目標

建立教師與學生可共同使用的課堂搶答系統：教師以帳號密碼登入，可同時開放多題；學生以字串學號免密碼登入，先輸入回答再按搶答。教師可見所有有效回答及每題唯一第一名，學生只看到自己的提交狀態。

不使用資料庫，題目、工作階段、回答與第一名暫存於單一 Node.js 程序記憶體。教師手動匯出時，後端以服務帳號呼叫 Google Sheets API，只將每題第一名寫入既有 Sequence，文字精確為 `回答_學號`。

| 項目 | 最終決策 |
| --- | --- |
| 技術 | JavaScript、Node.js 24、HTML／CSS、REST、SSE |
| 題號 | Case 1–6 分別對應第 1–6 題；各題可獨立開放 |
| 第一名 | 後端最先接受的有效提交；不採用學生裝置時間 |
| 重送 | 同題同學號只保留首次有效回答 |
| 教師可見 | 全部有效回答、學號與唯一第一名 |
| 學生可見 | 開放題目、自身學號及自己的已送出狀態 |
| 匯出 | 每題僅第一名，覆寫固定位置，不新增列或表頭 |
| 重啟 | 記憶體資料清空；已寫入 Sheet 的內容不清除 |
| 後續需求 | 分組、學籍驗證、持久化、公開部署未納入本次實作 |

## 3. 需求、規劃與方案演進

### 步驟 01：提出專案與初始介面需求

**處理內容：** 使用者提出期末專案，要求教師端題目管理、即時監控與 Google Sheet 匯出；學生端簡單登入、等待及搶答，禁止顯示勝負與名次。初始描述包含資料庫併發要求，並提供雲端試算表連結。

**產出：** 對話中的初始需求與待釐清問題。這個階段的描述不是最終規格，例如資料庫與登入識別方式後來均有調整。

### 步驟 02：確認既有 OpenSpec 環境

**處理內容：** 使用者表示 OpenSpec 已安裝；專案具備 OpenSpec 工作區及相關技能。後續以 `spec-driven` schema 管理 `live-buzzer`。

**產出：** [OpenSpec 專案設定][config]與既有技能入口可供工作流程使用。封存中的 `.openspec.yaml` 記載 change 建立日期為 2026-09-22。

**證據界線：** 可確認早期工具與工作區已存在，不能聲稱是助理在這次開發中首次安裝或初始化，也不能僅據此判定最初選取的介面是 Codex。

### 步驟 03：Explore 釐清需求與分階段確認

**處理內容：** 使用者要求按步驟進行，不希望助理連續跨階段實作。經多輪討論，確認以下變更：

| 初始描述或待決問題 | 後續確認結果 | 影響的產出 |
| --- | --- | --- |
| 以資料庫處理併發 | 不使用資料庫，採單一程序記憶體 | Design、核心狀態與部署限制 |
| 姓名／座號登入 | 暫以學號登入，保留未來修改可能 | private-buzz 規格及學生頁面 |
| 教師登入方式 | 必須有明確帳號與密碼 | question-management 規格與登入模組 |
| 是否一次只開一題 | 可同時開放多題 | 題目狀態、API、教師與學生介面 |
| Case 與題目關係 | Case N 就是第 N 題 | 固定題號及匯出位置 |
| 回答如何取得 | 學生先填回答，再搶答送出 | 回答欄位、提交 API、按鈕狀態 |
| 教師要看到誰的回答 | 全部學生的有效回答 | 教師投影、SSE、回答列表 |
| Google 要收到誰的回答 | 僅每題第一名 | 匯出快照與固定格寫入 |
| Sequence 文字格式 | 僅 `回答_學號` | sheet-export 規格、writer 與測試 |
| 未來可能分組 | 本版先以學號，未實作組別 | 非目標及後續變更邊界 |

**產出：** 對話確認的需求決策，後續納入 Proposal、Specs、Design、Tasks。Explore 沒有額外必須交付的獨立文件，本專案也沒有另建 `explore.md`。

### 步驟 04：建立 change 與 Proposal

**期間：** 2026-09-22 起，後續隨確認的需求修訂。

**處理內容：** 建立 `live-buzzer`，說明要解決的課堂問題、功能範圍與影響，區分三項能力：`question-management`、`private-buzz`、`sheet-export`。

**產出：** [proposal.md][proposal] 與 change 的 `.openspec.yaml`。開發時文件位於進行中的 change；目前完整保存在封存目錄。

### 步驟 05：定義 Specs 與 API 行為

**處理內容：** 將需求轉成可核對的 Requirement／Scenario，定義教師與學生權限、題目 CRUD、開始／停止、提交、事件串流及 Google 匯出。明確規定學生提交確認不透露第一名或名次。

**產出：** change 中三份差異規格；同步後的主規格如下：

| 主規格 | 需求數 | 情境數 | 涵蓋內容 |
| --- | ---: | ---: | --- |
| [question-management][question-spec] | 7 | 12 | 教師驗證、CRUD、多題、全部回答與教師版型 |
| [private-buzz][buzz-spec] | 7 | 10 | 學號登入、提交、去重、裁決、隱私與重連 |
| [sheet-export][sheet-spec] | 9 | 15 | Google 授權、第一名、固定位置、錯誤與確認清單 |
| **合計** | **23** | **37** | 最終版本，含後續教師介面增修 |

OpenSpec 的行為規格與 [OpenAPI JSON][openapi] 是不同產出：前者記錄需求與情境，後者記錄可供前後端對照的 API 結構。

### 步驟 06：Design 決定架構與資料流

**處理內容：** 選定 Node.js 原生 HTTP、JavaScript ES modules 與原生網頁；REST 接收操作，SSE 推播更新。設計同步搶答裁決、角色資料投影、記憶體工作階段、匯出鎖、失敗重試及部署限制。

**產出：** [design.md][design]，包含模組結構、狀態模型、介面行為及驗收策略。

```text
學生填寫回答 → REST → Node.js 記憶體 → 判定每題唯一第一名
                           │
                           ├─ SSE → 教師：全部回答與第一名
                           ├─ SSE → 學生：公開題目與自己的提交狀態
                           └─ 教師手動匯出 → Google Sheets API
```

### 步驟 07：拆分 Tasks，分段進入實作

**處理內容：** 將架構拆成專案骨架、登入、核心、API、教師端、學生端、Google 整合與驗收任務。使用者逐階段確認並授權繼續實作。

**產出：** [tasks.md][tasks]。原始範圍共 23 項，教師新版型增加 3 項，最後為 26 項。各項處理與產出詳見下一節。

### 步驟 08：處理額度中斷與恢復工作

**處理內容：** 開發期間數次因額度不足而停止；使用者要求先整理完成／未完成項目，恢復後接續。Google 設定尚不足時，保留真實匯出驗收為未完成，沒有把模擬測試當成真實整合成功。

**產出：** [接續紀錄][resume]、Tasks 完成狀態與驗收文件。曾記錄 22/23 完成，等待第 8.4 項真實 Google 驗收；這是當時狀態，不是目前仍未完成。

### 步驟 09：確認原生 Google Sheet 與整合方案

**期間：** Google 設定討論至 2026-09-23。

**處理內容：** 使用者將原始 Excel 轉為原生 Google Sheet，提供新網址。討論過在試算表端使用 Apps Script；使用者詢問限制後，最終選定本機 Node.js 直接呼叫 Google Sheets API，撤回尚未實作的 Apps Script 規劃。

**產出：** 修訂 Proposal、Design、sheet-export 規格及 [README 設定指南][readme]；確認服務帳號授權、目標分頁與固定位置。Apps Script 沒有成為交付程式，也沒有需要移除的已部署腳本。

| 題號 | 工作表1 的 Sequence |
| --- | --- |
| Case 1 | C19 |
| Case 2 | C20 |
| Case 3 | C21 |
| Case 4 | C22 |
| Case 5 | C23 |
| Case 6 | C24 |

**本機設定：** 使用者完成 Google 端設定及憑證準備；教師帳號與隨機密碼則依使用者授權在本機設定。`.env` 與服務帳號 JSON 是私人部署資料，本檔不複製其內容。

## 4. Apply：26 項任務分別做了什麼、產出什麼

以下 ID 對應已封存的 Tasks；「完成」依既有實作及驗收紀錄，不代表 2026-10-07 再次驗收。

| 任務 | 處理內容 | 主要產出 | 完成依據 |
| --- | --- | --- | --- |
| 1.1 | 建立 Node.js 專案、目錄與啟動／測試入口 | [package.json][package]、package-lock.json、public／src／tests／docs | 可啟動單一 HTTP 服務，無資料庫相依 |
| 1.2 | 設定教師帳密、服務網址、Google 參數與測試注入 | [config.js][app-config]、[.env.example][env-example]、[server.js][server] | 缺教師設定拒絕啟動；缺 Google 設定仍可本地搶答 |
| 2.1 | 教師驗證、學生學號登入、角色 cookie、有效期 | [auth.js][auth]、兩組角色路由 | 登入、隔離、前導零及過期測試 |
| 2.2 | 驗證 JSON、字數、欄位、來源與公開檔案範圍 | [http.js][http]、[server.js][server] | 拒絕超量、偽造欄位、跨來源與非公開檔案讀取 |
| 3.1 | UUID 題目、Case 1–6、CRUD、多題狀態 | [classroom.js][classroom] | 重複題號拒絕，各題獨立，重開保留回答 |
| 3.2 | 同步提交、保存全部有效回答、首次回答去重及唯一第一名 | [classroom.js][classroom] 的 submit | 核心及 100 人 HTTP 併發測試 |
| 3.3 | 停止／刪除後的過期請求、重建 UUID、重啟清空 | [classroom.js][classroom]、[server.js][server] | 舊請求不寫新題；新服務不恢復舊狀態 |
| 4.1 | 實作 REST 與 API 合約 | [teacher route][teacher-route]、[student route][student-route]、[openapi.json][openapi]、[產生器][openapi-script] | 合約含 14 組方法／路由，參照可解析 |
| 4.2 | 教師完整資料、學生白名單資料及固定提交確認 | [projections.js][projections]、角色路由 | 教師見全部；學生無他人資料、勝負或人數 |
| 4.3 | SSE 初始快照、重連、相關學生通知、心跳與慢連線處理 | [後端 events.js][server-events] | 即時更新、隔離、過期與連線清理測試 |
| 5.1 | 教師登入、題目管理、逐題控制與刪除確認 | [teacher.html][teacher-html]、[teacher.js][teacher-js]、[question-controls][controls]、[question-editor][editor] | 瀏覽器 CRUD、多題與草稿操作 |
| 5.2 | 全部回答、學號、第一名、換行及長內容顯示 | 教師回答元件；新版由 [teacher-view.js][teacher-view] 負責 | 三名學生回答皆可讀，僅一位第一名 |
| 5.3 | 匯出入口、覆寫說明、等待及成功／失敗訊息 | [export-panel.js][export-panel] | 模擬匯出、操作鎖與錯誤提示 |
| 6.1 | 學號登入、等待畫面與多題作答卡 | [student.html][student-html]、[student.js][student-js]、[answer-card.js][answer-card] | 多題獨立，沒有勝負／他人資訊 |
| 6.2 | 立即鎖定、送出確認、凍結答案及重試 | [answer-card.js][answer-card] | 空白拒絕、確認遺失重試、原回答不被覆蓋 |
| 6.3 | UUID 局部更新、草稿保留、連線與過期處理 | [student.js][student-js]、[前端 events.js][client-events] | SSE、重連、停止題目及重啟流程 |
| 7.1 | 第一名轉換為固定位置與精確文字 | [sheets.js][sheets] 的 sheetData | RAW 測試中的位置、換行與前導零核對 |
| 7.2 | Google 授權、批次 RAW 寫入、逾時及錯誤轉換 | [sheets.js][sheets] 的 createGoogleWriter | 模擬請求核對；後續 Case 1 真實驗收 |
| 7.3 | 匯出開始時快照、管理鎖與 finally 解鎖 | [sheets.js][sheets] 的 SheetExporter | 期間仍收回答；失敗不丟資料且可重試 |
| 8.1 | 100 學號、兩題交錯提交，共 200 次請求 | [api.test.js][api-test]、[驗收紀錄][verification] | 每題 100 份回答，各自唯一第一名 |
| 8.2 | 瀏覽器端到端、斷線／重啟及桌面／窄螢幕驗收 | [preview.js][preview-test]、[驗收紀錄][verification] | 實際操作與 1280px／390px 尺寸檢查 |
| 8.3 | 啟動、設定、操作、API、限制與部署說明 | [README][readme]、[.env.example][env-example]、[OpenAPI][openapi] | 正式啟動入口及文件對照完成 |
| 8.4 | 真實 Google 寫入、讀回、重試與還原 | [驗收紀錄的 8.4 節][verification] | 2026-09-23 僅測試 C19，兩次寫入後恢復原值 |
| 9.1 | 套用確認後的教師版型、總覽／單題、密度與側欄 | [teacher-dashboard.css][teacher-css]、[teacher.js][teacher-js]、[teacher-view.js][teacher-view] | 2026-09-24 新版瀏覽器驗收 |
| 9.2 | 匯出確認清單接正式 API 與操作鎖 | [export-panel.js][export-panel] | 清單更新、取消、模擬成功／失敗重試 |
| 9.3 | 新版回歸、草稿／焦點與手機尺寸驗收 | [版型紀錄][layout-doc]、[驗收紀錄][verification] | 三項新版任務完成，累計 26/26 |

補充：原回答元件 `response-list.js` 保留在專案中，最終教師入口改用 `teacher-view.js`。這個模組變化已補入 Design，不應把舊元件誤認為目前教師頁面的主要實作。

## 5. 整合、驗收與 OpenSpec 收尾

### 步驟 10：先完成本地及模擬整合驗收

**處理內容：** 用合成資料測試 HTTP、SSE、權限、併發與匯出 writer；另外透過瀏覽器操作教師與學生頁面。模擬 Google 不需要正式憑證，也不會改寫雲端。

**產出：** 五份自動測試檔、共用測試工具、模擬預覽服務與 [verification.md][verification]。Google 真實整合未完成前，任務 8.4 仍列為待辦。

### 步驟 11：完成真實 Google Sheets 驗收

**日期：** 2026-09-23。

**處理內容：** 使用者明確同意測試 Case 1 並還原。以正式 HTTP API 送入 TEST001、TEST002、TEST003 三份合成回答，確認教師可見全部、第一名為 TEST001。兩次正式匯出均只寫 C19，讀回文字為 `整合驗收_TEST001`，最後還原原值並核對其他資料及格式不變。

**產出：** [真實驗收紀錄][verification]、任務 8.4 完成狀態；暫存備份與測試題目在驗收後清除。原始任務由 22/23 進展至 23/23。

**範圍界線：** 真實寫入只涵蓋獲授權的 Case 1；Case 2–6 的位置由程式核對與代表性模擬測試支持，未宣稱六格都做過真實寫入。

### 步驟 12：提供操作與程式交付位置說明

**處理內容：** 說明從專案目錄執行 `npm start`、教師帳密修改位置、核心程式、規格及可交付文件；提醒私人設定與憑證不作為公開程式碼交付。

**產出：** [README][readme] 與對話中的檔案位置說明。程式入口、操作網址與資料重啟限制均有文件可查。

### 步驟 13：先製作教師版型預覽，再套用

**期間：** 本地功能完成後；正式整合驗收完成於 2026-09-24。

**處理內容：** 使用者希望優化卡片大小與位置，要求先看版型再決定。先提供獨立合成預覽；使用者回覆「套用新的模板」後，整合到正式教師頁面。

**產出：** [版型說明][layout-doc]、[預覽 HTML][layout-html]、[預覽 CSS][layout-css]、[預覽 JS][layout-js]，以及任務 9.1–9.3 對應的正式頁面與元件。獨立預覽不呼叫後端或 Google。

**驗收：** 2026-09-24 使用 3108 模擬服務，檢查 CRUD、全部回答、草稿與焦點、收合、刪除所選題、匯出取消／成功／失敗，以及 1280px／390px 尺寸。沒有因此再次寫入真實 Sheet。

### 步驟 14：對照投影片檢查流程與過期文件

**日期：** 2026-09-24 收尾階段。

**處理內容：** 使用者要求依投影片重新檢查 OpenSpec 步驟。發現文件仍有等待 Google 設定／驗收的過期描述，Design 的最終模組與驗證位置也需補正；同時釐清「實作完成」尚不等於「Verify、Sync、Archive 全部完成」。

**產出：** 修訂 Proposal、Design、Specs 的過期內容；補入教師新版型模組及 route 驗證後呼叫核心的實際設計；將專案慣例寫入 [config.yaml][config]。

**流程意義：** 這裡包含事後對照與補正，不能將最終文件回寫成「從一開始每一步都已正確完成」的歷史證明。

### 步驟 15：正式 Verify

**日期：** 2026-09-24。

**處理內容：** 對照 26 項任務、23 條需求及 37 個情境。補上「未授權或前端指定任意位置／答案時不得呼叫 writer」的 HTTP 回歸測試。

**產出：** [openspec-verification.md][spec-verification] 與 [api.test.js][api-test] 新增案例。自動測試由 13 項增加為 14 項，14/14 通過；報告未列未解決的 CRITICAL／WARNING。

**證據界線：** 37 個情境的依據包含自動測試、先前瀏覽器驗收及程式核對，不代表有 37 個獨立自動測試。此次 Verify 沒有重做真實 Google 寫入。

### 步驟 16：Sync 主規格

**日期：** 2026-09-24。

**處理內容：** 將已完成 change 的三份差異規格同步為主規格；主規格使用 Purpose／Requirements 結構，需求內容與差異規格核對一致，不帶入歷史 Review Notes。

**產出：** 三份 [question-management][question-spec]、[private-buzz][buzz-spec]、[sheet-export][sheet-spec] 主規格。嚴格驗證 3/3 通過；兩則 API 需求文字過長的 INFO 不屬驗證失敗。

### 步驟 17：Archive 與更新接續狀態

**日期：** 2026-09-24。

**處理內容：** 完成驗證及主規格同步後，將整個 change 移入日期命名的 archive 目錄，保留 Proposal、Design、Tasks、差異 Specs 及 `.openspec.yaml`。依使用者要求關閉當時正式及測試服務。

**產出：** [已封存的 live-buzzer][archive]、[接續紀錄][resume]、README 與核對報告中的完成狀態。進行中的 change 清單為空。

**位置說明：** 進行中的規劃文件原本在 change 下；完成封存後位於 archive 是正常結果。主規格仍保留在 openspec/specs，作為後續需求基準。

## 6. 封存後的複核與討論

| 時間／步驟 | 處理內容 | 產出或結論 | 是否改動系統 |
| --- | --- | --- | --- |
| 2026-09-29：封存位置複核 | 回答 Proposal／Design／Tasks 為何在 archive，核對完成數、同步及規格驗證 | 封存位置正確，不需移回進行中的 change | 唯讀核對 |
| 2026-10-01：工具來源澄清 | 使用者在 ChatGPT 看見「工作」標記，要求確認起初是否使用 Codex | 最初標籤無法確定；初始化選 Codex 代表工具整合，不等於證明當時介面選擇 | 無程式修改 |
| 2026-10-01：Codex 環境重新審查 | 再讀規劃、程式與測試；比較封存／主規格；重跑自動測試及 OpenSpec 驗證 | 26/26 任務、需求內容一致、14/14 測試通過、3/3 主規格通過、無進行中 change | 未改程式與封存文件；未重驗瀏覽器或 Google |
| 同次審查：既有工具定位 | 受限執行環境找不到 OpenSpec，曾發起臨時取得工具的嘗試；使用者中止並明確禁止安裝其他工具 | 後改以讀取既有安裝位置找到 OpenSpec 1.13.0，使用既有工具完成驗證；沒有把下載嘗試算成專案環境建置成果 | 後續不再下載或安裝 |
| 2026-10-06：區域網路討論 | 使用者確認教師與學生預計在同一區域網路，要求先討論不修改 | 既有程式支援；需設定 HOST、APP_ORIGIN、確認防火牆並跨裝置驗收 | 尚未依此討論修改設定 |
| 2026-10-06：流程完整性澄清 | 討論是否曾先實作、後補規格，以及這是否偏離 OpenSpec | 區分目前規格／程式一致與歷史流程順序；事後補正不能證明全程都先規格後實作 | 未重寫封存歷史 |
| 2026-10-07：建立本紀錄 | 整理各階段工作、26 項任務、檔案產出、驗收及待辦 | 本檔 project-history.md | 僅新增此紀錄檔 |

### 6.1 開發工具來源的證據界線

先前查核最初紀錄可見 `codex_work_desktop`，當時查詢的任務類型為 `codex`。這些資訊不能單獨證明使用者最初選的是 Codex 標籤，亦不能依 Work 標籤推定底層完全沒有共用執行能力。

本紀錄不將整段歷史寫成「已證實全程使用 Codex 介面」。可以確認的是：專案有實際本機檔案與執行／測試紀錄，並已在目前 Codex 任務環境進行後續審查。

### 6.2 規格與歷史流程的區別

可確認的補正包含 Google 設定／驗收狀態的過期文字、教師版型模組清單、驗證發生位置及回歸測試。部分文件在實作後重新對照並更新，這些事實保留於歷程。

目前文件及程式相符，不等於能證明歷史上的每個新增功能都先完成規劃更新；缺乏逐次先後證據的項目，不在本檔推定合規，也不臆測某一功能必定跳過 Proposal。若行為或需求確實先實作才補規格，應誠實記為流程偏離；既定規格內的修錯則不必一律重跑 Propose。

## 7. 執行時產生的資料與保存位置

| 資料 | 產生時機 | 保存位置與生命週期 |
| --- | --- | --- |
| 題目 UUID、Case、文字、開放狀態 | 教師建立／管理題目 | 後端記憶體；刪題或服務重啟後不保留 |
| 工作階段與 token 雜湊 | 教師／學生登入 | 後端記憶體；瀏覽器持有角色 HttpOnly cookie；逾期／重啟失效 |
| 首次有效回答、學號與接受順序 | 學生提交 | 每題記憶體集合；同題同學號不覆寫原回答 |
| 每題唯一第一名 | 第一份有效提交被接受 | 指向該題既有提交的 winnerKey；後續回答不替換 |
| 教師／學生即時快照 | 連線或可見狀態改變 | REST／SSE 傳輸；按角色限制欄位，不建立課堂資料檔 |
| 匯出快照 | 教師確認匯出 | 本次操作的記憶體副本；只含開始時已有的第一名 |
| `回答_學號` | Google 寫入成功 | Google Sheet 固定 Sequence；本機服務重啟不清除 |
| 帳密、Google 憑證路徑 | 本機部署設定 | 私人 .env；實際私鑰另存本機 credentials，不公開交付 |
| 合成測試資料 | 測試或預覽 | 測試程序記憶體；真實 C19 測試內容已按約還原 |

## 8. 截至本紀錄建立時的狀態與未完成項目

### 已有完成證據

- live-buzzer 的 26 項既定實作／驗收任務完成，OpenSpec 主規格同步並封存。
- 最近一次已知複核（2026-10-01）自動測試 14/14、主規格嚴格驗證 3/3 通過。
- 2026-09-23 完成 Case 1 真實 Google 寫入、重試及還原。
- 2026-09-24 完成教師新版型瀏覽器與尺寸驗收。

### 尚待部署環境完成

- 區域網路：將 HOST 設為 `0.0.0.0`，APP_ORIGIN 設為主機實際 IP 與連接埠的網址，確認 Windows 防火牆及網路允許裝置互通。
- 老師與學生使用相同來源網址，分別進入 `/teacher` 與 `/student`；學生裝置不使用指向自身的 localhost。
- 設定後重新啟動，使用另一台裝置確認登入、多題即時更新、提交、學生隱私及教師全部回答。
- 現有架構可支援上述設定，不需因純部署設定重新開 Propose。若要新增 QR Code、連線人數、分組等功能，才另行規劃 change。
- 實體教室網路、實際手機連線及 HTTPS 公開部署沒有已完成驗收的證據。

使用者先前要求這部分先討論、不改動；本次新增紀錄檔並未變更 .env、防火牆或網路設定，也未檢查當下是否有其他人啟動服務。

## 9. 後續紀錄格式

後續若繼續開發或完成教室驗收，可在本檔末尾追加，保留原有歷史：

| 日期 | 階段／change | 需求或問題 | 處理內容 | 新增／修改檔案 | 驗證方式與結果 | 尚待處理 |
| --- | --- | --- | --- | --- | --- | --- |
| 待填 | 待填 | 待填 | 待填 | 待填 | 區分本次執行與沿用證據 | 待填 |
| 2026-10-13 | grouped-case-questions Apply | 題組、Case 7 以後插列與既有列偵測 | 依已完成提案與設計實作資料模型、API、雙端介面、後端匯出計畫、Google 結構批次與重試 | `src/`、`public/`、`tests/`、`scripts/openapi.mjs`、`docs/openapi.json`、`README.md`、`openspec/config.yaml`、本 change 任務 | 36/36 自動測試、嚴格驗證、隔離瀏覽器教師／學生與 390px 通過；模擬 Google API 通過，真實 Sheet 未寫入 | 獨立 Verify、主規格同步、歸檔；如要真實結構驗收須先備份並取得明確範圍授權 |
| 2026-10-13 | grouped-case-questions Verify | 獨立核對 Apply 是否符合 change 規格與設計 | 逐條對照 20 項任務、10 條需求、34 個情境與七項設計決策，保存報告並更新目前流程狀態 | `docs/grouped-case-questions-verification.md`、`docs/RESUME.md`、`README.md`、`openspec/config.yaml` | 36/36 自動測試與 OpenSpec 嚴格驗證通過；無 CRITICAL／WARNING；沒有真實 Google 結構寫入 | 主規格同步、歸檔；真實 Sheet 結構驗收須另備份與授權 |
| 2026-10-14 | grouped-case-questions 最新 Verify、Sync、Archive | 完成追加教師介面規則後的流程收尾 | 重新對照 31 項任務、11 條需求、45 個情境；合併三份主規格並封存 change | `docs/grouped-case-questions-verification.md`、`openspec/specs/`、`openspec/changes/archive/2026-10-14-grouped-case-questions/` | 44/44 測試、主規格 3/3 驗證；無 critical，保留一項文案 warning；真實 Sheet 未寫入 | 如需修正文案或真實 Case 7+ 結構驗收，另行規劃與授權 |

[proposal]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/changes/archive/2026-09-24-live-buzzer/proposal.md
[design]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/changes/archive/2026-09-24-live-buzzer/design.md
[tasks]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/changes/archive/2026-09-24-live-buzzer/tasks.md
[archive]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/changes/archive/2026-09-24-live-buzzer
[config]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/config.yaml
[question-spec]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/specs/question-management/spec.md
[buzz-spec]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/specs/private-buzz/spec.md
[sheet-spec]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/openspec/specs/sheet-export/spec.md
[verification]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/docs/verification.md
[spec-verification]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/docs/openspec-verification.md
[resume]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/docs/RESUME.md
[readme]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/README.md
[openapi]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/docs/openapi.json
[openapi-script]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/scripts/openapi.mjs
[package]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/package.json
[env-example]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/.env.example
[app-config]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/config.js
[server]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/server.js
[auth]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/auth.js
[http]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/http.js
[classroom]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/classroom.js
[teacher-route]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/routes/teacher.js
[student-route]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/routes/student.js
[projections]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/projections.js
[server-events]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/events.js
[sheets]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/src/sheets.js
[teacher-html]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/teacher.html
[teacher-js]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/teacher.js
[teacher-view]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/components/teacher-view.js
[controls]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/components/question-controls.js
[editor]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/components/question-editor.js
[export-panel]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/components/export-panel.js
[student-html]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/student.html
[student-js]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/student.js
[answer-card]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/components/answer-card.js
[client-events]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/js/events.js
[api-test]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/tests/api.test.js
[preview-test]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/tests/preview.js
[teacher-css]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/css/teacher-dashboard.css
[layout-doc]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/docs/teacher-layout-preview.md
[layout-html]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/previews/teacher-layout.html
[layout-css]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/previews/teacher-layout.css
[layout-js]: C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/public/previews/teacher-layout.js
