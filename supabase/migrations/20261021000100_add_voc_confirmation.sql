-- 已有資料庫請執行此增量遷移；保留現有工單與 RLS 策略。
-- 可重複執行；新建資料庫則使用根目錄 supabase-schema.sql。
ALTER TABLE public.mow_voc_tickets
    ADD COLUMN IF NOT EXISTS confirmer VARCHAR(128),
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
