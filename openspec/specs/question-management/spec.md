# question-management Specification

## Purpose

提供教師以帳號密碼管理課堂搶答的控制台，支援多題獨立倒數、暫停與結算，即時查看所有學生的學號、回答與候選順位，並在亂答時取消資格、遞補得標者。

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
系統 SHALL 讓教師新增、列出、讀取、修改與刪除題目。內容為去除前後空白後 1–2000 字元。Case N SHALL 就是第 N 題，編號不可重複或修改，不提供任意綁定至其他 case 的功能。本次範本提供 Case 1–6，新增時可指定尚未使用的題號及 1–3600 的整數倒數秒數；省略秒數時預設 60 秒。倒數秒數 SHALL 僅能在題目尚未開始時修改。刪除題目 SHALL 不重新編排其他題號。內部題目識別 SHALL 區分刪除前後建立的同題號題目，避免過期請求落到新題。新增後 SHALL 尚未開放搶答。

#### Scenario: 第一題與第二題
- **WHEN** 教師新增 Case 1 及 Case 2，分別設定 30 秒及 90 秒
- **THEN** 兩者分別顯示第一題與第二題及各自倒數秒數；重複建立同題號回傳 409，空白內容或超出範圍的秒數回傳 400

#### Scenario: 尚未開始時修改時間
- **WHEN** 教師修改草稿題目的內容及倒數秒數
- **THEN** 儲存新設定；題目開始後再修改倒數秒數回傳 409，不重設既有計時

#### Scenario: 刪除開放題目
- **WHEN** 教師刪除已開放的 Case 1，Case 2 仍開放
- **THEN** 移除第一題及其計時器與相關記憶體紀錄，學生仍能回答第二題，Case 2 不改號，已寫入 Sheet 的內容不自動清除

### Requirement: 多題獨立開放與停止
系統 SHALL 允許多題同時開放，各題的開始、暫停、繼續、結算、提交狀態及順位獨立。題目狀態 SHALL 為 draft、open、paused 或 settled。教師開始草稿題目時才啟動倒數；暫停時凍結剩餘時間且不接受新提交，繼續時按剩餘時間接續倒數；倒數到零或教師提早結束 SHALL 結算。已結算題目 SHALL 不重新開放，既有回答與結果仍保留供教師查看。任一題狀態改變 SHALL 不停止其他題目的倒數。

#### Scenario: 同時開放兩題
- **WHEN** 教師先開放 Case 1，再開放 Case 2
- **THEN** 兩題各自倒數並可回答；學生提交第一題後仍可提交第二題

#### Scenario: 暫停及繼續
- **WHEN** 教師暫停尚有剩餘時間的 Case 1，稍後繼續
- **THEN** 暫停期間不接受新回答且剩餘時間不減少；繼續後以原剩餘時間倒數，已有回答保留，Case 2 不受影響

#### Scenario: 停止再重開
- **WHEN** 教師提早結束已有回答的 Case 1，之後再次要求開始或繼續該題
- **THEN** 結算順位與得標者固定，重新開放要求回傳 409；已有回答及失格紀錄保留，其他題目狀態不變

#### Scenario: 到期與同時提交
- **WHEN** 有效提交在該題伺服器截止時刻之前被接受，另一份在截止時刻或之後才抵達
- **THEN** 僅前者進入候選清單，後者不得改變結果；到期結算只發生一次

### Requirement: 全部回答即時監控
系統 SHALL 按題目顯示所有有效提交者的學號、完整回答、伺服器接受順序及失格狀態。開放或暫停中的題目 SHALL 顯示非失格候選人的目前順位、各自先前有效得標次數及「暫定第一名」；提交、其他題目結算或得標者失格致次數變動時 SHALL 即時重算並推送教師。結算後 SHALL 明確標示唯一最終得標者，保留固定順位及全部回答。重送同一學號同一題 SHALL 不產生重複列。教師重連時 SHALL 取得完整最新快照。

#### Scenario: 第一名之後仍收集回答
- **WHEN** 甲先提交第一題，乙及丙在題目仍開放時稍後提交
- **THEN** 教師可見三人完整回答及目前順位，暫定第一名依優先權決定，後續有效回答不因已有暫定第一名而被拒絕

#### Scenario: 其他題目完成時更新開放題順位
- **WHEN** Case 2 仍開放且已有甲、乙提交，而甲在 Case 1 結算得標
- **THEN** Case 2 立即依甲增加後的先前得標次數重新排序並更新暫定第一名；學生端不收到順位

#### Scenario: 重新整理教師頁面
- **WHEN** 已有多份回答，教師重新整理且後端未重啟
- **THEN** 全部回答、暫定或最終順位、失格標記及計時狀態仍可取得，不必等待新提交

### Requirement: 課堂狀態僅存記憶體
系統 SHALL 不使用資料庫或本地課堂資料檔保存題目、工作階段及回答。服務重啟 SHALL 清空所有暫存狀態，要求重新登入及建立題目，不從 Google Sheet 自動恢復。教師帳號密碼及 Google 憑證為部署設定，不屬於需清空的課堂資料。

#### Scenario: 服務重啟
- **WHEN** 後端服務重啟
- **THEN** 舊工作階段失效，教師重新登入後題目列表為空，已匯出的 Sheet 內容不變

### Requirement: 教師 API 契約
系統 SHALL 提供以下路由，除登入外均要求教師權限。無權限為 401，無效輸入為 400，不存在題目或提交為 404，重複題號及不合法狀態轉換為 409。教師題目物件 SHALL 包含 id、caseNumber、content、durationSeconds、status、計時資訊、submissions、provisionalLeader 與 winner；每筆 submission 含不可與學號混淆的 id、studentNumber、answer、伺服器接受順序、當前或結算時的先前得標次數、順位及失格狀態。winner 只在 settled 時為最終得標者或 null，且 SHALL 對應未失格的既有提交。provisionalLeader 僅供教師辨識尚未結算的暫定第一名。

| 方法與路由 | 輸入與成功行為 |
| --- | --- |
| POST /api/teacher/session | 接收 username、password，成功回傳 200 |
| GET /api/teacher/questions | 回傳 200 與所有題目、全部回答、順位及計時狀態 |
| POST /api/teacher/questions | 接收 caseNumber、content、可省略的 durationSeconds，回傳 201 與新題目 |
| GET /api/teacher/questions/{id} | 回傳 200 與指定題目完整教師投影 |
| PATCH /api/teacher/questions/{id} | 修改 content；僅在 draft 可修改 durationSeconds；回傳 200，不得改題號 |
| DELETE /api/teacher/questions/{id} | 刪除題目及暫存回答，回傳 204 |
| POST /api/teacher/questions/{id}/start | 開始 draft 題目倒數，回傳 200 |
| POST /api/teacher/questions/{id}/pause | 暫停 open 題目倒數，回傳 200 |
| POST /api/teacher/questions/{id}/resume | 繼續 paused 題目倒數，回傳 200 |
| POST /api/teacher/questions/{id}/stop | 提早結算 open 或 paused 題目，回傳 200 |
| POST /api/teacher/questions/{id}/submissions/{submissionId}/disqualify | 取消指定提交資格並回傳更新後題目，回傳 200 |
| GET /api/teacher/events | 初次連線及重連提供完整快照，後續即時更新回答、順位、計時轉換及遞補 |

#### Scenario: API 取得全部提交
- **WHEN** 同題有三位學生有效提交，教師查詢或接收事件
- **THEN** submissions 包含三份回答及各自順位與失格狀態；開放時 provisionalLeader 只有一人，結算後 winner 只有一人，學生不得存取此資料

#### Scenario: 教師以提交識別取消資格
- **WHEN** 教師對指定 submissionId 呼叫取消資格 API
- **THEN** 後端只更新該提交的資格與相關順位，無法用前端自選 winner、學號或回答覆寫結果

### Requirement: 教師端閱讀版型
系統 SHALL 提供題目總覽及依題目 UUID 選取的完整回答畫面、收合新增表單、舒適／精簡間距及題目側欄收合。系統 SHALL 保留題目管理與全部回答可見性，SSE 更新不得清除新增或編輯草稿；所選題目被刪除時回到總覽。桌面與窄螢幕 SHALL 可閱讀並操作，學生端契約不變。

#### Scenario: 編輯時有新回答
- **WHEN** 教師正在編輯題目且 SSE 傳來新回答
- **THEN** 保留編輯輸入與焦點，更新回答及摘要

#### Scenario: 收合與題目切換
- **WHEN** 教師收合側欄後查看所有題目或選題被刪除
- **THEN** 仍能使用總覽選取其他題目，不顯示已刪除題目的舊回答

### Requirement: 失格紀錄與候補遞補
系統 SHALL 允許教師對任一已保存提交取消資格，並在教師端保留學號、原回答及失格標記。失格提交 SHALL 排除暫定與最終順位、優先權計數及匯出，不得藉重新登入或重送恢復資格。開放題 SHALL 即時重排；已結算題 SHALL 依結算時固定的候選順位遞補下一名，若無候補則 winner 為 null。取消資格 SHALL 不改寫其他已結算題目的固定順位。

#### Scenario: 得標者亂答後遞補
- **WHEN** 已結算題目的得標者被取消資格，而後方仍有有效候補
- **THEN** 教師可見原得標者的失格紀錄與下一位候補成為唯一得標者，並即時更新仍開放題目的優先權計數

#### Scenario: 全部候補失格
- **WHEN** 教師將已結算題目的所有提交逐一取消資格
- **THEN** 該題保留全部失格回答供教師查看，但不再有最終得標者
