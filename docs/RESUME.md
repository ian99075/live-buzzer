# 接續紀錄

更新：2026-09-24。live-buzzer 已完成全部既定實作與 OpenSpec 收尾，無因額度中斷而尚待完成的項目。

## 完成狀態

- 26/26 實作任務；正式 Verify 核對 23 條需求、37 個情境，無未解決 CRITICAL／WARNING。
- 最新自動測試 14/14 通過（約 368 ms），包含新增的匯出非法欄位／權限防護。
- 三份主規格位於 openspec/specs/；嚴格驗證通過，只有兩則 API 契約文字偏長的 INFO。
- 已歸檔至 openspec/changes/archive/2026-09-24-live-buzzer/，完整保留 Proposal、Specs、Design、Tasks 及 .openspec.yaml。
- openspec/config.yaml 已補入技術棧、路徑、環境變數、隱私、裁決、測試與規劃規則。
- 正式 Verify 報告：docs/openspec-verification.md；歷次實際驗收：docs/verification.md。

## 已完成的實際驗收

單一 Node.js 記憶體搶答、教師全部回答、學生結果隔離、服務帳號直接呼叫 Google Sheets API，沒有 Apps Script 或資料庫。教師新版型已接回 API，包含總覽／單題、即時草稿保留與匯出確認。

2026-09-23 已獲授權使用 Case 1 合成資料完成兩次真實寫入，只改工作表1!C19，還原原值並核對其他資料／格式不變。2026-09-24 新版型完成獨立模擬服務瀏覽器驗收；本次收尾沒有再次寫入 Google 或重做瀏覽器驗收。

## 本機使用與關閉狀態

正式及 3108 測試服務已依使用者要求停止；下次在專案目錄執行 npm start，開啟 http://localhost:3000/teacher 或 /student。教師帳號 teacher；密碼在本機 .env 的 TEACHER_PASSWORD，不在聊天或文件列出。既有 .env 與 credentials 不要覆蓋，不輸出私鑰。

停止或重啟會清空題目、登入及回答，已匯出的 Sheet 保留。npm run preview:test 是模擬入口，不會寫入 Google。

## 後續工作邊界

未來新需求另建 OpenSpec change，以 openspec/specs/ 為基準，不重做或修改已歸檔變更。不需再次覆寫 Sheet 重做相同測試。教室實體裝置連線仍需依 README 設定 HOST／APP_ORIGIN／防火牆並實地驗收；HTTPS 公開部署、分組、持久化或學籍驗證屬另外需求。
