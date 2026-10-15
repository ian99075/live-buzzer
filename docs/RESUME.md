# 接續紀錄

## 2026-10-14：grouped-case-questions 歸檔

此 change 的 Proposal、Specs、Design、Tasks 均完成，31/31 任務已勾選；三份差異規格與主規格 11 個需求區塊逐條一致。已封存至 `openspec/changes/archive/2026-10-14-grouped-case-questions/`，`openspec list --json` 不再列出進行中 change；主規格驗證 3 通過、0 失敗。本次未修改程式、正式課堂或 Google Sheet。Verify 報告中「已匯出後仍顯示將匯出」的非阻擋文案 warning 保留，若日後要修正，請另開 change。

## 2026-10-14：grouped-case-questions 主規格同步

依 `$openspec-sync-specs` 將本 change 的三份差異規格逐條合併至 `openspec/specs/private-buzz/spec.md`、`question-management/spec.md` 與 `sheet-export/spec.md`，保留原主規格未改動的需求。教師 API 舊有的手動 `caseNumber`、題目建立表單，以及 Sheet 重試不得新增列等敘述，已按現行自動編號、題組彈窗與 Case 7+ 可擴列規則修正，避免主規格自相矛盾。重跑同步內容不變；`openspec validate --specs` 為 3 通過、0 失敗（四則長度 INFO），`openspec validate grouped-case-questions --strict` 通過。本次只修改主規格與本接續紀錄，未修改程式、正式課堂或 Google Sheet；change 尚未封存。

## 2026-10-13：grouped-case-questions 最新獨立 Verify

使用者手測後重新執行 `$openspec-verify-change`。目前 31/31 Tasks、11/11 Requirements、45/45 Scenarios 有實作與測試／隔離瀏覽器證據；`npm test` 44/44 與 `openspec validate grouped-case-questions --strict` 通過。最新完整報告為 `docs/grouped-case-questions-verification.md`，取代下方較早的 20/20 Verify 快照。無 critical issue；詳情頁在已匯出後仍顯示「將匯出」為一項文案 warning，歷史任務 11.2 保留舊標籤為一項文件 suggestion。本次未修改程式或真實 Google Sheet，也未執行 Sync／Archive。

## 2026-10-13：「搶答第一名」介面微調

沿用 `grouped-case-questions` 更新 Proposal、question-management 差異 Spec、Design 及 Tasks，完成 12.1 Apply。教師端已結算小題卡片與詳情的顯示文字改為「搶答第一名」；卡片回答 16px、學號 18px。`npm test` 44/44、OpenSpec 嚴格驗證及隔離瀏覽器 390px 驗收通過，證據見 `docs/verification.md`。未寫入真實 Google Sheet；仍需在使用者手測後重新執行獨立 Verify，再同步主規格與歸檔。

本次操作中斷後檢查發現 3000、3109、3110 均未監聽；原 3109 記憶體課堂已無法恢復。已使用現有 `.env` 憑證重新在 `0.0.0.0:3109` 啟動一個空課堂，`http://140.115.59.200:3109/teacher` 與本機頁面均回 200。教師操作請用 140.115.59.200 網址，因正式服務的 `APP_ORIGIN` 設為該網址；使用 127.0.0.1 網址可能遭登入／操作來源檢查拒絕。

## 2026-10-13：教師端文字與得標卡片調整

在使用者確認後，已沿用 `grouped-case-questions` 修訂 Proposal、question-management 差異 Spec、Design 及 Tasks，再完成 11.1–11.2 Apply。正式教師頁的建立入口改為「新增題目/題組」；題目管理以較大字顯示題目／題組標題；題組小題卡片把正式得標或目前第一名、學號、回答分層呈現。`npm test` 44/44、OpenSpec 嚴格驗證及隔離瀏覽器桌面／390px 版面檢查通過；詳見 `docs/verification.md`，未寫入真實 Google Sheet。

3109 的使用者手測服務未重啟，原記憶體課堂仍在；重新整理教師頁即可取得靜態介面改動。3110 的隔離預覽已關閉。新增 UI 規則後，先前的 `docs/grouped-case-questions-verification.md` 是修訂前的驗證快照；下一步由使用者決定是否重新執行 `$openspec-verify-change`，之後才同步主規格與歸檔。

## 2026-10-13：grouped-case-questions 修訂後 Apply

已依現有 change 完成連續自動編號、刪題與小題遞補、穩定 groupId、教師登出及 Sheet 座標帳本／回應遺失後讀回。`npm test` 44/44，OpenSpec 嚴格驗證通過；隔離瀏覽器的教師、學生與 390px 回歸結果見 `docs/verification.md`。本輪沒有修改真實 Google Sheet。下一步是使用者手動測試，之後另行 `$openspec-verify-change`；主規格同步與歸檔仍未執行。正式系統啟動後使用本機 `.env` 的教師憑證，請勿在文件或聊天貼出密碼。

啟動時發現原 `3000` 埠程序仍保存 7 題、12 份回答，因此未重啟或清空它。新版以相同正式程式碼及現有 `.env` 憑證，在 `0.0.0.0:3109` 啟動獨立課堂供手測；教師 `http://140.115.59.200:3109/teacher`，學生 `http://140.115.59.200:3109/student`，本機與主機 IP 回應均為 200。兩個埠的記憶體課堂互不相通。正式 Google Sheet 仍未在本輪寫入；手測完成後須先決定如何處理舊課堂，再切換 3000 埠。

## 2026-10-13：grouped-case-questions 獨立 Verify

已依 `$openspec-verify-change` 對照 20 項 Tasks、10 條 Requirement、34 個 Scenario 與七項 Design 決策。`npm test` 36/36、OpenSpec 嚴格驗證通過；沒有發現 CRITICAL、WARNING 或 SUGGESTION。完整對照表及真實 Google 結構尚未驗收的邊界見 `docs/grouped-case-questions-verification.md`。目前尚待主規格同步與歸檔；本次沒有修改正式 Google Sheet 或正式課堂資料。

## 2026-10-13：教師端分層版型續作

因額度中斷後，先核對 `grouped-case-questions` 的 Proposal／Design／Specs／Tasks 均齊備且相互一致，再完成本 change 的 7.1–7.3 Apply 任務。正式教師頁現在將建立 Case 和管理清單分成卡片，以可展開的 Case 題組導覽；大題頁提供小題列表與題組操作，小題詳情僅保留自身操作。新增 Case 和新增小題各有彈窗；小題彈窗要求內容、倒數秒數，可取消。

隔離模擬服務已用瀏覽器驗證 Case 1 題組、Case 7 單題、開放中單題轉組並追加小題、學生提交引起 SSE 時保留教師未送出草稿與焦點、390px 手機單欄無橫向溢出。`npm test` 36/36 與 OpenSpec 嚴格驗證通過；細節見 `docs/verification.md`。本輪沒有真實 Google 寫入。當時尚待獨立 Verify；完成結果見上方。

## 2026-10-13：grouped-case-questions Apply

已依 `openspec/changes/grouped-case-questions/` 的 Proposal、Design、差異規格及 Tasks 實作 Case 題組、小題、開放中單題轉組、Case 7+、教師／學生介面與 Sheet 結構寫入。原有課堂仍只在單一 Node 程序記憶體。OpenAPI、README、`openspec/config.yaml` 已同步這一輪的程式行為。

整套 `npm test` 36/36 通過；OpenSpec change 嚴格驗證通過。隔離預覽完成桌面及 390px 教師／學生驗收；模擬 Google API 涵蓋插列、既有列偵測、局部解除合併及重試。詳見 `docs/verification.md` 最後一節。**這些不是真實 Google Sheet 結構驗收**；本輪未修改雲端試算表，也未重測實體區域網路。真實寫入須先備份並另獲指定格／列範圍授權。

此輪只執行 Apply；後續應依使用者指示另做 `$openspec-verify-change`、`$openspec-sync-specs`、歸檔。本段以下是歷史紀錄，所稱「分組是未來需求」及舊測試數量只適用當時。

更新：2026-10-08。原始 `live-buzzer` 已完成全部既定實作與 OpenSpec 收尾；以下「完成狀態」以下段落保留該輪歷史紀錄。

## 新 change：timed-priority-buzz

已依 Proposal／Design／Delta Specs 實作每題倒數、暫停／繼續／結算、即時優先順位、教師取消資格與候補、學生確認彈窗，以及已結算得標者的覆寫／全員失格清空。無資料庫；只在單一 Node.js 程序記憶體中保存課堂與已確認匯出狀態。`docs/openapi.json` 與產生腳本已同步。

2026-10-08 完整 `npm test` 26/26 通過；模擬 Chrome 瀏覽器驗收多題倒數、確認／取消／逾時／重試、A／B／C 順位變動、結算／失格、覆寫／只剩清空格的匯出、教師編輯焦點保留及 390 px 寬度。詳細證據見 `docs/verification.md`。本輪沒有再次寫入真實 Google Sheet，也沒有讀取或修改 `.env` 與服務帳號憑證。

OpenSpec `timed-priority-buzz` 的 **Verify 已通過**，報告見 `docs/timed-priority-buzz-verification.md`；17 項 Apply 任務已完成。三份差異規格已同步至 `openspec/specs/` 主規格，change 已封存於 `openspec/changes/archive/2026-10-08-timed-priority-buzz/`。若要做新功能再另開 change。

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
