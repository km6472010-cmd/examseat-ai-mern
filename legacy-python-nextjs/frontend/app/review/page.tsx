"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldCheck, ImageIcon, Check, X, CircleDashed } from "lucide-react";

import { useSessionContext } from "@/lib/session-context";
import { api, ApiError, overlayUrl } from "@/lib/api";
import type { VerificationResultOut } from "@/types";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfidenceBar } from "@/components/seating/confidence-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ReviewPage() {
  const { currentSession, refreshCurrentSession } = useSessionContext();
  const [queue, setQueue] = React.useState<VerificationResultOut[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [viewImage, setViewImage] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    if (!currentSession) return;
    setLoading(true);
    const q = await api.getReviewQueue(currentSession.id);
    setQueue(q);
    setLoading(false);
  }, [currentSession]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDecision(id: number, action: "confirm" | "reject" | "mark_empty", notes?: string) {
    try {
      if (action === "confirm") await api.confirmReview(id, notes);
      if (action === "reject") await api.rejectReview(id, notes);
      if (action === "mark_empty") await api.markEmptyReview(id, notes);
      setQueue((prev) => prev.filter((r) => r.id !== id));
      await refreshCurrentSession();
      toast.success("Decision recorded.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to record decision");
    }
  }

  if (!currentSession) {
    return <EmptyState icon={ShieldCheck} title="No exam session selected" description="Select an exam session to see its human verification queue." />;
  }

  if (!loading && queue.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <EmptyState
          icon={ShieldCheck}
          title="Nothing needs review"
          description="Every case in this session was classified with high enough confidence, or has already been reviewed. Great work."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading count={queue.length} />
      <div className="grid gap-3 md:grid-cols-2">
        {queue.map((r) => (
          <Card key={r.id} className="border-status-review/40">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CircleDashed className="size-4 text-status-review" /> Seat {r.seat_id}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{r.explanation}</p>
              </div>
              <ConfidenceBar value={r.overall_confidence} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Assigned student</p>
                  <p className="font-medium">{r.assigned_student_name || r.assigned_student_id || "--"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Detected identity</p>
                  <p className="font-medium">{r.detected_student_id || "Unknown"}</p>
                </div>
              </div>
              <ReviewActions
                onView={() => setViewImage(r.job_id)}
                onConfirm={() => handleDecision(r.id, "confirm")}
                onReject={() => handleDecision(r.id, "reject")}
                onMarkEmpty={() => handleDecision(r.id, "mark_empty")}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!viewImage} onOpenChange={(open) => !open && setViewImage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Evidence image</DialogTitle></DialogHeader>
          {viewImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={overlayUrl(viewImage)!} alt="Evidence" className="w-full rounded-md border" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewActions({
  onView,
  onConfirm,
  onReject,
  onMarkEmpty,
}: {
  onView: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onMarkEmpty: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={onView}>
        <ImageIcon className="size-3.5" /> View Image
      </Button>
      <Button size="sm" variant="default" onClick={onConfirm}>
        <Check className="size-3.5" /> Confirm
      </Button>
      <Button size="sm" variant="destructive" onClick={onReject}>
        <X className="size-3.5" /> Reject
      </Button>
      <Button size="sm" variant="secondary" onClick={onMarkEmpty}>
        <CircleDashed className="size-3.5" /> Mark Empty
      </Button>
    </div>
  );
}

function PageHeading({ count }: { count?: number }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Human Verification</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {count !== undefined ? `${count} case(s) need manual confirmation before this exam's results are final.` : "Cases the AI could not confidently classify."}
      </p>
    </div>
  );
}
