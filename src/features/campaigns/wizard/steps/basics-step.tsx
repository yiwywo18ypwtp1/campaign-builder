"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Controller, useFormContext, useFormState } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { objectiveSchema } from "../../schemas";
import type { CampaignFormValues } from "../../types";
import { FieldError } from "../field-error";
import { slugify } from "../slugify";
import type { SlugStatus } from "../use-slug-availability";

const OBJECTIVE_DESCRIPTIONS: Record<CampaignFormValues["objective"], string> = {
  awareness: "Reach as many people as possible.",
  conversion: "Drive purchases and sign-ups.",
  retention: "Bring existing customers back.",
};

type Props = {
  /** New campaigns derive the slug from the name until the user edits the slug. */
  autoSlug: boolean;
  slugStatus: SlugStatus;
};

export function BasicsStep({ autoSlug, slugStatus }: Props) {
  const { register, control, setValue, getFieldState } = useFormContext<CampaignFormValues>();
  // useFormState subscribes only this component to errors. Reading `formState.errors` from the
  // context would subscribe the form's root (the whole wizard) and re-render every step on each error change.
  const { errors } = useFormState({ control, name: ["name", "slug", "objective"] });

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          autoComplete="off"
          aria-invalid={!!errors.name}
          aria-describedby="name-error"
          {...register("name", {
            onChange: (event) => {
              // A slug the user typed is "dirty"; one we generated with setValue isn't. Only the latter follows the name.
              const slugState = getFieldState("slug");
              if (autoSlug && !slugState.isDirty) {
                // Re-validate if the slug already shows an error, so a stale message doesn't stay.
                setValue("slug", slugify(event.target.value), { shouldValidate: slugState.isTouched || !!slugState.error });
              }
            },
          })}
        />
        <FieldError id="name-error" message={errors.name?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="slug">Slug</Label>
        <div className="flex items-center gap-3">
          <Input
            id="slug"
            autoComplete="off"
            className="max-w-md font-mono"
            aria-invalid={!!errors.slug || slugStatus === "taken"}
            aria-describedby="slug-hint slug-status slug-error"
            {...register("slug")}
          />
          <SlugIndicator status={slugStatus} />
        </div>
        <p id="slug-hint" className="text-xs text-muted-foreground">
          Used in links. Lowercase letters, digits and dashes.
        </p>
        <FieldError id="slug-error" message={errors.slug?.message} />
      </div>

      <fieldset className="grid gap-3" aria-describedby="objective-error">
        <legend className="mb-1 text-sm font-medium">Objective</legend>
        <Controller
          control={control}
          name="objective"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-3">
              {objectiveSchema.options.map((objective) => (
                <Label
                  key={objective}
                  htmlFor={`objective-${objective}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary"
                >
                  <RadioGroupItem id={`objective-${objective}`} value={objective} className="mt-0.5" />
                  <span className="grid gap-1">
                    <span className="font-medium capitalize">{objective}</span>
                    <span className="text-sm font-normal text-muted-foreground">{OBJECTIVE_DESCRIPTIONS[objective]}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        <FieldError id="objective-error" message={errors.objective?.message} />
      </fieldset>
    </div>
  );
}

function SlugIndicator({ status }: { status: SlugStatus }) {
  // aria-live: screen readers hear "Checking…" / "Available" without moving focus.
  return (
    <span id="slug-status" aria-live="polite" className="flex items-center gap-1.5 text-sm">
      {status === "checking" && (
        <>
          <Loader2 className="size-4 animate-spin text-muted-foreground" /> <span className="text-muted-foreground">Checking…</span>
        </>
      )}
      {status === "available" && (
        <>
          <CheckCircle2 className="size-4 text-emerald-600" /> <span className="text-emerald-700">Available</span>
        </>
      )}
      {status === "taken" && (
        <>
          <XCircle className="size-4 text-destructive" /> <span className="text-destructive">Already taken</span>
        </>
      )}
      {status === "error" && <span className="text-muted-foreground">Couldn&apos;t check — will be verified on save</span>}
    </span>
  );
}
