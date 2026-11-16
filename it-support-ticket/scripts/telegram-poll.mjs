// scripts/telegram-poll.mjs
// Workshop AgenticPM S01 - Layer 4: Long-polling Telegram Bot cho môi trường Local (Windows & Node.js 22)

import { createClient } from "@supabase/supabase-js";

// =============================================================================
// 1. KIỂM TRA BIẾN MÔI TRƯỜNG (BẢO VỆ KEY & TOKEN)
// =============================================================================
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";

if (!botToken) {
  console.error(
    "[LỖI CẤU HÌNH] Chưa tìm thấy TELEGRAM_BOT_TOKEN trong .env.local.",
  );
  console.error("Vui lòng cấu hình TELEGRAM_BOT_TOKEN trước khi chạy bot.");
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "[LỖI CẤU HÌNH] Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local.",
  );
  process.exit(1);
}

// Khởi tạo Supabase Admin Client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log("============================================================");
console.log("🤖 IT SUPPORT TELEGRAM BOT POLLING (Layer 4 - AgenticPM S01)");
console.log(`⚡ Gemini Model: ${geminiModel}`);
console.log(`🌐 Supabase Target: ${supabaseUrl}`);
console.log("============================================================\n");

// =============================================================================
// 2. HÀM PHÂN LOẠI TICKET BẰNG GEMINI REST (3 VÍ DỤ TIẾNG VIỆT SLIDE F2)
// =============================================================================
async function parseWithGemini(rawText) {
  const fallback = {
    title: rawText.length > 50 ? rawText.slice(0, 50) + "..." : rawText,
    description: rawText,
    priority: "Medium",
    category: "General",
    needs_review: true,
  };

  if (!geminiApiKey) {
    console.warn(
      "[CẢNH BÁO] Chưa cấu hình GEMINI_API_KEY. Áp dụng fallback mặc định.",
    );
    return fallback;
  }

  const prompt = `
Bạn là chuyên viên tiếp nhận và phân loại sự cố IT Support.
Hãy phân tích nội dung báo lỗi sau đây từ người dùng (bằng tiếng Việt) và trích xuất thành định dạng JSON.

Yêu cầu định dạng JSON với các trường:
- "title": Tiêu đề ngắn gọn tóm tắt sự cố (tiếng Việt).
- "description": Mô tả chi tiết vấn đề dựa trên tin nhắn gốc.
- "priority": Mức độ ưu tiên, chọn 1 trong 4 giá trị: "Low", "Medium", "High", "Critical".
- "category": Nhóm sự cố (ví dụ: "Network", "Hardware", "Software", "Access", "General").
- "needs_review": boolean (true nếu tin nhắn mơ hồ, thiếu chi tiết cần IT hỏi lại; false nếu lỗi đã rõ ràng).

Dưới đây là 3 ví dụ mẫu chuẩn (Few-shot Examples theo Slide F2):
Ví dụ 1:
Tin nhắn: "Không vào được Wi-Fi ở tầng 3"
Kết quả: {"title": "Mất kết nối Wi-Fi tại tầng 3", "description": "Người dùng phản ánh không thể kết nối hoặc truy cập Wi-Fi tại khu vực tầng 3.", "priority": "Medium", "category": "Network", "needs_review": false}

Ví dụ 2:
Tin nhắn: "Máy in phòng kế toán kẹt giấy liên tục không in được hóa đơn"
Kết quả: {"title": "Máy in phòng kế toán kẹt giấy liên tục", "description": "Máy in phòng kế toán bị kẹt giấy, không in được hóa đơn cần hỗ trợ gấp.", "priority": "High", "category": "Hardware", "needs_review": false}

Ví dụ 3:
Tin nhắn: "Sập mạng toàn bộ văn phòng rồi mọi người không làm việc được"
Kết quả: {"title": "Sập toàn bộ mạng văn phòng", "description": "Toàn bộ hệ thống mạng nội bộ bị ngắt kết nối, nhân viên không làm việc được.", "priority": "Critical", "category": "Network", "needs_review": false}

Nội dung báo lỗi cần phân tích: "${rawText}"

Chỉ trả về duy nhất một JSON object hợp lệ, không kèm văn bản giải thích nào khác.
`.trim();

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[GEMINI CẢNH BÁO] API trả về HTTP Status: ${res.status}`);
      return fallback;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) return fallback;

    let rawJsonText = parts
      .filter((part) => part.thought !== true && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();

    rawJsonText = rawJsonText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(rawJsonText);
    const validPriorities = ["Low", "Medium", "High", "Critical"];
    const priority = validPriorities.includes(parsed.priority)
      ? parsed.priority
      : "Medium";

    return {
      title:
        parsed.title && typeof parsed.title === "string"
          ? parsed.title.trim()
          : fallback.title,
      description:
        parsed.description && typeof parsed.description === "string"
          ? parsed.description.trim()
          : rawText,
      priority,
      category:
        parsed.category && typeof parsed.category === "string"
          ? parsed.category.trim()
          : "General",
      needs_review:
        typeof parsed.needs_review === "boolean" ? parsed.needs_review : true,
    };
  } catch (err) {
    console.warn("[GEMINI CẢNH BÁO] Ngoại lệ khi parse kết quả:", err.message);
    return fallback;
  }
}

// =============================================================================
// 3. HÀM LƯU TICKET VÀO SUPABASE (DÙNG CHUNG LOGIC & CHỐNG LƯU TRÙNG)
// =============================================================================
async function saveTicketToDatabase({
  title,
  description,
  priority,
  category,
  reporterName,
  originalText,
  compositeId,
  needsReview,
}) {
  const newTicket = {
    title: title.trim(),
    description: description ? description.trim() : "",
    priority: priority || "Medium",
    category: category || "General",
    status: "New",
    source: "telegram",
    reporter_name: reporterName || "Telegram User",
    original_text: originalText || null,
    telegram_message_id: compositeId,
    needs_review: Boolean(needsReview),
  };

  const { data, error } = await supabase
    .from("tickets")
    .insert([newTicket])
    .select()
    .single();

  if (error) {
    // Mã lỗi PostgreSQL 23505 = unique_violation (trùng lặp telegram_message_id)
    const isDuplicate =
      error.code === "23505" ||
      error.message?.toLowerCase().includes("unique") ||
      error.message?.toLowerCase().includes("duplicate");

    if (isDuplicate) {
      return { success: false, duplicate: true };
    }
    return { success: false, duplicate: false, error: error.message };
  }

  return { success: true, duplicate: false, ticket: data };
}

// =============================================================================
// 4. VÒNG LẶP POLLING (LONG-POLLING VỚI RETRY VÀ TĂNG OFFSET CHÍNH XÁC)
// =============================================================================
let offset = 0;
let isRunning = true;

process.on("SIGINT", () => {
  console.log("\n🛑 [DỪNG BOT] Đang thoát tiến trình polling...");
  isRunning = false;
  process.exit(0);
});

async function startPolling() {
  console.log(
    "🚀 [KHỞI ĐỘNG] Đang lắng nghe tin nhắn Telegram qua getUpdates (Long-polling)...\n",
  );

  while (isRunning) {
    try {
      const getUpdatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=30`;

      const response = await fetch(getUpdatesUrl, {
        signal: AbortSignal.timeout(35000), // Timeout 35s cho long-polling 30s
      });

      if (!response.ok) {
        console.warn(
          `[TELEGRAM CẢNH BÁO] API trả về status: ${response.status} ${response.statusText}`,
        );
        // Chờ 3s trước khi thử lại để tránh spam
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const body = await response.json();
      if (!body.ok) {
        console.warn(
          "[TELEGRAM LỖI] Phản hồi không thành công:",
          body.description,
        );
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const updates = body.result || [];

      for (const update of updates) {
        const message = update.message || update.channel_post;

        // Bỏ qua nếu không phải tin nhắn có văn bản
        if (!message || !message.text) {
          offset = update.update_id + 1;
          continue;
        }

        const text = message.text.trim();
        const chatId = message.chat?.id;
        const messageId = message.message_id;
        const compositeId = `${chatId}:${messageId}`;

        // Bỏ qua các lệnh bot (như /start, /help)
        if (text.startsWith("/")) {
          console.log(`[BỎ QUA LỆNH] Chat ID ${chatId}: "${text}"`);
          offset = update.update_id + 1;
          continue;
        }

        // Tên người báo lỗi từ thông tin Telegram
        const reporterName =
          [message.from?.first_name, message.from?.last_name]
            .filter(Boolean)
            .join(" ") ||
          message.from?.username ||
          `Chat_${chatId}`;

        console.log(
          `\n------------------------------------------------------------`,
        );
        console.log(
          `📥 [ĐÃ NHẬN] Message ID ${compositeId} từ "${reporterName}": "${text}"`,
        );

        // Phân loại với Gemini AI
        const parsed = await parseWithGemini(text);
        console.log(`🤖 [ĐÃ PHÂN LOẠI]`);
        console.log(`   - Tiêu đề: "${parsed.title}"`);
        console.log(
          `   - Mức ưu tiên: [${parsed.priority}] | Nhóm: [${parsed.category}] | Cần xem xét: [${parsed.needs_review}]`,
        );

        // Lưu vào Supabase
        const result = await saveTicketToDatabase({
          title: parsed.title,
          description: parsed.description,
          priority: parsed.priority,
          category: parsed.category,
          reporterName,
          originalText: text,
          compositeId,
          needsReview: parsed.needs_review,
        });

        if (result.duplicate) {
          console.log(
            `⚠️  [ĐÃ BỎ QUA BẢN TRÙNG] Message ID ${compositeId} đã được lưu trước đó.`,
          );
          // Đã xác nhận tồn tại trong DB -> Tăng offset an toàn
          offset = update.update_id + 1;
        } else if (result.success) {
          const shortId = result.ticket.id.slice(0, 8);
          console.log(
            `✅ [ĐÃ LƯU] Ticket #${shortId} ("${result.ticket.title}") đã xuất hiện trên Dashboard!`,
          );
          // Xử lý thành công -> Tăng offset
          offset = update.update_id + 1;
        } else {
          console.error(
            `❌ [LỖI LƯU TICKET] Không thể lưu Message ID ${compositeId}:`,
            result.error,
          );
          console.log(
            `   Sẽ thử lại ở lượt poll tiếp theo (Không tăng offset).`,
          );
          // Không tăng offset để vòng lặp sau xử lý lại
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } catch (networkError) {
      if (networkError.name !== "TimeoutError") {
        console.warn(
          `[MẠNG CẢNH BÁO] Không thể kết nối tới Telegram API (${networkError.message}). Sẽ thử lại sau 5s...`,
        );
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

startPolling();
