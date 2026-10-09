"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState, type Ref } from "react";
import { Controller, get, useFieldArray, useFormContext, useFormState, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AppConfig } from "@/lib/app-config";
import { formatAmount, formatMoney, parseAmount } from "@/lib/money";
import type { CampaignFormValues } from "../../types";
import { FieldError } from "../field-error";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

// Weekday numbers follow `Date#getDay()` (0 = Sunday); the list starts on Monday.
const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const BUDGET_TYPES = [
  { value: "daily", title: "Daily", description: "Spend up to this amount every day." },
  { value: "lifetime", title: "Lifetime", description: "Spend this amount in total until the end date." },
] as const;

/** Step 3: budget and schedule. Cross-field rules (minimum, lifetime needs an end…) live in the zod schema. */
export function BudgetStep({ config }: { config: AppConfig }) {
  const { register, control, setValue, getValues, getFieldState, trigger } = useFormContext<CampaignFormValues>();
  // Only this component listens to errors (not the form root), see BasicsStep.
  const { errors } = useFormState({ control });
  const budgetType = useWatch({ control, name: "budget.type" });
  const currencyCode = useWatch({ control, name: "budget.currency" });
  const timezone = useWatch({ control, name: "schedule.timezone" });
  const minAmount = config.currencies.find((c) => c.code === currencyCode)?.minAmount;

  const message = (path: string): string | undefined => get(errors, path)?.message;

  /**
   * The schema checks fields against each other (end vs start, amount vs currency minimum), but
   * react-hook-form only re-validates the field being edited. After a change, re-check the related
   * fields that already show an error or were visited, so stale messages don't stay and new ones appear.
   */
  function revalidate(...names: RevalidateName[]) {
    const stale = names.filter((name) => get(errors, name) || getFieldState(name).isTouched);
    if (stale.length > 0) void trigger(stale);
  }

  function changeType(type: "daily" | "lifetime") {
    if (type === budgetType) return;
    // Replace the whole budget object, like a rule on field change: `pacing` exists only for lifetime.
    const { amount, currency } = getValues("budget");
    setValue("budget", type === "daily" ? { type, amount, currency } : { type, amount, currency, pacing: "even" }, {
      shouldDirty: true,
    });
    revalidate("schedule.end");
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-4" aria-labelledby="budget-heading">
        <h3 id="budget-heading" className="font-medium">
          Budget
        </h3>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Type</legend>
          <RadioGroup value={budgetType} onValueChange={(value) => changeType(value as "daily" | "lifetime")} className="grid gap-3 sm:grid-cols-2">
            {BUDGET_TYPES.map((type) => (
              <Label
                key={type.value}
                htmlFor={`budget-type-${type.value}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary"
              >
                <RadioGroupItem id={`budget-type-${type.value}`} value={type.value} className="mt-0.5" />
                <span className="grid gap-1">
                  <span className="font-medium">{type.title}</span>
                  <span className="text-sm font-normal text-muted-foreground">{type.description}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="flex flex-wrap items-start gap-4">
          <div className="grid gap-2">
            <Label htmlFor="budget-amount">Amount</Label>
            <Controller
              control={control}
              name="budget.amount"
              render={({ field }) => (
                <MoneyInput
                  id="budget-amount"
                  value={field.value}
                  invalid={!!message("budget.amount")}
                  inputRef={field.ref}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="budget-currency">Currency</Label>
            <select
              id="budget-currency"
              className={SELECT_CLASS}
              aria-invalid={!!message("budget.currency")}
              {...register("budget.currency", { onChange: () => revalidate("budget.amount") })}
            >
              {config.currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </select>
          </div>
          {budgetType === "lifetime" && (
            <div className="grid gap-2">
              <Label htmlFor="budget-pacing">Pacing</Label>
              <select id="budget-pacing" className={SELECT_CLASS} {...register("budget.pacing" as "budget.currency")}>
                <option value="even">Even — spread over the period</option>
                <option value="asap">ASAP — spend as fast as possible</option>
              </select>
            </div>
          )}
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          {minAmount !== undefined && `Minimum: ${formatMoney(minAmount, currencyCode)}. `}
        </p>
        <FieldError id="budget-amount-error" message={message("budget.amount") ?? message("budget.currency")} />
      </section>

      <section className="grid gap-4" aria-labelledby="schedule-heading">
        <h3 id="schedule-heading" className="font-medium">
          Schedule
        </h3>

        <div className="grid gap-2">
          <Label htmlFor="schedule-timezone">Timezone</Label>
          <select
            id="schedule-timezone"
            className={`${SELECT_CLASS} max-w-xs`}
            aria-invalid={!!message("schedule.timezone")}
            {...register("schedule.timezone", { onChange: () => revalidate("schedule.start", "schedule.end") })}
          >
            {config.timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <FieldError id="schedule-timezone-error" message={message("schedule.timezone")} />
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="grid gap-2">
            <Label htmlFor="schedule-start">Start</Label>
            <Input
              id="schedule-start"
              type="datetime-local"
              className="w-56"
              aria-invalid={!!message("schedule.start")}
              aria-describedby="schedule-start-error schedule-hint"
              {...register("schedule.start", { onChange: () => revalidate("schedule.end") })}
            />
            <FieldError id="schedule-start-error" message={message("schedule.start")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-end">End{budgetType === "lifetime" ? "" : " (optional)"}</Label>
            <Input
              id="schedule-end"
              type="datetime-local"
              className="w-56"
              aria-invalid={!!message("schedule.end")}
              aria-describedby="schedule-end-error schedule-hint"
              {...register("schedule.end", { setValueAs: (value: string) => value || undefined })}
            />
            <FieldError id="schedule-end-error" message={message("schedule.end")} />
          </div>
        </div>
        <p id="schedule-hint" className="-mt-3 text-xs text-muted-foreground">
          Times are in the campaign timezone ({timezone}), not in your browser&apos;s.
        </p>

        <Dayparting errors={errors} revalidate={revalidate} />
      </section>
    </div>
  );
}

type RevalidateName = "budget.amount" | "schedule.start" | "schedule.end" | "schedule.dayparting";
type RevalidateFn = (...names: RevalidateName[]) => void;

/** Weekly time windows. An empty list means the campaign runs all the time. */
function Dayparting({ errors, revalidate }: { errors: object; revalidate: RevalidateFn }) {
  const { register, control } = useFormContext<CampaignFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "schedule.dayparting" });
  const addRef = useRef<HTMLButtonElement>(null);

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Dayparting (optional)</legend>
      <p className="-mt-1 text-xs text-muted-foreground">Run only in these windows. Overnight windows (22:00–02:00) must be split into two days.</p>

      {fields.map((item, index) => {
        const path = `schedule.dayparting.${index}`;
        // Overlap errors sit on `from`, an overnight window on `to`.
        const messages = [...new Set([get(errors, `${path}.from`)?.message, get(errors, `${path}.to`)?.message].filter(Boolean))];
        const invalid = messages.length > 0;
        const changed = { onChange: () => revalidate("schedule.dayparting") };
        return (
          <div key={item.id} className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Window ${index + 1}`}>
              <select aria-label="Weekday" className={SELECT_CLASS} {...register(`schedule.dayparting.${index}.weekday`, { valueAsNumber: true, ...changed })}>
                {WEEKDAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              <Input
                type="time"
                aria-label="From"
                className="w-28"
                aria-invalid={invalid}
                aria-describedby={invalid ? `${path}-error` : undefined}
                {...register(`schedule.dayparting.${index}.from`, changed)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                aria-label="To"
                className="w-28"
                aria-invalid={invalid}
                aria-describedby={invalid ? `${path}-error` : undefined}
                {...register(`schedule.dayparting.${index}.to`, changed)}
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove window ${index + 1}`}
                onClick={() => {
                  remove(index);
                  revalidate("schedule.dayparting");
                  // The removed row takes its focus with it: move it to a stable place.
                  addRef.current?.focus();
                }}
              >
                <Trash2 />
              </Button>
            </div>
            {invalid && (
              <p id={`${path}-error`} className="text-sm text-destructive">
                {messages.join(" ")}
              </p>
            )}
          </div>
        );
      })}

      <div>
        <Button ref={addRef} type="button" variant="outline" size="sm" onClick={() => append({ weekday: 1, from: "09:00", to: "17:00" })}>
          <Plus /> Add window
        </Button>
      </div>
    </fieldset>
  );
}

type MoneyInputProps = {
  id: string;
  /** Minor units (cents), or NaN while the text isn't a valid amount. */
  value: number;
  invalid: boolean;
  inputRef: Ref<HTMLInputElement>;
  onChange: (minor: number) => void;
  onBlur: () => void;
};

/**
 * The form stores integer minor units; the user types text. While typing, the text stays exactly
 * as typed and the parsed value goes to the form (NaN if it isn't a valid amount, so the schema
 * reports "Enter an amount"). On blur a valid amount is reformatted: "1234.5" → "1,234.50".
 */
function MoneyInput({ id, value, invalid, inputRef, onChange, onBlur }: MoneyInputProps) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? formatAmount(value) : ""));

  return (
    <Input
      id={id}
      ref={inputRef}
      inputMode="decimal"
      autoComplete="off"
      className="w-40 tabular-nums"
      aria-invalid={invalid}
      aria-describedby="budget-amount-error"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseAmount(event.target.value) ?? Number.NaN);
      }}
      onBlur={() => {
        const minor = parseAmount(text);
        if (minor !== null) setText(formatAmount(minor));
        onBlur();
      }}
    />
  );
}
