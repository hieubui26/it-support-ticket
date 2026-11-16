import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Khởi tạo URL và Key từ biến môi trường
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// =============================================================================
// 1. SUPABASE CLIENT CHO TRÌNH DUYỆT (BROWSER CLIENT)
// =============================================================================
// Client này chỉ sử dụng NEXT_PUBLIC_SUPABASE_ANON_KEY an toàn trên giao diện.
// Được dùng cho:
// - Dashboard client component: Đọc dữ liệu ban đầu và lắng nghe Realtime channel.
// - Nút bấm trên Kanban: Bắn lệnh update status trực tiếp (tuân thủ RLS Policy).
// =============================================================================
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    // Nếu chạy trong SSR, tạo instance tạm
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  // Trên trình duyệt (client-side), tái sử dụng singleton instance
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}

// Instance mặc định dùng cho client components
export const supabase = getSupabaseBrowserClient();

// =============================================================================
// 2. SUPABASE ADMIN CLIENT CHO PHÍA SERVER (SERVER ONLY)
// =============================================================================
// Client này sử dụng SUPABASE_SERVICE_ROLE_KEY để toàn quyền ghi và truy vấn,
// hoàn toàn bỏ qua các quy tắc RLS (Row Level Security).
// 
// LƯU Ý BẢO MẬT:
// - CHỈ ĐƯỢC GỌI TRONG CÁC FILE ROUTE HANDLERS (/api/*) HOẶC SERVER ACTIONS.
// - TUYỆT ĐỐI KHÔNG import hoặc gọi hàm này trong các component có "use client".
// =============================================================================
export function getSupabaseAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "[Bảo mật] SUPABASE_SERVICE_ROLE_KEY chưa được thiết lập trên server. " +
      "Vui lòng cấu hình trong file .env.local để sử dụng admin client."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
