"use client";

import * as React from "react";
import Link from "next/link";
import {
  Armchair,
  Users,
  CircleDashed,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend } from "recharts";

import { useSessionContext } from "@/lib/session-context";
import { api } from "@/lib/api";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  Correct: "var(--status-correct)",
  "Wrong Seat": "var(--status-wrong)",
  "Needs Review": "var(--status-review)",
  Empty: "var(--status-empty)",
  Unassigned: "var(--status-unassigned)",
};

export default function DashboardPage() {
  const { currentSession, sessions, setCurrentSessionId, loading, refreshSessions } = useSessionContext();
  const [runningDemo, setRunningDemo] = React.useState(false);

  async function handleRunDemo() {
    setRunningDemo(true);
    try {
      const session = await api.runDemo();
      await refreshSessions();
      setCurrentSessionId(session.id);
      toast.success("Demo session generated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run demo");
    } finally {
      setRunningDemo(false);
    }
  }

  if (loading) return <DashboardSkeleton />;

  if (!currentSession) {
    return (
      <div className="space-y-6">
        <PageHeading title="Dashboard" description="Overview of your examination sessions." />
        <EmptyState
          icon={Armchair}
          title="No exam session selected"
          description="Create a new exam session to get started, or run the built-in demo to see the complete verification pipeline with synthetic data."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRunDemo} disabled={runningDemo}>
                <Sparkles className="size-4" /> {runningDemo ? "Generating..." : "Run Demo"}
              </Button>
            </div>
          }
        />
        {sessions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <SessionsTable sessions={sessions} onSelect={setCurrentSessionId} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const s = currentSession;
  const chartData = [
    { name: "Correct", value: s.correct },
    { name: "Wrong Seat", value: s.wrong_seat },
    { name: "Needs Review", value: s.needs_review },
    { name: "Empty", value: s.empty },
    { name: "Unassigned", value: s.unassigned },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <PageHeading
        title={s.exam_name}
        description={`${s.room} · ${new Date(s.exam_date).toLocaleDateString()}${s.is_demo ? " · Synthetic demo data" : ""}`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Seats" value={s.total_seats} icon={Armchair} />
        <StatCard label="Occupied" value={s.occupied} icon={Users} accentClassName="bg-info/15 text-info" />
        <StatCard label="Empty" value={s.empty} icon={CircleDashed} accentClassName="bg-status-empty-bg text-status-empty" />
        <StatCard label="Correct" value={s.correct} icon={CheckCircle2} accentClassName="bg-status-correct-bg text-status-correct" />
        <StatCard label="Wrong Seat" value={s.wrong_seat} icon={XCircle} accentClassName="bg-status-wrong-bg text-status-wrong" />
        <StatCard label="Needs Review" value={s.needs_review} icon={AlertTriangle} accentClassName="bg-status-review-bg text-status-review" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Verification breakdown</CardTitle>
            <CardDescription>Overall accuracy: {s.accuracy_pct}%</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No verification results yet.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
            <CardDescription>Follow the workflow to complete this exam&apos;s verification.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <NextStepLink href="/seating" title="1. Seating Arrangement" done={s.total_seats > 0} description="Upload or edit the official seating plan." />
            <NextStepLink href="/classroom" title="2. Classroom Setup" done={!!s.classroom_layout_id} description="Calibrate seat positions for this room." />
            <NextStepLink href="/verify" title="3. Verify Exam" done={s.occupied > 0 || s.empty > 0} description="Upload a photo or video and run AI verification." />
            <NextStepLink href="/review" title="4. Human Verification" done={s.needs_review === 0 && (s.occupied > 0 || s.empty > 0)} description={`${s.needs_review} case(s) need review.`} />
          </CardContent>
        </Card>
      </div>

      {sessions.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>All sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionsTable sessions={sessions} onSelect={setCurrentSessionId} activeId={s.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NextStepLink({ href, title, description, done }: { href: string; title: string; description: string; done: boolean }) {
  return (
    <Link href={href} className="group flex flex-col justify-between rounded-lg border p-3 transition-colors hover:bg-accent">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        {done ? <Badge variant="success">Done</Badge> : <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

function SessionsTable({ sessions, onSelect, activeId }: { sessions: ReturnType<typeof useSessionContext>["sessions"]; onSelect: (id: number) => void; activeId?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Exam</TableHead>
          <TableHead>Room</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Accuracy</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <TableRow key={s.id} className={s.id === activeId ? "bg-accent/40" : ""}>
            <TableCell className="font-medium">{s.exam_name}</TableCell>
            <TableCell>{s.room}</TableCell>
            <TableCell>{new Date(s.exam_date).toLocaleDateString()}</TableCell>
            <TableCell><Badge variant="secondary" className="capitalize">{s.status}</Badge></TableCell>
            <TableCell>{s.total_seats ? `${s.accuracy_pct}%` : "--"}</TableCell>
            <TableCell>
              <Button size="sm" variant="ghost" onClick={() => onSelect(s.id)}>Open</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
