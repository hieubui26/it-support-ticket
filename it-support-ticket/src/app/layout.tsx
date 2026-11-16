import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT Support Hub - AgenticPM S01",
  description: "Hệ thống quản lý IT Support Ticket đa kênh với AI Triage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased min-h-screen flex">
        {children}
      </body>
    </html>
  );
}
