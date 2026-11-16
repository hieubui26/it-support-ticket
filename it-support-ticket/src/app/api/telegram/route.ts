import { NextResponse } from "next/server";

// =============================================================================
// POST /api/telegram - Khung Webhook tiếp nhận tin nhắn từ Telegram Bot (Layer 2)
// Sẽ tích hợp bóc tách Gemini 3.8 Flash và ghi Supabase ở Layer 3
// =============================================================================
export async function POST(request: Request) {
  try {
    // 1. Kiểm tra header bí mật xác thực webhook từ Telegram (tùy chọn nhưng khuyến nghị)
    const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secretToken && secretToken !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }

    // 2. Đọc payload từ Telegram
    const update = await request.json();
    const message = update?.message || update?.channel_post;
    const text = message?.text || "";

    // 3. Phản hồi 200 OK ngay để Telegram không retry
    return NextResponse.json({
      ok: true,
      message: "Khung Webhook Telegram tiếp nhận thành công (Layer 2)",
      received_text: text,
      message_id: message?.message_id || null,
      from_user: message?.from?.username || message?.from?.first_name || "Ẩn danh",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json(
      { error: "Lỗi xử lý webhook Telegram", details: message },
      { status: 500 }
    );
  }
}
