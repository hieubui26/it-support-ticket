import { TicketPriority } from "@/types/ticket";

export interface ParsedTicketData {
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  needs_review: boolean;
}

// =============================================================================
// Hàm parseTicketFromText: Gọi Gemini REST để bóc tách thông tin ticket từ tin nhắn
// =============================================================================
export async function parseTicketFromText(rawText: string): Promise<ParsedTicketData> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  // Giá trị mặc định (Fallback) an toàn theo schema hiện có
  const fallback: ParsedTicketData = {
    title: rawText.length > 50 ? rawText.slice(0, 50) + "..." : rawText,
    description: rawText,
    priority: "Medium",
    category: "General",
    needs_review: true,
  };

  if (!apiKey) {
    console.warn("[Gemini AI] Cảnh báo: GEMINI_API_KEY chưa được thiết lập. Áp dụng fallback.");
    return fallback;
  }

  // Prompt phân loại tiếng Việt với 3 ví dụ mẫu chuẩn theo Slide F2
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[Gemini AI] Gọi API thất bại với HTTP Status: ${res.status}`);
      return fallback;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      return fallback;
    }

    let rawJsonText = parts.map((part: { text?: string }) => part.text || "").join("").trim();
    if (rawJsonText.startsWith("```json")) {
      rawJsonText = rawJsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (rawJsonText.startsWith("```")) {
      rawJsonText = rawJsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(rawJsonText);

    const validPriorities: TicketPriority[] = ["Low", "Medium", "High", "Critical"];
    const priority: TicketPriority = validPriorities.includes(parsed.priority) ? parsed.priority : "Medium";

    return {
      title: parsed.title && typeof parsed.title === "string" ? parsed.title.trim() : fallback.title,
      description: parsed.description && typeof parsed.description === "string" ? parsed.description.trim() : rawText,
      priority,
      category: parsed.category && typeof parsed.category === "string" ? parsed.category.trim() : "General",
      needs_review: typeof parsed.needs_review === "boolean" ? parsed.needs_review : true,
    };
  } catch (error: unknown) {
    console.warn(
      "[Gemini AI] Lỗi parse hoặc mạng khi gọi Gemini:",
      error instanceof Error ? error.message : "Ngoại lệ không xác định"
    );
    return fallback;
  }
}
