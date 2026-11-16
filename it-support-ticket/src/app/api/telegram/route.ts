import { NextResponse } from "next/server";
import { parseTicketFromText } from "@/lib/gemini";
import { createTicket, checkExistingTicketByTelegramId } from "@/lib/tickets";

export const dynamic = "force-dynamic";
export const maxDuration = 25; // Cho phép Vercel Serverless Function chạy tối đa 25s

// =============================================================================
// GET /api/telegram - Endpoint chẩn đoán Model & Thời gian phản hồi từ Vercel
// Giúp kiểm tra trực tiếp Gemini từ cloud mà không cần gửi tin nhắn Telegram
// =============================================================================
export async function GET() {
  const start = Date.now();
  const configuredModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const hasKey = Boolean(process.env.GEMINI_API_KEY);

  const testSample = "Máy in phòng kế toán kẹt giấy liên tục không in được";
  const parsed = await parseTicketFromText(testSample);
  const durationMs = Date.now() - start;

  return NextResponse.json({
    diagnostics: {
      model_configured: configuredModel,
      has_gemini_api_key: hasKey,
      response_time_ms: durationMs,
      status: parsed.is_fallback ? "GEMINI_FALLBACK" : "GEMINI_PARSED",
    },
    test_result: parsed,
  });
}

// =============================================================================
// POST /api/telegram - Webhook tiếp nhận tin nhắn từ Telegram Bot (G1)
// =============================================================================
export async function POST(request: Request) {
  const requestStart = Date.now();
  const elapsed = () => `${Date.now() - requestStart}ms`;

  try {
    // 1. Kiểm tra header bí mật X-Telegram-Bot-Api-Secret-Token
    const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secretToken !== expectedSecret) {
      console.warn(`[+${elapsed()}] 🔒 [WEBHOOK BẢO MẬT] Từ chối request do secret token không khớp hoặc bị thiếu.`);
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
      console.log(`[+${elapsed()}] ⏭️ [WEBHOOK BỎ QUA LỆNH] Chat ID ${message.chat?.id}: "${text}"`);
      return NextResponse.json(
        { ok: true, ignored: true, reason: "Command message" },
        { status: 200 }
      );
    }

    // 4. Khóa ghép định danh: chat_id:message_id
    const chatId = message.chat?.id;
    const messageId = message.message_id;
    const compositeId = `${chatId}:${messageId}`;

    const reporterName =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
      message.from?.username ||
      `Chat_${chatId}`;

    console.log(`\n------------------------------------------------------------`);
    console.log(`[+${elapsed()}] 📥 [WEBHOOK ĐÃ NHẬN] Message ID ${compositeId} từ "${reporterName}": "${text}"`);

    // =========================================================================
    // 5. PRE-CHECK DUPLICATE: Kiểm tra ticket đã tồn tại TRƯỚC KHI gọi Gemini
    // =========================================================================
    const existingTicket = await checkExistingTicketByTelegramId(compositeId);
    if (existingTicket) {
      const shortId = existingTicket.id.slice(0, 8);
      console.log(
        `[+${elapsed()}] ⚠️ [ĐÃ BỎ QUA BẢN TRÙNG (PRE-CHECK)] Message ID ${compositeId} đã tồn tại trong database (Ticket #${shortId} - "${existingTicket.title}"). Trả về 200 OK ngay.`
      );
      return NextResponse.json(
        { ok: true, duplicate: true, ticket_id: existingTicket.id },
        { status: 200 }
      );
    }

    // 6. Phân loại nội dung bằng Gemini (Timeout 8500ms, retry 503 duy nhất 1 lần)
    const configuredModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    console.log(`[+${elapsed()}] 🤖 [BẮT ĐẦU PHÂN LOẠI GEMINI] Model: "${configuredModel}"...`);
    const parsed = await parseTicketFromText(text);

    // 7. Lưu ticket vào Supabase bằng logic dùng chung
    console.log(`[+${elapsed()}] 💾 [BẮT ĐẦU LƯU TICKET VÀO SUPABASE]...`);
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

    // Trường hợp A: Trùng lặp do request song song chặn bởi database UNIQUE
    if (result.duplicate) {
      console.log(
        `[+${elapsed()}] ⚠️ [ĐÃ BỎ QUA BẢN TRÙNG (UNIQUE CONSTRAINT)] Message ID ${compositeId} được chặn thành công bởi database.`
      );
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    // Trường hợp B: Lưu thất bại -> Trả về 500 để Telegram kích hoạt cơ chế retry sau
    if (!result.success || !result.ticket) {
      console.error(`[+${elapsed()}] ❌ [LỖI LƯU TICKET] Message ID ${compositeId}:`, result.error);
      return NextResponse.json(
        { error: "Lỗi lưu ticket vào cơ sở dữ liệu", details: result.error },
        { status: 500 }
      );
    }

    // Trường hợp C: Lưu thành công -> Trả về 200 OK
    const shortId = result.ticket.id.slice(0, 8);
    console.log(
      `[+${elapsed()}] ✅ [ĐÃ LƯU THÀNH CÔNG] Ticket #${shortId} ("${result.ticket.title}") [${parsed.priority} - ${parsed.category}]. Tổng thời gian: ${elapsed()}`
    );
    return NextResponse.json(
      { ok: true, ticket: result.ticket, elapsed: elapsed() },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Lỗi server không xác định";
    console.error(`[+${elapsed()}] ❌ [POST /api/telegram] Ngoại lệ:`, errorMsg);
    return NextResponse.json(
      { error: "Lỗi xử lý webhook Telegram", details: errorMsg },
      { status: 500 }
    );
  }
}
