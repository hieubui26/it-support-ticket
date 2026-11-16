// scripts/telegram-webhook.mjs
// Workshop AgenticPM S01 - G1: Quản lý Telegram Bot Webhook (Đăng ký / Gỡ bỏ / Kiểm tra)

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!botToken) {
  console.error("[LỖI CẤU HÌNH] Chưa tìm thấy TELEGRAM_BOT_TOKEN trong .env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const commandOrUrl = args[0]?.trim();

async function callTelegram(method, body = null) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const options = {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, ok: data.ok, data };
}

async function main() {
  if (!commandOrUrl || commandOrUrl === "help") {
    console.log("============================================================");
    console.log("🔧 HƯỚNG DẪN QUẢN LÝ TELEGRAM WEBHOOK (AgenticPM S01)");
    console.log("============================================================");
    console.log("1. Đăng ký webhook lên Vercel:");
    console.log("   npm run webhook -- https://<your-project>.vercel.app");
    console.log("\n2. Gỡ bỏ webhook (để quay lại dùng npm run dev:poll):");
    console.log("   npm run webhook:delete  (hoặc: npm run webhook -- delete)");
    console.log("\n3. Kiểm tra trạng thái webhook hiện tại:");
    console.log("   npm run webhook:info    (hoặc: npm run webhook -- info)");
    console.log("============================================================\n");
    return;
  }

  // 1. Lệnh GỠ WEBHOOK
  if (["delete", "remove", "clear", "unset"].includes(commandOrUrl.toLowerCase())) {
    console.log("⏳ Đang gửi yêu cầu gỡ bỏ Webhook tới Telegram API...");
    const res = await callTelegram("deleteWebhook", { drop_pending_updates: false });
    if (res.ok) {
      console.log("✅ [GỠ WEBHOOK THÀNH CÔNG] Bot đã được hủy webhook.");
      console.log("   Bây giờ bạn có thể chuyển về chạy polling local bằng lệnh:");
      console.log("   npm run dev:poll");
    } else {
      console.error("❌ [LỖI GỠ WEBHOOK]:", res.data?.description);
    }
    return;
  }

  // 2. Lệnh XEM THÔNG TIN Webhook
  if (commandOrUrl.toLowerCase() === "info") {
    console.log("⏳ Đang kiểm tra thông tin Webhook hiện tại từ Telegram...");
    const res = await callTelegram("getWebhookInfo");
    if (res.ok) {
      const info = res.data?.result || {};
      console.log("\n📋 [THÔNG TIN WEBHOOK TỪ TELEGRAM]");
      console.log(`   - URL: ${info.url || "(Chưa đăng ký webhook - Bot đang ở chế độ Polling)"}`);
      console.log(`   - Có secret token: ${info.has_custom_certificate !== undefined ? "Có" : "Không"}`);
      console.log(`   - Updates đang chờ (Pending updates): ${info.pending_update_count || 0}`);
      if (info.last_error_message) {
        console.log(`   - Lỗi gần nhất: ${info.last_error_message}`);
        console.log(`   - Thời điểm lỗi: ${new Date(info.last_error_date * 1000).toLocaleString("vi-VN")}`);
      }
    } else {
      console.error("❌ [LỖI]:", res.data?.description);
    }
    return;
  }

  // 3. Lệnh ĐĂNG KÝ Webhook với URL
  let targetUrl = commandOrUrl;
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://${targetUrl}`;
  }

  targetUrl = targetUrl.replace(/\/+$/, "");

  // Đảm bảo trỏ đúng vào endpoint route handler /api/telegram
  if (!targetUrl.endsWith("/api/telegram")) {
    targetUrl = `${targetUrl}/api/telegram`;
  }

  if (!targetUrl.startsWith("https://")) {
    console.error("❌ [LỖI]: Telegram yêu cầu Webhook URL phải bắt đầu bằng HTTPS bảo mật!");
    process.exit(1);
  }

  console.log(`⏳ Đang đăng ký Webhook Telegram tới URL: ${targetUrl}...`);
  if (webhookSecret) {
    console.log("🔒 Bảo mật: Đã áp dụng secret_token (X-Telegram-Bot-Api-Secret-Token).");
  } else {
    console.warn("⚠️  Cảnh báo: TELEGRAM_WEBHOOK_SECRET chưa được cấu hình.");
  }

  const setPayload = {
    url: targetUrl,
    allowed_updates: ["message", "channel_post"],
  };

  if (webhookSecret) {
    setPayload.secret_token = webhookSecret;
  }

  const res = await callTelegram("setWebhook", setPayload);

  if (res.ok) {
    console.log(`\n🎉 [ĐĂNG KÝ WEBHOOK THÀNH CÔNG!]`);
    console.log(`   - Webhook URL: ${targetUrl}`);
    console.log(`   - Trạng thái: Sẵn sàng nhận tin nhắn trên Production Vercel.`);
    console.log(`\n💡 Lưu ý: Khi Webhook đang bật, polling local sẽ bị Telegram khóa.`);
    console.log(`   Để quay lại polling local, chỉ cần chạy: npm run webhook:delete`);
  } else {
    console.error(`❌ [ĐĂNG KÝ THẤT BẠI]:`, res.data?.description);
  }
}

main().catch((err) => {
  console.error("❌ Ngoại lệ:", err.message);
  process.exit(1);
});
