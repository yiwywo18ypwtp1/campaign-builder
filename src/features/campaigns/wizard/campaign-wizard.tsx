"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import type { AppConfig } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import { buildCampaignSchemas } from "../schemas";
import type { CampaignFormValues } from "../types";
import { BasicsStep } from "./steps/basics-step";
import {
  furthestAllowedStep,
  isStepAllowed,
  parseStep,
  STEP_FIELDS,
  STEP_LABELS,
  WIZARD_STEPS,
  type WizardStep,
} from "./steps";
import { useSlugAvailability } from "./use-slug-availability";

type Props = {
  mode: "create" | "edit";
  /** Set when editing: the slug check must not report the campaign's own slug as taken. */
  campaignId?: string;
  defaultValues: CampaignFormValues;
  config: AppConfig;
};

/**
 * The whole wizard is one React Hook Form with one zod schema (`FormProvider`); each step only
 * renders its own fields. Leaving a step validates just that step's fields (`trigger`), the
 * final submit validates everything. The current step lives in the URL (`?step=audience`).
 */
export function CampaignWizard({ mode, campaignId, defaultValues, config }: Props) {
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
  const slugStatus = useSlugAvailability(slug, campaignId);

  const showStep = (next: WizardStep, options?: { replace?: boolean }) => writeStepToUrl(pathname, next, options);

  // The server redirects direct links to steps that aren't reachable yet. This covers the
  // same case on the client: browser back/forward, or the URL edited by hand.
  useEffect(() => {
    const furthest = furthestAllowedStep(form.getValues(), schemas.steps);
    if (!isStepAllowed(step, furthest)) writeStepToUrl(pathname, furthest, { replace: true });
  }, [step, pathname, form, schemas]);

  // Move focus to the step title when the step changes, so keyboard and screen reader users
  // start at the top of the new step (not on the first render).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) headingRef.current?.focus();
    previousStep.current = step;
  }, [step]);

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
        <nav aria-label="Wizard steps">
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
        </nav>

        {/* Enter in a field means "Next", not a native form submit. */}
        <form
          noValidate
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (nextStep) void goTo(nextStep);
          }}
        >
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium outline-none">
            {STEP_LABELS[step]}
          </h2>

          {step === "basics" && <BasicsStep autoSlug={mode === "create"} slugStatus={slugStatus} />}
          {step !== "basics" && (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              This step is built in the next phases of the task.
            </p>
          )}

          <div className="flex gap-2 border-t pt-4">
            {previous && (
              <Button type="button" variant="outline" onClick={() => showStep(previous)}>
                Back
              </Button>
            )}
            {nextStep && (
              <Button type="submit" className="ml-auto">
                Next: {STEP_LABELS[nextStep]}
              </Button>
            )}
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
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}
