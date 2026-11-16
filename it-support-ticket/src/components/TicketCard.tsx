import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Ticket, TicketPriority, TicketStatus } from "@/types/ticket";

interface TicketCardProps {
  ticket: Ticket;
  updatingId: string | null;
  onNextStatus: () => void;
  nextButtonText: string;
  nextButtonClass: string;
  formatTime: (iso?: string) => string;
}

export default function TicketCard({
  ticket,
  updatingId,
  onNextStatus,
  nextButtonText,
  nextButtonClass,
  formatTime,
}: TicketCardProps) {
  const {attributes, listeners, setNodeRef, transform, isDragging} = useDraggable({
    id: ticket.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-semibold text-gray-500">#{ticket.id}</span>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
          {ticket.priority}
        </span>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium text-gray-900 line-clamp-1">{ticket.title}</h3>
        <p className="text-sm text-gray-500 line-clamp-2">{ticket.description}</p>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{formatTime(ticket.created_at)}</span>
        {updatingId === ticket.id ? (
          <span className="animate-pulse">Updating...</span>
        ) : (
          <button
            onClick={onNextStatus}
            className={nextButtonClass}
          >
            {nextButtonText}
          </button>
        )}
      </div>
    </div>
  );
}
