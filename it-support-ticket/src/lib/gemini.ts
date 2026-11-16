import { TicketPriority } from "@/types/ticket";

export interface ParsedTicketData {
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  needs_review: boolean;
  is_fallback?: boolean;
  error_detail?: string;
}

// Helper: Gọi REST Gemini với timeout 20s và header x-goog-api-key chuẩn
const TICKET_PRIORITIES: TicketPriority[] = [
  "Low", "Medium", "High", "Critical",
];

const TICKET_CATEGORIES = [
  "Network", "Hardware", "Software", "Access", "General",
];

async function callGeminiRest(
  prompt: string,
  model: string,
  apiKey: string,
  timeoutMs = 20000,
): Promise<Response> {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: TICKET_PRIORITIES },
            category: { type: "string", enum: TICKET_CATEGORIES },
            needs_review: { type: "boolean" },
          },
          required: ["title", "description", "priority", "category", "needs_review"],
        },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// =============================================================================
// Hàm parseTicketFromText: Cho đủ 20s ngân sách để Gemini hoàn tất phản hồi từ Cloud
// =============================================================================
export async function parseTicketFromText(
  rawText: string,
  modelOverride?: string
): Promise<ParsedTicketData> {
  const startTime = Date.now();
  const elapsed = () => `${Date.now() - startTime}ms`;

  const apiKey = process.env.GEMINI_API_KEY;
  const model = modelOverride || process.env.GEMINI_MODEL || "gemini-3-flash";

  // Fallback an toàn theo schema hiện có
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
    fallback.error_detail = "GEMINI_API_KEY is not set";
    return fallback;
  }

  console.log(`[+${elapsed()}] 🤖 [GEMINI BẮT ĐẦU] Gọi model: "${model}" | Timeout: 20000ms`);

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

  // 1. Cho Gemini thời gian 20 giây (20000ms) để không bị ngắt giữa chừng
  try {
    res = await callGeminiRest(prompt, model, apiKey, 20000);
  } catch (err: unknown) {
    const errorObj = err as { name?: string; message?: string };
    errorReason = errorObj.name === "TimeoutError" ? "Timeout quá 20000ms" : errorObj.message || "Lỗi mạng";
  }

  // 2. Nếu Google trả về 503 (quá tải) và còn thời gian -> Thử lại 1 lần sau 1.5s
  if (res && res.status === 503 && Date.now() - startTime < 16000) {
    console.warn(`[+${elapsed()}] 🔄 [GEMINI RETRY] Model: "${model}". Gặp HTTP 503. Chờ 1500ms thử lại...`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      res = await callGeminiRest(prompt, model, apiKey, 6000);
    } catch (retryErr: unknown) {
      const errorObj = retryErr as { name?: string; message?: string };
      errorReason = errorObj.name === "TimeoutError" ? "Timeout quá 6000ms ở retry" : errorObj.message || "Lỗi mạng retry";
      res = null;
    }
  }

  // 3. Nếu vẫn không thành công -> Kích hoạt Fallback
  if (!res || !res.ok) {
    let rawError = errorReason;
    if (res) {
      try {
        const textErr = await res.text();
        rawError = `HTTP ${res.status}: ${textErr.slice(0, 200)}`;
      } catch {
        rawError = `HTTP Status ${res.status}`;
      }
    }

    console.warn(
      `[+${elapsed()}] ⚠️ [GEMINI FALLBACK] Model: "${model}". Chi tiết lỗi: ${rawError}. Áp dụng fallback với needs_review=true.`
    );

    fallback.error_detail = rawError;
    return fallback;
  }

  // 4. Parse JSON kết quả
  try {
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts;

    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error(`Gemini không trả nội dung (${candidate?.finishReason ?? "unknown"})`);
    }

    const answer = parts
      .filter((part: { thought?: boolean; text?: string }) =>
        part.thought !== true && typeof part.text === "string"
      )
      .map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();

    const blocks = Array.from(answer.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi));
    const jsonText = blocks.length === 1 ? blocks[0][1].trim() : answer;

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(
        `Gemini trả JSON không hợp lệ (finishReason=${candidate.finishReason ?? "unknown"}, length=${answer.length})`
      );
    }

    if (
      !parsed ||
      typeof parsed.title !== "string" ||
      !parsed.title.trim() ||
      typeof parsed.description !== "string" ||
      !TICKET_PRIORITIES.includes(parsed.priority) ||
      !TICKET_CATEGORIES.includes(parsed.category) ||
      typeof parsed.needs_review !== "boolean"
    ) {
      throw new Error("Gemini trả ticket thiếu trường hoặc có giá trị ngoài schema");
    }

    const parsedResult: ParsedTicketData = {
      title: parsed.title.trim(),
      description: parsed.description.trim(),
      priority: parsed.priority,
      category: parsed.category,
      needs_review: parsed.needs_review,
      is_fallback: false,
    };

    console.log(
      `[+${elapsed()}] 🤖 [GEMINI PARSED] Model: "${model}" | Tiêu đề: "${parsedResult.title}" | Priority: [${parsedResult.priority}] | Category: [${parsedResult.category}] | NeedsReview: [${parsedResult.needs_review}]`
    );

    return parsedResult;
  } catch (parseError: unknown) {
    const errorMsg = parseError instanceof Error ? parseError.message : "Cú pháp không hợp lệ";
    console.warn(`[+${elapsed()}] ⚠️ [GEMINI FALLBACK] Model: "${model}". JSON parse thất bại: ${errorMsg}`);
    fallback.error_detail = `JSON parse failed: ${errorMsg}`;
    return fallback;
  }
}
