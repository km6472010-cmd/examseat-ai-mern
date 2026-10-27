"use client";

import * as React from "react";
import { toast } from "sonner";
import { Camera, Grid3x3, Plus, Save, Trash2, Wand2, FolderOpen } from "lucide-react";

import { useSessionContext } from "@/lib/session-context";
import { api, ApiError, mediaUrl } from "@/lib/api";
import type { ClassroomLayoutOut, SeatRegion } from "@/types";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

let seatCounter = 0;
function nextSeatId(existing: SeatRegion[]) {
  seatCounter += 1;
  let id = `S${existing.length + seatCounter}`;
  while (existing.some((s) => s.seat_id === id)) {
    seatCounter += 1;
    id = `S${existing.length + seatCounter}`;
  }
  return id;
}

export default function ClassroomPage() {
  const { currentSession, refreshCurrentSession } = useSessionContext();
  const [layouts, setLayouts] = React.useState<ClassroomLayoutOut[]>([]);
  const [layoutId, setLayoutId] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [room, setRoom] = React.useState("");
  const [imagePath, setImagePath] = React.useState<string | null>(null);
  const [imageDims, setImageDims] = React.useState<{ w: number; h: number } | null>(null);
  const [seats, setSeats] = React.useState<SeatRegion[]>([]);
  const [selectedSeatId, setSelectedSeatId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState(4);
  const [cols, setCols] = React.useState(5);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<File | null>(null);
  const dragState = React.useRef<{ seatId: string } | null>(null);

  React.useEffect(() => {
    api.listLayouts().then(setLayouts).catch(() => setLayouts([]));
  }, []);

  React.useEffect(() => {
    if (currentSession) setRoom(currentSession.room);
  }, [currentSession]);

  async function handleImageChange(file: File) {
    fileRef.current = file;
    setUploading(true);
    try {
      const result = await api.uploadClassroomImage(file);
      setImagePath(result.path);
      setImageDims({ w: result.width, h: result.height });
      if (seats.length === 0) {
        const grid = await api.autoDetectSeats(file, rows, cols);
        setSeats(grid.seats);
        toast.message("Seats auto-laid-out as a grid", { description: grid.confidence_note });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateGrid() {
    if (!fileRef.current) {
      toast.error("Upload a classroom photo first.");
      return;
    }
    try {
      const grid = await api.autoDetectSeats(fileRef.current, rows, cols);
      setSeats(grid.seats);
      toast.message(`Generated ${grid.seats.length} seats`, { description: grid.confidence_note });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Auto-detect failed");
    }
  }

  function addSeat() {
    setSeats((prev) => [
      ...prev,
      { seat_id: nextSeatId(prev), row: 1, column: 1, x: 0.5, y: 0.5, w: 0.12, h: 0.18, is_usable: true },
    ]);
  }

  function updateSeat(seatId: string, patch: Partial<SeatRegion>) {
    setSeats((prev) => prev.map((s) => (s.seat_id === seatId ? { ...s, ...patch } : s)));
  }

  function removeSeat(seatId: string) {
    setSeats((prev) => prev.filter((s) => s.seat_id !== seatId));
    if (selectedSeatId === seatId) setSelectedSeatId(null);
  }

  function handlePointerDown(seatId: string) {
    dragState.current = { seatId };
    setSelectedSeatId(seatId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    updateSeat(dragState.current.seatId, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Give this layout a name.");
      return;
    }
    if (seats.length === 0) {
      toast.error("Add at least one seat.");
      return;
    }
    setSaving(true);
    try {
      const layout = await api.calibrateClassroom(
        {
          name: name.trim(),
          room: room.trim() || undefined,
          reference_width: imageDims?.w,
          reference_height: imageDims?.h,
          seats,
          calibration_method: "manual",
        },
        imagePath || undefined
      );
      toast.success(`Saved layout "${layout.name}" with ${layout.seats.length} seats.`);
      setLayouts((prev) => [layout, ...prev]);
      setLayoutId(layout.id);
      if (currentSession) {
        await api.updateSession(currentSession.id, { classroom_layout_id: layout.id });
        await refreshCurrentSession();
        toast.success("Linked layout to current session.");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadLayout(id: string) {
    const layout = await api.getLayout(Number(id));
    setLayoutId(layout.id);
    setName(layout.name);
    setRoom(layout.room || "");
    setImagePath(layout.reference_image_path);
    setImageDims(layout.reference_width && layout.reference_height ? { w: layout.reference_width, h: layout.reference_height } : null);
    setSeats(layout.seats);
    if (currentSession) {
      await api.updateSession(currentSession.id, { classroom_layout_id: layout.id });
      await refreshCurrentSession();
    }
    toast.success(`Loaded "${layout.name}" -- reused for this session.`);
  }

  if (!currentSession) {
    return (
      <EmptyState
        icon={Camera}
        title="No exam session selected"
        description="Create or select an exam session from the top bar before calibrating a classroom."
      />
    );
  }

  const selectedSeat = seats.find((s) => s.seat_id === selectedSeatId) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Classroom Setup</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Calibrate physical seat positions -- reusable across future photos and videos.</p>
        </div>
        {layouts.length > 0 && (
          <Select onValueChange={handleLoadLayout} value={layoutId ? String(layoutId) : undefined}>
            <SelectTrigger className="w-64">
              <FolderOpen className="size-4" />
              <SelectValue placeholder="Load an existing layout" />
            </SelectTrigger>
            <SelectContent>
              {layouts.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.seats.length} seats)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Classroom photo & seat calibration</CardTitle>
            <CardDescription>Drag each seat box to match the photo. Click a seat to edit its ID or mark it unusable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageChange(e.target.files[0])} className="max-w-xs" />
              <div className="flex items-center gap-1">
                <Input type="number" value={rows} min={1} max={26} onChange={(e) => setRows(Number(e.target.value))} className="w-16" />
                <span className="text-xs text-muted-foreground">rows ×</span>
                <Input type="number" value={cols} min={1} max={30} onChange={(e) => setCols(Number(e.target.value))} className="w-16" />
                <span className="text-xs text-muted-foreground">cols</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleGenerateGrid} disabled={uploading}>
                <Wand2 className="size-4" /> Generate grid
              </Button>
              <Button variant="outline" size="sm" onClick={addSeat}>
                <Plus className="size-4" /> Add seat
              </Button>
            </div>

            <div
              ref={containerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted select-none"
              style={
                imagePath
                  ? { backgroundImage: `url(${mediaUrl(imagePath)})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : undefined
              }
            >
              {!imagePath && (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Grid3x3 className="mr-2 size-4" /> Upload a classroom photo to begin calibration
                </div>
              )}
              {seats.map((seat) => (
                <div
                  key={seat.seat_id}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handlePointerDown(seat.seat_id);
                  }}
                  className={`absolute flex cursor-grab items-center justify-center rounded-md border-2 text-[10px] font-semibold text-white shadow-sm active:cursor-grabbing ${
                    seat.seat_id === selectedSeatId ? "border-primary" : "border-white/70"
                  } ${seat.is_usable ? "bg-black/45" : "bg-black/20 opacity-60"}`}
                  style={{
                    left: `${(seat.x - seat.w / 2) * 100}%`,
                    top: `${(seat.y - seat.h / 2) * 100}%`,
                    width: `${seat.w * 100}%`,
                    height: `${seat.h * 100}%`,
                  }}
                >
                  {seat.seat_id}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{seats.length} seat(s) placed.</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Layout details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label>Layout name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CSE-204 -- 5x4 grid" />
              </div>
              <div className="grid gap-1.5">
                <Label>Room</Label>
                <Input value={room} onChange={(e) => setRoom(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                <Save className="size-4" /> {saving ? "Saving..." : "Save & link to session"}
              </Button>
            </CardContent>
          </Card>

          {selectedSeat && (
            <Card>
              <CardHeader>
                <CardTitle>Edit seat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-1.5">
                  <Label>Seat ID</Label>
                  <Input
                    value={selectedSeat.seat_id}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSeats((prev) => prev.map((s) => (s.seat_id === selectedSeat.seat_id ? { ...s, seat_id: newId } : s)));
                      setSelectedSeatId(newId);
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Row</Label>
                    <Input type="number" value={selectedSeat.row} onChange={(e) => updateSeat(selectedSeat.seat_id, { row: Number(e.target.value) })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Column</Label>
                    <Input type="number" value={selectedSeat.column} onChange={(e) => updateSeat(selectedSeat.seat_id, { column: Number(e.target.value) })} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selectedSeat.is_usable} onCheckedChange={(v) => updateSeat(selectedSeat.seat_id, { is_usable: !!v })} />
                  Usable seat
                </label>
                {!selectedSeat.is_usable && <Badge variant="secondary">Marked unusable -- excluded from verification</Badge>}
                <Button variant="destructive" size="sm" className="w-full" onClick={() => removeSeat(selectedSeat.seat_id)}>
                  <Trash2 className="size-4" /> Remove seat
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
