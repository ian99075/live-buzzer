# Verification Report: grouped-case-questions

驗證日期：2026-10-13。對照本 change 的 Proposal、Design、三份差異 Spec、Tasks 與目前程式碼。本次只驗證，未同步主規格、封存 change、操作正式課堂或寫入真實 Google Sheet。

## Summary

| Dimension | Result |
| --- | --- |
| Completeness | 31/31 Tasks 已勾選；11/11 Requirements 有實作證據 |
| Correctness | 45/45 Scenarios 有程式、測試或既有隔離瀏覽器證據；44/44 自動測試通過 |
| Coherence | 七項 Design 決策與現有架構相符；有一項教師端細部文案提示應修正 |
| OpenSpec | `openspec status` 顯示四類規劃文件完成；`openspec validate grouped-case-questions --strict` 通過 |

45 個情境不是 45 支一對一命名的自動測試。下表將每項需求對到實作與可用證據；UI 的視覺與草稿保留情境沿用 [Apply 驗收紀錄](verification.md) 中隔離瀏覽器的實際操作，未拿正式課堂重測。

## Completeness and correctness

| Requirement | Scenarios | Implementation | Evidence |
| --- | ---: | --- | --- |
| 題目 CRUD 與固定題號 | 5 | `src/classroom.js:35`、`src/classroom.js:143`、`src/routes/teacher.js:19` | `tests/classroom.test.js:23`、`tests/api.test.js:86`、`tests/timed-classroom.test.js:68` |
| 題組及動態追加小題 | 3 | `src/classroom.js:48`、`src/classroom.js:63`、`src/classroom.js:157` | `tests/classroom.test.js:48`、`tests/api.test.js:37`、隔離瀏覽器 |
| 單題轉題組 | 2 | `src/classroom.js:75`、`src/routes/teacher.js:64` | `tests/timed-classroom.test.js:112`、`tests/events.test.js:49` |
| 題組教師 API 與畫面 | 4 | `src/routes/teacher.js:19`、`src/projections.js:13`、`public/js/teacher.js:15` | `tests/api.test.js:37`、`tests/api.test.js:86`、隔離瀏覽器 SSE 草稿驗收 |
| 教師端 Case 與小題分層介面 | 6 | `public/js/components/teacher-view.js:79`、`public/js/components/group-controls.js:4`、`public/css/teacher-dashboard.css:91` | `docs/teacher-layout-390.png`、`docs/teacher-first-place-390.png`、[Apply 驗收紀錄](verification.md) |
| 教師工作階段登出 | 2 | `src/routes/teacher.js:16`、`src/auth.js:25`、`src/events.js:44`、`public/js/teacher.js:144` | `tests/api.test.js:108`、`tests/events.test.js:68`、隔離瀏覽器 |
| 學生 API 契約 | 2 | `src/projections.js:30`、`src/classroom.js:204` | `tests/api.test.js:5`、`tests/events.test.js:49`、`tests/timed-api.test.js:28` |
| 小題搶答與優先權獨立 | 4 | `src/classroom.js:163`、`src/classroom.js:181`、`public/js/components/answer-card.js:65` | `tests/timed-classroom.test.js:132`、`tests/events.test.js:49`、隔離學生端驗收 |
| Case 與 Sequence 對應 | 8 | `src/sheets.js:13`、`src/sheets.js:26`、`src/classroom.js:204` | `tests/sheets.test.js:7`、`tests/sheets.test.js:111`、`tests/sheets.test.js:162` |
| 後端固定寫入範圍 | 2 | `src/sheets.js:13`、`src/routes/teacher.js:16` | `tests/api.test.js:170`、`tests/sheets.test.js:7` |
| 匯出時擴充 Case 列與解除必要合併 | 7 | `src/sheets.js:58`、`src/sheets.js:86`、`src/sheets.js:153` | `tests/sheets.test.js:250` 起的模擬 Google API 測試、隔離匯出預覽 |

教師端新文案與字級另核對：`public/js/components/teacher-view.js:90` 的題組卡片結算後顯示「搶答第一名」；`public/css/teacher-dashboard.css:95` 與 `:96` 分別設定學號 18px、回答 16px。隔離瀏覽器在 390px 寬度實測無橫向溢出。前端未顯示舊的「正式得標者」。

## Coherence

- Case 編號可變，題目 UUID 與題組 groupId 穩定；刪除或轉換不重建原題，搶答仍由單一 Node 程序的同步區段裁決。
- 教師投影含完整回答與順位，學生投影只含公開題目和自身 submitted；SSE 遵守同一角色邊界。
- Sheet 座標與清空計畫由後端產生。擴列以 Google developer metadata 識別，重試先讀結構；值以 RAW 寫入。未加入資料庫或 Apps Script。
- `scripts/openapi.mjs` 與 `docs/openapi.json` 包含建題、題組、投影及教師登出合約；合約測試通過。

## Issues by priority

### CRITICAL

無。

### WARNING

- **詳情頁的匯出狀態文案可能誤導。** `public/js/components/teacher-view.js:6` 對所有已結算題都顯示「搶答第一名 · 將匯出」，即使該題已成功匯出也是如此。建議改成固定「搶答第一名」，或依已確認匯出狀態顯示正確後綴；題組小題卡片目前已使用正確的「搶答第一名」。此項不影響得標裁決或 Sheet 寫入。

### SUGGESTION

- `openspec/changes/grouped-case-questions/tasks.md:64` 的歷史任務 11.2 仍記載舊文案「正式得標者」；12.1 已明確取代它。若要讓封存後文件易讀，可在 11.2 標明由 12.1 更新。

## Verification limits and final assessment

本次 `npm test` 在允許本機 HTTP 的環境執行，44/44 通過；沙箱內的第一次執行有 19 項因 127.0.0.1 連線 `EACCES` 而無法執行，並非程式測試失敗。嚴格驗證通過。Case 7+ 真實 Google 插列、developer metadata、解除合併及重試仍只以模擬 Google API 驗證；先前 Case 1 的真實 C19 寫入不能代替本次新結構驗證。本次未重測實體教室區域網路。

**Final assessment:** 無阻擋封存的 critical issue；一項文案 warning 與一項文件 suggestion。修正文案後可再快速重跑相關檢查，再進入主規格同步與歸檔；若接受目前文案，也可帶著此警示進行後續流程。
