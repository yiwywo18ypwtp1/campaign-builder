"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLUMN_KEYS, COLUMN_LABELS } from "@/features/campaigns/list-query";
import { savePreferencesAction } from "./actions";
import { preferencesSchema, type Preferences } from "./preferences";

type Props = {
  defaultValues: Preferences;
  timezones: string[];
};

export function PreferencesForm({ defaultValues, timezones }: Props) {
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Preferences>({ resolver: zodResolver(preferencesSchema), defaultValues });

  async function onSubmit(values: Preferences) {
    const result = await savePreferencesAction(values);
    if (!result.ok) {
      // Field errors from the server go to their fields; the general message goes above the button.
      for (const [path, message] of Object.entries(result.error.fieldErrors ?? {})) {
        setError(path as FieldPath<Preferences>, { message });
      }
      setError("root.server", { message: result.error.message });
      return;
    }
    reset(result.data); // the saved values become the new "clean" state
    toast.success("Preferences saved");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="default-timezone">Default timezone for new campaigns</Label>
        <Controller
          control={control}
          name="defaultTimezone"
          render={({ field, fieldState }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="default-timezone"
                className="w-72"
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.error ? "default-timezone-error" : undefined}
              >
                {/* Explicit text: Radix can't know the item label during SSR, so the value would flash empty. */}
                <SelectValue>{field.value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {timezones.map((timezone) => (
                  <SelectItem key={timezone} value={timezone}>
                    {timezone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.defaultTimezone && (
          <p id="default-timezone-error" className="text-sm text-destructive">
            {errors.defaultTimezone.message}
          </p>
        )}
      </div>

      <fieldset className="grid gap-3" aria-describedby={errors.columns?.visible ? "columns-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Visible columns in the campaign list</legend>
        <Controller
          control={control}
          name="columns.visible"
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {COLUMN_KEYS.map((key) => (
                <Label key={key} htmlFor={`column-${key}`} className="flex cursor-pointer items-center gap-2 font-normal">
                  <Checkbox
                    id={`column-${key}`}
                    checked={field.value.includes(key)}
                    onCheckedChange={(checked) =>
                      // Keep the canonical column order instead of the click order.
                      field.onChange(COLUMN_KEYS.filter((k) => (k === key ? checked === true : field.value.includes(k))))
                    }
                  />
                  {COLUMN_LABELS[key]}
                </Label>
              ))}
            </div>
          )}
        />
        {errors.columns?.visible && (
          <p id="columns-error" className="text-sm text-destructive">
            {errors.columns.visible.message}
          </p>
        )}
      </fieldset>

      {errors.root?.server && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.server.message}
        </p>
      )}

      <div>
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
