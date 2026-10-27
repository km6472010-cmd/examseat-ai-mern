"use client";

import * as React from "react";
import { toast } from "sonner";
import { Save, Cpu, SlidersHorizontal, Database } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { AppSettings } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    api.getSettings().then(setSettings).finally(() => setLoading(false));
  }, []);

  function patch(field: keyof AppSettings, value: number | boolean) {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        person_detection_confidence_threshold: settings.person_detection_confidence_threshold,
        seat_match_max_distance_norm: settings.seat_match_max_distance_norm,
        confidence_review_threshold: settings.confidence_review_threshold,
        confidence_high_threshold: settings.confidence_high_threshold,
        identity_match_threshold: settings.identity_match_threshold,
        auto_delete_evidence: settings.auto_delete_evidence,
        retention_days: settings.retention_days,
      });
      setSettings(updated);
      toast.success("Settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Configure detection thresholds, matching sensitivity, and data retention.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Cpu className="size-4" /> Detection model</CardTitle>
          <CardDescription>
            This deployment runs fully offline with OpenCV&apos;s built-in HOG person detector -- no GPU or model
            download required. The architecture supports swapping in a YOLO backend later (see app/cv/detectors.py)
            without changing any calling code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Active backend:</span>
            <Badge variant="secondary" className="uppercase">{settings.detection_backend}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="size-4" /> Confidence thresholds</CardTitle>
          <CardDescription>Controls when the AI is confident enough to decide a case versus routing it to Human Verification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ThresholdField
            label="Person detection confidence"
            description="Minimum confidence for a raw person detection to be considered."
            value={settings.person_detection_confidence_threshold}
            onChange={(v) => patch("person_detection_confidence_threshold", v)}
          />
          <ThresholdField
            label="Seat match max distance"
            description="Maximum normalized distance between a student and a seat to be considered a candidate match."
            value={settings.seat_match_max_distance_norm}
            onChange={(v) => patch("seat_match_max_distance_norm", v)}
            max={0.5}
          />
          <ThresholdField
            label="Needs-review threshold"
            description="Overall confidence below this value is always routed to Human Verification."
            value={settings.confidence_review_threshold}
            onChange={(v) => patch("confidence_review_threshold", v)}
          />
          <ThresholdField
            label="High-confidence threshold"
            description="Overall confidence above this value is treated as a high-confidence result in reports."
            value={settings.confidence_high_threshold}
            onChange={(v) => patch("confidence_high_threshold", v)}
          />
          <ThresholdField
            label="Identity match threshold"
            description="Minimum similarity for the optional identity-matching module (Mode 2) to report a match, instead of 'identity could not be verified'."
            value={settings.identity_match_threshold}
            onChange={(v) => patch("identity_match_threshold", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="size-4" /> Storage & privacy</CardTitle>
          <CardDescription>Evidence images and videos can contain student photos -- configure retention responsibly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-delete evidence</Label>
              <p className="text-xs text-muted-foreground">Automatically remove uploaded photos/videos after the retention period.</p>
            </div>
            <Switch checked={settings.auto_delete_evidence} onCheckedChange={(v) => patch("auto_delete_evidence", v)} />
          </div>
          <Separator />
          <div className="grid gap-1.5 max-w-xs">
            <Label>Retention period (days)</Label>
            <Input
              type="number"
              min={1}
              value={settings.retention_days}
              onChange={(e) => patch("retention_days", Number(e.target.value))}
              disabled={!settings.auto_delete_evidence}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        <Save className="size-4" /> {saving ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}

function ThresholdField({
  label,
  description,
  value,
  onChange,
  max = 1,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm tabular-nums text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
