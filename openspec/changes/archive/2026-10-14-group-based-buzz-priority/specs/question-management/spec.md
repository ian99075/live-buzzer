# Spec Delta

## MODIFIED Requirements

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
