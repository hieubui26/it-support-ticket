"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Ticket, TicketPriority, TicketStatus } from "@/types/ticket";
import TicketCard from "@/components/TicketCard";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

function DroppableColumn({
  status,
  children,
}: {
  status: TicketStatus;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`bg-slate-200/60 rounded-2xl p-4 flex flex-col border border-slate-200 min-h-[500px] ${isOver ? "ring-2 ring-indigo-400" : ""
        }`}
    >
      {children}
    </section>
  );
}

export default function DashboardPage() {
  // State definitions
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPriorities, setSelectedPriorities] = useState<TicketPriority[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">(
    "connecting"
  );

  // Fetch tickets
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

  // Realtime listener
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("dashboard-tickets-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tickets",
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newTicket = payload.new as Ticket;
          setTickets((prev) => {
            if (prev.some((t) => t.id === newTicket.id)) return prev;
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
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CLOSED" || status === "CHANNEL_ERROR")
          setRealtimeStatus("disconnected");
        else setRealtimeStatus("connecting");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Status change handler (optimistic UI)
  const handleStatusChange = async (ticketId: string, nextStatus: TicketStatus) => {
    try {
      setUpdatingId(ticketId);
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: nextStatus } : t))
      );
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Không thể cập nhật trạng thái.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi đổi trạng thái.";
      setErrorMessage(msg);
      // Re‑fetch to ensure UI is in sync
      fetchTickets();
    } finally {
      setUpdatingId(null);
    }
  };

  // Filtering & column data
  const filteredTickets = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesPriority =
        selectedPriorities.length === 0 || selectedPriorities.includes(ticket.priority);
      const matchesTitle = ticket.title.toLowerCase().includes(normalizedQuery);
      return matchesPriority && matchesTitle;
    });
  }, [tickets, selectedPriorities, searchQuery]);

  const newTickets = useMemo(() => filteredTickets.filter((t) => t.status === "New"), [
    filteredTickets,
  ]);
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

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: undefined }));

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    const ticketId = active.id as string;
    const targetStatus = over.id as string;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    const currentStatus = ticket.status;
    const allowed =
      (currentStatus === "New" && targetStatus === "In Progress") ||
      (currentStatus === "In Progress" && targetStatus === "Resolved");
    if (allowed) {
      void handleStatusChange(ticketId, targetStatus as TicketStatus);
    }
  };

  // Droppable refs

  return (
    <div className="flex-1 flex min-h-screen bg-slate-100">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 min-h-screen border-r border-slate-800">
        <div>
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
          <nav className="p-4 space-y-1.5">
            <Link href="/" className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 font-medium text-sm transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              Gửi yêu cầu (Portal)
            </Link>
            <Link href="/dashboard" className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-indigo-600/15 text-indigo-400 font-medium text-sm transition border border-indigo-500/20">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a２ ２ ０ ００-２ ２" /></svg>
              Bảng Kanban (Dashboard)
            </Link>
          </nav>
        </div>
        {/* Realtime status */}
        <div className="p-4 border-t border-slate-800">
          <div className="p-3 rounded-lg bg-slate-800/60 text-xs text-slate-400 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">Supabase Realtime</span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${realtimeStatus === "connected"
                ? "bg-emerald-500/10 text-emerald-400"
                : realtimeStatus === "connecting"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-rose-500/10 text-rose-400"
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${realtimeStatus === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : realtimeStatus === "connecting"
                    ? "bg-amber-400"
                    : "bg-rose-400"
                  }`}></span>
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
        <header className="min-h-20 bg-white border-b border-slate-200 px-8 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Bảng theo dõi sự cố (Kanban)</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200">
                Tổng cộng: {filteredTickets.length} tickets
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Theo dõi luồng xử lý ticket đa kênh từ Portal và Telegram Bot</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ticket-search" className="sr-only">
              Tìm ticket theo tiêu đề
            </label>
            <input
              id="ticket-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm theo tiêu đề..."
              className="w-full sm:w-48 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo mức độ ưu tiên">
              {(["Low", "Medium", "High", "Critical"] as TicketPriority[]).map((priority) => {
                const isSelected = selectedPriorities.includes(priority);

                return (
                  <button
                    key={priority}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedPriorities((current) =>
                        current.includes(priority)
                          ? current.filter((selected) => selected !== priority)
                          : [...current, priority]
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
                    }`}
                  >
                    {priority}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedPriorities([])}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>
        </header>

        {/* Error banner */}
        {errorMessage && (
          <div className="mx-8 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <span>⚠️ {errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="font-bold hover:text-rose-900">✕</button>
          </div>
        )}

        <div className="flex-1 p-8 overflow-y-auto">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <svg className="w-8 h-8 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              <span className="text-sm">Đang tải dữ liệu tickets...</span>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto items-start">
                {/* New Column */}
                <DroppableColumn status="New">
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
                </DroppableColumn>

                {/* In Progress Column */}
                <DroppableColumn status="In Progress">
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
                </DroppableColumn>

                {/* Resolved Column */}
                <DroppableColumn status="Resolved">
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
                        Không có ticket đã hoàn thành
                      </div>
                    ) : (
                      resolvedTickets.map((ticket) => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          updatingId={updatingId}
                          onNextStatus={() => { }}
                          nextButtonText=""
                          nextButtonClass=""
                          formatTime={formatTime}
                        />
                      ))
                    )}
                  </div>
                </DroppableColumn>
              </div>
            </DndContext>
          )}
        </div>
      </main>
    </div>
  );
}
