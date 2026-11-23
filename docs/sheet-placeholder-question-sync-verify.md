# OpenSpec Verify：sheet-placeholder-question-sync

日期：2026-11-18，於 Scenario 文件修訂後再次 Verify。範圍是此 change 的 Proposal、Design、Tasks、四份 delta spec 與目前工作樹；未執行 Sync 或 Archive。

## 摘要

| 面向 | 結果 |
| --- | --- |
| 完整度 | 32/32 任務完成；24 項現行需求均找到實作；另有 3 項明確移除的舊需求 |
| 正確性 | 100 個情境逐類核對程式、重新執行 52 項自動測試與既有隔離瀏覽器紀錄；匯出中互斥情境缺直接回歸測試 |
| 一致性 | 核心設計決策與實作相符；受影響 Scenario 的 WHEN／THEN 已寫明現行規則，舊標題仍待後續同步時整理；Design 大部分歷史用語已修正 |
| 自動檢查 | 本次 `npm test` 52/52、`openspec validate sheet-placeholder-question-sync --strict` 通過；前次 Verify 已確認 40 個 JavaScript 檔語法、OpenAPI 重產 SHA-256 與 `git diff --check`，本次未重跑後三項 |
| 真實 Google Sheet | 前次 Verify 已只讀成功：「學習單」題目鍵 6 個、答案鍵 6 個；本次未重做連線或寫入真實答案格 |

## 現行需求與實作對照

下列每行對應一個現行 Requirement；情境由同一行的程式與測試／瀏覽器證據合併覆蓋，不代表每個情境都有獨立測試函式。移除的舊需求不列入 24 項。

| Capability／Requirement | 實作證據 | 驗證證據 |
| --- | --- | --- |
| `sheet-question-import`：從題目格匯入單題與小題 | `src/sheet-grid.js:36`、`src/sheets.js:130`、`src/classroom.js:27` | `tests/sheet-grid.test.js:25`、`tests/api.test.js:12` |
| `sheet-question-import`：題目與答案佔位符配對驗證 | `src/sheet-grid.js:36` | `tests/sheet-grid.test.js:32`、`tests/sheet-grid.test.js:37` |
| `sheet-question-import`：增量重新匯入保留課堂 | `src/classroom.js:27` | `tests/classroom.test.js:16`、`tests/group-round.test.js:191` |
| `sheet-question-import`：匯入 API 與失敗回復 | `src/routes/teacher.js:20`、`src/sheets.js:130` | `tests/api.test.js:12`、`tests/api.test.js:106` |
| `question-management`：題目 CRUD 與固定題號 | `src/classroom.js:27`、`src/classroom.js:188`、`src/routes/teacher.js:65` | `tests/classroom.test.js:38`、`tests/api.test.js:40` |
| `question-management`：課堂狀態僅存記憶體 | `src/classroom.js:18`、`src/server.js` | `tests/contract.test.js:75` |
| `question-management`：教師 API 契約 | `src/routes/teacher.js:4`、`src/projections.js:20` | `tests/contract.test.js:6`、`tests/api.test.js:12` |
| `question-management`：教師端閱讀版型 | `public/js/teacher.js`、`public/js/components/teacher-view.js:14`、`public/css/app.css` | `docs/sheet-placeholder-question-sync-apply.md:12`、`:46` |
| `question-management`：題組及動態追加小題 | `src/classroom.js:27`、`src/classroom.js:188` | `tests/group-round.test.js:191`、`tests/classroom.test.js:38` |
| `question-management`：題組教師 API 與畫面 | `src/routes/teacher.js:30`、`src/projections.js:27`、`public/js/components/group-controls.js:4` | `tests/group-round.test.js:15`、隔離瀏覽器紀錄 `docs/sheet-placeholder-question-sync-apply.md:44` |
| `question-management`：Case 與小題分層介面 | `public/js/components/teacher-view.js:14`、`:70`、`:90`、`public/css/app.css:28` | 隔離瀏覽器紀錄 `docs/sheet-placeholder-question-sync-apply.md:36`、`:46` |
| `private-buzz`：先填回答再送出 | `public/js/components/answer-card.js`、`public/js/components/group-answer-card.js:51`、`src/classroom.js:243` | `tests/group-round.test.js:15`、隔離瀏覽器紀錄 `docs/sheet-placeholder-question-sync-apply.md:44` |
| `private-buzz`：保存全部有效回答與唯一第一名 | `src/classroom.js:209`、`:214`、`:224`、`:243` | `tests/group-round.test.js:78`、`tests/group-priority.test.js:6` |
| `private-buzz`：學號登入與多題畫面 | `src/classroom.js:70`、`public/js/student.js:46`、`public/css/app.css:26` | `tests/group-priority.test.js:32`、`tests/timed-api.test.js:5`、隔離瀏覽器紀錄 `docs/sheet-placeholder-question-sync-apply.md:18` |
| `private-buzz`：學生結果隔離 | `src/projections.js:42`、`src/routes/student.js:17` | `tests/student-results.test.js:7`、`:47`、`:74` |
| `private-buzz`：學生 API 契約 | `src/routes/student.js:4`、`scripts/openapi.mjs` | `tests/contract.test.js:6`、`tests/group-round.test.js:15` |
| `private-buzz`：題組共用搶答與優先權 | `src/classroom.js:173`、`:209`、`:243`、`public/js/components/group-answer-card.js:3` | `tests/group-round.test.js:15`、`:209`、`tests/timed-classroom.test.js:126` |
| `sheet-export`：僅匯出每題第一名 | `src/sheets.js:80` | `tests/group-round.test.js:98`、`tests/sheets.test.js:24` |
| `sheet-export`：Case 與 Sequence 對應 | `src/sheet-grid.js:36`、`src/sheets.js:99` | `tests/sheet-grid.test.js:25`、`tests/sheets.test.js:24` |
| `sheet-export`：後端固定寫入範圍 | `src/sheets.js:8`、`:58`、`src/routes/teacher.js:26` | `tests/sheets.test.js:112`、`tests/api.test.js:63` |
| `sheet-export`：文字安全及可重試匯出 | `src/sheets.js:58`、`:138`、`:174` | `tests/sheets.test.js:43`、`:95`、`:136` |
| `sheet-export`：匯出快照與同時操作 | `src/classroom.js:26`、`src/sheets.js:111`、`:161`、`:174` | 快照失效：`tests/group-round.test.js:163`；同時操作直接測試待補 |
| `sheet-export`：匯出 API 契約 | `src/routes/teacher.js:25`、`src/sheets.js:161`、`:174` | `tests/api.test.js:63`、`tests/contract.test.js:6` |
| `sheet-export`：教師匯出確認清單 | `public/js/components/export-panel.js:3` | 隔離瀏覽器紀錄 `docs/sheet-placeholder-question-sync-apply.md:20` |

## 情境與設計檢查

- 四份 spec 共 100 個 Scenario（匯入 14、題目管理 27、學生搶答 31、匯出 28）。對應行為可在上述程式、52 項合成資料／HTTP／SSE／Google client 測試及既有桌面／390px 隔離瀏覽器紀錄中找到。沒有聲稱 100 個情境各有一個獨立測試。第 9.1 項文件任務已明確補充舊操作停用、題組共用搶答及刪題保留來源題號。
- 解析後才整批匯入、來源鍵不遞補、題組共用倒數與唯一第一名、學生白名單投影、預覽 token 綁定最新答案與成員、首次匯出同批保存答案鍵備註、失敗後讀回及匯出期間管理鎖，均符合 Design 的核心決策。
- `src/`、`public/js/`、`scripts/` 的 ES module 與相對 import 沿用現有結構；未見顯著程式模式偏離。`docs/openapi.json` 與產生器內容一致。

## 問題與限制

### CRITICAL

無。

### WARNING

1. `sheet-export`「匯出快照與同時操作」的匯出中重入與教師操作拒絕有 `src/classroom.js:26`、`src/sheets.js:174` 的程式鎖，但目前測試沒有把 Google `write` 暫停在進行中，再同時送出第二次匯出、匯入或失格。建議在 `tests/sheets.test.js` 加入可控制的 deferred writer，直接驗證 409、快照未變及其他開放題仍可收回答。
2. 若干 Scenario 標題仍沿用被本 change 取代的舊規則，例如 `specs/question-management/spec.md:86`「三個小題獨立運作」、`:132`「以彈窗新增小題」及 `specs/sheet-export/spec.md:43`「刪除大題後遞補」。其 WHEN／THEN 已明確寫出舊操作停用及現行結果；但僅看標題仍可能誤解。直接在 MODIFIED delta 改名會被 OpenSpec 嚴格驗證判成刪除主規格原情境。本次保留對應名稱並通過嚴格驗證；如要清除標題舊用語，應在後續同步主規格後，將主規格及此 delta 的對應 Scenario 名稱一併更正，再重新執行嚴格驗證，不需修改產品程式。

### SUGGESTION

- `openspec/changes/sheet-placeholder-question-sync/design.md:89` 的 Migration Plan 仍以「教師先在新表備份題目格，手動將……標記移至備註」敘述提案當時的待辦；但前次唯讀檢查已解析六組 q/a 鍵。建議將該步標示為歷史遷移紀錄，或改為以現況為準的操作說明。第 5、7、75 行已在本次文件修訂中標為「提案當時」。

真實 Google Sheet 的**答案寫入**未在本次 Verify 執行；Design 明確要求先有指定格、原值／備註備份與還原授權。自動測試僅使用合成 writer。前次唯讀檢查確認當時題目與答案鍵均可解析，不能據此宣稱正式寫入權限已驗收。

結論：無阻止同步或歸檔的實作缺口；有 2 項警示與 1 項文件建議。舊 Scenario 標題的整理須在同步主規格時維持兩邊對應。此報告不代表已完成 Sync 或 Archive。

## 同步後補記（2026-11-18）

上文是同步前的 Verify 快照。此次 Sync 已將四份 delta 合併到主規格，並在主規格與 delta 兩邊同步更正舊 Scenario 名稱；Design 第 89 行亦標為提案當時的遷移步驟。上述標題警示與文件建議已處理；匯出進行中的直接併發回歸測試仍待補。同步後 `openspec validate --specs` 四份主規格皆通過（兩項既有 Requirement 過長警告），此 change 的嚴格驗證亦通過；尚未歸檔。
