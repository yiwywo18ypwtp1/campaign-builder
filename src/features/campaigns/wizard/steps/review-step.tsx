"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { RuleTreeView } from "../../detail/rule-tree-view";
import type { buildCampaignSchemas } from "../../schemas";
import type { CampaignFormValues } from "../../types";
import { FORM_STEPS, type FormStep } from "../../schemas";
import { STEP_LABELS } from "../steps";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  steps: ReturnType<typeof buildCampaignSchemas>["steps"];
  /** Opens a step and focuses its first invalid field. */
  onFix: (step: FormStep) => void;
};

/**
 * Step 4: read-only summary of everything entered. Each section has a "Fix" button; a section that
 * no longer passes validation (e.g. the start time slipped into the past) says why.
 */
export function ReviewStep({ steps, onFix }: Props) {
  const { control } = useFormContext<CampaignFormValues>();
  // The summary shows every field, so subscribing to the whole form is the point here.
  const values = useWatch({ control }) as CampaignFormValues;

  return (
    <div className="grid gap-4">
      {FORM_STEPS.map((step) => {
        const result = steps[step].safeParse(values);
        return (
          <section key={step} className="grid gap-3 rounded-lg border p-4" aria-labelledby={`review-${step}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 id={`review-${step}`} className="font-medium">
                {STEP_LABELS[step]}
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={() => onFix(step)}>
                {result.success ? "Edit" : "Fix"}
              </Button>
            </div>
            {!result.success && (
              <p role="alert" className="text-sm text-destructive">
                {result.error.issues[0].message}
              </p>
            )}
            {step === "basics" && <BasicsSummary values={values} />}
            {step === "audience" && <RuleTreeView group={values.audience} />}
            {step === "budget" && <BudgetSummary values={values} />}
          </section>
        );
      })}
    </div>
  );
}

function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BasicsSummary({ values }: { values: CampaignFormValues }) {
  return (
    <Summary
      rows={[
        ["Name", values.name],
        ["Slug", values.slug],
        ["Objective", values.objective],
      ]}
    />
  );
}

function BudgetSummary({ values: { budget, schedule } }: { values: CampaignFormValues }) {
  const amount = Number.isFinite(budget.amount) ? formatMoney(budget.amount, budget.currency) : "—";
  const pacing = budget.type === "lifetime" ? ` · pacing: ${budget.pacing}` : "";
  const windows = schedule.dayparting.map((part) => `${WEEKDAY_NAMES[part.weekday]} ${part.from}–${part.to}`);
  return (
    <Summary
      rows={[
        ["Budget", `${amount} ${budget.type}${pacing}`],
        ["Timezone", schedule.timezone],
        ["Start", schedule.start.replace("T", " ")],
        ["End", schedule.end ? schedule.end.replace("T", " ") : "No end date"],
        ["Dayparting", windows.length > 0 ? windows.join(", ") : "All day, every day"],
      ]}
    />
  );
}
