"use client";

import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  rowSelectionFeature,
  tableFeatures,
} from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatWallTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { can, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { COLUMN_LABELS, type CampaignListItem } from "../list-query";
import { canTransition, STATUS_ACTIONS, TRANSITIONS, type StatusAction } from "../status";
import type { CampaignStatus } from "../types";

// Columns and features live at module scope: TanStack Table needs stable references,
// otherwise it rebuilds its models on every render. Things that change at runtime (role,
// callbacks, per-row errors) reach the cells through `meta` instead.

export type CampaignTableMeta = {
  role: Role;
  rowErrors: Record<string, string>;
  onStatusAction: (row: CampaignListItem, action: StatusAction) => void;
};

export const features = tableFeatures({
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowSelectionFeature,
  tableMeta: metaHelper<CampaignTableMeta>(),
});

const helper = createColumnHelper<typeof features, CampaignListItem>();

export const columns = helper.columns([
  helper.display({
    id: "select",
    size: 44,
    enableResizing: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all loaded campaigns"
        checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.name}`}
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
  }),
  helper.accessor("name", {
    header: COLUMN_LABELS.name,
    size: 260,
    cell: ({ row }) => (
      <Link href={`/campaigns/${row.original.id}`} className="truncate font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  }),
  helper.accessor("status", {
    header: COLUMN_LABELS.status,
    size: 120,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
  helper.accessor("objective", {
    header: COLUMN_LABELS.objective,
    size: 120,
    cell: ({ row }) => <span className="capitalize">{row.original.objective}</span>,
  }),
  helper.accessor((row) => row.budget.amount, {
    id: "budget",
    header: COLUMN_LABELS.budget,
    size: 160,
    cell: ({ row }) => {
      const { budget } = row.original;
      return (
        <span className="truncate tabular-nums">
          {formatMoney(budget.amount, budget.currency)}
          <span className="text-muted-foreground">{budget.type === "daily" ? " / day" : " total"}</span>
        </span>
      );
    },
  }),
  helper.accessor("spend", {
    header: COLUMN_LABELS.spend,
    size: 140,
    cell: ({ row }) => (
      <span className="truncate tabular-nums">{formatMoney(row.original.spend, row.original.budget.currency)}</span>
    ),
  }),
  helper.accessor("start", {
    header: COLUMN_LABELS.start,
    size: 180,
    cell: ({ row }) => <WallTime value={row.original.start} timezone={row.original.timezone} />,
  }),
  helper.accessor("end", {
    header: COLUMN_LABELS.end,
    size: 180,
    cell: ({ row }) =>
      row.original.end ? <WallTime value={row.original.end} timezone={row.original.timezone} /> : <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("ownerName", {
    id: "owner",
    header: COLUMN_LABELS.owner,
    size: 160,
    cell: ({ row }) => <span className="truncate">{row.original.ownerName}</span>,
  }),
  helper.display({
    id: "actions",
    header: "Actions",
    size: 240,
    enableResizing: false,
    enableHiding: false,
    cell: ({ row, table }) => <RowActions campaign={row.original} meta={table.options.meta!} />,
  }),
]);

const ACTION_LABELS: Record<StatusAction, string> = { pause: "Pause", resume: "Resume", archive: "Archive" };

function RowActions({ campaign, meta }: { campaign: CampaignListItem; meta: CampaignTableMeta }) {
  // UI only hides what the role can't do; the server checks the role again (403).
  const actions = STATUS_ACTIONS.filter(
    (action) => can(meta.role, TRANSITIONS[action].permission) && canTransition(campaign.status, action),
  );
  const error = meta.rowErrors[campaign.id];

  return (
    <div className="flex min-w-0 items-center gap-1">
      {actions.map((action) => (
        <Button
          key={action}
          size="xs"
          variant="outline"
          onClick={() => meta.onStatusAction(campaign, action)}
          aria-label={`${ACTION_LABELS[action]} ${campaign.name}`}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
      {error && (
        <span role="status" className="truncate text-xs text-destructive" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

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

function WallTime({ value, timezone }: { value: string; timezone: string }) {
  return (
    <span className="truncate tabular-nums" title={`${value} (${timezone})`}>
      {formatWallTime(value)}
    </span>
  );
}
