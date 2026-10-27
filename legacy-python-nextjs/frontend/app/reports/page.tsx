"use client";

import * as React from "react";
import { FileBarChart, FileText, FileSpreadsheet, FileJson } from "lucide-react";

import { useSessionContext } from "@/lib/session-context";
import { api } from "@/lib/api";
import type { ReportSummary, VerificationResultOut } from "@/types";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/seating/status-badge";
import { ConfidenceBar } from "@/components/seating/confidence-bar";

export default function ReportsPage() {
  const { currentSession } = useSessionContext();
  const [summary, setSummary] = React.useState<ReportSummary | null>(null);
  const [results, setResults] = React.useState<VerificationResultOut[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!currentSession) return;
    setLoading(true);
    Promise.all([api.getReportSummary(currentSession.id), api.getResults(currentSession.id)])
      .then(([s, r]) => {
        setSummary(s);
        setResults(r);
      })
      .catch(() => {
        setSummary(null);
        setResults([]);
      })
      .finally(() => setLoading(false));
  }, [currentSession]);

  if (!currentSession) {
    return <EmptyState icon={FileBarChart} title="No exam session selected" description="Select an exam session to generate its verification report." />;
  }

  if (!loading && results.length === 0) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="No verification results to report yet"
        description="Run AI verification from the Verify Exam page first, then come back here to export a report."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Downloadable verification report for {currentSession.exam_name}.</p>
        </div>
        <div className="flex gap-2">
          <a href={api.downloadReportUrl(currentSession.id, "pdf")} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><FileText className="size-4" /> PDF</Button>
          </a>
          <a href={api.downloadReportUrl(currentSession.id, "csv")} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><FileSpreadsheet className="size-4" /> CSV</Button>
          </a>
          <a href={api.downloadReportUrl(currentSession.id, "json")} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><FileJson className="size-4" /> JSON</Button>
          </a>
        </div>
      </div>

      {summary && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Exam information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <InfoField label="Exam" value={summary.exam_name} />
              <InfoField label="Room" value={summary.room} />
              <InfoField label="Date" value={new Date(summary.exam_date).toLocaleDateString()} />
              <InfoField label="Seats" value={String(summary.total_seats)} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Total" value={summary.total_seats} />
            <StatCard label="Occupied" value={summary.occupied} />
            <StatCard label="Empty" value={summary.empty} />
            <StatCard label="Correct" value={summary.correct} />
            <StatCard label="Wrong Seat" value={summary.wrong_seat} />
            <StatCard label="Unassigned" value={summary.unassigned} />
            <StatCard label="Needs Review" value={summary.needs_review} suffix="" />
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Detailed results</CardTitle>
          <CardDescription>The same data included in the exported report.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[28rem] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seat</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results
                  .slice()
                  .sort((a, b) => a.seat_id.localeCompare(b.seat_id))
                  .map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.seat_id}</TableCell>
                      <TableCell>{r.assigned_student_id || "--"}</TableCell>
                      <TableCell>{r.detected_student_id || (r.status === "EMPTY" ? "None" : "Unknown")}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell><ConfidenceBar value={r.overall_confidence} /></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This report is generated by an AI-assisted verification tool. Low-confidence cases are marked &ldquo;Needs Review&rdquo;
        and require human confirmation -- this system does not make autonomous disciplinary decisions.
      </p>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
