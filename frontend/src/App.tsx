import { BrowserRouter, Routes, Route } from "react-router-dom";

import { SessionProvider } from "@/lib/session-context";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";

import DashboardPage from "@/pages/DashboardPage";
import SeatingPage from "@/pages/SeatingPage";
import ClassroomPage from "@/pages/ClassroomPage";
import VerifyPage from "@/pages/VerifyPage";
import ResultsPage from "@/pages/ResultsPage";
import ReviewPage from "@/pages/ReviewPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/seating" element={<SeatingPage />} />
            <Route path="/classroom" element={<ClassroomPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppShell>
        <Toaster position="top-right" richColors closeButton />
      </SessionProvider>
    </BrowserRouter>
  );
}
