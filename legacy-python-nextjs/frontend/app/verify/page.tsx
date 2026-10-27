"use client";

import * as React from "react";
import { toast } from "sonner";
import { ScanEye, Upload, Video, ImageIcon, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { useSessionContext } from "@/lib/session-context";
import { api, ApiError, overlayUrl } from "@/lib/api";
import type { VerificationResultOut, ProcessingJobOut } from "@/types";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/seating/status-badge";

export default function VerifyPage() {
  const { currentSession, refreshCurrentSession } = useSessionContext();

  if (!currentSession) {
    return (
      <EmptyState
        icon={ScanEye}
        title="No exam session selected"
        description="Create or select an exam session from the top bar before running verification."
      />
    );
  }

  const missingPrereqs = !currentSession.classroom_layout_id || currentSession.total_seats === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Verify Exam</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Upload a classroom photo or video for <span className="font-medium text-foreground">{currentSession.exam_name}</span> and run AI verification.
        </p>
      </div>

      {missingPrereqs ? (
        <EmptyState
          icon={ScanEye}
          title="Set up the seating plan and classroom layout first"
          description="Verification needs both an official seating arrangement and a calibrated classroom layout linked to this session."
          action={
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href="/seating">Seating Arrangement</Link></Button>
              <Button asChild><Link href="/classroom">Classroom Setup</Link></Button>
            </div>
          }
        />
      ) : (
        <Tabs defaultValue="image">
          <TabsList>
            <TabsTrigger value="image"><ImageIcon className="size-3.5" /> Image</TabsTrigger>
            <TabsTrigger value="video"><Video className="size-3.5" /> Video</TabsTrigger>
          </TabsList>
          <TabsContent value="image">
            <ImageVerifyPanel sessionId={currentSession.id} onDone={refreshCurrentSession} />
          </TabsContent>
          <TabsContent value="video">
            <VideoVerifyPanel sessionId={currentSession.id} onDone={refreshCurrentSession} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ResultsSummaryStrip({ results }: { results: VerificationResultOut[] }) {
  const counts = { CORRECT: 0, EMPTY: 0, WRONG_SEAT: 0, UNASSIGNED: 0, NEEDS_REVIEW: 0 } as Record<string, number>;
  results.forEach((r) => (counts[r.status] = (counts[r.status] || 0) + 1));
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([status, v]) => (
          <span key={status} className="flex items-center gap-1">
            <StatusBadge status={status as VerificationResultOut["status"]} />
            <span className="text-xs text-muted-foreground">&times;{v}</span>
          </span>
        ))}
    </div>
  );
}

function ImageVerifyPanel({ sessionId, onDone }: { sessionId: number; onDone: () => Promise<void> }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState<VerificationResultOut[] | null>(null);

  async function handleRun() {
    if (!file) {
      toast.error("Choose a classroom photo first.");
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const data = await api.verifyImage(sessionId, file);
      setResults(data);
      await onDone();
      toast.success(`Verification complete -- ${data.length} seat(s) analyzed.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Verification failed");
    } finally {
      setRunning(false);
    }
  }

  const jobId = results?.[0]?.job_id ?? null;
  const overlay = overlayUrl(jobId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload classroom photo</CardTitle>
        <CardDescription>Runs person detection, seat matching, and the comparison engine against the official plan.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-sm" />
          <Button onClick={handleRun} disabled={running || !file}>
            <Upload className="size-4" /> {running ? "Processing..." : "Run AI Verification"}
          </Button>
        </div>

        {results && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-status-correct">
              <CheckCircle2 className="size-4" /> Processed {results.length} seat(s).{" "}
              <Link href="/results" className="underline">View full results &rarr;</Link>
            </div>
            <ResultsSummaryStrip results={results} />
            {overlay && (
              <div className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={overlay} alt="Annotated verification overlay" className="w-full" />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VideoVerifyPanel({ sessionId, onDone }: { sessionId: number; onDone: () => Promise<void> }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [job, setJob] = React.useState<ProcessingJobOut | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleRun() {
    if (!file) {
      toast.error("Choose a classroom video first.");
      return;
    }
    setSubmitting(true);
    try {
      const j = await api.verifyVideo(sessionId, file);
      setJob(j);
      toast.message("Video queued for processing.");
      pollRef.current = setInterval(async () => {
        const updated = await api.getJob(j.id);
        setJob(updated);
        if (updated.status === "completed" || updated.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          await onDone();
          if (updated.status === "completed") toast.success("Video verification complete.");
          else toast.error(updated.error_message || "Video verification failed.");
        }
      }, 1500);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to start video verification");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload classroom video</CardTitle>
        <CardDescription>Frames are sampled, students are tracked across frames, and evidence is aggregated per seat.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-sm" />
          <Button onClick={handleRun} disabled={submitting || !file || (job?.status === "running")}>
            <Upload className="size-4" /> {submitting ? "Uploading..." : "Run AI Verification"}
          </Button>
        </div>

        {job && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Processing Video</span>
              <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "wrong" : "review"} className="capitalize">
                {job.status}
              </Badge>
            </div>
            <Progress value={job.progress_percent} />
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div>Frames processed: <span className="font-medium text-foreground">{job.frames_processed} / {job.frames_total}</span></div>
              <div>Students detected: <span className="font-medium text-foreground">{job.students_detected}</span></div>
              <div>Seats analyzed: <span className="font-medium text-foreground">{job.seats_analyzed}</span></div>
            </div>
            {job.status === "completed" && (
              <Link href="/results" className="text-sm text-primary underline">View full results &rarr;</Link>
            )}
            {job.error_message && <p className="text-xs text-status-wrong">{job.error_message}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
