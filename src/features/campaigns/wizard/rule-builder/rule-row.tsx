"use client";

import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { Controller, get, useFormContext, useFormState, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CampaignFormValues, RuleField } from "../../types";
import { asChildPath, COUNTRIES, defaultRule, FIELD_LABELS, FIELD_OPERATORS, type ChildPath } from "./rules";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

type Props = {
  /** Runtime path of this rule, e.g. "audience.children.1.children.0". */
  path: string;
  currencies: string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
};

/**
 * One rule. Render isolation (typing in one rule must not re-render the tree):
 * - `useWatch` subscribes to this rule's `field` only — the row re-renders when the type changes;
 * - `useFormState({ name: path })` subscribes to this rule's errors only;
 * - text/number inputs use `register` (uncontrolled): typing doesn't render React at all;
 *   selects use `Controller`, which re-renders just itself.
 */
export function RuleRow({ path, currencies, canMoveUp, canMoveDown, onMove, onRemove }: Props) {
  const rulePath: ChildPath = asChildPath(path);
  const { control, setValue, clearErrors } = useFormContext<CampaignFormValues>();
  const field = useWatch({ control, name: `${rulePath}.field` }) as RuleField;
  // Only this rule's value errors, matched exactly. A plain `name: rulePath` would match by prefix:
  // rule "…children.3" would also react to changes in rule "…children.30".
  // Reading only `errors` (not getFieldState, which also reads dirty/touched state) keeps the
  // subscription to errors: RHF broadcasts dirty-state changes to every subscriber.
  const { errors } = useFormState({
    control,
    name: [`${rulePath}.value`, `${rulePath}.value.0`, `${rulePath}.value.1`],
    exact: true,
  });
  // For tuples the message can sit on an item (age: "value.1") rather than on `value` itself.
  const valueMessage: string | undefined =
    get(errors, `${path}.value`)?.message ?? get(errors, `${path}.value.0`)?.message ?? get(errors, `${path}.value.1`)?.message;
  // DOM ids come from the path, not from RHF's `field.id`: those ids are random and differ between
  // the server render and the browser, which would break hydration.
  const errorId = `${path}-error`;

  function changeField(next: RuleField) {
    // Replace the whole rule: operator and value always match the new field, no leftover keys.
    setValue(rulePath, defaultRule(next), { shouldDirty: true });
    clearErrors(rulePath); // errors of the old type (e.g. "value.1") no longer apply
  }

  return (
    <div className="grid gap-1" data-path={path}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Rule: ${FIELD_LABELS[field]}`}>
        <select
          aria-label="Field"
          className={SELECT_CLASS}
          value={field}
          onChange={(event) => changeField(event.target.value as RuleField)}
        >
          {(Object.keys(FIELD_LABELS) as RuleField[]).map((option) => (
            <option key={option} value={option}>
              {FIELD_LABELS[option]}
            </option>
          ))}
        </select>

        <Controller
          control={control}
          name={`${rulePath}.op`}
          render={({ field: op }) => (
            <select aria-label="Operator" className={SELECT_CLASS} value={op.value} onChange={op.onChange} onBlur={op.onBlur}>
              {FIELD_OPERATORS[field].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        />

        {/* Keyed by the field type: switching it mounts the matching editor. */}
        <ValueEditor key={field} field={field} path={rulePath} currencies={currencies} invalid={!!valueMessage} errorId={errorId} />

        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Move rule up" data-move="up" disabled={!canMoveUp} onClick={() => onMove("up")}>
            <ArrowUp />
          </Button>
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Move rule down" data-move="down" disabled={!canMoveDown} onClick={() => onMove("down")}>
            <ArrowDown />
          </Button>
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Remove rule" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {valueMessage && (
        <p id={errorId} className="text-sm text-destructive">
          {valueMessage}
        </p>
      )}
    </div>
  );
}

type EditorProps = { field: RuleField; path: ChildPath; currencies: string[]; invalid: boolean; errorId: string };

function ValueEditor({ field, path, currencies, invalid, errorId }: EditorProps) {
  const { register, control } = useFormContext<CampaignFormValues>();
  const a11y = { "aria-invalid": invalid, "aria-describedby": invalid ? errorId : undefined };
  const numberInput = "w-24 tabular-nums";

  switch (field) {
    case "country":
      return (
        <Controller
          control={control}
          name={`${path}.value`}
          render={({ field: value }) => {
            const selected = (value.value as string[]) ?? [];
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" {...a11y} onBlur={value.onBlur}>
                    {selected.length > 0 ? selected.join(", ") : "Pick countries"} <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {COUNTRIES.map((country) => (
                    <DropdownMenuCheckboxItem
                      key={country}
                      checked={selected.includes(country)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) => {
                        value.onChange(checked ? [...selected, country] : selected.filter((c) => c !== country));
                        // A pick is a finished interaction (unlike typing): validate now, so a
                        // "Pick at least one country" error disappears right away.
                        value.onBlur();
                      }}
                    >
                      {country}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }}
        />
      );
    case "age":
      return (
        <span className="flex items-center gap-1.5">
          <Input type="number" aria-label="Minimum age" className={numberInput} {...a11y} {...register(`${path}.value.0`, { valueAsNumber: true })} />
          <span className="text-sm text-muted-foreground">and</span>
          <Input type="number" aria-label="Maximum age" className={numberInput} {...a11y} {...register(`${path}.value.1`, { valueAsNumber: true })} />
        </span>
      );
    case "ltv":
      return (
        <span className="flex items-center gap-1.5">
          <Input type="number" step="any" aria-label="Lifetime value" className={numberInput} {...a11y} {...register(`${path}.value`, { valueAsNumber: true })} />
          <select aria-label="Currency" className={SELECT_CLASS} {...register(`${path}.currency`)}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </span>
      );
    case "last_seen":
      return (
        <span className="flex items-center gap-1.5">
          <Input type="number" aria-label="Days" className={numberInput} {...a11y} {...register(`${path}.value`, { valueAsNumber: true })} />
          <span className="text-sm text-muted-foreground">days</span>
        </span>
      );
    case "tag":
      return <Input aria-label="Tag" placeholder="e.g. vip" className="w-48" {...a11y} {...register(`${path}.value`)} />;
  }
}
