"use client";

import { useState } from "react";
import Link from "next/link";
import { TicketPriority } from "@/types/ticket";

export default function PortalPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("Medium");
  const [reporterName, setReporterName] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successTicketId, setSuccessTicketId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate tiêu đề bắt buộc
    if (!title.trim()) {
      setErrorMessage("Vui lòng nhập tiêu đề sự cố.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          reporter_name: reporterName.trim() || "Ẩn danh",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gửi ticket thất bại.");
      }

      // Lấy ID trả về từ API (lấy 8 ký tự đầu nếu là UUID để hiển thị gọn gàng)
      const rawId = data.ticket?.id || "";
      const displayId = rawId.length > 8 ? rawId.slice(0, 8) : rawId;
      setSuccessTicketId(displayId);

      // Reset form
      setTitle("");
      setDescription("");
      setPriority("Medium");
      setReporterName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-screen bg-slate-50">
      {/* SIDEBAR TỐI MÀU (Đồng bộ với Dashboard) */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 min-h-screen border-r border-slate-800">
        <div>
          {/* Logo Brand */}
          <div className="h-16 flex items-center px-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-indigo-500/20">
                IT
              </div>
              <div>
                <h1 className="text-sm font-semibold text-white tracking-wide">IT SUPPORT HUB</h1>
                <p className="text-[11px] text-slate-400">AgenticPM S01</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <Link
              href="/"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-indigo-600/15 text-indigo-400 font-medium text-sm transition border border-indigo-500/20"
            >
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Gửi yêu cầu (Portal)
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 font-medium text-sm transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Bảng Kanban (Dashboard)
            </Link>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="p-3 rounded-lg bg-slate-800/60 text-xs text-slate-400">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-300 font-medium">Hệ thống sẵn sàng</span>
            </div>
            <p>Quy mô team: 5–10 người</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-8 lg:p-12 overflow-y-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Cổng tiếp nhận sự cố IT</h2>
            <p className="text-slate-500 text-sm mt-1">Điền thông tin bên dưới để gửi yêu cầu hỗ trợ kỹ thuật đến bộ phận IT.</p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2 rounded-lg transition"
          >
            Xem Dashboard
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>

        {/* THÔNG BÁO LỖI (NẾU CÓ) */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 shadow-sm flex items-start justify-between gap-3 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="p-1 bg-rose-100 rounded-lg shrink-0 text-rose-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-rose-900 text-sm">Gửi ticket không thành công</h3>
                <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-600 text-sm p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* THÔNG BÁO THÀNH CÔNG KÈM TICKET ID */}
        {successTicketId && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-sm flex items-start justify-between gap-3 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-emerald-100 rounded-lg shrink-0 text-emerald-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-emerald-900 text-sm">
                  Ticket #{successTicketId} đã được ghi nhận
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Yêu cầu đã được chuyển vào hàng đợi Dashboard của đội ngũ IT. Kỹ thuật viên sẽ xử lý theo mức độ ưu tiên.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSuccessTicketId(null)}
              className="text-emerald-500 hover:text-emerald-700 text-sm p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* FORM CONTAINER */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tiêu đề (Bắt buộc) */}
            <div>
              <label htmlFor="title" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Tiêu đề sự cố <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Máy in phòng kế toán kẹt giấy liên tục"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition"
              />
              <p className="text-xs text-slate-400 mt-1">Tóm tắt ngắn gọn vấn đề đang gặp phải (tối đa 100 ký tự).</p>
            </div>

            {/* Mô tả chi tiết */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Mô tả chi tiết
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả cụ thể hiện tượng lỗi, phần mềm hoặc thiết bị liên quan..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition resize-y"
              />
            </div>

            {/* Mức ưu tiên & Tên người báo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="priority" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Mức độ ưu tiên
                </label>
                <div className="relative">
                  <select
                    id="priority"
                    name="priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TicketPriority)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white transition cursor-pointer appearance-none pr-10"
                  >
                    <option value="Low">Low - Không khẩn cấp, có thể chờ</option>
                    <option value="Medium">Medium - Ảnh hưởng công việc cá nhân</option>
                    <option value="High">High - Ảnh hưởng đến cả nhóm / phòng ban</option>
                    <option value="Critical">Critical - Toàn bộ hệ thống gián đoạn</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="reporter" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Tên người báo lỗi
                </label>
                <input
                  type="text"
                  id="reporter"
                  name="reporter"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A (Marketing)"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition"
                />
              </div>
            </div>

            {/* Submit Button (Khóa nút khi đang gửi) */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <span className="text-xs text-slate-500">
                💡 Gặp sự cố khẩn cấp? Nhắn tin nhanh qua Telegram Bot IT.
              </span>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-medium text-sm shadow-sm transition ${
                  isSubmitting
                    ? "bg-indigo-400 cursor-not-allowed opacity-80"
                    : "bg-indigo-600 hover:bg-indigo-700 hover:shadow focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Đang gửi ticket...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Gửi ticket
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
