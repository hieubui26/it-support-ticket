-- =============================================================================
-- WORKSHOP AGENTICPM S01: SCHEMA BẢNG PUBLIC.TICKETS
-- =============================================================================

-- 1. Bật extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tạo bảng tickets
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    category TEXT DEFAULT 'General',
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'Resolved')),
    source TEXT NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'telegram')),
    reporter_name TEXT DEFAULT 'Ẩn danh',
    original_text TEXT,
    telegram_message_id TEXT,
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Tạo index tăng tốc truy vấn lọc theo trạng thái và mức ưu tiên trên Dashboard
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);

-- 4. Bật Row Level Security (RLS) để kiểm soát quyền truy cập
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- MÔ TẢ QUYỀN TRUY CẬP (RLS POLICIES) CHO DASHBOARD & PORTAL Ở LAYER 3:
-- =============================================================================
-- - Dashboard (Client): Dùng NEXT_PUBLIC_SUPABASE_ANON_KEY để:
--     + Đọc danh sách ticket (SELECT) hiển thị trên 3 cột Kanban.
--     + Cập nhật trạng thái (UPDATE status) khi kỹ thuật viên bấm nút chuyển cột.
--     + Nhận sự kiện Realtime khi có thay đổi dữ liệu.
-- - Portal (Client / Server Action): Cho phép tạo ticket mới (INSERT).
-- - Telegram Webhook (Server): Dùng SUPABASE_SERVICE_ROLE_KEY (bỏ qua RLS) 
--   để insert ticket đã được Gemini trích xuất an toàn.
-- =============================================================================

-- Policy 1: Cho phép đọc công khai (SELECT) để Dashboard hiển thị được ticket
CREATE POLICY "Allow public read access to tickets" 
    ON public.tickets 
    FOR SELECT 
    USING (true);

-- Policy 2: Cho phép tạo ticket từ Portal (INSERT)
CREATE POLICY "Allow public insert to tickets" 
    ON public.tickets 
    FOR INSERT 
    WITH CHECK (true);

-- Policy 3: Cho phép cập nhật trạng thái ticket từ nút bấm Dashboard (UPDATE)
CREATE POLICY "Allow public update ticket status" 
    ON public.tickets 
    FOR UPDATE 
    USING (true)
    WITH CHECK (true);

-- 5. KÍCH HOẠT SUPABASE REALTIME
-- Bắt buộc phải thêm bảng public.tickets vào publication supabase_realtime
-- để tính năng Realtime Postgres Changes đẩy cập nhật sang các tab Dashboard mà không cần F5.
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;

-- 6. Trigger tự động cập nhật trường updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tickets_updated_at ON public.tickets;
CREATE TRIGGER set_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
