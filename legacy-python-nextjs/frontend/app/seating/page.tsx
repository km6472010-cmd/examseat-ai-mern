"use client";

import * as React from "react";
import { toast } from "sonner";
import { Upload, Plus, Trash2, FileSpreadsheet, PencilLine, ScanText, Download } from "lucide-react";

import { useSessionContext } from "@/lib/session-context";
import { api, ApiError } from "@/lib/api";
import type { SeatingPlanOut } from "@/types";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface EditableRow {
  seat_id: string;
  row: number;
  column: number;
  student_id: string;
  student_name: string;
}

const SAMPLE_CSV = `seat_id,row,column,student_id,student_name\nA01,1,1,STU001,Student 1\nA02,1,2,STU002,Student 2\nA03,1,3,STU003,Student 3\nA04,1,4,STU004,Student 4\n`;

export default function SeatingPage() {
  const { currentSession, refreshCurrentSession } = useSessionContext();
  const [plan, setPlan] = React.useState<SeatingPlanOut | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [warnings, setWarnings] = React.useState<{ row_number: number; message: string }[]>([]);

  const load = React.useCallback(async () => {
    if (!currentSession) return;
    setLoading(true);
    const p = await api.getSeatingPlan(currentSession.id);
    setPlan(p);
    setLoading(false);
  }, [currentSession]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!currentSession) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No exam session selected"
        description="Create or select an exam session from the top bar before setting up a seating arrangement."
      />
    );
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Seating Arrangement</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Upload the official seating plan for <span className="font-medium text-foreground">{currentSession.exam_name}</span>.
        </p>
      </div>

      {plan && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Active seating plan</CardTitle>
              <CardDescription>
                {plan.seats.length} seat(s) &middot; source: <Badge variant="secondary" className="capitalize">{plan.source}</Badge>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SeatingTablePreview seats={plan.seats} />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="csv">
        <TabsList>
          <TabsTrigger value="csv"><Upload className="size-3.5" />CSV Upload</TabsTrigger>
          <TabsTrigger value="manual"><PencilLine className="size-3.5" />Manual Editor</TabsTrigger>
          <TabsTrigger value="ocr"><ScanText className="size-3.5" />Scan Image (OCR)</TabsTrigger>
        </TabsList>

        <TabsContent value="csv">
          <CsvUploadPanel
            sessionId={currentSession.id}
            onDone={async (p, w) => {
              setPlan(p);
              setWarnings(w);
              await refreshCurrentSession();
            }}
          />
          {warnings.length > 0 && (
            <Card className="mt-4 border-status-review/40 bg-status-review-bg/40">
              <CardHeader>
                <CardTitle className="text-status-review">Parsing warnings ({warnings.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                {warnings.map((w, i) => (
                  <div key={i}>Row {w.row_number}: {w.message}</div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="manual">
          <ManualEditorPanel
            sessionId={currentSession.id}
            initialSeats={plan?.seats}
            onSaved={async (p) => {
              setPlan(p);
              await refreshCurrentSession();
            }}
          />
        </TabsContent>

        <TabsContent value="ocr">
          <OcrPanel
            sessionId={currentSession.id}
            onSaved={async (p) => {
              setPlan(p);
              await refreshCurrentSession();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SeatingTablePreview({ seats }: { seats: SeatingPlanOut["seats"] }) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Seat</TableHead>
            <TableHead>Row</TableHead>
            <TableHead>Column</TableHead>
            <TableHead>Student ID</TableHead>
            <TableHead>Student Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {seats.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.seat_id}</TableCell>
              <TableCell>{s.row}</TableCell>
              <TableCell>{s.column}</TableCell>
              <TableCell>{s.assigned_student_id || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
              <TableCell>{s.assigned_student_name || "--"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CsvUploadPanel({
  sessionId,
  onDone,
}: {
  sessionId: number;
  onDone: (plan: SeatingPlanOut, warnings: { row_number: number; message: string }[]) => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleUpload() {
    if (!file) {
      toast.error("Choose a CSV file first.");
      return;
    }
    setUploading(true);
    try {
      const result = await api.uploadSeatingCsv(sessionId, file);
      toast.success(`Parsed ${result.rows_parsed} seat(s)${result.rows_skipped ? `, skipped ${result.rows_skipped}` : ""}.`);
      onDone(result.seating_plan, result.warnings);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_seating.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload seating CSV</CardTitle>
        <CardDescription>
          Required columns: <code className="rounded bg-muted px-1 py-0.5">seat_id, row, column</code>. Optional: <code className="rounded bg-muted px-1 py-0.5">student_id, student_name</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-sm" />
          <Button onClick={handleUpload} disabled={uploading || !file}>
            <Upload className="size-4" /> {uploading ? "Uploading..." : "Upload & Parse"}
          </Button>
          <Button variant="ghost" onClick={downloadSample}>
            <Download className="size-4" /> Sample CSV
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{SAMPLE_CSV}</pre>
      </CardContent>
    </Card>
  );
}

function emptyRow(): EditableRow {
  return { seat_id: "", row: 1, column: 1, student_id: "", student_name: "" };
}

function ManualEditorPanel({
  sessionId,
  initialSeats,
  onSaved,
}: {
  sessionId: number;
  initialSeats?: SeatingPlanOut["seats"];
  onSaved: (plan: SeatingPlanOut) => void;
}) {
  const [rows, setRows] = React.useState<EditableRow[]>(() =>
    initialSeats && initialSeats.length
      ? initialSeats.map((s) => ({
          seat_id: s.seat_id,
          row: s.row,
          column: s.column,
          student_id: s.assigned_student_id || "",
          student_name: s.assigned_student_name || "",
        }))
      : [emptyRow()]
  );
  const [saving, setSaving] = React.useState(false);

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    const valid = rows.filter((r) => r.seat_id.trim());
    if (!valid.length) {
      toast.error("Add at least one seat with a seat ID.");
      return;
    }
    setSaving(true);
    try {
      const plan = await api.saveManualSeating(
        sessionId,
        valid.map((r) => ({
          seat_id: r.seat_id.trim(),
          row: Number(r.row) || 1,
          column: Number(r.column) || 1,
          student_id: r.student_id.trim() || null,
          student_name: r.student_name.trim() || null,
        }))
      );
      toast.success(`Saved ${plan.seats.length} seat(s).`);
      onSaved(plan);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Manual seating editor</CardTitle>
          <CardDescription>Add rows, assign students, and mark seats without an assignment.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setRows((r) => [...r, emptyRow()])}>
          <Plus className="size-4" /> Add row
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-96 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Seat ID</TableHead>
                <TableHead className="w-20">Row</TableHead>
                <TableHead className="w-20">Column</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell><Input value={r.seat_id} onChange={(e) => updateRow(idx, { seat_id: e.target.value })} placeholder="A01" /></TableCell>
                  <TableCell><Input type="number" value={r.row} onChange={(e) => updateRow(idx, { row: Number(e.target.value) })} /></TableCell>
                  <TableCell><Input type="number" value={r.column} onChange={(e) => updateRow(idx, { column: Number(e.target.value) })} /></TableCell>
                  <TableCell><Input value={r.student_id} onChange={(e) => updateRow(idx, { student_id: e.target.value })} placeholder="STU001" /></TableCell>
                  <TableCell><Input value={r.student_name} onChange={(e) => updateRow(idx, { student_name: e.target.value })} placeholder="Student 1" /></TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save seating plan"}</Button>
      </CardContent>
    </Card>
  );
}

function OcrPanel({ sessionId, onSaved }: { sessionId: number; onSaved: (plan: SeatingPlanOut) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [rows, setRows] = React.useState<EditableRow[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  async function handleExtract() {
    if (!file) return;
    setExtracting(true);
    try {
      const result = await api.ocrExtractSeating(file);
      setWarnings(result.warnings);
      setRows(
        result.rows.map((r) => ({
          seat_id: String(r.seat_id ?? ""),
          row: Number(r.row ?? 1),
          column: Number(r.column ?? 1),
          student_id: String(r.student_id ?? ""),
          student_name: String(r.student_name ?? ""),
        }))
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "OCR extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleConfirm() {
    const valid = rows.filter((r) => r.seat_id.trim());
    if (!valid.length) {
      toast.error("No rows to save -- extract or add at least one seat.");
      return;
    }
    setSaving(true);
    try {
      const plan = await api.ocrConfirmSeating(
        sessionId,
        valid.map((r) => ({
          seat_id: r.seat_id.trim(),
          row: Number(r.row) || 1,
          column: Number(r.column) || 1,
          student_id: r.student_id.trim() || null,
          student_name: r.student_name.trim() || null,
        }))
      );
      toast.success(`Saved ${plan.seats.length} seat(s) from OCR.`);
      onSaved(plan);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan a seating-plan image</CardTitle>
        <CardDescription>
          Upload a photo or scan of a printed seating table. OCR extraction is a best-effort baseline -- always review
          and correct the extracted rows below before saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-sm" />
          <Button onClick={handleExtract} disabled={extracting || !file}>
            <ScanText className="size-4" /> {extracting ? "Extracting..." : "Extract table"}
          </Button>
        </div>

        {warnings.length > 0 && (
          <div className="rounded-md border border-status-review/40 bg-status-review-bg/40 p-3 text-xs text-muted-foreground">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Seat ID</TableHead>
                    <TableHead className="w-20">Row</TableHead>
                    <TableHead className="w-20">Column</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Student Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell><Input value={r.seat_id} onChange={(e) => updateRow(idx, { seat_id: e.target.value })} /></TableCell>
                      <TableCell><Input type="number" value={r.row} onChange={(e) => updateRow(idx, { row: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input type="number" value={r.column} onChange={(e) => updateRow(idx, { column: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input value={r.student_id} onChange={(e) => updateRow(idx, { student_id: e.target.value })} /></TableCell>
                      <TableCell><Input value={r.student_name} onChange={(e) => updateRow(idx, { student_name: e.target.value })} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleConfirm} disabled={saving}>{saving ? "Saving..." : "Confirm & save"}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
