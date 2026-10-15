# Spec Delta

## MODIFIED Requirements

### Requirement: 學生 API 契約
系統 SHALL 提供下列路由。除登入外均需有效學生工作階段。無效輸入回傳 400、未登入或過期回傳 401，不附帶其他人的資料。studentNumber SHALL 為字串。公開題目清單 SHALL 僅含 open 或 paused 的單題及小題；每題僅含 id、caseNumber、partNumber、groupTitle、content、status、倒數資訊及 submitted。單題的 partNumber 與 groupTitle 為 null。submitted 僅代表目前學號在該題是否曾有效提交，包含後來失格的提交，不代表勝負。時間資訊 SHALL 以後端時間為準供學生畫面估算倒數，後端仍獨立判定截止。

| 方法與路由 | 輸入與成功行為 |
| --- | --- |
| POST /api/student/session | 接收 studentNumber，建立工作階段，回傳 200 與自己的 studentNumber |
| GET /api/student/questions | 回傳 200 與 studentNumber、serverNow、questions；每題限公開欄位及自己的 submitted |
| POST /api/student/questions/{id}/buzz | 接收 answer，學號取自工作階段；格式正確回傳固定 202 與 {"received":true} |
| GET /api/student/events | 初次連線、重連及自身可見狀態改變時，提供與 questions 相同的白名單資料 |

#### Scenario: 學生多題 API 不洩漏資料
- **WHEN** 一般題及題組小題各自已有多份回答，學生查詢或接收事件
- **THEN** 只取得題號、公開題組標題、題目、計時狀態及各題自己的 submitted，不取得其他學生回答、先前得標次數、暫定第一名或最終得標者

#### Scenario: 開放中的單題轉成 1-1
- **WHEN** 學生已送出 Case 1 且仍在倒數，教師將它轉成題組
- **THEN** 學生畫面改標示 1-1 及題組標題，原 ID 與 submitted=true 保持；不出現第二次可送出機會

## ADDED Requirements

### Requirement: 小題搶答與優先權獨立
每個小題 SHALL 視為獨立可搶答題目，分別保存同學號的首次有效回答、確認彈窗、倒數、暫定順位、結算結果及失格狀態。同一學生 SHALL 可對不同小題各送一次。計算開放小題的優先權時，其他已結算且仍有效的小題各得標一次就各計一次；同一題組內也適用。結算後固定該小題順位，其他小題之後的變動不得回溯重排。

#### Scenario: 同一題組不同學生得標
- **WHEN** Case 1 的 1-1、1-2 各有提交且分別結算
- **THEN** 兩小題各自最多有一名得標者，可以是不同學生；一位學生送出 1-1 不鎖住 1-2

#### Scenario: 已結算小題影響仍開放小題
- **WHEN** 1-2 仍開放且甲乙已提交，甲在 1-1 結算得標
- **THEN** 教師端 1-2 立即把甲的先前有效得標次數加一並重排；學生端不取得變動後順位

#### Scenario: 題組新增小題的學生畫面
- **WHEN** 教師在 1-1 開放期間新增草稿 1-2，稍後單獨開放 1-2
- **THEN** 學生在 1-2 開放前看不到它，開放後看到題組標題與 1-2 的獨立題目、倒數及確認送出流程

#### Scenario: 刪題後公開題號變動

- **WHEN** 學生已向 Case 2 的 2-2 送出回答，教師刪除 Case 1 或同組較早的小題，使該題的顯示編號改變
- **THEN** 學生端依原題目 ID 更新公開標籤並維持 submitted=true、原有倒數與不可重送狀態；不得因此顯示順位、得標或其他學生資料

