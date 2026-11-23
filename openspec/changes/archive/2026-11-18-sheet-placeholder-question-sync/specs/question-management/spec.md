# Spec Delta

## MODIFIED Requirements

### Requirement: 題目 CRUD 與固定題號
系統 SHALL 讓教師列出、讀取及刪除從指定 Sheet 匯入的單題與題組；題目文字僅由 Sheet 提供。教師 SHALL 只可修改 draft 單題或 draft 題組的 1–3600 整數秒倒數，省略時預設 60 秒；題組只設定一次共用秒數，開始後不得修改。Case 與小題編號 SHALL 永久等於來源 `$q_...$` 鍵，不要求連續，也不得由前端改號。刪單題或刪整組只移除本堂課資料，不讓其他題號遞補；draft 題組可單刪小題，開始後不得單刪小題；重新匯入可恢復來源仍存在的草稿題目。

#### Scenario: 第一題與第二題
- **WHEN** 教師匯入題目格備註含 `$q_1$`、`$q_2$` 及對應答案鍵的 Sheet，再分別把兩題草稿倒數設為 30 秒及 90 秒
- **THEN** 後端顯示 Case 1、Case 2 與各自秒數；超出範圍的秒數回傳 400

#### Scenario: 第七題不受六題限制
- **WHEN** Sheet 的題目格備註含 `$q_7$` 且有對應 `$a_7$`，教師匯入
- **THEN** 系統建立 Case 7 草稿，即使 Case 5 或 Case 6 不存在亦不改號

#### Scenario: 尚未開始時修改時間
- **WHEN** 教師將草稿單題或題組的倒數改為 45 秒
- **THEN** 該單題或整組保存新秒數；開始後再修改回傳 409，不重設既有計時

#### Scenario: 刪除開放題目
- **WHEN** Case 1、2、3 已匯入，教師刪除正在開放的 Case 2
- **THEN** Case 2 的計時與本堂課回答移除；Case 3 保留題號、ID、計時與回答，刪除本身不寫入 Sheet

#### Scenario: 刪除草稿小題後保留其他來源題號
- **WHEN** draft 題組有 1-1、1-2、1-3，教師刪除 1-2
- **THEN** 不執行舊版題號遞補；1-1 與 1-3 保留原號和原 ID，後續重匯仍在來源中的 `$q_1_2$` 可重建 1-2，不影響 1-3

#### Scenario: 開始後不得單刪小題
- **WHEN** 題組已開始，教師要求刪除其中 1-2
- **THEN** 回傳 409，整組內容、倒數及所有回答不變；仍可刪除整組

### Requirement: 課堂狀態僅存記憶體
系統 SHALL 不使用資料庫或本地課堂資料檔保存題目、工作階段及回答。服務重啟 SHALL 清空所有暫存狀態，要求重新登入及手動從 Google Sheet 匯入題目，不自動恢復回答。教師帳號密碼及 Google 憑證為部署設定，不屬於需清空的課堂資料。

#### Scenario: 服務重啟
- **WHEN** 後端服務重啟
- **THEN** 舊工作階段失效，教師重新登入後題目列表為空；教師可手動重新匯入題目，已匯出的 Sheet 內容不變

### Requirement: 教師 API 契約
系統 SHALL 提供以下路由，除登入外均要求教師權限。無權限為 401，無效輸入為 400，不存在單題、題組或提交為 404，不合法狀態轉換為 409。教師單題物件維持穩定 id、來源 caseNumber、content、durationSeconds、status、計時、submissions、provisionalLeader 與 winner。題組物件 SHALL 含 groupId、caseNumber、groupTitle、有序 parts（小題 id、sourceKey、partNumber、content）、一份共用 durationSeconds／status／計時／submissions／provisionalLeader／winner。groupId 與學生 groupNumber 不同。單題 submission 含 answer；題組 submission 含按 sourceKey 對應的完整 answers，兩者均含 id、studentNumber、groupNumber、接受順序、同組先前有效第一名次數、順位及失格狀態。priorWinCount 以先前已結算且仍有效的單題或**整個題組各算一次**。winner 只在 settled 時提供；provisionalLeader 僅供教師查看目前第一名。教師 API 不提供修改學生組別或題目文字的欄位。

| 方法與路由 | 輸入與成功行為 |
| --- | --- |
| POST /api/teacher/session | 接收 username、password，成功回傳 200 |
| DELETE /api/teacher/session | 撤銷目前教師工作階段並清除 Cookie，回傳 204 |
| GET /api/teacher/questions | 回傳 200 與所有單題及題組、全部回答、組別、順位及計時狀態；題組為一個競賽項目並含有序 parts |
| POST /api/teacher/questions/import-google-sheet | 不接受自選 Sheet 或格位，手動增量匯入，回傳 200 與新增、更新、保留題目數及警示 |
| GET /api/teacher/questions/{id} | 回傳 200 與指定題目完整教師投影 |
| PATCH /api/teacher/questions/{id} | 僅供 draft 單題設定 durationSeconds，回傳 200；content 與題號欄位回傳 400 |
| PATCH /api/teacher/groups/{groupId} | 僅供 draft 題組設定一次共用 durationSeconds，回傳 200 |
| DELETE /api/teacher/questions/{id} | 刪單題或 draft 題組小題，回傳 204；已開始題組小題回傳 409 |
| DELETE /api/teacher/groups/{groupId} | 只刪除本堂課整組及其小題，回傳 204 |
| POST /api/teacher/questions/{id}/start、pause、resume、stop | 僅供單題；開始、暫停、繼續、提早結算，回傳 200 |
| POST /api/teacher/groups/{groupId}/start、pause、resume、stop | 僅供題組；整組開始、暫停、繼續、提早結算，回傳 200 |
| POST /api/teacher/questions/{id}/submissions/{submissionId}/disqualify | 僅供單題；取消指定提交資格，回傳 200 |
| POST /api/teacher/groups/{groupId}/submissions/{submissionId}/disqualify | 僅供題組；取消整份提交資格並整組遞補，回傳 200 |
| POST /api/teacher/exports/google-sheet | 以後端快照與答案佔位符匯出，回傳 200 |
| GET /api/teacher/events | 初次連線及重連提供完整快照，後續即時更新回答、組別、順位、計時轉換及遞補 |

#### Scenario: API 取得全部提交
- **WHEN** 同題有三位學生有效提交，其中兩人為 `G2`，教師查詢或接收事件
- **THEN** submissions 包含三份回答、各自的 groupNumber、同組先前第一名次數、順位與失格狀態；開放時 provisionalLeader 只有一人，結算後 winner 只有一人；學生不得存取教師完整資料，僅可依 `private-buzz` 取得結算後第一名的學號與組別

#### Scenario: 教師以提交識別取消資格
- **WHEN** 教師對指定 submissionId 呼叫取消資格 API
- **THEN** 後端只更新該提交的資格與相關順位，無法用前端自選 winner、學號、組別或回答覆寫結果

#### Scenario: 舊手動建題 API 不再使用
- **WHEN** 教師要求舊的建立單題、建立題組、追加小題、修改題組標題或單題轉題組路由
- **THEN** 系統不建立或改寫題目，提示改在 Sheet 編輯並重新匯入

### Requirement: 教師端閱讀版型
系統 SHALL 提供題目總覽及依題目 UUID 選取的完整回答畫面、匯入題目入口、草稿秒數設定、舒適／精簡間距及題目側欄收合。系統 SHALL 保留題目管理與全部回答可見性；SSE 更新不得清除尚未保存的秒數設定或焦點，所選題目被刪除時返回所屬題組或總覽。桌面與窄螢幕 SHALL 可閱讀並操作；學生端結算結果的受限公開依 `private-buzz` 契約處理。

#### Scenario: 編輯時有新回答
- **WHEN** 教師正在設定草稿題秒數且 SSE 傳來另一題的新回答
- **THEN** 保留秒數輸入與焦點，同時更新回答及摘要

#### Scenario: 收合與題目切換
- **WHEN** 教師收合側欄後查看所有題目或選題被刪除
- **THEN** 仍能使用總覽選取其他題目，不顯示已刪除題目的舊回答

### Requirement: 題組及動態追加小題
系統 SHALL 由 Sheet 的 `$q_N_M$` 匯入題組與小題；題組標題不另接受搶答，但**題組整體** SHALL 是唯一可搶答單位。小題各有穩定 ID、來源鍵與內容，倒數、狀態、提交、順位、第一名屬於題組，教師只對整組設定秒數與開始／暫停／繼續／結算。draft 題組可增量加入或單獨刪除小題且不遞補來源題號。題組一旦開始便鎖定小題集合；重匯發現新小題 SHALL 回傳 409 並保持整個課堂不變；單刪小題 SHALL 回傳 409。刪除最後一個 draft 小題 SHALL 同時移除空題組；刪除整組 SHALL 移除其全部小題與暫存回答，不修改 Sheet。

#### Scenario: 三個小題共用一次搶答
- **WHEN** Sheet 的題目格備註有 `$q_1_1$`、`$q_1_2$`、`$q_1_3$` 及對應答案鍵，教師匯入
- **THEN** 不採用舊版逐小題獨立搶答；Case 1 為一個草稿題組，三小題有穩定內容與題號，教師只可一次開放整組，所有小題共用倒數與結算結果

#### Scenario: 已開放題組拒絕新增小題
- **WHEN** Case 1 題組正在搶答，Sheet 新增 `$q_1_4$` 與 `$a_1_4$` 後教師重新匯入
- **THEN** 回傳 409，1-4 不加入；Case 1 的倒數、回答、順位與全課堂其他題目皆不變

#### Scenario: 草稿題組從 Sheet 匯入新小題
- **WHEN** Case 1 仍為 draft，Sheet 新增 `$q_1_4$` 與 `$a_1_4$` 後教師重新匯入
- **THEN** 1-4 以來源題號加入同一題組，原有小題 ID、共用秒數與內容維持

#### Scenario: 刪除題組後保留其他來源題號
- **WHEN** Case 1 與 Case 2 皆為匯入題組，教師刪除 Case 1 整組
- **THEN** 不執行舊版大題遞補；Case 2 及其小題保持 Case 2、2-1 等原號與既有 ID、回答及計時，再次匯入可恢復 Case 1

### Requirement: 題組教師 API 與畫面
教師 API SHALL 以 `POST /api/teacher/questions/import-google-sheet` 從 Sheet 建立題組及新小題，並提供 `DELETE /api/teacher/groups/{groupId}` 移除本堂課題組。題組設定、控制、失格與刪除 SHALL 以穩定 groupId 定位，來源 Case 編號不因刪題而改變；對小題 ID 嘗試個別控制或失格 SHALL 回傳 409。手動建立題組、小題、修改題組標題及單題轉題組的 API SHALL 停用；所有教師路由 SHALL 要求登入與欄位白名單驗證。教師快照 SHALL 包含題組 ID／標題、共用狀態與倒數、所有小題的來源題號與內容、每位學生完整 answers、一份排行及一位目前／結算第一名。

#### Scenario: 從 Sheet 匯入並查詢題組
- **WHEN** Sheet 的題目格備註有 `$q_7_1$` 與 `$q_7_2$` 及對應答案鍵，教師匯入
- **THEN** 教師清單與 SSE 可見「題組 7」、7-1、7-2 的內容、整組一份狀態、全部整組回答與一份排行，不需先有 Case 1–6

#### Scenario: 不合法題組操作
- **WHEN** 未登入者呼叫題組刪除 API，或教師呼叫舊的手動新增小題及轉題組 API
- **THEN** 前者回傳 401，後者不建立題目或改寫來源題號

#### Scenario: 刪除其他題組後仍以原 groupId 操作
- **WHEN** 教師取得 Case 2 的 groupId，另一教師刪除 Case 1
- **THEN** Case 2 保留原題號，原 groupId 仍指向 Case 2，不會指向別組

#### Scenario: 編輯時收到題組事件
- **WHEN** 教師正在設定草稿題組共用秒數，SSE 收到另一題的提交
- **THEN** 保留未儲存秒數與焦點，更新回答及題組總覽

### Requirement: 教師端 Case 與小題分層介面
教師端 SHALL 將「匯入題目」入口與既有題目清單顯示為分離區塊，不顯示手動建題、改題幹、改題組標題、追加小題或轉題組入口。清單 SHALL 先以 Case 為單位，題組小題預設收合；題目或題組標題 SHALL 比 Case 編號更大。題組頁 SHALL 以大題標題及分界線區分小題內容卡片，但只有**整組一套**草稿秒數、搶答控制、倒數、提交清單、即時排行與「目前第一名」／結算後「搶答第一名」；每位學生的提交可展開查看各小題回答，不得顯示彼此獨立的小題第一名。第一名學號與組別 SHALL 醒目，回答字級小於學號但大於原有小字。桌面與窄螢幕 SHALL 保持區塊邊界及間距；草稿題組的秒數標籤、輸入框及「儲存／取消」操作列 SHALL 有可見的垂直間距，不得互相重疊、遮擋或造成水平溢出。

#### Scenario: 從 Case 資料夾進入小題
- **WHEN** 教師打開含 1-1、1-2 的 Case 1 題組，再進入 1-1
- **THEN** 題組頁顯示大題標題、分界線及小題內容；1-1 可查看其題幹與各學生對 1-1 的回答，但控制、秒數與第一名仍屬 Case 1 整組，沒有獨立小題開始鍵或手動新增按鈕

#### Scenario: 題目導覽與整組第一名資訊的文字層級
- **WHEN** 教師在題目管理清單查看 Case 1 題組並打開整組結果
- **THEN** 題組標題字級大於 Case 1 編號；開放中只在題組層級標示一位「目前第一名」，結算後只在題組層級醒目顯示一位「搶答第一名」的學號與 `G` 組別，各小題顯示該位學生的對應回答，回答字級小於學號

#### Scenario: 從 Sheet 匯入草稿小題
- **WHEN** 教師需要在 draft 題組新增 1-3
- **THEN** 畫面引導教師在 Sheet 新題目格備註加入 `$q_1_3$`、答案格加入 `$a_1_3$` 後按「匯入題目」，而非開啟手動建題彈窗；題組已開始時提示不能追加

#### Scenario: 即時回答不覆蓋未儲存秒數
- **WHEN** 教師正在輸入草稿題組秒數，另一題透過 SSE 收到回答
- **THEN** 秒數輸入與焦點保留，背景摘要與回答更新

#### Scenario: 左右區塊清晰分離
- **WHEN** 教師在桌面或較窄視窗進入 Case 題組頁
- **THEN** 匯入入口、題目清單與右側題組內容維持各自卡片邊界及間距，不互相重疊；窄螢幕以單欄排列

#### Scenario: 題組秒數表單與操作列不重疊
- **WHEN** 教師在草稿題組按「設定秒數」，於桌面與窄螢幕查看或操作秒數欄位
- **THEN** 標籤、輸入框與「儲存／取消」按鈕區塊清楚分列並保有可見間距，按鈕可完整顯示與點擊；窄螢幕換行或單欄時不遮擋輸入框、不與相鄰區塊相貼，也沒有水平捲動

#### Scenario: 匯入後依來源鍵顯示不連續題號
- **WHEN** Sheet 僅有題目格備註 `$q_1$` 與 `$q_4$` 及對應答案鍵，教師匯入
- **THEN** 清單顯示 Case 1 與 Case 4，不出現預計新增 Case 2 的手動編號彈窗

## REMOVED Requirements

### Requirement: 單題轉題組
**Reason**: 題型與題號改由 Sheet 中的 `$q_N$` 或 `$q_N_M$` 決定；課堂內轉型會使答案鍵對應不明。
**Migration**: 在 Sheet 重新編排題目與答案佔位符後重新匯入；已開始或已結算的原題保留本堂課狀態，不在進行中自動轉型。
