import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session-context";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "ExamSeat AI -- Exam Seating Verification",
  description: "Intelligent exam seating arrangement verification system",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans antialiased">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
