import { TicketPriority } from "@/types/ticket";

export interface ParsedTicketData {
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  needs_review: boolean;
  is_fallback?: boolean;
}

// Helper: Gọi REST Gemini với timeout rõ ràng và bảo mật URL (không in key ra log)
async function callGeminiRest(
  prompt: string,
  model: string,
  apiKey: string,
  timeoutMs: number
): Promise<Response> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  return fetch(endpoint, {
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
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// =============================================================================
// Hàm parseTicketFromText: Phân loại lỗi với Timeout tối ưu, Retry 503 & Fallback
// =============================================================================
export async function parseTicketFromText(rawText: string): Promise<ParsedTicketData> {
  const startTime = Date.now();
  const elapsed = () => `${Date.now() - startTime}ms`;

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  // Fallback an toàn theo schema hiện có khi Gemini gặp sự cố
  const fallback: ParsedTicketData = {
    title: rawText.length > 50 ? rawText.slice(0, 50) + "..." : rawText,
    description: rawText,
    priority: "Medium",
    category: "General",
    needs_review: true,
    is_fallback: true,
  };

  if (!apiKey) {
    console.warn(`[+${elapsed()}] ⚠️ [GEMINI FALLBACK] Model: "${model}". Lý do: GEMINI_API_KEY chưa được thiết lập.`);
    return fallback;
  }

  console.log(`[+${elapsed()}] 🤖 [GEMINI BẮT ĐẦU] Model thực tế: "${model}" | Timeout lượt 1: 8500ms`);

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

  let res: Response | null = null;
  let errorReason = "";

  // 1. Lần gọi đầu tiên: Tăng timeout lên 8500ms để đủ thời gian cho cloud serverless
  try {
    res = await callGeminiRest(prompt, model, apiKey, 8500);
  } catch (err: unknown) {
    const errorObj = err as { name?: string; message?: string };
    errorReason = errorObj.name === "TimeoutError" ? "Timeout quá 8500ms" : errorObj.message || "Lỗi mạng";
  }

  // 2. Nếu gặp HTTP 503 (Overloaded) hoặc timeout và tổng thời gian < 10000ms: Thử lại DUY NHẤT 1 lần
  const is503 = res && res.status === 503;
  const isTimeout = !res && errorReason.includes("Timeout");

  if (is503 || (isTimeout && Date.now() - startTime < 9500)) {
    const reasonMsg = is503 ? "HTTP 503 Service Unavailable" : errorReason;
    console.warn(`[+${elapsed()}] 🔄 [GEMINI RETRY] Model: "${model}". Gặp ${reasonMsg}. Chờ 1200ms thử lại duy nhất 1 lần...`);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    try {
      // Lần gọi thứ hai (Timeout 4000ms)
      res = await callGeminiRest(prompt, model, apiKey, 4000);
    } catch (retryErr: unknown) {
      const errorObj = retryErr as { name?: string; message?: string };
      errorReason = errorObj.name === "TimeoutError" ? "Timeout quá 4000ms ở lần retry" : errorObj.message || "Lỗi mạng retry";
      res = null;
    }
  }

  // 3. Nếu vẫn lỗi sau khi thử lại -> Kích hoạt Fallback
  if (!res || !res.ok) {
    const finalReason = res ? `HTTP Status ${res.status}` : errorReason || "Không nhận được phản hồi";
    console.warn(
      `[+${elapsed()}] ⚠️ [GEMINI FALLBACK] Model: "${model}". Lý do: ${finalReason}. Áp dụng fallback với needs_review=true.`
    );
    return fallback;
  }

  // 4. Bóc tách JSON an toàn
  try {
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      console.warn(`[+${elapsed()}] ⚠️ [GEMINI FALLBACK] Model: "${model}". Lý do: Phản hồi từ Gemini không có candidates[0].parts.`);
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

    const parsedResult: ParsedTicketData = {
      title: parsed.title && typeof parsed.title === "string" ? parsed.title.trim() : fallback.title,
      description: parsed.description && typeof parsed.description === "string" ? parsed.description.trim() : rawText,
      priority,
      category: parsed.category && typeof parsed.category === "string" ? parsed.category.trim() : "General",
      needs_review: typeof parsed.needs_review === "boolean" ? parsed.needs_review : false,
      is_fallback: false,
    };

    console.log(
      `[+${elapsed()}] 🤖 [GEMINI PARSED] Model: "${model}" | Tiêu đề: "${parsedResult.title}" | Priority: [${parsedResult.priority}] | Category: [${parsedResult.category}] | NeedsReview: [${parsedResult.needs_review}]`
    );

    return parsedResult;
  } catch (parseError: unknown) {
    const errorMsg = parseError instanceof Error ? parseError.message : "Cú pháp không hợp lệ";
    console.warn(`[+${elapsed()}] ⚠️ [GEMINI FALLBACK] Model: "${model}". Lý do: JSON parse thất bại (${errorMsg}). Áp dụng fallback.`);
    return fallback;
  }
}
