# group-based-buzz-priority OpenSpec Verify

日期：2026-10-14。驗證進行中的 `group-based-buzz-priority` change；本步驟未同步主規格、未歸檔，也未修改程式行為。

| 面向 | 結果 | 證據 |
| --- | --- | --- |
| 完整性 | 16/16 tasks 已完成；3 份 delta spec 的 13 項需求、49 個情境已逐項核對 | `openspec status --change group-based-buzz-priority --json`、`openspec instructions apply --change group-based-buzz-priority --json`、`tasks.md` |
| 正確性 | 通過 | `npm test`：48/48 通過，涵蓋組別綁定、教師／學生 REST 與 SSE 隔離、同組優先權、失格遞補、題組、模擬 Sheet 匯出與重試；`openspec validate group-based-buzz-priority --strict` 通過 |
| 一致性 | 核心實作與 Design、Spec 相符 | `src/classroom.js` 以學號固定組別並依組別的有效第一名次數排序；`src/projections.js` 區隔教師與學生資料；`src/sheets.js` 共用 `{題目}_回答_G組別` 格式供預覽與匯出；正式教師介面不使用「得標」文案 |

另外，Apply 階段已以兩名 `G2`、一名 `G3` 的合成學生完成瀏覽器流程及桌面／390px 版面驗收，紀錄見 `docs/group-based-buzz-priority-apply-check.md`。本次唯讀檢查 `/teacher`、`/student` 均回應 HTTP 200。`git diff --check` 通過；Git 僅提示 Windows 換行正規化。

## 發現

### Critical

無。

### Warning

- 真實 Google Sheet 尚未執行寫入與還原驗收。現有模擬 Google API 測試涵蓋精確文字、格位、插列、解除合併及重試，但不能證明目標試算表目前的權限與版型仍符合預期。Apply 紀錄也明確標示此限制；若要驗收真實寫入，須另選測試格位並確認可還原原值。

### Suggestion

- `openspec/changes/group-based-buzz-priority/specs/private-buzz/spec.md:45` 的情境只說乙、丙提交 Case 2，結果卻寫「甲乙同組優先權計數」。建議改成「乙所屬 G2 的計數為 1」，避免把未提交的甲誤讀為 Case 2 候選人；不影響實作判定。
- `public/previews/grouped-teacher-layout.js:84`、`:87` 與 `public/previews/teacher-layout.html:17` 仍有舊版「得標」及「回答_學號」文字。這些是歷史靜態版型預覽，正式 `/teacher` 頁沒有該文字；若仍會展示預覽頁，建議更新或標示為舊版。

結論：未發現阻止本 change 進入後續 OpenSpec 流程的實作問題。真實 Sheet 寫入屬尚未完成的外部整合驗收；其餘兩項為文件／靜態預覽清理建議。
