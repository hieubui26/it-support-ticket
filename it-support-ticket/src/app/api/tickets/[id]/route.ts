import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { TicketStatus } from "@/types/ticket";

export const dynamic = "force-dynamic";

// =============================================================================
// PATCH /api/tickets/[id] - Cập nhật trạng thái ticket (Layer 3)
// =============================================================================
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: "Thiếu Ticket ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    const validStatuses: TicketStatus[] = ["New", "In Progress", "Resolved"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Trạng thái không hợp lệ. Chỉ chấp nhận một trong các giá trị: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("tickets")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`[PATCH /api/tickets/${id}] Lỗi cập nhật Supabase:`, error.message);
      return NextResponse.json(
        { error: "Không thể cập nhật trạng thái ticket.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Cập nhật trạng thái ticket thành công sang ${status}.`,
      ticket: data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server không xác định";
    console.error("[PATCH /api/tickets/[id]] Exception:", message);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi cập nhật ticket.", details: message },
      { status: 500 }
    );
  }
}
