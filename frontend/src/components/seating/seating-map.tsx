import { cn } from "@/lib/utils";
import type { SeatRegion, VerificationResultOut } from "@/types";
import { STATUS_DOT_CLASS } from "@/components/seating/status-badge";

interface SeatingMapProps {
  seats: SeatRegion[] | null;
  fallbackSeats?: { seat_id: string; row: number; column: number }[];
  resultsBySeat: Map<string, VerificationResultOut>;
  onSelect: (seatId: string) => void;
  selectedSeatId?: string | null;
}

export function SeatingMap({ seats, fallbackSeats, resultsBySeat, onSelect, selectedSeatId }: SeatingMapProps) {
  if (seats && seats.length > 0) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted/40">
        {seats.map((seat) => {
          const result = resultsBySeat.get(seat.seat_id);
          const dot = result ? STATUS_DOT_CLASS[result.status] : "bg-border";
          return (
            <button
              key={seat.seat_id}
              onClick={() => onSelect(seat.seat_id)}
              className={cn(
                "absolute flex flex-col items-center justify-center gap-0.5 rounded-md border bg-card text-[10px] font-medium shadow-sm transition-transform hover:z-10 hover:scale-105",
                seat.seat_id === selectedSeatId ? "ring-2 ring-primary" : ""
              )}
              style={{
                left: `${(seat.x - seat.w / 2) * 100}%`,
                top: `${(seat.y - seat.h / 2) * 100}%`,
                width: `${seat.w * 100}%`,
                height: `${seat.h * 100}%`,
              }}
            >
              <span className={cn("size-2 rounded-full", dot)} />
              <span>{seat.seat_id}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (fallbackSeats && fallbackSeats.length > 0) {
    const maxRow = Math.max(...fallbackSeats.map((s) => s.row));
    const maxCol = Math.max(...fallbackSeats.map((s) => s.column));
    return (
      <div className="overflow-x-auto rounded-lg border bg-muted/40 p-4">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${maxCol}, minmax(56px, 1fr))`, gridTemplateRows: `repeat(${maxRow}, auto)` }}
        >
          {fallbackSeats.map((seat) => {
            const result = resultsBySeat.get(seat.seat_id);
            const dot = result ? STATUS_DOT_CLASS[result.status] : "bg-border";
            return (
              <button
                key={seat.seat_id}
                onClick={() => onSelect(seat.seat_id)}
                style={{ gridColumn: seat.column, gridRow: seat.row }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-md border bg-card px-2 py-3 text-[10px] font-medium shadow-sm transition-transform hover:scale-105",
                  seat.seat_id === selectedSeatId ? "ring-2 ring-primary" : ""
                )}
              >
                <span className={cn("size-2 rounded-full", dot)} />
                <span>{seat.seat_id}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return <p className="py-10 text-center text-sm text-muted-foreground">No seat layout available yet.</p>;
}
