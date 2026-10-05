# question-management Specification

## Purpose

提供教師以帳號密碼管理課堂搶答的控制台，支援多題同時開放、逐題開始與停止，並即時查看所有學生提交的學號及回答，清楚區分每題第一名與後續提交者。

## Requirements

### Requirement: 教師帳號及密碼
系統 SHALL 同時驗證明確設定的教師帳號與密碼，僅有效教師工作階段能管理題目、讀取所有回答與第一名、訂閱教師事件及匯出。學生輸入學號 SHALL 不取得教師權限。

#### Scenario: 教師登入
- **WHEN** 教師輸入正確帳號及密碼
- **THEN** 建立教師工作階段；任一錯誤皆回傳 401，不透露是帳號或密碼錯誤

#### Scenario: 未授權讀取
- **WHEN** 學生或未登入者讀取教師 API 或事件通道
- **THEN** 回傳 401 且不提供任何學生回答或第一名資料

### Requirement: 題目 CRUD 與固定題號
系統 SHALL 讓教師新增、列出、讀取、修改與刪除題目。內容為去除前後空白後 1–2000 字元。Case N SHALL 就是第 N 題，編號不可重複或修改，不提供任意綁定至其他 case 的功能。本次範本提供 Case 1–6，新增時可指定尚未使用的題號。刪除題目 SHALL 不重新編排其他題號。內部題目識別 SHALL 區分刪除前後建立的同題號題目，避免過期請求落到新題。新增後 SHALL 尚未開放搶答。

#### Scenario: 第一題與第二題
- **WHEN** 教師新增 Case 1 及 Case 2
- **THEN** 兩者分別顯示第一題與第二題；重複建立同題號回傳 409，空白內容回傳 400

#### Scenario: 刪除開放題目
- **WHEN** 教師刪除已開放的 Case 1，Case 2 仍開放
- **THEN** 移除第一題及相關記憶體紀錄，學生仍能回答第二題，Case 2 不改號，已寫入 Sheet 的內容不自動清除

### Requirement: 多題獨立開放與停止
系統 SHALL 允許多題同時開放，各題的開始、停止、提交狀態及第一名獨立。開放或停止一題 SHALL 不改變其他題目。停止後重新開放同一題 SHALL 保留該題第一名及所有既有有效回答，不自動重置。

#### Scenario: 同時開放兩題
- **WHEN** 教師先開放 Case 1，再開放 Case 2
- **THEN** 兩題均可回答，學生提交第一題後仍可提交第二題

#### Scenario: 停止再重開
- **WHEN** 教師停止已有第一名的第一題，再重新開放
- **THEN** 該題第一名及既有回答保留，未提交的學生仍可提交，其他題目狀態不變

### Requirement: 全部回答即時監控
系統 SHALL 按題目顯示所有有效提交者的學號及完整回答，並明確標示其中唯一第一名。已有第一名 SHALL 不阻止教師繼續收到其他學生的有效回答。重送同一學號同一題 SHALL 不產生重複列。瀏覽器重連時，若後端未重啟且教師工作階段仍有效，SHALL 取得完整最新快照。

#### Scenario: 第一名之後仍收集回答
- **WHEN** 甲先提交第一題，乙及丙在第一題仍開放時稍後提交
- **THEN** 教師可見三人的學號及各自回答，只有甲被標示為第一名

#### Scenario: 重新整理教師頁面
- **WHEN** 已有多份回答，教師重新整理且後端未重啟
- **THEN** 全部回答與第一名標示仍可取得，不必等待新提交

### Requirement: 課堂狀態僅存記憶體
系統 SHALL 不使用資料庫或本地課堂資料檔保存題目、工作階段及回答。服務重啟 SHALL 清空所有暫存狀態，要求重新登入及建立題目，不從 Google Sheet 自動恢復。教師帳號密碼及 Google 憑證為部署設定，不屬於需清空的課堂資料。

#### Scenario: 服務重啟
- **WHEN** 後端服務重啟
- **THEN** 舊工作階段失效，教師重新登入後題目列表為空，已匯出的 Sheet 內容不變

### Requirement: 教師 API 契約
系統 SHALL 提供以下路由。除登入外均要求教師權限。無權限為 401，無效輸入為 400，不存在題目為 404，重複題號或狀態衝突為 409。教師題目物件 SHALL 包含 id、caseNumber、content、status、submissions 與 winner；submissions 中每筆含 studentNumber、answer，winner 為唯一第一名的 studentNumber、answer 或 null。每題第一名 SHALL 對應該題已保存的一筆提交，不得額外捏造或變更回答。

| 方法與路由 | 輸入與成功行為 |
| --- | --- |
| POST /api/teacher/session | 接收 username、password，成功回傳 200 |
| GET /api/teacher/questions | 回傳 200 與所有題目、全部回答及第一名 |
| POST /api/teacher/questions | 接收 caseNumber、content，回傳 201 與新題目 |
| GET /api/teacher/questions/{id} | 回傳 200 與指定題目、全部回答及第一名 |
| PATCH /api/teacher/questions/{id} | 修改 content，回傳 200；不得改題號 |
| DELETE /api/teacher/questions/{id} | 刪除題目及暫存回答，回傳 204 |
| POST /api/teacher/questions/{id}/start | 僅開放指定題目，回傳 200 |
| POST /api/teacher/questions/{id}/stop | 僅停止指定題目，回傳 200 |
| GET /api/teacher/events | 初次連線及重連提供完整快照，後續即時更新所有回答及第一名 |

#### Scenario: API 取得全部提交
- **WHEN** 同題有三位學生有效提交，教師查詢或接收事件
- **THEN** submissions 包含三份回答而 winner 只有第一名；學生不得存取此資料


### Requirement: 教師端閱讀版型
系統 SHALL 提供題目總覽及依題目 UUID 選取的完整回答畫面、收合新增表單、舒適／精簡間距及題目側欄收合。系統 SHALL 保留題目管理與全部回答可見性，SSE 更新不得清除新增或編輯草稿；所選題目被刪除時回到總覽。桌面與窄螢幕 SHALL 可閱讀並操作，學生端契約不變。

#### Scenario: 編輯時有新回答
- **WHEN** 教師正在編輯題目且 SSE 傳來新回答
- **THEN** 保留編輯輸入與焦點，更新回答及摘要

#### Scenario: 收合與題目切換
- **WHEN** 教師收合側欄後查看所有題目或選題被刪除
- **THEN** 仍能使用總覽選取其他題目，不顯示已刪除題目的舊回答
