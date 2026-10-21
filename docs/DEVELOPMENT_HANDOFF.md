# 開發接手與維運 AI 助理路線

接手日期：2026-10-21（Asia/Taipei）  
原始碼基準：`7d3081bfa70467fc8dcc1f5b6a6d34cde5b9caaa`  
優先方向：維運 AI 助理，支援查案場、解讀異常、建議派工。

## 已確認的架構

- 前端：`index.html` 內含版型、樣式與 Vanilla JS；GitHub Pages 發布 `main` 根目錄，沒有 npm 建置程序。
- 初始資料：`om_platform_data.js` 與 JSON 快照；前端另外將新增、編輯與完工狀態存入 localStorage。
- 後端程式：Supabase PostgreSQL schema 與 `line-webhook` Edge Function；實際 Supabase 專案、部署版本、資料與 secrets 尚未驗證。
- LINE 分類：固定案場字串與關鍵字規則。原始碼中尚未發現語言模型呼叫、Agent 工具調用或檢索服務。
- 最後一次已查得的 Pages 部署成功：2026-10-15，對應上述基準 commit。部署成功不等於業務資料流程驗證通過。
- 本次透過 GitHub 連接器接手。Windows 沙箱啟動錯誤使本機終端與瀏覽器工具無法執行；未確認本機 checkout，也未讀取或更新 Obsidian Vault。

README 的案場、工單與 VOC 數量是原專案對快照的描述，尚未與正式資料庫核對，不能當作目前即時數量。

## 首批修復：VOC 寫入契約

前端的 `content/front_chat/back_ops/hours` 是介面資料欄位；資料庫欄位是 `customer_content/front_desk_reply/back_desk_notes/hours_spent`。原本直接寫入介面欄位會使 PostgreSQL 拒絕請求。Supabase 也可能以 resolved `{ error }` 回傳失敗，不能只依靠 try/catch。

本次變更：

1. 新增共用欄位轉換與雲端寫入函式，供 VOC 新增、編輯、LINE 模擬與確認簽核使用。
2. 使用 `onConflict: 'ticket_no'` upsert，讓編輯與歷史工單簽核以業務單號更新。
3. 保留先存本機的流程，明確顯示本機儲存、雲端成功或雲端失敗；失敗後須重新儲存，尚無自動重試佇列。
4. 在新建 schema 與增量 migration 補上 `confirmer/confirmed_at`。
5. LINE Webhook 改用 SQL 欄位並保留來源 user/message ID。入庫失敗時中止 Lark 廣播與 LINE 成功回覆，回傳 HTTP 500；缺少 LINE secret 時回傳 503。
6. 加入無外部依賴的回歸檢查與 GitHub Actions，全部使用記憶體替身，不會發送真實訊息或寫入資料庫。

## 發布與驗證

已有資料庫只需執行 [確認欄位增量遷移](../supabase/migrations/20261021000100_add_voc_confirmation.sql)，不應重跑整份根目錄 schema：原 schema 的 trigger/policy 建立指令不具重複執行保護。

建議發布次序：

1. 備份並在測試資料庫執行上述 migration，確認資料不變且兩個欄位存在。
2. 確認 Edge Function 的 `LINE_CHANNEL_SECRET` 已設定，再發布更新的 `line-webhook`。
3. 執行 `node scripts/test-voc-regression.mjs`，並檢查 PR 的 Actions 結果。
4. 在測試環境手動驗證新增、編輯、確認簽核、離線與錯誤提示；以測試 LINE 帳號驗證有效與無效簽章。
5. 驗收後再合併前端至 `main`，觸發 Pages 發布。

自動檢查涵蓋 SQL 欄位契約、upsert 衝突鍵、成功/離線/資料庫/網路失敗、簽核、LINE 資料來源與入庫失敗的副作用、缺少 secret、無效簽章與 HTTP 回應。測試擷取實際函式並為少數 TypeScript 註記做移除；這不等同 Deno 型別檢查、真實 HMAC 驗證、SQL 實機遷移或瀏覽器端到端驗證。

此 PR 未部署 Supabase、未套用正式 migration、未改動正式資料，也未發送 LINE/Lark 訊息。

## 上線前待處理事項

| 優先 | 現況與證據 | 完成條件 |
| --- | --- | --- |
| P0 | 根目錄 SQL 的匿名 SELECT/INSERT/UPDATE 策略使用 `true`；角色選單只改畫面 | 接入身分驗證與角色/案場授權，使用至少兩種角色驗證跨案場拒絕；另核對正式資料庫實際策略 |
| P0 | 公開 repository 包含案場、聯絡人相關資料快照及試算表 | 確認公開資料範圍，為展示環境提供去識別資料，正式資料改走受授權的查詢 |
| P1 | `syncVocFromLine()` 只重算計數、重畫表格，卻宣稱同步完成；初始化也未讀雲端 VOC | 真正查詢雲端並去重合併；保留未同步本機編輯；顯示來源與同步時間 |
| P1 | LINE 的三碼隨機單號可能碰撞；尚未利用來源訊息 ID 去重 | 以事件/訊息 ID 保證重送冪等，並提供可靠單號配置；測試重送與批次部分失敗 |
| P1 | 前端 Lark 未配置 webhook 時複製卡片仍宣稱推播成功；HTTP/應用錯誤尚未全面檢查 | 區分準備卡片與送達；驗證回應及錯誤；移到經驗證的後端服務 |
| P1 | 派工編輯只更新記憶體；作業紀錄未關聯雲端工單 UUID，最終簽核與完工未以交易同步 | 重整工單 ID、持久化與狀態機，測試重新整理和跨裝置一致性 |
| P1 | LINE credentials 存於瀏覽器，並不能設定 Edge Function 的環境變數 | 將 secrets 設定移至部署流程，前端提供實際設定狀態與說明 |

## 維運 AI 助理第一版

第一版以可追溯的查詢與建議為核心。資料查詢必須在後端檢查使用者可存取的案場；模型 API secret 只放後端。現有前端的角色選單不可作為授權依據。

| 使用情境 | 所需工具與資料 | 驗收方式 |
| --- | --- | --- |
| 查案場 | 依案場編號、名稱、客戶、區域查詢；顯示容量、負責人、合約與未結工單 | 同名/部分名稱回傳候選，不擅自挑選；每項結果列案場編號、資料來源與更新時間 |
| 解讀異常 | 彙整該案場的 VOC、工單與作業紀錄；區分觀察、推測與需補資料 | 每個結論可回查紀錄；無遙測時明確指出缺少電壓、電流、功率或輻照度，不編造故障診斷 |
| 建議派工 | 依合約、故障緊急程度、地區與工程師資訊產生派工草稿 | 顯示依據、建議人員與待確認資訊；使用者確認後才建立工單，避免重複派工 |

建議 API 邊界：

- `search_sites(query, filters)`：只回傳使用者有權限讀取的案場與必要欄位。
- `get_site_context(field_no)`：查詢合約、工單、VOC、現場紀錄，附來源 ID 和時間。
- `draft_dispatch(field_no, evidence_ids)`：輸出可編輯建議與引用，不直接發送通知。
- 經使用者確認後呼叫既有派工服務；後端再次檢查權限、必要欄位與冪等鍵。

實作順序：先修正資料同步與身分授權，再建立查詢工具和助理介面，接著加入具引用的異常摘要，最後接派工草稿流程。模型供應商、部署環境與可用的正式資料來源，應在串接前確認；本次接手未將規則分類描述成已完成的語言模型 Agent。

第一版回歸情境至少包含：明確案場查詢、名稱歧義、未知案場、無合約/無工單、過期快照、缺少遙測、未授權案場、模型/資料庫失敗，以及重複確認派工。
