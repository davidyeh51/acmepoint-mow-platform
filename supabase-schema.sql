-- ==============================================================================
-- 進金生能源 (ACME POINTES 6692) 太陽光電維運管理智慧營運平台 (MOW 2.0)
-- Supabase PostgreSQL 資料庫結構、Row Level Security (RLS) 與 Storage 配置腳本
-- 適用於 GitHub Pages 前端直連串接
-- ==============================================================================

-- 啟用 UUID 擴展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. 案場主表 (mow_sites) - 納管全台 514 座光電案場 (789.2 MW)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mow_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_no VARCHAR(64) UNIQUE NOT NULL,        -- 案場編號 (例如: Z0000064, 81307016, 12400122)
    field_name VARCHAR(255) NOT NULL,            -- 案場名稱 (例如: 可口可樂(外來案), 尚準墊片有限公司)
    status_label VARCHAR(64) DEFAULT '正常',     -- 維運狀態標定 (正常 / 待執行派工 / 逾期警示 / 無有效合約)
    capacity_kw NUMERIC(12, 3) NOT NULL DEFAULT 0, -- 裝置容量 (kW)
    zone VARCHAR(64),                            -- 維運分區 (A_北區維運 / B_中區維運 / C_南區維運)
    engineer VARCHAR(128),                       -- 負責工程師 (例如: 李孟家(Leo), 陳秉浤(Bryant))
    manager VARCHAR(128),                        -- 負責管理師 (例如: 鍾依靜(Ivy), 黃鈺祺(Mina))
    client_name VARCHAR(255),                    -- 客戶名稱 (例如: 太古可口可樂, 奇美實業)
    site_attribute VARCHAR(64),                  -- 案場屬性 (自建案場 / 外來案場 / 代工)
    site_type VARCHAR(64),                       -- 案場類型 (屋頂型 / 地面型 / 水面型 / 漁電共生)
    has_contract VARCHAR(16) DEFAULT '有',       -- 有效合約 (有 / 無)
    contract_no VARCHAR(64),                     -- 進行中合約編號
    contract_type VARCHAR(64),                   -- 合約類型 (維運合約 / 工程合約)
    contract_period VARCHAR(128),                -- 合約起訖日
    contract_years NUMERIC(5, 2),                -- 合約年限
    is_high_voltage VARCHAR(16) DEFAULT '否',    -- 高壓案場 (是 / 否)
    is_our_hv_maint VARCHAR(16) DEFAULT '否',    -- 高保由我司施作 (是 / 否)
    inv_procurement VARCHAR(64),                 -- INV採購屬性 (我司採購 / 客供)
    pv_procurement VARCHAR(64),                  -- PV採購屬性 (我司採購 / 客供)
    grid_connection_date VARCHAR(64),            -- 併聯日期
    address TEXT,                                -- 案場地址
    gps_coords VARCHAR(128),                     -- GPS座標
    contact_person VARCHAR(128),                 -- 主要連絡人
    contact_phone VARCHAR(128),                  -- 連絡電話
    contact_email VARCHAR(128),                  -- 電子信箱
    equipment_notes TEXT,                        -- 設備與電號明細
    notes TEXT,                                  -- 注意事項/備註
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. 待執行與已安排派工工單表 (mow_work_orders) - 逆向對齊 ACME MOW Work_List
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mow_work_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_no VARCHAR(64),                         -- 項目序號 (1, 2, 3...)
    field_no VARCHAR(64) REFERENCES public.mow_sites(field_no) ON DELETE SET NULL,
    field_name VARCHAR(255) NOT NULL,            -- 案場名稱
    engineer VARCHAR(128) NOT NULL,              -- 負責工程師帳號/姓名 (例如: leoli, bryantchen, andrewlu)
    work_type VARCHAR(64) NOT NULL,              -- 工作類別 (巡檢 / 清洗 / 高壓 / 除草 / 其他)
    start_date DATE,                             -- D-day(起始日)
    period_days INTEGER,                         -- 週期(天) (90, 120, 180, 365)
    due_date DATE NOT NULL,                      -- 應執行日(D-day)
    status VARCHAR(64) NOT NULL DEFAULT '待執行', -- 狀態 (待執行 / 已安排 / 已完成)
    light_color VARCHAR(32) DEFAULT 'red',       -- 燈號 (red / yellow / green)
    aom_no VARCHAR(64),                          -- 原系統工單編號 (AOM_No)
    guid VARCHAR(128),                           -- 原系統識別碼 (GUID)
    
    -- 派工配置詳細屬性 (由 open_RW(1) / open_RW(4) 產生)
    expense_attribution VARCHAR(64) DEFAULT '維運', -- 費用歸屬 (維運 / 保固 / 在製 / 個案)
    report_type VARCHAR(64) DEFAULT '進金生',        -- 報告類型 (進金生 / 中租 / 雲豹 / 需要報告)
    dispatch_source VARCHAR(64) DEFAULT '合約',     -- 派工來源 (合約 / 監控 / 客服)
    dispatch_category VARCHAR(128),              -- 派工分類 (例如: M 案場巡檢 / L 委外作業 / A 機況查檢處理)
    dispatch_item VARCHAR(128),                  -- 派工項目 (例如: M_01 例行巡檢執行 / A_02 裝置斷線)
    assigned_engineers JSONB DEFAULT '[]'::jsonb, -- 指派工程師名冊
    notes TEXT,                                  -- 派工備註
    
    completed_at TIMESTAMPTZ,                    -- 完工結案時間戳記
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. 現場作業紀錄表 (mow_work_records) - 逆向對齊 ACME MOW index_work_R.aspx
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mow_work_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id UUID REFERENCES public.mow_work_orders(id) ON DELETE CASCADE,
    field_name VARCHAR(255) NOT NULL,            -- 案場名稱
    record_serial VARCHAR(64),                   -- 紀錄表流水號
    start_time TIMESTAMPTZ,                      -- 現場執行起始時間
    end_time TIMESTAMPTZ,                        -- 現場執行結束時間
    meter_reading_kwh NUMERIC(12, 2) DEFAULT 0,  -- 109表 KWh (輸入值抄表)
    action_progress TEXT NOT NULL,               -- 作為及進度說明
    fault_system VARCHAR(64),                    -- 異常系統 (監控系統 / 電力系統 / 機構土建 / 其它)
    fault_section VARCHAR(128),                  -- 異常段
    fault_location VARCHAR(128),                 -- 異常處
    is_replacement_needed BOOLEAN DEFAULT FALSE, -- 是否需要更換料件
    replaced_parts JSONB DEFAULT '[]'::jsonb,    -- 更換料件陣列 (料件名稱, 數量, 需求日, 到件日, 響應天數)
    workers JSONB DEFAULT '[]'::jsonb,           -- 現場作業人員名單
    support_backend BOOLEAN DEFAULT FALSE,       -- 是否需要後台支援
    support_pd BOOLEAN DEFAULT FALSE,            -- 是否申請PD支援
    support_vendor BOOLEAN DEFAULT FALSE,        -- 是否需要設備廠商支援
    is_final_record BOOLEAN DEFAULT FALSE,       -- 是否為最後一筆 (觸發自動結案)
    bpm_status VARCHAR(64) DEFAULT '暫存中',      -- BPM簽核狀態 (暫存中 / 送簽中 / 已簽核)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. 四方協同回報表 (mow_collaborative_reports) - 業務・客戶・主管・工程師協同
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mow_collaborative_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role VARCHAR(64) NOT NULL,                   -- 回報人角色 (工程師 / 業務 / 主管 / 客戶)
    reporter_name VARCHAR(128) NOT NULL,         -- 回報人姓名
    field_name VARCHAR(255) NOT NULL,            -- 關聯案場名稱
    category VARCHAR(128) NOT NULL,              -- 事項類別 (定期巡檢結果 / 清洗除草 / 機況異常叫修 / 續約諮詢)
    content TEXT NOT NULL,                       -- 詳細說明內容
    attachment_url TEXT,                         -- 附檔照片或報告網址
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. 索引優化 (加速高頻查詢與篩選)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mow_orders_status ON public.mow_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_mow_orders_engineer ON public.mow_work_orders(engineer);
CREATE INDEX IF NOT EXISTS idx_mow_orders_type ON public.mow_work_orders(work_type);
CREATE INDEX IF NOT EXISTS idx_mow_orders_due ON public.mow_work_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_mow_sites_zone ON public.mow_sites(zone);
CREATE INDEX IF NOT EXISTS idx_mow_sites_field_no ON public.mow_sites(field_no);
CREATE INDEX IF NOT EXISTS idx_mow_records_order ON public.mow_work_records(work_order_id);

-- ------------------------------------------------------------------------------
-- 6. 自動更新 updated_at 觸發器
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_mow_sites_modtime
    BEFORE UPDATE ON public.mow_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mow_orders_modtime
    BEFORE UPDATE ON public.mow_work_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mow_records_modtime
    BEFORE UPDATE ON public.mow_work_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 7. 行級安全策略 (Row Level Security - RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.mow_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mow_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mow_work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mow_collaborative_reports ENABLE ROW LEVEL SECURITY;

-- 允許所有人 (含公開匿名者與 GitHub Pages 訪客) 讀取案場與工單
CREATE POLICY "Public Read mow_sites" ON public.mow_sites FOR SELECT USING (true);
CREATE POLICY "Public Read mow_work_orders" ON public.mow_work_orders FOR SELECT USING (true);
CREATE POLICY "Public Read mow_work_records" ON public.mow_work_records FOR SELECT USING (true);
CREATE POLICY "Public Read mow_collaborative_reports" ON public.mow_collaborative_reports FOR SELECT USING (true);

-- 允許經由前端操作寫入/更新工單與回報 (使用 anon key 或 authenticated)
CREATE POLICY "Allow Insert mow_work_orders" ON public.mow_work_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Update mow_work_orders" ON public.mow_work_orders FOR UPDATE USING (true);

CREATE POLICY "Allow Insert mow_work_records" ON public.mow_work_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Update mow_work_records" ON public.mow_work_records FOR UPDATE USING (true);

CREATE POLICY "Allow Insert mow_collaborative_reports" ON public.mow_collaborative_reports FOR INSERT WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 8. 儲存桶配置 (Storage Bucket: mow-attachments)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) 
VALUES ('mow-attachments', 'mow-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 允許任何人讀取 attachments 儲存桶內的檔案
CREATE POLICY "Public Access Attachments" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'mow-attachments');

-- 允許使用者上傳附件照片與 PDF 巡檢報告
CREATE POLICY "Allow Upload Attachments" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'mow-attachments');
