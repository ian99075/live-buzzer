## Purpose

讓教師手動將每題第一個有效提交者的學號及回答填入既有 Google 試算表 Step 1 的對應 Case Sequence，教師雖能查看全部回答，匯出仍嚴格限制每題一位學生並保留其餘表格。

## Review Notes

使用者已提供原生試算表「GN4-1 (1)」，Sheet ID 為 `1R0a6MuSJAd5YIIsY_69KvXFR9KuH4El_cJ_RtXW4DgI`；已唯讀核對「工作表1」C19–C24。2026-09-23 確認撤回 Apps Script 方案，採本機 Node.js + 服務帳號直接呼叫 Google Sheets API。已於同日依授權完成 Case 1 真實寫入、重試與還原原值，證據見 docs/verification.md；其餘 Case 未額外寫入雲端。仍匯出學生先填的回答與學號，組別功能留待未來變更。

## ADDED Requirements

### Requirement: Google Sheets API 匯出通道與授權
系統 SHALL 由已驗證教師觸發本機 Node.js 後端，以官方 Google 授權程式庫及服務帳號直接呼叫 Google Sheets API。服務帳號 SHALL 具有指定試算表編輯權限。JSON 憑證及存取權杖 SHALL 不提供給教師或學生網頁、不放在網址中、不記錄於應用日誌或版本控制。系統 SHALL 不依賴 Apps Script 部署或共用密鑰。

#### Scenario: 教師手動匯出
- **WHEN** 已登入教師按下匯出且 Sheet ID、服務帳號憑證與編輯權限已設定
- **THEN** 後端取得授權並直接送出第一名快照，瀏覽器不取得 Google 憑證或權杖

#### Scenario: 授權失敗
- **WHEN** 憑證無效或服務帳號沒有目標試算表編輯權限
- **THEN** 回報匯出失敗並保留本機回答，不回傳憑證或 Google 原始錯誤

### Requirement: 僅匯出每題第一名
系統 SHALL 在教師按下「彙整至 Google Sheet」後，從後端記憶體中各題已判定的第一名取得學號及其原始有效回答。教師可見的其他學生回答 SHALL 不包含在匯出內容。搶答提交 SHALL 不自動匯出；前端 SHALL 不得指定另一名學生替代第一名、替換其回答或指定任意寫入範圍。

#### Scenario: 教師可見三人但只匯出一人
- **WHEN** 第一題有甲、乙、丙三份有效回答，甲為第一名，教師按下匯出
- **THEN** 第一題 Sequence 只包含甲的學號及回答，不包含乙、丙的資料

### Requirement: Case 與 Sequence 對應
系統 SHALL 將第一題（Case 1）寫入 C19、第二題（Case 2）寫入 C20，依此類推至 Case 6 的 C24，分頁預設為工作表1。每格 SHALL 僅以「回答_學號」格式寫入完整回答、單一底線分隔符及學號，不添加標籤、引號或額外分隔換行；回答本身的換行保留。不改動其他欄位或格式、不建立表頭、不追加列。沒有第一名的題目 SHALL 不寫入、不清空既有值。介面 SHALL 提示會覆寫指定 Sequence 的既有內容。

#### Scenario: 精確輸出格式
- **WHEN** 第一題的第一名學號為 00123，回答為 Single element
- **THEN** C19 的文字值恰為 Single element_00123，不包含「學號：」或「回答：」標籤，且保留學號前導零

#### Scenario: 部分題目有第一名
- **WHEN** Case 1 與 Case 3 有第一名，其他題目沒有
- **THEN** 只寫入 C19、C21，內容分別來自各題第一名，其他位置保持不變

#### Scenario: 沒有可匯出資料
- **WHEN** 所有題目都尚無有效提交
- **THEN** 回報 0 筆，不呼叫 Google 寫入，也不清空任何儲存格

### Requirement: 後端固定寫入範圍
系統 SHALL 使用後端設定中的目標 Sheet ID 與分頁，依有效第一名快照產生 Case 1–6 對應的 C19–C24 單格更新。前端 SHALL 不得指定任意試算表、分頁或範圍，亦不得提供另一份回答取代後端快照。所有位置 SHALL 由後端依題號計算。

#### Scenario: 前端試圖指定其他位置
- **WHEN** 匯出請求包含自訂 Sheet ID、分頁或範圍
- **THEN** 拒絕非契約欄位，不依前端指定位置寫入

### Requirement: 文字安全及可重試匯出
系統 SHALL 將學號及回答當作文字保存，保留學號前導零，不將回答解讀為公式。重試 SHALL 覆寫相同儲存格，不追加重複資料。Google 授權／寫入錯誤、配額限制或逾時 SHALL 不清除仍在記憶體中的全部回答及第一名，亦不得宣稱匯出成功。後端 SHALL 使用有限的等待時間；只有 Google 寫入成功且確認更新儲存格數與本次快照相符，才能向教師回報成功，不得僅根據 HTTP 200 判斷。

#### Scenario: 回答包含公式樣式文字
- **WHEN** 第一名的回答以等號起頭或包含換行
- **THEN** 該回答作為文字寫入，不執行公式，學號仍可明確辨認

#### Scenario: 寫入回應遺失後重試
- **WHEN** Google 寫入後回應遺失，後端未重啟且教師重試
- **THEN** 同一第一名學號及回答仍覆寫相同位置，不新增列

#### Scenario: HTTP 成功但匯出未確認
- **WHEN** Google API 回傳無效資料、錯誤訊息或與本次要求數量不符的寫入確認
- **THEN** 後端回報匯出失敗，不宣告寫入成功，保留回答並允許教師重試

### Requirement: 匯出快照與同時操作
系統 SHALL 以匯出開始時各題第一名的資料為快照，本次 writtenCount 不包含後來才產生第一名的題目。匯出期間 SHALL 拒絕第二次匯出及題目管理操作，避免對應改變；已開放題目仍可接收其他學生回答並供教師即時查看。

#### Scenario: 匯出時有新提交
- **WHEN** 正在匯出第一題時，第一題收到後續回答且第二題才產生第一名
- **THEN** 教師可見新增回答，本次只寫第一題原第一名；第二題可在下次匯出

### Requirement: 設定及記憶體限制
系統 SHALL 允許後端設定原生 Sheet ID、分頁名稱及服務帳號 JSON 憑證路徑。服務帳號 SHALL 具有目標試算表編輯權限。服務重啟 SHALL 不保留待匯出工作或回答，也不清除已寫入 Sheet 的內容。未設定或權限不足 SHALL 提供清楚錯誤，不顯示成功。

#### Scenario: 尚未設定權限
- **WHEN** 有待匯出資料但缺少 Sheet ID、憑證路徑，或憑證無效／沒有 Google 編輯權限
- **THEN** 回報設定或寫入錯誤，不洩漏私鑰或 Google 授權資訊，保留目前記憶體中的回答

#### Scenario: 重啟後結果
- **WHEN** 第一題已匯出、第二題未匯出，後端重啟
- **THEN** 第一題在 Sheet 的內容保留，第二題暫存回答消失，不自動恢復

### Requirement: 匯出 API 契約
系統 SHALL 提供 POST /api/teacher/exports/google-sheet，要求教師工作階段，無須前端提供學號、回答或範圍。成功為 200 與 writtenCount、ranges；無資料為 200、writtenCount=0 及空 ranges。教師未授權為 401、匯出進行中為 409、有資料但後端 Sheet ID 或憑證路徑設定缺失為 503。憑證讀取／授權／寫入錯誤、配額超限、無效確認或逾時 SHALL 轉換為 502，不洩漏遠端原始錯誤或私鑰。

#### Scenario: 實際成功才回報成功
- **WHEN** 教師呼叫匯出 API，Google 完成寫入且確認更新儲存格數與本次快照相符
- **THEN** 回傳實際寫入的題目數與對應範圍，且每題只有第一名的學號及回答


### Requirement: 教師匯出確認清單
系統 SHALL 在教師按下匯出入口後顯示第一名及預期儲存格的確認清單，確認後才呼叫原匯出 API。清單 SHALL 隨教師快照更新，不宣稱畫面預覽已鎖定後端快照。匯出中 SHALL 禁止重複提交，失敗後可重試，不將學生後續回答匯出。

#### Scenario: 取消匯出預覽
- **WHEN** 教師開啟清單後取消
- **THEN** 不呼叫寫入 API，不修改 Google Sheet
