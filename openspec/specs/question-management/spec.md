# question-management Specification

## Purpose

提供教師以帳號密碼管理課堂搶答的控制台，支援多題獨立倒數、暫停與結算，即時查看所有學生的學號、組別、回答與候選順位，並在亂答時取消資格、遞補搶答第一名。

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
系統 SHALL 讓教師新增、列出、讀取、修改與刪除單題及題組小題。內容去除前後空白後為 1–2000 字元；倒數為 1–3600 整數秒，省略時預設 60 秒，開始後不得修改。大題 SHALL 由後端從 Case 1 起按建立順序連續編號，小題 SHALL 在各題組內從 1 起連續編號；教師不得自行指定或修改題號，亦不受六題限制。刪除後同層較後題號 SHALL 立即依序遞補，新題接在目前末號之後。改號 SHALL 保留未刪題目的 ID、狀態、計時、回答、順位及得標者；刪除前後同位置的新題仍以不同 ID 區分。新增小題 SHALL 為 draft。

#### Scenario: 第一題與第二題
- **WHEN** 教師在空課堂依序新增兩個單題，分別設定 30 秒及 90 秒
- **THEN** 後端分配 Case 1、Case 2 並回傳各自題號與秒數；空白內容或超出範圍的秒數回傳 400

#### Scenario: 第七題不受六題限制
- **WHEN** 教師已建立 Case 1–6，接著新增一題
- **THEN** 後端分配 Case 7，題目可獨立開放；建題請求若夾帶 `caseNumber` 則回傳 400，不建立題目

#### Scenario: 尚未開始時修改時間
- **WHEN** 教師修改草稿單題或草稿小題的內容及倒數秒數
- **THEN** 儲存新設定；該題開始後再修改倒數秒數回傳 409，不重設既有計時

#### Scenario: 刪除開放題目
- **WHEN** Case 1、2、3 皆已建立，教師刪除已開放的 Case 2，而 Case 3 仍開放
- **THEN** 被刪題目的計時器與紀錄移除，原 Case 3 立即顯示為 Case 2 且以原 ID、計時與回答繼續運作；下一個新題為 Case 3，刪除操作本身不連線 Google Sheet

#### Scenario: 刪除中間小題後遞補
- **WHEN** 題組內有 1-1、1-2、1-3，教師刪除 1-2 後再追加一題
- **THEN** 原 1-3 以相同 ID、狀態與回答變為 1-2，新草稿編為 1-3；舊 1-2 ID 的過期請求不得落到新 1-2

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
系統 SHALL 按題目顯示所有有效提交者的學號、`G` 加組別編號、完整回答、伺服器接受順序及失格狀態。開放或暫停中的題目 SHALL 顯示非失格候選人的目前順位、各自所屬組別在其他已結算題目的先前有效第一名次數及「目前第一名」；提交、其他題目結算或第一名失格致組別次數變動時 SHALL 即時重算並推送教師。結算後 SHALL 明確標示唯一「搶答第一名」，保留固定順位及全部回答。同組不同學號的提交 SHALL 分別顯示，重送同一學號同一題 SHALL 不產生重複列。教師重連時 SHALL 取得完整最新快照。教師介面 SHALL 避免使用「得標者」「得標」作為欄位、卡片、預覽或提示文字。

#### Scenario: 第一名之後仍收集回答
- **WHEN** `G2` 的甲先提交第一題，`G2` 的乙及 `G3` 的丙在題目仍開放時稍後提交
- **THEN** 教師可見三人的學號、組別及完整回答與目前順位；同組甲乙各占一列，後續有效回答不因已有目前第一名而被拒絕

#### Scenario: 其他題目完成時更新開放題順位
- **WHEN** Case 2 仍開放且已有 `G2` 的甲乙及 `G3` 的丙提交，而 `G2` 的另一位成員在 Case 1 結算成為搶答第一名
- **THEN** Case 2 立即依 `G2` 增加後的同組先前第一名次數重新排序並更新目前第一名；學生端不收到順位

#### Scenario: 重新整理教師頁面
- **WHEN** 已有多份回答，教師重新整理且後端未重啟
- **THEN** 全部回答、組別、目前或結算後的順位、失格標記及計時狀態仍可取得，不必等待新提交

### Requirement: 課堂狀態僅存記憶體
系統 SHALL 不使用資料庫或本地課堂資料檔保存題目、工作階段及回答。服務重啟 SHALL 清空所有暫存狀態，要求重新登入及建立題目，不從 Google Sheet 自動恢復。教師帳號密碼及 Google 憑證為部署設定，不屬於需清空的課堂資料。

#### Scenario: 服務重啟
- **WHEN** 後端服務重啟
- **THEN** 舊工作階段失效，教師重新登入後題目列表為空，已匯出的 Sheet 內容不變

### Requirement: 教師 API 契約
系統 SHALL 提供以下路由，除登入外均要求教師權限。無權限為 401，無效輸入為 400，不存在題目、題組或提交為 404，不合法狀態轉換為 409。教師題目物件 SHALL 包含穩定 id、目前 caseNumber、partNumber、groupId、groupTitle、content、durationSeconds、status、計時資訊、submissions、provisionalLeader 與 winner；其中 groupId 是題組識別碼，與學生的 groupNumber 不同。每筆 submission 含不可與學號混淆的 id、studentNumber、groupNumber、answer、伺服器接受順序、當前或結算時的同組先前第一名次數、順位及失格狀態；既有 priorWinCount 欄位的數值 SHALL 代表同組先前有效第一名次數。winner 只在 settled 時為最終第一名或 null，provisionalLeader 僅供教師辨識尚未結算的目前第一名；兩者非 null 時 SHALL 包含該提交的 groupNumber，且 SHALL 對應未失格的既有提交。教師 API 不提供修改學生組別的欄位。

| 方法與路由 | 輸入與成功行為 |
| --- | --- |
| POST /api/teacher/session | 接收 username、password，成功回傳 200 |
| DELETE /api/teacher/session | 撤銷目前教師工作階段並清除 Cookie，回傳 204 |
| GET /api/teacher/questions | 回傳 200 與所有題目、全部回答、組別、順位及計時狀態 |
| POST /api/teacher/questions | 接收 content、可省略的 durationSeconds；後端分配 caseNumber，回傳 201 與新題目 |
| POST /api/teacher/groups | 接收 title、parts；後端分配 caseNumber 與穩定 groupId，回傳 201 與題組 |
| PATCH /api/teacher/groups/{groupId} | 修改題組標題，回傳 200 與更新後題組 |
| DELETE /api/teacher/groups/{groupId} | 刪除整組及其小題，回傳 204 |
| POST /api/teacher/groups/{groupId}/questions | 追加草稿小題，回傳 201 與新題目 |
| GET /api/teacher/questions/{id} | 回傳 200 與指定題目完整教師投影 |
| PATCH /api/teacher/questions/{id} | 修改 content；僅在 draft 可修改 durationSeconds；回傳 200，不得改題號 |
| DELETE /api/teacher/questions/{id} | 刪除題目及暫存回答，回傳 204 |
| POST /api/teacher/questions/{id}/convert-to-group | 接收 title，保留原題 ID 與狀態，回傳 200 與題組 |
| POST /api/teacher/questions/{id}/start | 開始 draft 題目倒數，回傳 200 |
| POST /api/teacher/questions/{id}/pause | 暫停 open 題目倒數，回傳 200 |
| POST /api/teacher/questions/{id}/resume | 繼續 paused 題目倒數，回傳 200 |
| POST /api/teacher/questions/{id}/stop | 提早結算 open 或 paused 題目，回傳 200 |
| POST /api/teacher/questions/{id}/submissions/{submissionId}/disqualify | 取消指定提交資格並回傳更新後題目，回傳 200 |
| GET /api/teacher/events | 初次連線及重連提供完整快照，後續即時更新回答、組別、順位、計時轉換及遞補 |

#### Scenario: API 取得全部提交
- **WHEN** 同題有三位學生有效提交，其中兩人為 `G2`，教師查詢或接收事件
- **THEN** submissions 包含三份回答、各自的 groupNumber、同組先前第一名次數及順位與失格狀態；開放時 provisionalLeader 只有一人，結算後 winner 只有一人，且均附帶其組別；學生不得存取此資料

#### Scenario: 教師以提交識別取消資格
- **WHEN** 教師對指定 submissionId 呼叫取消資格 API
- **THEN** 後端只更新該提交的資格與相關順位，無法用前端自選 winner、學號、組別或回答覆寫結果

### Requirement: 教師端閱讀版型
系統 SHALL 提供題目總覽及依題目 UUID 選取的完整回答畫面、新增題目／題組彈窗、舒適／精簡間距及題目側欄收合。系統 SHALL 保留題目管理與全部回答可見性，SSE 更新不得清除新增或編輯草稿；所選題目被刪除時返回所屬題組或總覽。桌面與窄螢幕 SHALL 可閱讀並操作，學生端契約不變。

#### Scenario: 編輯時有新回答
- **WHEN** 教師正在編輯題目且 SSE 傳來新回答
- **THEN** 保留編輯輸入與焦點，更新回答及摘要

#### Scenario: 收合與題目切換
- **WHEN** 教師收合側欄後查看所有題目或選題被刪除
- **THEN** 仍能使用總覽選取其他題目，不顯示已刪除題目的舊回答

### Requirement: 失格紀錄與候補遞補
系統 SHALL 允許教師對任一已保存提交取消資格，並在教師端保留學號、組別、原回答及失格標記。失格提交 SHALL 排除目前與結算後的順位、同組有效第一名次數及匯出，不得藉重新登入或重送恢復資格。開放題 SHALL 即時重排；已結算題 SHALL 依結算時固定的候選順位遞補下一名，即使候補與原第一名同組亦可遞補；若無候補則 winner 為 null。遞補或清空第一名後，該題對目前有效第一名所屬組別的計數 SHALL 立即更新其他仍開放題目的順位，但不改寫其他已結算題目的固定順位。

#### Scenario: 得標者亂答後遞補
- **WHEN** 已結算題目 `G2` 的甲為第一名，甲被取消資格，而後方的 `G2` 乙與 `G3` 丙仍有效
- **THEN** 教師可見甲的失格紀錄與乙依固定順位成為唯一搶答第一名，`G2` 的有效第一名次數仍計一次；乙的學號、組別及回答成為下次手動匯出的來源

#### Scenario: 遞補到另一組
- **WHEN** 已結算題目的 `G2` 第一名被取消資格，由 `G3` 的候補依固定順位遞補，另一題仍開放
- **THEN** 原題維持固定順位，其他開放題即時減少 `G2` 並增加 `G3` 的先前有效第一名次數

#### Scenario: 全部候補失格
- **WHEN** 教師將已結算題目的所有提交逐一取消資格
- **THEN** 該題保留全部失格回答及組別供教師查看，但不再有搶答第一名；該題不計入任何組別的先前第一名次數
### Requirement: 題組及動態追加小題
系統 SHALL 允許教師建立題組標題及至少一個小題；題組容器本身不接受搶答。每個小題 SHALL 有獨立題目 ID、內容、倒數與狀態。教師 SHALL 能在題組已有 open、paused 或 settled 小題時追加草稿小題；小題編號 SHALL 始終連續，刪除中間小題時後續小題遞補，新增時接在末號之後。刪除題組內最後一個小題 SHALL 同時移除空題組；刪除整個題組 SHALL 移除其全部小題。題組標題可修改，但 SHALL 不變更小題 ID、內容、計時或提交。

#### Scenario: 三個小題獨立運作
- **WHEN** 教師建立 Case 1 題組，標題為「第一組」，含 1-1、1-2、1-3
- **THEN** 三個小題均為草稿且各有獨立控制；開放 1-1 不會自動開放 1-2 或 1-3

#### Scenario: 已開放後追加
- **WHEN** Case 1 的 1-1 正在搶答，教師追加下一小題
- **THEN** 新題編號為 1-2 且維持草稿；1-1 的倒數、回答、順位與學生送出狀態不變

#### Scenario: 題組刪除後大題遞補
- **WHEN** Case 1 與 Case 2 皆為題組，教師刪除 Case 1 整組
- **THEN** 原 Case 2 及其各小題立即改標為 Case 1、1-1 起，既有題目 ID、回答及計時不變；新建大題編為 Case 2

### Requirement: 單題轉題組
系統 SHALL 允許教師把 draft、open、paused 或 settled 的單題轉成同一 Case 的題組。原單題 SHALL 成為 1-1，保留其題目 ID、內容、剩餘時間或截止時刻、全部提交、失格紀錄、順位、得標者及已確認匯出狀態；新增題組標題不得重新裁決原題。後續小題 SHALL 從 1-2 起追加。

#### Scenario: 開放中的單題轉換
- **WHEN** Case 1 已開放且已有甲提交，教師設定題組標題並轉換
- **THEN** 原題以 1-1 持續倒數，甲的回答與暫定順位不變，原題 ID 的學生提交與教師控制仍有效；新 1-2 要另外新增及開放

#### Scenario: 已結算且已匯出後轉換
- **WHEN** Case 1 已結算且 C19 已確認匯出，教師把它轉成題組
- **THEN** 1-1 的唯一得標者、固定順位及 C19 對應維持，轉換本身不觸發再次匯出

### Requirement: 題組教師 API 與畫面
教師 API SHALL 提供 `POST /api/teacher/groups` 建立題組（title、parts 陣列，各 part 含 content 與可省略的 durationSeconds）、`PATCH /api/teacher/groups/{groupId}` 修改 title、`DELETE /api/teacher/groups/{groupId}` 刪整組、`POST /api/teacher/groups/{groupId}/questions` 追加小題，以及 `POST /api/teacher/questions/{id}/convert-to-group` 接收 title。`POST /api/teacher/questions` SHALL 接收 content 與可省略的 durationSeconds；兩個建題 API 均由後端回傳分配的 caseNumber，指定 caseNumber SHALL 回傳 400。題組操作 SHALL 以建立時分配且改號後不變的 groupId 定位，不得以可變 Case 號誤改其他題組。所有路由 SHALL 要求教師登入與欄位白名單驗證。教師快照 SHALL 包含題目 ID、目前題號、題組 ID／標題與完整回答。

#### Scenario: 建立與查詢題組
- **WHEN** 已有六個 Case，教師建立一個含兩個小題的題組
- **THEN** 回傳 201 與題組標題及兩個依序編號的小題；教師清單和 SSE 可見 7-1、7-2 與各自狀態、回答及順位

#### Scenario: 不合法題組操作
- **WHEN** 未登入者呼叫題組 API、教師在建題請求指定 `caseNumber`、提供空標題或空 parts、或對題組小題要求再次轉換
- **THEN** 分別回傳 401、400、400 或 409，不變更原有題目

#### Scenario: 改號後仍操作原題組
- **WHEN** 教師取得原 Case 2 的 groupId，另一教師刪除 Case 1，使該組遞補為 Case 1，第一位教師再以原 groupId 追加小題
- **THEN** 小題加入原題組並編為目前 Case 1 的下一號；舊的數字 Case 路由不得誤作用到現在的 Case 2

#### Scenario: 編輯時收到題組事件
- **WHEN** 教師正在輸入題組標題或新小題草稿，SSE 收到另一小題的提交
- **THEN** 保留未儲存輸入與焦點，更新該小題回答及題組總覽

### Requirement: 教師端 Case 與小題分層介面

教師端 SHALL 將建立題目／題組與既有題目清單顯示為分離區塊，建立入口及彈窗標題 SHALL 使用「新增題目/題組」而非「新增 Case」；清單 SHALL 先以 Case 為單位，題組的小題預設收合，教師進入或展開該 Case 後才顯示所屬小題。清單中的題目或題組標題 SHALL 比 Case 編號使用更大的字級並有較高視覺層級。題組頁 SHALL 以較大的大題標題及明確分界線區分小題卡片；每張小題卡片 SHALL 以醒目的獨立區塊呈現結算後的「搶答第一名」或尚未結算的「目前第一名」之學號與回答，兩種狀態不得混淆；回答字級 SHALL 大於原有小字且小於學號字級，無回答時 SHALL 顯示空狀態。新增小題、修改題組標題與刪除整組 SHALL 僅置於題組頁。小題詳情 SHALL 顯示其所屬大題、返回題組的入口、獨立搶答控制及全部回答，不顯示大題層級操作。單題詳情 SHALL 保留轉題組入口。建立題目／題組 SHALL 使用獨立彈窗，顯示後端將分配的預計題號但不提供可編輯的題號輸入；題組頁新增小題 SHALL 另開彈窗，要求內容與 1–3600 秒倒數。桌面與窄螢幕 SHALL 保持區塊邊界，即時更新 SHALL 不清除未儲存輸入或焦點。

#### Scenario: 從 Case 資料夾進入小題

- **WHEN** 教師打開含 1-1、1-2 的 Case 1 題組，再進入 1-1
- **THEN** 題組頁先顯示大題標題、分界線及小題卡片；1-1 詳情只顯示該小題的控制和回答，能返回 Case 1，且不出現新增小題、改題組標題或刪除整組的按鈕

#### Scenario: 題目導覽與小題得標資訊的文字層級

- **WHEN** 教師在題目管理清單查看 Case 1 題組，並打開含已結算與仍開放小題的題組頁
- **THEN** 建立入口與彈窗標示「新增題目/題組」，清單中題組標題字級大於 Case 1 編號；已結算小題醒目顯示「搶答第一名」及其學號、回答，回答字級小於學號但大於原有小字；未結算小題只標示「目前第一名」，無回答小題顯示空狀態

#### Scenario: 在大題內以彈窗新增小題

- **WHEN** 教師於 Case 1 題組頁按「新增小題」，填寫內容與 45 秒倒數後確認
- **THEN** 系統經教師題組 API 建立下一個草稿小題，題組清單與卡片更新；若取消彈窗或輸入不合法，不建立小題

#### Scenario: 即時回答不覆蓋未送出的彈窗草稿

- **WHEN** 教師正在建立 Case 或於題組內填寫新小題，另一小題收到學生回答並透過 SSE 更新
- **THEN** 教師仍保有彈窗中的文字、倒數設定與目前輸入焦點，背景摘要與回答更新

#### Scenario: 左右區塊清晰分離

- **WHEN** 教師在桌面或較窄視窗進入 Case 題組頁
- **THEN** 建立題目、題目清單與右側題組內容維持各自的卡片邊界及間距，不互相重疊；窄螢幕以單欄排列

#### Scenario: 新增彈窗只預覽題號

- **WHEN** 教師開啟建立 Case 彈窗且目前已有兩個 Case
- **THEN** 彈窗顯示預計 Case 3 且不能編輯題號；若其他教師先建立 Case 3，實際回傳題號仍以後端分配為準並更新畫面

### Requirement: 教師工作階段登出

系統 SHALL 在教師控制台右上角提供登出按鈕。已登入教師呼叫 `DELETE /api/teacher/session` 時，後端 SHALL 撤銷目前工作階段、使該工作階段的教師事件連線失效並回傳 204，同時清除瀏覽器的教師工作階段 Cookie。教師端 SHALL 返回登入畫面。登出 SHALL 不清除課堂題目、回答或其他教師及學生的工作階段。

#### Scenario: 教師主動登出

- **WHEN** 教師按右上角「登出」且 API 成功
- **THEN** 目前分頁返回登入畫面，同一 Cookie 再讀取教師題目或訂閱教師事件回傳 401；另一教師工作階段與學生搶答仍可使用

#### Scenario: 未登入者要求登出

- **WHEN** 未登入者呼叫教師登出 API
- **THEN** 回傳 401，不影響其他工作階段或課堂資料
