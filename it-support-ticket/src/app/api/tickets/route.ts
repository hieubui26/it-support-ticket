import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { TicketPriority } from "@/types/ticket";

export const dynamic = "force-dynamic";

// =============================================================================
// GET /api/tickets - Lấy danh sách toàn bộ tickets từ Supabase (Layer 3)
// =============================================================================
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data: tickets, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/tickets] Lỗi truy vấn Supabase:", error.message);
      return NextResponse.json(
        { error: "Không thể lấy danh sách ticket từ cơ sở dữ liệu.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tickets: tickets || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server không xác định";
    console.error("[GET /api/tickets] Exception:", message);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi tải tickets.", details: message },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/tickets - Tạo ticket mới từ Portal (Layer 3)
// Tự động gán: source = "portal", status = "New"
// =============================================================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, priority, reporter_name } = body;

    // 1. Kiểm tra tiêu đề bắt buộc
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Tiêu đề sự cố là bắt buộc và không được để trống." },
        { status: 400 }
      );
    }

    // 2. Chuẩn hóa mức ưu tiên
    const validPriorities: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
    const safePriority: TicketPriority = validPriorities.includes(priority)
      ? priority
      : "Medium";

    const supabase = getSupabaseAdminClient();

    // 3. Thêm mới vào bảng public.tickets
    const newTicketData = {
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      priority: safePriority,
      category: "General",
      status: "New",
      source: "portal",
      reporter_name: typeof reporter_name === "string" && reporter_name.trim() ? reporter_name.trim() : "Ẩn danh",
      needs_review: false,
    };

    const { data, error } = await supabase
      .from("tickets")
      .insert([newTicketData])
      .select()
      .single();

    if (error) {
      console.error("[POST /api/tickets] Lỗi insert Supabase:", error.message);
      return NextResponse.json(
        { error: "Không thể lưu ticket vào Supabase.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Ticket đã được tạo thành công.",
        ticket: data,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server không xác định";
    console.error("[POST /api/tickets] Exception:", message);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi tạo ticket.", details: message },
      { status: 500 }
    );
  }
}
