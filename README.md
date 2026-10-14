# 進金生能源 6692｜太陽光電維運管理智慧營運平台 (MOW 2.0)
> **ACME POINTES Solar O&M Intelligence Platform 2.0**  
> 逆向重製原站 `https://ds.acmepointes.net/acme_mow/Work_List`，整合 514 座光電案場（789.2 MW）全維度資料庫、461 筆即時派工單、四方協同回報與 Supabase BaaS 後端雲端同步。

[![GitHub Pages](https://img.shields.io/badge/Deployment-GitHub%20Pages-blue?logo=github)](https://davidyeh51.github.io/acmepoint-mow-platform/)
[![Backend](https://img.shields.io/badge/Backend-Supabase%20BaaS-3ECF8E?logo=supabase)](https://supabase.com)
[![Design](https://img.shields.io/badge/Design%20System-Zero--Noise%20Tri--Consulting-051C2C)](https://mckinsey.com)

---

## 📖 專案概述 (Executive Overview)

本平台是針對進金生能源服務股份有限公司（ACME POINTES）既有內部維運管理系統（ACME MOW: Maintenance, Operation & Work）進行之**現代化架構重構與決策大盤升級專案**。

透過 **REA (Reverse-Engineer-Anything) 逆向工程技術**，深度解析原 ASP.NET 系統之工單流、狀態機、權限配置與資料庫結構，並融合**全台 514 座光電案場（789.18 MW）全維度數據資產**，遵循三大頂尖管理顧問公司（McKinsey 麥肯錫、BCG 波士頓、Accenture 埃森哲）之「零雜訊視覺標準」，打造成業務、客戶、主管與工程師四方「單一真理來源 (Single Source of Truth)」的雲端即時營運戰情平台。

```
┌────────────────────────────────────────────────────────┐
│ 1. 前端託管 (GitHub Pages)                             │
│    • 純前端 HTML5 / Vanilla JS / 零構建零依賴           │
│    • 採用 @supabase/supabase-js@2 CDN 直連              │
│    • 僅暴露公開 SUPABASE_URL 與 anon public key        │
└───────────────────────────┬────────────────────────────┘
                            │
                 REST / Realtime / Auth
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. 後端 BaaS 雲端服務 (Supabase PostgreSQL)             │
│    • Database: mow_sites (514案場), mow_work_orders     │
│                (461工單), mow_work_records (現場紀錄)   │
│    • Storage:  mow-attachments (照片與 PDF 巡檢報告)   │
│    • Security: 強制啟用 RLS (Row Level Security)       │
└────────────────────────────────────────────────────────┘
```

---

## 🔍 REA 逆向工程剖析報告 (Reverse Engineering Findings)

透過 Playwright CDP 與 DOM 自動化探針，針對原站 `https://ds.acmepointes.net/acme_mow/Work_List` 完成全鏈路逆向分析：

### 1. 核心業務流程與狀態機
- **待執行 (Pending)**：
  - 燈號標定：🔴 紅色（未派工或已逾 D-day 應執行日）。
  - 權限動作：僅開放【✏️ 派工】(`open_RW(1, AOM_No, 'N', GUID)`)。
- **已安排 (Scheduled)**：
  - 燈號標定：🟡 黃色（已指派工程師，出工準備中）。
  - 權限動作：開放【✏️ 派工編輯】、【📝 作業紀錄表】(`open_RW(2)`)、【📄 維運報告】(`open_RW(3)`) 與【✅ 一鍵完工結案】。
- **已完成 (Completed)**：
  - 燈號標定：🟢 綠色（最後一筆紀錄表核簽通過，自動封存結案）。

### 2. 派工與作業紀錄表深度架構
- **派工來源 (Source)**：`合約` (定期巡檢、委外清洗高壓)、`監控` (SCADA 裝置斷線/低電壓異常)、`客服` (客戶 VOC 反映)。
- **74 項專業光電料件更換庫**：涵蓋 PT100感測器、Santon直流開關、日照計、Delta風扇、突波吸收器、士林/東元NFB等。
- **維運 KPI 指標追蹤**：記錄現場 109 表抄表度數 (kWh)、料件更換需求日、到件日、待料天數與出工修復響應天數。

---

## 🌟 系統核心功能模組

| 視圖模組 | 功能要點 | 數據規格 |
| :--- | :--- | :--- |
| **📊 營運總盤** | 總管理容量、合約覆蓋率、三大分區負載分析、角色觀點聯動（主管/業務/工程師/客戶） | 514 案場 / 789.18 MW |
| **📋 待執行工單 (Work_List)** | 461 筆實時工單隊列、狀態紅綠燈、新增派工、作業紀錄表、維運報告書、一鍵完工結案 | 461 筆即時工單 |
| **📑 全案場整合大庫** | 融合案場規格、維運合約、例行排程、連絡人與設備電號，支援抽屜式詳細資料視窗 | 55 欄全維度整合大表 |
| **⚙️ 合約例行派工履約 (R1)** | 巡檢、清洗、高壓與除草四大例行年度約定次數、已執行次數與達成率指標 | 182 履約案場 |
| **👥 連絡人與設備庫** | 業主緊急電話、主要窗口名錄、台電抄表電號與逆變器箱變配件商明細 | 674 連絡人 / 652 合約 |
| **📝 四方協同回報中心** | 跨角色線上提交現場異常通報、合約變更諮詢與即時處理動態時間軸 | 即時反饋動態流 |
| **☁️ Supabase 雲端控制台** | 即時握手測試、Anon Key 安全配置、雙向雲端同步與自動離線本地模式 | BaaS 雲端資料庫 |

---

## 🛠️ Supabase 後端配置教學 (One-Click Migration)

遵循 `github-supabase-web` 標準規範，請依下列步驟完成 Supabase 雲端資料庫串接：

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard) 並建立新專案。
2. 進入專案的 **SQL Editor**，開啟專案目錄下的 [`supabase-schema.sql`](./supabase-schema.sql) 並點擊 **Run**。
3. 腳本將自動建立：
   - 資料表：`mow_sites`, `mow_work_orders`, `mow_work_records`, `mow_collaborative_reports`
   - 自動更新時間戳記觸發器 (`update_updated_at_column`)
   - 行級安全策略 (RLS: 允許公開讀取，前端安全寫入)
   - Storage 儲存桶：`mow-attachments` (提供現場巡檢照片與 PDF 報告直傳)
4. 前往 **Project Settings ➔ API**，複製 `Project URL` 與 `anon public key`。
5. 開啟本前端網頁，點擊右上角 **`☁️ Supabase: 離線`**，貼入憑證並點擊 **`💾 儲存並啟用`**，即可享受毫秒級雲端資料庫同步！

---

## 🚀 GitHub Pages 發布與本機運行

### 1. 本地免安裝預覽
直接以瀏覽器開啟 `index.html`，系統自帶 514 案場與 461 筆派工離線資料集，無須任何建置步驟即可完整操作所有派工、篩選與紀錄功能。

### 2. 推播至 GitHub Pages
```bash
git init
git add .
git commit -m "feat: initial commit for ACME MOW 2.0 platform"
gh repo create acmepoint-mow-platform --public --source=. --remote=origin --push
```
至 GitHub 倉庫 **Settings ➔ Pages**，將 Source 設為 `main` 分支 `/ (root)`，即可透過 `https://davidyeh51.github.io/acmepoint-mow-platform/` 存取。

---

*版權所有 © 2026 進金生能源服務股份有限公司 (ACME POINTES ENERGY SERVICE) ｜ 技術支援：大衛維運智慧平台小組*
