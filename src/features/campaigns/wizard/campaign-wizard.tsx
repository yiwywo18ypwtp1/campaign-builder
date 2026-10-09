"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type FieldErrors, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AppConfig } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import { submitCampaignAction } from "../actions";
import { buildCampaignSchemas, FORM_STEPS, type FormStep } from "../schemas";
import type { Campaign, CampaignFormValues } from "../types";
import { AudienceStep } from "./steps/audience-step";
import { BasicsStep } from "./steps/basics-step";
import { BudgetStep } from "./steps/budget-step";
import { ReviewStep } from "./steps/review-step";
import {
  furthestAllowedStep,
  isStepAllowed,
  parseStep,
  STEP_FIELDS,
  STEP_LABELS,
  WIZARD_STEPS,
  type WizardStep,
} from "./steps";
import { useAutosave, type SaveState } from "./use-autosave";
import { useDirtyGuard } from "./use-dirty-guard";
import { useSlugAvailability } from "./use-slug-availability";

type Props = {
  mode: "create" | "edit";
  /** Set when editing: the slug check must not report the campaign's own slug as taken. */
  campaignId?: string;
  /** Version of the stored campaign (edit only): the server rejects a submit based on an older one. */
  version?: number;
  /** Status of the stored campaign (edit only): a draft is scheduled on submit, others are just saved. */
  status?: Campaign["status"];
  defaultValues: CampaignFormValues;
  config: AppConfig;
};

/**
 * The whole wizard is one React Hook Form with one zod schema (`FormProvider`); each step only
 * renders its own fields. Leaving a step validates just that step's fields (`trigger`), the
 * final submit validates everything. The current step lives in the URL (`?step=audience`).
 */
export function CampaignWizard({ mode, campaignId, version, status, defaultValues, config }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const step = parseStep(searchParams.get("step")) ?? "basics";

  // Built once: the schema depends on server config (budget minimums), not on render state.
  const [schemas] = useState(() => buildCampaignSchemas(config));
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(schemas.campaign),
    defaultValues,
    mode: "onTouched", // first error on blur, then re-validate while typing
  });

  const slug = useWatch({ control: form.control, name: "slug" });

  // Only drafts are autosaved: a running campaign is changed with the final "Save changes" button.
  const schedules = status === undefined || status === "draft"; // what the final button does
  const autosave = useAutosave({ form, steps: schemas.steps, enabled: schedules, id: campaignId, version });
  useDirtyGuard(autosave.hasUnsavedChanges);

  // After the first autosave the draft has an id: its own slug must not count as taken.
  const slugStatus = useSlugAvailability(slug, autosave.id);

  const showStep = (next: WizardStep, options?: { replace?: boolean }) => writeStepToUrl(pathname, next, options);

  // The server redirects direct links to steps that aren't reachable yet. This covers the
  // same case on the client: browser back/forward, or the URL edited by hand.
  useEffect(() => {
    const furthest = furthestAllowedStep(form.getValues(), schemas.steps);
    if (!isStepAllowed(step, furthest)) writeStepToUrl(pathname, furthest, { replace: true });
  }, [step, pathname, form, schemas]);

  // Move focus to the step title when the step changes, so keyboard and screen reader users
  // start at the top of the new step (not on the first render).
  // When a step is opened because of an error, focus goes to the first invalid field instead.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const focusInvalid = useRef(false);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      const invalid = focusInvalid.current && formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      (invalid || headingRef.current)?.focus();
    }
    focusInvalid.current = false;
    previousStep.current = step;
  }, [step]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  /** Opens the step that owns the first error and focuses the invalid field there. */
  function showFirstError(errors: FieldErrors<CampaignFormValues>) {
    const failed = FORM_STEPS.find((item) => STEP_FIELDS[item].some((name) => name in errors));
    if (!failed) return;
    focusInvalid.current = true;
    if (failed === step) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    else showStep(failed);
  }

  /** "Fix" on the review step: open the step and show what is wrong there. */
  async function fix(target: FormStep) {
    focusInvalid.current = true;
    showStep(target);
    await form.trigger(STEP_FIELDS[target]);
  }

  /** Final submit. The browser validates everything first; the server then has the last word. */
  async function submit(values: CampaignFormValues) {
    setSubmitting(true);
    setSubmitError(undefined);
    // A running autosave must finish first: it changes the version this submit is based on.
    const saved = await autosave.settle();
    const result = await submitCampaignAction({ id: saved.id, values, version: saved.version });
    if (result.ok) {
      autosave.finish();
      toast.success(schedules ? "Campaign scheduled" : "Campaign saved");
      router.push(`/campaigns/${result.data.id}`);
      return; // stay in the "submitting" state until the page changes
    }
    setSubmitting(false);
    autosave.resume();

    const { code, message, fieldErrors } = result.error;
    if (code === "VERSION_CONFLICT") {
      setSubmitError("This campaign was changed somewhere else. Reload the page to see the latest version.");
      return;
    }
    // A slug the check called free can still lose the race (409): show it on the field.
    const entries = Object.entries(fieldErrors ?? {});
    if (code === "SLUG_TAKEN" && entries.length === 0) entries.push(["slug", "This slug is already taken"]);
    if (entries.length === 0) {
      setSubmitError(message);
      return;
    }
    for (const [path, text] of entries) form.setError(path as FieldPath<CampaignFormValues>, { type: "server", message: text });
    setSubmitError("Some fields need attention.");
    showFirstError(Object.fromEntries(entries.map(([path]) => [path.split(".")[0], true])) as FieldErrors<CampaignFormValues>);
  }

  /**
   * Going back is always allowed. Going forward validates every step on the way, stops at
   * the first invalid one and focuses its first invalid field.
   */
  async function goTo(target: WizardStep) {
    const from = WIZARD_STEPS.indexOf(step);
    const to = WIZARD_STEPS.indexOf(target);
    if (to <= from) return showStep(target);

    for (const current of WIZARD_STEPS.slice(from, to)) {
      if (current === "review") continue;
      const valid = await form.trigger(STEP_FIELDS[current], { shouldFocus: true });
      const slugTaken = current === "basics" && slugStatus === "taken";
      if (slugTaken) form.setError("slug", { message: "This slug is already taken" }, { shouldFocus: true });
      if (!valid || slugTaken) {
        if (current !== step) showStep(current);
        return;
      }
    }
    showStep(target);
  }

  const index = WIZARD_STEPS.indexOf(step);
  const nextStep = WIZARD_STEPS[index + 1];
  const previous = WIZARD_STEPS[index - 1];

  return (
    <FormProvider {...form}>
      <div className="grid gap-6">
        <nav aria-label="Wizard steps" className="flex flex-wrap items-center justify-between gap-2">
          <ol className="flex flex-wrap gap-2">
            {WIZARD_STEPS.map((item, i) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => void goTo(item)}
                  aria-current={item === step ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                    item === step ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="tabular-nums">{i + 1}</span> {STEP_LABELS[item]}
                </button>
              </li>
            ))}
          </ol>
          {schedules && <SaveIndicator state={autosave.state} message={autosave.message} onRetry={autosave.retry} />}
        </nav>

        {/* Enter in a field means "Next", not a native form submit. */}
        <form
          noValidate
          className="grid gap-6"
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            if (nextStep) void goTo(nextStep);
            else void form.handleSubmit(submit, showFirstError)();
          }}
        >
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium outline-none">
            {STEP_LABELS[step]}
          </h2>

          {step === "basics" && <BasicsStep autoSlug={mode === "create"} slugStatus={slugStatus} />}
          {step === "audience" && <AudienceStep currencies={config.currencies.map((c) => c.code)} />}
          {step === "budget" && <BudgetStep config={config} />}
          {step === "review" && <ReviewStep steps={schemas.steps} onFix={(target) => void fix(target)} />}
          {submitError && (
            <p role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <div className="flex gap-2 border-t pt-4">
            {previous && (
              <Button type="button" variant="outline" onClick={() => showStep(previous)}>
                Back
              </Button>
            )}
            <Button type="submit" className="ml-auto" disabled={submitting}>
              {nextStep ? `Next: ${STEP_LABELS[nextStep]}` : schedules ? "Schedule campaign" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </FormProvider>
  );
}

/**
 * Step changes are history entries (pushState), so the browser's Back button goes to the
 * previous step. The native History API updates `useSearchParams` without a server round-trip.
 */
function writeStepToUrl(pathname: string, step: WizardStep, { replace = false } = {}) {
  const url = `${pathname}?step=${step}`;
  // Entries carry `wizard: true`, so the dirty guard can tell steps from the page the user came from.
  if (replace) window.history.replaceState(window.history.state, "", url);
  else window.history.pushState({ wizard: true }, "", url);
}

const SAVE_LABELS: Record<SaveState, string> = {
  idle: "",
  saved: "Draft saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  error: "Couldn't save the draft",
  conflict: "Changed in another window — reload to continue",
};

/** Autosave status, announced politely to screen readers. */
function SaveIndicator({ state, message, onRetry }: { state: SaveState; message?: string; onRetry: () => void }) {
  return (
    <p aria-live="polite" className={cn("text-sm text-muted-foreground", (state === "error" || state === "conflict") && "text-destructive")}>
      {SAVE_LABELS[state]}
      {state === "error" && (
        <>
          {message ? ` (${message})` : ""}{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </p>
  );
}
