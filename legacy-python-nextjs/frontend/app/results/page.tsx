"use client";

import * as React from "react";
import { ClipboardList, Grid3x3, List, Search } from "lucide-react";

import { useSessionContext } from "@/lib/session-context";
import { api, overlayUrl } from "@/lib/api";
import type { ClassroomLayoutOut, SeatingPlanOut, VerificationResultOut, VerificationStatus } from "@/types";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, STATUS_DOT_CLASS } from "@/components/seating/status-badge";
import { ConfidenceBar } from "@/components/seating/confidence-bar";
import { SeatingMap } from "@/components/seating/seating-map";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_STATUSES: VerificationStatus[] = ["CORRECT", "WRONG_SEAT", "NEEDS_REVIEW", "EMPTY", "UNASSIGNED"];

export default function ResultsPage() {
  const { currentSession } = useSessionContext();
  const [results, setResults] = React.useState<VerificationResultOut[]>([]);
  const [layout, setLayout] = React.useState<ClassroomLayoutOut | null>(null);
  const [plan, setPlan] = React.useState<SeatingPlanOut | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [selectedSeatId, setSelectedSeatId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!currentSession) return;
    setLoading(true);
    Promise.all([
      api.getResults(currentSession.id),
      currentSession.classroom_layout_id ? api.getLayout(currentSession.classroom_layout_id) : Promise.resolve(null),
      api.getSeatingPlan(currentSession.id),
    ])
      .then(([r, l, p]) => {
        setResults(r);
        setLayout(l);
        setPlan(p);
      })
      .finally(() => setLoading(false));
  }, [currentSession]);

  if (!currentSession) {
    return <EmptyState icon={ClipboardList} title="No exam session selected" description="Select an exam session to view its verification results." />;
  }

  if (!loading && results.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No verification results yet"
        description="Run AI verification on a classroom photo or video from the Verify Exam page to see results here."
      />
    );
  }

  const resultsBySeat = new Map(results.map((r) => [r.seat_id, r]));
  const filtered = results.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search && !r.seat_id.toLowerCase().includes(search.toLowerCase()) && !(r.assigned_student_id || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selectedResult = selectedSeatId ? resultsBySeat.get(selectedSeatId) : null;
  const jobId = results[0]?.job_id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Results</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Complete verification results for {currentSession.exam_name}.</p>
      </div>

      <Tabs defaultValue="table">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="table"><List className="size-3.5" /> Table</TabsTrigger>
            <TabsTrigger value="map"><Grid3x3 className="size-3.5" /> Seating Map</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input placeholder="Search seat or student..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="table">
          <Card>
            <CardContent className="pt-5">
              <div className="max-h-[32rem] overflow-y-auto rounded-md border">
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
                    {filtered.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedSeatId(r.seat_id)}>
                        <TableCell className="font-medium">{r.seat_id}</TableCell>
                        <TableCell>{r.assigned_student_name || r.assigned_student_id || <span className="text-muted-foreground">--</span>}</TableCell>
                        <TableCell>{r.detected_student_id || <span className="text-muted-foreground">{r.status === "EMPTY" ? "None" : "Unverified"}</span>}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell><ConfidenceBar value={r.overall_confidence} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="map">
          <Card>
            <CardHeader>
              <CardTitle>Interactive seating map</CardTitle>
            </CardHeader>
            <CardContent>
              <SeatingMap
                seats={layout?.seats ?? null}
                fallbackSeats={plan?.seats.map((s) => ({ seat_id: s.seat_id, row: s.row, column: s.column }))}
                resultsBySeat={resultsBySeat}
                onSelect={setSelectedSeatId}
                selectedSeatId={selectedSeatId}
              />
              <Legend />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedResult} onOpenChange={(open) => !open && setSelectedSeatId(null)}>
        <DialogContent className="max-w-lg">
          {selectedResult && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Seat {selectedResult.seat_id}
                  <StatusBadge status={selectedResult.status} />
                </DialogTitle>
                <DialogDescription>{selectedResult.explanation}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Assigned student</p>
                  <p className="font-medium">{selectedResult.assigned_student_name || selectedResult.assigned_student_id || "--"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Detected identity</p>
                  <p className="font-medium">{selectedResult.detected_student_id || "Unverified"}</p>
                </div>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <ConfidenceRow label="Detection confidence" value={selectedResult.detection_confidence} />
                <ConfidenceRow label="Seat match confidence" value={selectedResult.seat_match_confidence} />
                <ConfidenceRow label="Identity confidence" value={selectedResult.identity_confidence} />
                <ConfidenceRow label="Spatial consistency" value={selectedResult.spatial_consistency} />
                <div className="my-1 border-t" />
                <ConfidenceRow label="Overall confidence" value={selectedResult.overall_confidence} bold />
              </div>
              {jobId && (
                <div className="overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={overlayUrl(jobId)!} alt="Evidence overlay" className="w-full" />
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfidenceRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "text-sm font-medium" : "text-xs text-muted-foreground"}>{label}</span>
      <ConfidenceBar value={value} />
    </div>
  );
}

function Legend() {
  const items: { status: VerificationStatus; label: string }[] = [
    { status: "CORRECT", label: "Correct" },
    { status: "WRONG_SEAT", label: "Wrong Seat" },
    { status: "NEEDS_REVIEW", label: "Needs Review" },
    { status: "EMPTY", label: "Empty" },
    { status: "UNASSIGNED", label: "Unassigned" },
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {items.map((i) => (
        <span key={i.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-2.5 rounded-full ${STATUS_DOT_CLASS[i.status]}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
