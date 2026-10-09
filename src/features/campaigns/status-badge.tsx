import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CampaignStatus } from "./types";

// Plain presentational component (no "use client"): works in Server and Client Components.

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  running: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  finished: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  archived: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant="secondary" className={cn("capitalize", STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}
