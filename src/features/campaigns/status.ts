import type { Action } from "@/lib/permissions";
import type { CampaignStatus } from "./types";

// Status transition rules. The server enforces them; the client uses them to decide
// which actions to offer for a row.

export const STATUS_ACTIONS = ["pause", "resume", "archive"] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

export const TRANSITIONS: Record<StatusAction, { from: readonly CampaignStatus[]; permission: Action }> = {
  pause: { from: ["scheduled", "running"], permission: "campaign:pause" },
  resume: { from: ["paused"], permission: "campaign:resume" },
  archive: { from: ["draft", "scheduled", "running", "paused", "finished"], permission: "campaign:archive" },
};

export function canTransition(status: CampaignStatus, action: StatusAction): boolean {
  return TRANSITIONS[action].from.includes(status);
}
