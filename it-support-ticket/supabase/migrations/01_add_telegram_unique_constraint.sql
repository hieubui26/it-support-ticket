-- =============================================================================
-- WORKSHOP AGENTICPM S01: MIGRATION LAYER 4
-- Chống lưu trùng tin nhắn Telegram bằng ràng buộc UNIQUE cho telegram_message_id
-- =============================================================================

-- 1. Thêm ràng buộc UNIQUE cho cột telegram_message_id
-- Khóa ghép được lưu dưới định dạng "<chat_id>:<message_id>" (ví dụ: "-1001234567:42")
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'unique_telegram_message_id'
    ) THEN
        ALTER TABLE public.tickets 
        ADD CONSTRAINT unique_telegram_message_id UNIQUE (telegram_message_id);
    END IF;
END $$;

-- 2. Tạo Index tìm kiếm nhanh theo telegram_message_id
CREATE INDEX IF NOT EXISTS idx_tickets_telegram_msg_id 
ON public.tickets (telegram_message_id) 
WHERE telegram_message_id IS NOT NULL;
