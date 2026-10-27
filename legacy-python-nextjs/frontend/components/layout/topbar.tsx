"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionContext } from "@/lib/session-context";
import { api } from "@/lib/api";

const STATUS_BADGE: Record<string, "default" | "secondary" | "success" | "review"> = {
  draft: "secondary",
  ready: "secondary",
  processing: "review",
  completed: "success",
  archived: "secondary",
};

export function Topbar() {
  const router = useRouter();
  const { sessions, currentSession, currentSessionId, setCurrentSessionId, refreshSessions } = useSessionContext();
  const [newOpen, setNewOpen] = React.useState(false);
  const [examName, setExamName] = React.useState("");
  const [room, setRoom] = React.useState("");
  const [examDate, setExamDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = React.useState(false);
  const [runningDemo, setRunningDemo] = React.useState(false);

  async function handleCreate() {
    if (!examName || !room || !examDate) {
      toast.error("Exam name, room, and date are all required.");
      return;
    }
    setCreating(true);
    try {
      const session = await api.createSession({ exam_name: examName, room, exam_date: examDate });
      await refreshSessions();
      setCurrentSessionId(session.id);
      setNewOpen(false);
      setExamName("");
      setRoom("");
      toast.success(`Created session "${session.exam_name}"`);
      router.push("/seating");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  }

  async function handleRunDemo() {
    setRunningDemo(true);
    try {
      const session = await api.runDemo();
      await refreshSessions();
      setCurrentSessionId(session.id);
      toast.success("Demo session generated with synthetic data.");
      router.push("/results");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run demo");
    } finally {
      setRunningDemo(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card px-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-72 justify-between">
            <span className="truncate">
              {currentSession ? currentSession.exam_name : "Select an exam session"}
            </span>
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Exam sessions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {sessions.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No sessions yet.</div>}
          {sessions.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => setCurrentSessionId(s.id)} className="flex items-center justify-between">
              <span className="truncate">{s.exam_name}</span>
              {s.id === currentSessionId && <Badge variant="secondary">Current</Badge>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNewOpen(true)}>
            <Plus className="size-4" /> New exam session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {currentSession && (
        <Badge variant={STATUS_BADGE[currentSession.status] ?? "secondary"} className="hidden sm:inline-flex capitalize">
          {currentSession.status.replace("_", " ")}
        </Badge>
      )}
      {currentSession?.is_demo && <Badge variant="outline" className="hidden sm:inline-flex">Synthetic Demo Data</Badge>}

      <div className="flex-1" />

      <Button variant="secondary" size="sm" onClick={handleRunDemo} disabled={runningDemo}>
        <Sparkles className="size-4" />
        {runningDemo ? "Generating..." : "Run Demo"}
      </Button>
      <Button size="sm" onClick={() => setNewOpen(true)}>
        <Plus className="size-4" /> New Session
      </Button>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create exam session</DialogTitle>
            <DialogDescription>
              Each exam session tracks its own seating arrangement, classroom calibration, and verification results.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="exam-name">Exam name</Label>
              <Input id="exam-name" value={examName} onChange={(e) => setExamName(e.target.value)} placeholder="Database Systems -- Midterm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="room">Room</Label>
                <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="CSE-204" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create session"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
