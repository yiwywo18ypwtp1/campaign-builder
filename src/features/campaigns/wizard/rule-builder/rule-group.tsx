"use client";

import { FolderPlus, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Controller, get, useFieldArray, useFormContext, useFormState } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_RULES_PER_GROUP } from "../../schemas";
import type { CampaignFormValues } from "../../types";
import { RuleRow } from "./rule-row";
import { asGroupPath, defaultRule, MAX_GROUP_DEPTH, newGroup } from "./rules";

type Props = {
  /** Runtime path of this group: "audience" or e.g. "audience.children.2". */
  path: string;
  depth: number;
  currencies: string[];
  /** Removes this group from its parent (absent for the root group). */
  onRemove?: () => void;
};

/**
 * One group of the rule tree. Each group owns a field array for its own `children`
 * (nested `useFieldArray`), so adding/removing/moving re-renders this group only.
 * Items are keyed by RHF's stable `field.id`, never by index: a removed or moved rule keeps
 * its DOM, its input state and its focus.
 */
export function RuleGroup({ path, depth, currencies, onRemove }: Props) {
  const groupPath = asGroupPath(path);
  const { control } = useFormContext<CampaignFormValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: `${groupPath}.children` });

  // Group-level errors (empty group, too many items). With registered children the resolver
  // puts them at "children.root", for an empty group directly at "children".
  // `exact: true` matters: without it RHF matches names by prefix, so every change anywhere
  // below this group ("…children.30.op") would re-render the group — and with it every row.
  const { errors } = useFormState({ control, name: `${groupPath}.children`, exact: true });
  const groupError: string | undefined = get(errors, `${path}.children.root`)?.message ?? get(errors, `${path}.children`)?.message;

  const addRuleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const canAddGroup = depth + 1 < MAX_GROUP_DEPTH;
  const isFull = fields.length >= MAX_RULES_PER_GROUP;
  const errorId = `${path}-group-error`;

  function removeChild(index: number) {
    remove(index);
    // The removed item may have contained the focused element: move focus to a stable place
    // in this group instead of letting it fall back to <body>.
    addRuleRef.current?.focus();
  }

  function moveChild(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    move(index, target);
    // Keep keyboard users on the moved row (found by its new path). At the first/last position the
    // same-direction button becomes disabled and can't hold focus, so fall back to the other one.
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-path="${path}.children.${target}"]`);
      const button =
        row?.querySelector<HTMLButtonElement>(`[data-move="${direction}"]:not(:disabled)`) ??
        row?.querySelector<HTMLButtonElement>("[data-move]:not(:disabled)");
      button?.focus();
    });
  }

  return (
    <section
      aria-label={depth === 0 ? "Audience rules" : "Rule group"}
      aria-describedby={groupError ? errorId : undefined}
      className={cn("grid gap-3 rounded-lg border p-3", depth > 0 && "bg-muted/40", groupError && "border-destructive")}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Match</span>
        <Controller
          control={control}
          name={`${groupPath}.op`}
          render={({ field }) => (
            <div role="radiogroup" aria-label="Combine rules with" className="flex rounded-lg border p-0.5">
              {(["and", "or"] as const).map((op) => (
                <button
                  key={op}
                  type="button"
                  role="radio"
                  aria-checked={field.value === op}
                  onClick={() => field.onChange(op)}
                  className={cn(
                    "rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase",
                    field.value === op ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {op === "and" ? "All" : "Any"}
                </button>
              ))}
            </div>
          )}
        />
        <span className="text-sm text-muted-foreground">of these</span>
        {onRemove && (
          <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={onRemove} aria-label="Remove group">
            <Trash2 /> Remove group
          </Button>
        )}
      </div>

      <ol ref={listRef} className="grid gap-3">
        {fields.map((field, index) => {
          const childPath = `${path}.children.${index}`;
          return (
            <li key={field.id}>
              {/* `kind` never changes for an item, so the snapshot in `fields` is enough to choose the component. */}
              {field.kind === "group" ? (
                <RuleGroup path={childPath} depth={depth + 1} currencies={currencies} onRemove={() => removeChild(index)} />
              ) : (
                <RuleRow
                  path={childPath}
                  currencies={currencies}
                  canMoveUp={index > 0}
                  canMoveDown={index < fields.length - 1}
                  onMove={(direction) => moveChild(index, direction)}
                  onRemove={() => removeChild(index)}
                />
              )}
            </li>
          );
        })}
      </ol>

      {groupError && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {groupError}
        </p>
      )}

      <div className="flex gap-2">
        <Button ref={addRuleRef} type="button" size="sm" variant="outline" disabled={isFull} onClick={() => append(defaultRule("country"))}>
          <Plus /> Add rule
        </Button>
        {canAddGroup && (
          <Button type="button" size="sm" variant="outline" disabled={isFull} onClick={() => append(newGroup())}>
            <FolderPlus /> Add group
          </Button>
        )}
        {isFull && <span className="self-center text-xs text-muted-foreground">A group holds up to {MAX_RULES_PER_GROUP} items.</span>}
      </div>
    </section>
  );
}
