# Verification Report: live-buzzer

日期：2026-09-24。Schema：spec-driven。依 openspec-verify-change 核對最終 Proposal、Design、三份 Specs、26 項 Tasks、實作與測試；本報告的程式路徑及行號相對專案根目錄。

## Summary

| Dimension | 結果 |
| --- | --- |
| Completeness | 26/26 任務；23/23 需求有實作；37/37 情境具測試或瀏覽器驗收證據 |
| Correctness | 14/14 自動測試通過，0 失敗、0 跳過；需求與角色/API/匯出行為相符 |
| Coherence | 過期規劃文字已修正，最終 Node.js 單程序／SSE／服務帳號／教師版型一致 |

## 檢查方法與證據界線

本輪重新執行 npm test（約 368 ms）、讀取實作與測試、逐項對照需求及情境。openspec validate live-buzzer --strict 通過。瀏覽器與真實 Google 驗收沿用 docs/verification.md 已記錄的實際操作證據，本輪沒有再次開啟正式課堂或寫入 Google，也不將程式閱讀當成重新做過瀏覽器驗收。

「情境具證據」包含自動測試、先前人工瀏覽器操作與補充程式核對，不表示每一情境都有獨立自動化測試。固定 Google Case 2–6 位置以程式核對，代表性 C19/C21 RAW 測試與 Case 1 真實還原驗收共同支持；未宣稱六格皆做過真實雲端寫入。

## 已修正的發現

- Proposal、Design 與兩份 Specs 註解仍描述等待 Google 設定／驗收，現已更新為實際完成日期、範圍及歷史決策。
- Design 補上教師專用 CSS、teacher-view、API 契約測試與驗收文件；明確表示舊 response-list 元件目前未使用。
- 工作階段由 route 驗證後同步呼叫核心，修正 Design 原先宣稱核心內再次驗證的敘述；行為契約與程式不變。
- 匯出前端任意位置情境缺少直接 HTTP 回歸測試，已新增 tests/api.test.js:82：未登入／學生回 401，偽造位置、學號、回答回 400，writer 不被呼叫且原回答保留。
- 長期規則已補入 openspec/config.yaml，包含技術棧、路徑、環境變數、隱私、裁決、測試與文件規則。

## Requirements and Scenarios

### private-buzz

| 需求 | 情境 | 實作證據 | 測試／驗收證據 |
| --- | --- | --- | --- |
| 學號登入與多題畫面 | 多題同時可作答 | src/routes/student.js:4; src/projections.js:11; public/js/student.js:14 | tests/api.test.js:5; 瀏覽器：多題同時開放 |
| 先填回答再送出 | 回答與學號一併送出；空白答案 | src/http.js:11; public/js/components/answer-card.js:21 | tests/api.test.js:36; 瀏覽器：空白不可送出、立即鎖定、確認遺失重試 |
| 保存全部有效回答與唯一第一名 | 多人併發同題；同時回答不同題 | src/classroom.js:18 | tests/api.test.js:54; tests/classroom.test.js:23 |
| 去重及過期請求 | 重試與修改後重送；停止後請求抵達 | src/classroom.js:18 | tests/classroom.test.js:23; tests/api.test.js:5 |
| 學生結果隔離 | 第一名與後續提交者 | src/routes/student.js:20; src/projections.js:11; src/events.js:39 | tests/api.test.js:5; tests/events.test.js:7 |
| 重連及重啟 | 重新整理與服務重啟的差異 | src/auth.js:23; public/js/student.js:7 | tests/contract.test.js:31; 瀏覽器：重新整理及服務重啟 |
| 學生 API 契約 | 學生多題 API 不洩漏資料 | src/routes/student.js:4; src/projections.js:11 | tests/api.test.js:5; tests/events.test.js:7; tests/contract.test.js:6 |

### question-management

| 需求 | 情境 | 實作證據 | 測試／驗收證據 |
| --- | --- | --- | --- |
| 教師帳號及密碼 | 教師登入；未授權讀取 | src/auth.js:6; src/routes/teacher.js:4 | tests/classroom.test.js:8; tests/api.test.js:5 |
| 題目 CRUD 與固定題號 | 第一題與第二題；刪除開放題目 | src/classroom.js:8; src/routes/teacher.js:4 | tests/classroom.test.js:23; tests/api.test.js:5; 瀏覽器：新增與刪題 |
| 多題獨立開放與停止 | 同時開放兩題；停止再重開 | src/classroom.js:16 | tests/classroom.test.js:23; 瀏覽器：雙題、停止重開 |
| 全部回答即時監控 | 第一名之後仍收集回答；重新整理教師頁面 | src/projections.js:2; src/events.js:3; public/js/components/teacher-view.js:36 | tests/events.test.js:7; 瀏覽器：全部回答、重新整理 |
| 課堂狀態僅存記憶體 | 服務重啟 | src/classroom.js:4; src/auth.js:6; src/server.js:16 | tests/contract.test.js:31 |
| 教師 API 契約 | API 取得全部提交 | src/routes/teacher.js:4; src/projections.js:2 | tests/api.test.js:5; tests/contract.test.js:6; tests/events.test.js:7 |
| 教師端閱讀版型 | 編輯時有新回答；收合與題目切換 | public/js/teacher.js:26; public/js/teacher.js:52; public/js/components/teacher-view.js:19 | 新版瀏覽器：SSE 焦點／草稿、切題、收合、刪除所選題、390px／1280px |

### sheet-export

| 需求 | 情境 | 實作證據 | 測試／驗收證據 |
| --- | --- | --- | --- |
| Google Sheets API 匯出通道與授權 | 教師手動匯出；授權失敗 | src/sheets.js:9; src/routes/teacher.js:4 | tests/sheets.test.js:6; tests/sheets.test.js:23; 真實 Google 驗收 8.4 |
| 僅匯出每題第一名 | 教師可見三人但只匯出一人 | src/classroom.js:27; src/sheets.js:44 | tests/sheets.test.js:37; 真實 Google 驗收 8.4 |
| Case 與 Sequence 對應 | 精確輸出格式；部分題目有第一名；沒有可匯出資料 | src/sheets.js:3; public/js/components/export-panel.js:12 | tests/sheets.test.js:6; tests/api.test.js:5; 真實 Google 驗收 8.4 |
| 後端固定寫入範圍 | 前端試圖指定其他位置 | src/routes/teacher.js:19; src/http.js:4; src/sheets.js:3 | tests/api.test.js:82（本輪新增：非法範圍／答案與未授權匯出） |
| 文字安全及可重試匯出 | 回答包含公式樣式文字；寫入回應遺失後重試；HTTP 成功但匯出未確認 | src/sheets.js:9 | tests/sheets.test.js:6; tests/sheets.test.js:23 |
| 匯出快照與同時操作 | 匯出時有新提交 | src/sheets.js:44; src/classroom.js:6 | tests/sheets.test.js:37 |
| 設定及記憶體限制 | 尚未設定權限；重啟後結果 | src/config.js:1; src/sheets.js:9; src/server.js:16 | tests/api.test.js:71; tests/sheets.test.js:23; tests/contract.test.js:31；程式僅手動匯出時呼叫 writer，重啟無 Google 清除操作 |
| 匯出 API 契約 | 實際成功才回報成功 | src/routes/teacher.js:19; src/sheets.js:44 | tests/api.test.js:71; tests/api.test.js:82; tests/sheets.test.js:37; 真實 Google 驗收 8.4 |
| 教師匯出確認清單 | 取消匯出預覽 | public/js/components/export-panel.js:22 | 新版瀏覽器：確認清單即時更新、取消無 writer、成功／失敗重試 |

## Issues

- CRITICAL：0 個未解決問題。
- WARNING：0 個未解決的規格／實作落差。
- SUGGESTION：主規格驗證有兩則 INFO，提醒 API 契約需求文字較長；保留完整路由契約以利核對，不影響驗證通過。舊回答元件未使用但不影響功能，本次不擴大清理範圍。

## Final Assessment

既定本地功能的檢查通過，可同步主規格並歸檔。實體手機／教室網路與 HTTPS 公開部署未驗收；分組、持久化及學籍驗證仍是未來需求。此次未重驗 Google 即時權限，真實寫入結果以 2026-09-23 的授權驗收為準。

## 流程收尾

- Verify：已完成，上述 CRITICAL／WARNING 皆為 0。
- Sync：三份主規格已建立於 openspec/specs/；Purpose 與 ADDED 需求內容逐字核對一致，主規格改用單一 Requirements 標題且不複製歷史 Review Notes。
- Validate：三份主規格嚴格驗證通過，0 失敗；兩則長度 INFO 如上。
- Archive：已依 openspec-archive-change 將完整變更目錄（含 .openspec.yaml）移至 openspec/changes/archive/2026-09-24-live-buzzer/，保留 26/26 任務與全部文件。
- 長期規則：openspec/config.yaml 已補技術棧、目錄、環境變數、錯誤／隱私、測試與各規劃文件規則。
- 前置環境：OpenSpec 安裝與工作區在早期已具備；紀錄不主張由本輪重裝或重跑 init。Explore、Propose、Apply 的文件及需求決策均已核對，保留歷史而不補造指令紀錄。
- 本輪未啟動正式系統、未修改 .env 或憑證，也未連 Google 寫入。
