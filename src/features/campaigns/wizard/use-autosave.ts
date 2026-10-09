"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { saveDraftAction } from "../actions";
import { FORM_STEPS, type buildCampaignSchemas, type FormStep } from "../schemas";
import { STEP_FIELDS } from "./steps";
import type { CampaignFormValues } from "../types";

export type SaveState = "idle" | "saved" | "saving" | "unsaved" | "error" | "conflict";

const DEBOUNCE_MS = 2000;

type Options = {
  form: UseFormReturn<CampaignFormValues>;
  steps: ReturnType<typeof buildCampaignSchemas>["steps"];
  /** Only drafts are autosaved; other campaigns are saved with the final button. */
  enabled: boolean;
  id?: string;
  version?: number;
};

/**
 * Draft autosave. Changes are watched with `form.subscribe` (no re-render per keystroke); after 2 s
 * without changes the draft is saved silently:
 * - steps are checked with `safeParse` (not `trigger`, which would paint errors on fields the user
 *   hasn't reached yet); the longest valid prefix of steps is sent, the server merges only those;
 * - saves run strictly one at a time: a change during a save is picked up by the next one;
 * - "unsaved" is a comparison with the last saved snapshot, not RHF's `isDirty`: `form.reset()` would also
 *   clear per-field dirty flags, and the slug field uses its flag to know the user typed it by hand.
 */
export function useAutosave({ form, steps, enabled, id: initialId, version: initialVersion }: Options) {
  const [state, setState] = useState<SaveState>(initialId ? "saved" : "idle");
  const [message, setMessage] = useState<string>();
  const [id, setId] = useState(initialId);

  const version = useRef(initialVersion);
  const idRef = useRef(initialId);
  // What the server has: the values of the steps saved so far. "Unsaved" = the form differs from this.
  const saved = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const paused = useRef(false); // the final submit is running
  const stopped = useRef(false); // someone else saved: autosave must not overwrite their work
  const finished = useRef(false); // the wizard was submitted: nothing is unsaved any more

  const hasChanges = () => JSON.stringify(form.getValues()) !== JSON.stringify(saved.current);

  // Stable (depends only on the stable `form`): the dirty guard puts it into an effect's dependencies.
  const hasUnsavedChanges = useCallback(
    () => !finished.current && (JSON.stringify(form.getValues()) !== JSON.stringify(saved.current) || inFlight.current !== null),
    [form],
  );

  async function save() {
    timer.current = undefined;
    if (stopped.current || paused.current || !hasChanges()) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }

    const values = form.getValues();
    // Longest run of valid steps from the start: [basics ✓, audience ✗] saves only basics.
    let validSteps: FormStep[] = [];
    for (const step of FORM_STEPS) {
      if (!steps[step].safeParse(values).success) break;
      validSteps = [...validSteps, step];
    }
    const lastValid = validSteps.at(-1);
    if (!lastValid) {
      setState("unsaved");
      return;
    }

    setState("saving");
    inFlight.current = (async () => {
      const result = await saveDraftAction({ id: idRef.current, values, step: lastValid, version: version.current });
      if (result.ok) {
        const created = idRef.current === undefined;
        idRef.current = result.data.id;
        version.current = result.data.version;
        // Steps after the first invalid one weren't saved: their edits stay "unsaved".
        const savedFields = validSteps.flatMap((step) => STEP_FIELDS[step]);
        saved.current = { ...saved.current, ...Object.fromEntries(savedFields.map((name) => [name, structuredClone(values[name as keyof typeof values])])) };
        setMessage(undefined);
        if (created) {
          setId(result.data.id);
          // The draft now has a URL of its own; replaceState keeps the form mounted (no navigation).
          window.history.replaceState(window.history.state, "", `/campaigns/${result.data.id}/edit${window.location.search}`);
        }
        setState(hasChanges() ? "unsaved" : "saved");
      } else if (result.error.code === "VERSION_CONFLICT") {
        stopped.current = true;
        setState("conflict");
      } else {
        setMessage(result.error.message);
        setState("error");
      }
    })();
    await inFlight.current;
    inFlight.current = null;

    // Something changed while saving: save again (once, with the latest values).
    if (queued.current) {
      queued.current = false;
      schedule();
    }
  }

  function schedule() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
  }

  useEffect(() => {
    saved.current = structuredClone(form.getValues());
    // `form.subscribe` doesn't re-render anything: it is a plain callback for every value change.
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: () => {
        if (!enabled || stopped.current || paused.current) return;
        if (!hasChanges()) {
          clearTimeout(timer.current);
          if (!inFlight.current) setState("saved");
          return;
        }
        if (inFlight.current) queued.current = true;
        else setState("unsaved");
        schedule();
      },
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once; the callbacks only read refs and `form`
  }, [form, enabled]);

  return {
    state,
    message,
    /** Id of the draft once it exists (set by the first save), for the slug check. */
    id,
    /** For the dirty guard: called from event handlers, so it reads refs instead of causing renders. */
    hasUnsavedChanges,
    /** Save now instead of waiting for the debounce (the "Retry" button). */
    retry: () => void save(),
    /** Before the final submit: stop autosave, wait for a running save, return the latest id/version. */
    async settle() {
      paused.current = true;
      clearTimeout(timer.current);
      await inFlight.current;
      return { id: idRef.current, version: version.current };
    },
    /** The final submit failed: autosave may continue. */
    resume() {
      paused.current = false;
    },
    /** The final submit succeeded: leaving the page must not ask for confirmation. */
    finish() {
      finished.current = true;
    },
  };
}
