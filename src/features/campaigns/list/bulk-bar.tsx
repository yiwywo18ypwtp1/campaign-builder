"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, type Role } from "@/lib/permissions";
import { STATUS_ACTIONS, TRANSITIONS, type StatusAction } from "../status";

const LABELS: Record<StatusAction, { idle: string; pending: string }> = {
  pause: { idle: "Pause", pending: "Pausing" },
  resume: { idle: "Resume", pending: "Resuming" },
  archive: { idle: "Archive", pending: "Archiving" },
};

type Props = {
  role: Role;
  selectedCount: number;
  /** The action in flight, if any. */
  pendingAction: StatusAction | null;
  onAction: (action: StatusAction) => void;
  onClear: () => void;
};

export function BulkBar({ role, selectedCount, pendingAction, onAction, onClear }: Props) {
  const actions = STATUS_ACTIONS.filter((action) => can(role, TRANSITIONS[action].permission));

  return (
    <div role="region" aria-label="Bulk actions" className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
      <span className="font-medium">{selectedCount.toLocaleString("en-US")} selected</span>
      {actions.map((action) => (
        <Button key={action} size="sm" variant="outline" disabled={pendingAction !== null} onClick={() => onAction(action)}>
          {LABELS[action].idle}
        </Button>
      ))}
      {pendingAction && (
        <span role="status" className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {LABELS[pendingAction].pending} {selectedCount.toLocaleString("en-US")} campaigns…
        </span>
      )}
      <Button size="sm" variant="ghost" className="ml-auto" disabled={pendingAction !== null} onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
