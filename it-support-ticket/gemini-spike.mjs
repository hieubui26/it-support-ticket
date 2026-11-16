// gemini-spike.mjs
// Workshop AgenticPM S01 - B3: Spike thử nghiệm gọi Gemini API với Node.js 22 fetch()

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

if (!apiKey) {
  console.error("[Lỗi cấu hình] Biến môi trường GEMINI_API_KEY chưa được thiết lập.");
  console.error("Vui lòng kiểm tra file .env.local hoặc truyền GEMINI_API_KEY trước khi chạy.");
  process.exit(1);
}

const sampleMessage = "Không vào được Wi-Fi ở tầng 3";

const prompt = `
Bạn là chuyên viên tiếp nhận và phân loại sự cố IT Support.
Hãy phân tích nội dung báo lỗi sau đây từ người dùng và trích xuất thành định dạng JSON.

Nội dung báo lỗi: "${sampleMessage}"

Yêu cầu định dạng kết quả trả về là một JSON object duy nhất với các trường:
- "title": Tiêu đề ngắn gọn tóm tắt sự cố (tiếng Việt).
- "description": Mô tả chi tiết vấn đề dựa trên tin nhắn (tiếng Việt).
- "priority": Mức độ ưu tiên, chọn 1 trong 4 giá trị: "Low", "Medium", "High", "Critical".
- "category": Nhóm sự cố (ví dụ: "Network", "Hardware", "Software", "Access", "Other").
- "needs_review": boolean (true nếu thông tin còn mơ hồ hoặc thiếu dữ liệu cần IT xem lại, false nếu thông tin đã rõ ràng).

Chỉ trả về JSON hợp lệ, không kèm theo bất kỳ văn bản giải thích nào khác.
`.trim();

const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

const requestBody = {
  contents: [
    {
      role: "user",
      parts: [
        {
          text: prompt,
        },
      ],
    },
  ],
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.1,
  },
};

async function runSpike() {
  console.log(`[Khởi động] Đang gọi Gemini API với model: ${model}...`);
  console.log(`[Tin nhắn mẫu]: "${sampleMessage}"\n`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Lỗi API] HTTP Status: ${res.status} ${res.statusText}`);
      console.error("Chi tiết phản hồi lỗi từ Google Gemini:");
      console.error(errorText);
      process.exit(1);
    }

    const data = await res.json();

    // Lấy text từ candidates[0].content.parts
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      console.error("[Lỗi dữ liệu] Không tìm thấy candidates[0].content.parts trong phản hồi từ API.");
      console.error("Cấu trúc phản hồi nhận được:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const rawText = parts.map((part) => part.text || "").join("").trim();

    // Làm sạch markdown code blocks nếu có
    let cleanText = rawText;
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    try {
      const parsed = JSON.parse(cleanText);
      console.log("=== Kết quả trích xuất JSON thành công ===");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.error("[Lỗi cú pháp] Nội dung trả về không thể parse thành JSON hợp lệ.");
      console.error("Nội dung text nhận được từ model:\n", rawText);
      console.error("Chi tiết lỗi parse:", parseError.message);
      process.exit(1);
    }
  } catch (networkError) {
    console.error("[Lỗi kết nối] Không thể kết nối tới Gemini API:", networkError.message);
    process.exit(1);
  }
}

runSpike();
