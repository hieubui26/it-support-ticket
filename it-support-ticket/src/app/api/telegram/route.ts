import { NextResponse } from "next/server";
import { parseTicketFromText } from "@/lib/gemini";
import { createTicket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

// =============================================================================
// POST /api/telegram - Webhook tiếp nhận tin nhắn từ Telegram Bot trên Vercel (G1)
// =============================================================================
export async function POST(request: Request) {
  try {
    // 1. Kiểm tra header bí mật X-Telegram-Bot-Api-Secret-Token
    const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secretToken !== expectedSecret) {
      console.warn("[WEBHOOK BẢO MẬT] Từ chối request do secret token không khớp hoặc bị thiếu.");
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }

    const update = await request.json();
    const message = update?.message || update?.channel_post;

    // 2. Bỏ qua các sự kiện không phải tin nhắn văn bản (ảnh, sticker, update khác...)
    if (!message || typeof message.text !== "string") {
      return NextResponse.json(
        { ok: true, ignored: true, reason: "Non-text message" },
        { status: 200 }
      );
    }

    const text = message.text.trim();

    // 3. Bỏ qua các lệnh bot (như /start, /help, /info) có chủ đích
    if (!text || text.startsWith("/")) {
      console.log(`[WEBHOOK BỎ QUA LỆNH] Chat ID ${message.chat?.id}: "${text}"`);
      return NextResponse.json(
        { ok: true, ignored: true, reason: "Command message" },
        { status: 200 }
      );
    }

    // 4. Khóa ghép chống lưu trùng: chat_id:message_id
    const chatId = message.chat?.id;
    const messageId = message.message_id;
    const compositeId = `${chatId}:${messageId}`;

    const reporterName =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
      message.from?.username ||
      `Chat_${chatId}`;

    console.log(`\n------------------------------------------------------------`);
    console.log(`📥 [WEBHOOK ĐÃ NHẬN] Message ID ${compositeId} từ "${reporterName}": "${text}"`);

    // 5. Phân loại thông minh bằng Gemini 3.8 Flash (tái sử dụng từ polling)
    const parsed = await parseTicketFromText(text);
    console.log(`🤖 [WEBHOOK ĐÃ PHÂN LOẠI]`);
    console.log(`   - Tiêu đề: "${parsed.title}"`);
    console.log(`   - Mức ưu tiên: [${parsed.priority}] | Nhóm: [${parsed.category}] | Cần xem xét: [${parsed.needs_review}]`);

    // 6. Lưu ticket vào Supabase bằng logic dùng chung
    const result = await createTicket({
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      category: parsed.category,
      source: "telegram",
      status: "New",
      reporter_name: reporterName,
      original_text: text,
      telegram_message_id: compositeId,
      needs_review: parsed.needs_review,
    });

    // 7. Xử lý kết quả lưu:
    // Trường hợp A: Bản ghi đã tồn tại (trùng lặp) -> Trả về 200 OK để Telegram không gửi lại
    if (result.duplicate) {
      console.log(`⚠️  [WEBHOOK ĐÃ BỎ QUA BẢN TRÙNG] Message ID ${compositeId} đã được lưu trước đó.`);
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    // Trường hợp B: Lưu thất bại -> Trả về 500 để Telegram kích hoạt cơ chế retry sau
    if (!result.success || !result.ticket) {
      console.error(`❌ [WEBHOOK LỖI LƯU TICKET] Message ID ${compositeId}:`, result.error);
      return NextResponse.json(
        { error: "Lỗi lưu ticket vào cơ sở dữ liệu", details: result.error },
        { status: 500 }
      );
    }

    // Trường hợp C: Lưu thành công -> Trả về 200 OK
    const shortId = result.ticket.id.slice(0, 8);
    console.log(`✅ [WEBHOOK ĐÃ LƯU] Ticket #${shortId} ("${result.ticket.title}") đã xuất hiện trên Dashboard!`);
    return NextResponse.json(
      { ok: true, ticket: result.ticket },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server không xác định";
    console.error("[POST /api/telegram] Exception:", message);
    return NextResponse.json(
      { error: "Lỗi xử lý webhook Telegram", details: message },
      { status: 500 }
    );
  }
}
