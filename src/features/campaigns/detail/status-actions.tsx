"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { can, type Role } from "@/lib/permissions";
import { changeStatusAction } from "../actions";
import { StatusBadge } from "../status-badge";
import { canTransition, PREDICTED_STATUS, STATUS_ACTIONS, TRANSITIONS, type StatusAction } from "../status";
import type { CampaignStatus } from "../types";

const LABELS: Record<StatusAction, string> = { pause: "Pause", resume: "Resume", archive: "Archive" };

type Props = { campaignId: string; name: string; status: CampaignStatus; role: Role };

/**
 * Status badge + Pause / Resume / Archive. The badge shows the expected status right away
 * (`useOptimistic`). On success the action revalidates the page, so the `status` prop becomes
 * the real one; on failure the transition ends and the badge falls back to the old prop —
 * the rollback needs no extra code.
 */
export function StatusActions({ campaignId, name, status, role }: Props) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();

  const actions = STATUS_ACTIONS.filter(
    (action) => can(role, TRANSITIONS[action].permission) && canTransition(optimisticStatus, action),
  );

  function run(action: StatusAction) {
    // Archive without undo is Core; the undo toast is Advanced. Ask before an action that hides the campaign.
    if (action === "archive" && !window.confirm(`Archive “${name}”?`)) return;

    startTransition(async () => {
      setOptimisticStatus(PREDICTED_STATUS[action]);
      const result = await changeStatusAction(campaignId, action);
      if (!result.ok) toast.error(`Couldn't ${action} the campaign: ${result.error.message}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={optimisticStatus} />
      {actions.map((action) => (
        <Button key={action} size="sm" variant="outline" disabled={isPending} onClick={() => run(action)}>
          {LABELS[action]}
        </Button>
      ))}
    </div>
  );
}
