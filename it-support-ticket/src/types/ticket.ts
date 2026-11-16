export type TicketPriority = "Low" | "Medium" | "High" | "Critical";
export type TicketStatus = "New" | "In Progress" | "Resolved";
export type TicketSource = "portal" | "telegram";

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  status: TicketStatus;
  source: TicketSource;
  reporter_name: string;
  original_text?: string | null;
  telegram_message_id?: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}
