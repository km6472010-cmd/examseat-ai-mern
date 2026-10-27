"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Grid3x3,
  Camera,
  ScanEye,
  ClipboardList,
  ShieldCheck,
  FileBarChart,
  Settings as SettingsIcon,
  GraduationCap,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/seating", label: "Seating Arrangement", icon: Grid3x3 },
  { href: "/classroom", label: "Classroom Setup", icon: Camera },
  { href: "/verify", label: "Verify Exam", icon: ScanEye },
  { href: "/results", label: "Results", icon: ClipboardList },
  { href: "/review", label: "Human Verification", icon: ShieldCheck },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">ExamSeat AI</div>
          <div className="text-[10px] text-sidebar-foreground/60">Seating Verification</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3 text-[11px] text-sidebar-foreground/50">
        Assistive tool only. Every low-confidence case requires human verification before action is taken.
      </div>
    </aside>
  );
}
