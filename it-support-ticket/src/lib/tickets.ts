import { getSupabaseAdminClient } from "@/lib/supabase";
import { Ticket, TicketPriority, TicketSource, TicketStatus } from "@/types/ticket";

export interface CreateTicketInput {
  title: string;
  description?: string;
  priority?: TicketPriority;
  category?: string;
  source: TicketSource;
  status?: TicketStatus;
  reporter_name?: string;
  original_text?: string | null;
  telegram_message_id?: string | null;
  needs_review?: boolean;
}

export interface CreateTicketResult {
  success: boolean;
  duplicate: boolean;
  ticket?: Ticket;
  error?: string;
}

// =============================================================================
// Hàm createTicket: Dùng chung logic lưu ticket cho cả Portal và Telegram Bot
// =============================================================================
export async function createTicket(input: CreateTicketInput): Promise<CreateTicketResult> {
  const supabase = getSupabaseAdminClient();

  // Chuẩn hóa priority hợp lệ
  const validPriorities: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
  const safePriority: TicketPriority =
    input.priority && validPriorities.includes(input.priority) ? input.priority : "Medium";

  const newTicketData = {
    title: input.title.trim(),
    description: typeof input.description === "string" ? input.description.trim() : "",
    priority: safePriority,
    category: input.category?.trim() || "General",
    status: input.status || "New",
    source: input.source,
    reporter_name: input.reporter_name?.trim() || "Ẩn danh",
    original_text: input.original_text || null,
    telegram_message_id: input.telegram_message_id || null,
    needs_review: typeof input.needs_review === "boolean" ? input.needs_review : false,
  };

  const { data, error } = await supabase
    .from("tickets")
    .insert([newTicketData])
    .select()
    .single();

  if (error) {
    // Mã lỗi PostgreSQL 23505 đại diện cho vi phạm ràng buộc UNIQUE (chống trùng lặp tin nhắn)
    const isDuplicate =
      error.code === "23505" ||
      error.message?.toLowerCase().includes("unique") ||
      error.message?.toLowerCase().includes("duplicate");

    if (isDuplicate) {
      return {
        success: false,
        duplicate: true,
        error: "Tin nhắn Telegram này đã được ghi nhận trước đó.",
      };
    }

    return {
      success: false,
      duplicate: false,
      error: error.message,
    };
  }

  return {
    success: true,
    duplicate: false,
    ticket: data as Ticket,
  };
}
