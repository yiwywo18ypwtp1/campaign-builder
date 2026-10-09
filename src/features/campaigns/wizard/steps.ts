import type { FieldPath } from "react-hook-form";
import { FORM_STEPS, type buildCampaignSchemas, type FormStep } from "../schemas";
import type { CampaignFormValues } from "../types";

// Wizard steps, shared by the server page (redirects for direct links) and the client wizard.

export const WIZARD_STEPS = [...FORM_STEPS, "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStep, string> = {
  basics: "Basics",
  audience: "Audience",
  budget: "Budget & schedule",
  review: "Review",
};

/** Top-level form fields owned by each step: `trigger(STEP_FIELDS[step])` validates one step. */
export const STEP_FIELDS: Record<FormStep, FieldPath<CampaignFormValues>[]> = {
  basics: ["name", "slug", "objective"],
  audience: ["audience"],
  budget: ["budget", "schedule"],
};

export function parseStep(value: string | null | undefined): WizardStep | null {
  return WIZARD_STEPS.find((step) => step === value) ?? null;
}

/**
 * The furthest step the user may open: every form step before it must be valid.
 * Returns the first invalid step, or "review" when everything is valid.
 */
export function furthestAllowedStep(values: unknown, steps: ReturnType<typeof buildCampaignSchemas>["steps"]): WizardStep {
  return FORM_STEPS.find((step) => !steps[step].safeParse(values).success) ?? "review";
}

export function isStepAllowed(step: WizardStep, furthest: WizardStep): boolean {
  return WIZARD_STEPS.indexOf(step) <= WIZARD_STEPS.indexOf(furthest);
}

/**
 * Server-side guard for direct links: returns the step to redirect to, or `null` when the
 * requested step can be shown. A missing `?step` simply opens the first step.
 */
export function stepRedirect(requested: string | string[] | undefined, furthest: WizardStep): WizardStep | null {
  if (requested === undefined) return null;
  const step = typeof requested === "string" ? parseStep(requested) : null;
  return step && isStepAllowed(step, furthest) ? null : furthest;
}
