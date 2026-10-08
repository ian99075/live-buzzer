# Verification Report: timed-priority-buzz

驗證日期：2026-10-08。依 `openspec-verify-change` 檢查 `proposal.md`、`design.md`、三份 delta specs、`tasks.md`、實作、OpenAPI 與測試。報告涵蓋 Verify；其後已同步主規格，並封存於 `openspec/changes/archive/2026-10-08-timed-priority-buzz/`。

## Summary

| 面向 | 結果 |
| --- | --- |
| Completeness | 17/17 任務完成；16/16 需求有實作依據 |
| Correctness | 42/42 情境逐項對照實作及自動／瀏覽器證據；26/26 自動測試通過 |
| Coherence | 狀態、角色投影、Google 匯出與 Design 一致；Verify 期間修正 4 處落差 |
| 規格有效性 | `openspec validate timed-priority-buzz --strict` 通過 |

## 需求與情境對照

| 能力 | 需求／情境 | 主要實作與驗證依據 |
| --- | --- | --- |
| `private-buzz` | 6／15 | `src/classroom.js:52`、`:81`、`:98` 的同步截止、去重、接受順序及順位；`src/projections.js:22` 的學生白名單；`public/js/components/answer-card.js:3` 的倒數、確認與凍結重試；`tests/api.test.js`、`tests/timed-api.test.js`、`tests/timed-classroom.test.js`，以及 `docs/verification.md` 的模擬瀏覽器流程。 |
| `question-management` | 5／14 | `src/classroom.js:21`、`:60`、`:107` 的題目狀態及失格遞補；`src/routes/teacher.js:20` 的控制 API；`public/js/components/question-controls.js:18`、`public/js/components/teacher-view.js:25`、`:49` 的倒數、接收序與名次；`tests/timed-classroom.test.js`、`tests/timed-api.test.js`。另補測刪除開放題不影響其他題、失格後開放題即時重排。 |
| `sheet-export` | 5／13 | `src/sheets.js:3`、`:44` 的固定格映射、僅快照已結算有效得標者及成功匯出後的覆寫或清空；`public/js/components/export-panel.js:3` 的確認清單；`tests/sheets.test.js` 的 RAW、固定 C19–C24、失敗重試、僅待清空及匯出中另一題到期。 |

`docs/openapi.json` 已與 `scripts/openapi.mjs` 的產生結果逐位元核對一致；`tests/contract.test.js` 檢查路由、參照與關鍵欄位。學生 REST／SSE 的白名單與教師投影分開，未提供名次、得標者或他人回答。確認彈窗與教師操作均以模擬 Chrome 實際驗收，記錄見 `docs/verification.md`。

## Issues by priority

- **CRITICAL：0。** 無未完成任務或缺少實作的需求。
- **WARNING：0。** Verify 期間修正教師表格未明示接受順序、總覽卡片未顯示倒數、學生空白回答提示不明確，以及 `openspec/config.yaml` 的舊「先送先得」描述；修正後以隔離 Chrome 及完整測試重驗。
- **SUGGESTION：0。** 未發現需在本 change 中處理的程式結構差異。

## 驗證邊界與下一步

本次測試使用合成學號、隔離的本機 HTTP 服務及模擬 Google writer；**沒有再次寫入真實 Google Sheet**。2026-09-23 的 Case 1 真實寫入與還原屬原始系統整合證據，不能取代本 change 新增的覆寫／清空真實雲端驗收。這項限制已在 `docs/verification.md` 記錄，不影響本 change 規格所要求的模擬驗收。

結論：**Verify 通過，無未解決的 CRITICAL／WARNING。** 三份主規格已同步，`timed-priority-buzz` 已封存。同步與封存僅修改規格及說明文件，沒有重啟或清除使用者的課堂資料。
