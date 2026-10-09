import type { Campaign, CampaignFormValues } from "./types";

/** The part of a stored campaign the wizard edits (server-owned fields like id or version are left out). */
export function toFormValues(campaign: Campaign): CampaignFormValues {
  const { name, slug, objective, audience, budget, schedule } = campaign;
  return { name, slug, objective, audience, budget, schedule };
}
