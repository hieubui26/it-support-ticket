"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Ticket, TicketPriority, TicketStatus } from "@/types/ticket";

export default function DashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<"ALL" | TicketPriority>("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  // 1. Tải danh sách tickets từ GET /api/tickets
  const fetchTickets = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/tickets");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Không thể tải danh sách ticket.");
      }

      setTickets(data.tickets || []);
      setErrorMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // 2. Lắng nghe Supabase Realtime (INSERT & UPDATE)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // Khởi tạo channel lắng nghe thay đổi trên bảng public.tickets
    const channel = supabase
      .channel("dashboard-tickets-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newTicket = payload.new as Ticket;
            setTickets((prev) => {
              // Tránh trùng thẻ: chỉ thêm nếu ID chưa tồn tại trong danh sách
              if (prev.some((t) => t.id === newTicket.id)) {
                return prev;
              }
              return [newTicket, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const updatedTicket = payload.new as Ticket;
            setTickets((prev) =>
              prev.map((t) => (t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t))
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setTickets((prev) => prev.filter((t) => t.id !== deletedId));
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeStatus("disconnected");
        } else {
          setRealtimeStatus("connecting");
        }
      });

    // 3. Dọn subscription khi rời trang
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 4. Hàm xử lý chuyển trạng thái ticket qua PATCH /api/tickets/[id]
  const handleStatusChange = async (ticketId: string, nextStatus: TicketStatus) => {
    try {
      setUpdatingId(ticketId);

      // Cập nhật lạc quan (Optimistic update) trên giao diện ngay lập tức
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: nextStatus } : t))
      );

      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Không thể cập nhật trạng thái.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi đổi trạng thái.";
      setErrorMessage(msg);
      // Tải lại dữ liệu nếu cập nhật lỗi để đồng bộ trạng thái chính xác
      fetchTickets();
    } finally {
      setUpdatingId(null);
    }
  };

  // 5. Lọc tickets theo mức ưu tiên
  const filteredTickets = useMemo(() => {
    if (selectedPriority === "ALL") return tickets;
    return tickets.filter((t) => t.priority === selectedPriority);
  }, [tickets, selectedPriority]);

  // Phân chia theo 3 cột Kanban
  const newTickets = useMemo(
    () => filteredTickets.filter((t) => t.status === "New"),
    [filteredTickets]
  );
  const inProgressTickets = useMemo(
    () => filteredTickets.filter((t) => t.status === "In Progress"),
    [filteredTickets]
  );
  const resolvedTickets = useMemo(
    () => filteredTickets.filter((t) => t.status === "Resolved"),
    [filteredTickets]
  );

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex-1 flex min-h-screen bg-slate-100">
      {/* SIDEBAR TỐI MÀU (Đồng bộ với Portal) */}
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
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 font-medium text-sm transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Gửi yêu cầu (Portal)
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-indigo-600/15 text-indigo-400 font-medium text-sm transition border border-indigo-500/20"
            >
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Bảng Kanban (Dashboard)
            </Link>
          </nav>
        </div>

        {/* Realtime Status Indicator */}
        <div className="p-4 border-t border-slate-800">
          <div className="p-3 rounded-lg bg-slate-800/60 text-xs text-slate-400 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">Supabase Realtime</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  realtimeStatus === "connected"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : realtimeStatus === "connecting"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-rose-500/10 text-rose-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    realtimeStatus === "connected"
                      ? "bg-emerald-400 animate-pulse"
                      : realtimeStatus === "connecting"
                      ? "bg-amber-400"
                      : "bg-rose-400"
                  }`}
                />
                {realtimeStatus === "connected"
                  ? "Connected"
                  : realtimeStatus === "connecting"
                  ? "Connecting"
                  : "Disconnected"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Tự động đồng bộ các tab</p>
          </div>
        </div>
      </aside>

      {/* MAIN KANBAN AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* TOP HEADER */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Bảng theo dõi sự cố (Kanban)</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200">
                Tổng cộng: {filteredTickets.length} tickets
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Theo dõi luồng xử lý ticket đa kênh từ Portal và Telegram Bot</p>
          </div>

          {/* BỘ LỌC THEO MỨC ƯU TIÊN */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <span className="text-xs font-semibold text-slate-500 px-2.5">Ưu tiên:</span>
            <button
              onClick={() => setSelectedPriority("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedPriority === "ALL"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setSelectedPriority("Critical")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 transition ${
                selectedPriority === "Critical"
                  ? "bg-white shadow-sm ring-1 ring-rose-300"
                  : "hover:bg-rose-50"
              }`}
            >
              Critical
            </button>
            <button
              onClick={() => setSelectedPriority("High")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-orange-700 transition ${
                selectedPriority === "High"
                  ? "bg-white shadow-sm ring-1 ring-orange-300"
                  : "hover:bg-orange-50"
              }`}
            >
              High
            </button>
            <button
              onClick={() => setSelectedPriority("Medium")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 transition ${
                selectedPriority === "Medium"
                  ? "bg-white shadow-sm ring-1 ring-amber-300"
                  : "hover:bg-amber-50"
              }`}
            >
              Medium
            </button>
            <button
              onClick={() => setSelectedPriority("Low")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 transition ${
                selectedPriority === "Low"
                  ? "bg-white shadow-sm ring-1 ring-slate-300"
                  : "hover:bg-slate-200/60"
              }`}
            >
              Low
            </button>
          </div>
        </header>

        {/* THÔNG BÁO LỖI (NẾU CÓ) */}
        {errorMessage && (
          <div className="mx-8 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <span>⚠️ {errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="font-bold hover:text-rose-900">
              ✕
            </button>
          </div>
        )}

        {/* KANBAN BOARD CONTAINER */}
        <div className="flex-1 p-8 overflow-y-auto">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <svg className="w-8 h-8 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Đang tải dữ liệu tickets...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto items-start">
              {/* ============================================================= */}
              {/* CỘT 1: MỚI TIẾP NHẬN (NEW) */}
              {/* ============================================================= */}
              <section className="bg-slate-200/60 rounded-2xl p-4 flex flex-col border border-slate-200 min-h-[500px]">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-300/70">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <h3 className="font-bold text-slate-800 text-sm tracking-wide">MỚI TIẾP NHẬN</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-300/80 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {newTickets.length}
                  </span>
                </div>

                <div className="space-y-3.5 flex-1">
                  {newTickets.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      Không có ticket mới
                    </div>
                  ) : (
                    newTickets.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        updatingId={updatingId}
                        onNextStatus={() => handleStatusChange(ticket.id, "In Progress")}
                        nextButtonText="Bắt đầu xử lý →"
                        nextButtonClass="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border-indigo-200"
                        formatTime={formatTime}
                      />
                    ))
                  )}
                </div>
              </section>

              {/* ============================================================= */}
              {/* CỘT 2: ĐANG XỬ LÝ (IN PROGRESS) */}
              {/* ============================================================= */}
              <section className="bg-slate-200/60 rounded-2xl p-4 flex flex-col border border-slate-200 min-h-[500px]">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-300/70">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <h3 className="font-bold text-slate-800 text-sm tracking-wide">ĐANG XỬ LÝ</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-300/80 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {inProgressTickets.length}
                  </span>
                </div>

                <div className="space-y-3.5 flex-1">
                  {inProgressTickets.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      Chưa có ticket đang xử lý
                    </div>
                  ) : (
                    inProgressTickets.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        updatingId={updatingId}
                        onNextStatus={() => handleStatusChange(ticket.id, "Resolved")}
                        nextButtonText="Hoàn tất ✓"
                        nextButtonClass="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-200"
                        formatTime={formatTime}
                      />
                    ))
                  )}
                </div>
              </section>

              {/* ============================================================= */}
              {/* CỘT 3: HOÀN TẤT (RESOLVED) */}
              {/* ============================================================= */}
              <section className="bg-slate-200/60 rounded-2xl p-4 flex flex-col border border-slate-200 min-h-[500px]">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-300/70">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <h3 className="font-bold text-slate-800 text-sm tracking-wide">HOÀN TẤT</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-300/80 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {resolvedTickets.length}
                  </span>
                </div>

                <div className="space-y-3.5 flex-1">
                  {resolvedTickets.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      Chưa có ticket hoàn tất
                    </div>
                  ) : (
                    resolvedTickets.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        updatingId={updatingId}
                        isResolved
                        formatTime={formatTime}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: THẺ TICKET TRÊN KANBAN
// =============================================================================
interface TicketCardProps {
  ticket: Ticket;
  updatingId: string | null;
  onNextStatus?: () => void;
  nextButtonText?: string;
  nextButtonClass?: string;
  isResolved?: boolean;
  formatTime: (time?: string) => string;
}

function TicketCard({
  ticket,
  updatingId,
  onNextStatus,
  nextButtonText,
  nextButtonClass,
  isResolved,
  formatTime,
}: TicketCardProps) {
  const isCritical = ticket.priority === "Critical";
  const isUpdating = updatingId === ticket.id;

  return (
    <div
      className={`bg-white rounded-xl p-4 shadow-sm transition hover:shadow-md ${
        isCritical
          ? "border-2 border-rose-400"
          : "border border-slate-200/80"
      } ${isResolved ? "opacity-90 hover:opacity-100" : ""}`}
    >
      {/* Header card: Priority badge & Source badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        {/* Priority Badge */}
        {ticket.priority === "Critical" && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
            CRITICAL
          </span>
        )}
        {ticket.priority === "High" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            HIGH
          </span>
        )}
        {ticket.priority === "Medium" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            MEDIUM
          </span>
        )}
        {ticket.priority === "Low" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
            LOW
          </span>
        )}

        {/* Source Badge */}
        {ticket.source === "telegram" ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
            <svg className="w-3 h-3 text-sky-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
            Telegram
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Portal
          </span>
        )}
      </div>

      {/* Title */}
      <h4
        className={`font-bold text-sm mb-1 leading-snug ${
          isResolved ? "line-through text-slate-500" : "text-slate-900"
        }`}
      >
        {ticket.title}
      </h4>

      {/* Description */}
      {ticket.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{ticket.description}</p>
      )}

      {/* Meta info: Category, Reporter, Time */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2.5 border-t border-slate-100 mb-3">
        <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          #{ticket.category || "General"}
        </span>
        <div className="text-right">
          <span className="text-slate-600 block">{ticket.reporter_name || "Ẩn danh"}</span>
          <span className="text-slate-400 text-[10px]">{formatTime(ticket.created_at)}</span>
        </div>
      </div>

      {/* Action button */}
      {isResolved ? (
        <div className="w-full py-1 text-center text-xs text-emerald-600 font-semibold bg-emerald-50/60 rounded-lg border border-emerald-100">
          ✓ Đã hoàn tất
        </div>
      ) : onNextStatus ? (
        <button
          onClick={onNextStatus}
          disabled={isUpdating}
          className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 border ${nextButtonClass} ${
            isUpdating ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          {isUpdating ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Đang cập nhật...
            </>
          ) : (
            nextButtonText
          )}
        </button>
      ) : null}
    </div>
  );
}
