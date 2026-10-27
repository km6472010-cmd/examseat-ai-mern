import * as React from "react";
import { api } from "@/lib/api";
import type { ExamSessionSummary } from "@/types";

interface SessionContextValue {
  sessions: ExamSessionSummary[];
  currentSession: ExamSessionSummary | null;
  currentSessionId: string | null;
  loading: boolean;
  setCurrentSessionId: (id: string | null) => void;
  refreshSessions: () => Promise<ExamSessionSummary[]>;
  refreshCurrentSession: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

const STORAGE_KEY = "examseat.currentSessionId";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = React.useState<ExamSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionIdState] = React.useState<string | null>(null);
  const [currentSession, setCurrentSession] = React.useState<ExamSessionSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshSessions = React.useCallback(async () => {
    try {
      const data = await api.listSessions();
      setSessions(data);
      return data;
    } catch {
      setSessions([]);
      return [];
    }
  }, []);

  const refreshCurrentSession = React.useCallback(async () => {
    const id = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (id) {
      try {
        const s = await api.getSession(id);
        setCurrentSession(s);
        setCurrentSessionIdState(id);
        return;
      } catch {
        // session no longer exists
      }
    }
    setCurrentSession(null);
    setCurrentSessionIdState(null);
  }, []);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshSessions();
      await refreshCurrentSession();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCurrentSessionId = React.useCallback((id: string | null) => {
    setCurrentSessionIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  React.useEffect(() => {
    if (currentSessionId) {
      api.getSession(currentSessionId).then(setCurrentSession).catch(() => setCurrentSession(null));
    } else {
      setCurrentSession(null);
    }
  }, [currentSessionId]);

  return (
    <SessionContext.Provider
      value={{ sessions, currentSession, currentSessionId, loading, setCurrentSessionId, refreshSessions, refreshCurrentSession }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used within SessionProvider");
  return ctx;
}
