# 教師端版型 A（已確認並套用）

預覽網址：http://localhost:3000/previews/teacher-layout.html

使用者已確認套用。正式教師頁面為 /teacher，重新整理即可載入新版，不需要重啟服務。上述預覽網址保留為獨立合成示例。

## 版面提案

- 保留米白、深綠及暖黃配色，縮小頁首。
- 左側以約 280px 題目清單顯示狀態與回答數；新增表單按需展開。
- 右側放大回答閱讀區，可切換「全部題目總覽」及「單題全部回答」。
- 單題第一名獨立標示，下方以表格列出全部回答。
- 匯出按鈕放在上方工具列，捲動時仍可使用。
- 提供舒適／精簡間距與收合題目欄，可比較卡片大小及閱讀寬度。
- 窄螢幕改為上下排列，題目清單採雙欄。

## 預覽範圍

資料全為合成示例，僅存在此預覽頁面記憶體；沒有 fetch、SSE、後端 API、Google 寫入或持久儲存。停止／開始、新增題目與匯出清單皆為模擬，重新整理可重設。編輯／刪題等完整操作仍以正式版本為準，本提案主要供確認版面。

程式碼：public/previews/teacher-layout.html、teacher-layout.css、teacher-layout.js。

已同步 OpenSpec Proposal、Specs、Design 與 Tasks，並整合至 public/teacher.html、public/css/teacher-dashboard.css、public/js/teacher.js、public/js/components/teacher-view.js 及 export-panel.js。正式頁面已接回登入、CRUD、SSE、全部回答與真實匯出 API；匯出前先確認第一名清單。共用樣式與學生端未修改。

2026-09-24 完成桌面／手機尺寸與模擬匯出驗收，結果見 docs/verification.md。預覽三個檔案與正式介面獨立，可保留作為版型設計紀錄。
