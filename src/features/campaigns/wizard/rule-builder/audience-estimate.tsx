"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { fetchJson } from "@/lib/fetch-json";
import { ruleGroupSchema } from "../../schemas";
import type { CampaignFormValues } from "../../types";

const DEBOUNCE_MS = 500;
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

type Result = { key: string; count: number } | { key: string; error: true };

/**
 * Live audience size for the current rule tree (`POST /api/audience/estimate`, 200–1500 ms).
 * - The only component watching the whole tree: typing re-renders this panel, not the rules.
 * - Debounced: one request after the user pauses.
 * - Races: a newer tree aborts the older request (AbortController), and a request number makes
 *   sure an older response can never replace a newer one — even if it arrived just before abort.
 * - The last number stays on screen (dimmed) while a new one loads, so it doesn't jump around.
 */
export function AudienceEstimate() {
  const { control } = useFormContext<CampaignFormValues>();
  const audience = useWatch({ control, name: "audience" });

  const parsed = ruleGroupSchema.safeParse(audience);
  // The tree as a string: a stable value for the effect and a key for "which tree is this answer for".
  const key = parsed.success ? JSON.stringify(parsed.data) : null;

  const [result, setResult] = useState<Result | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!key) return; // invalid tree: nothing to estimate yet

    const requestId = ++latestRequest.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { count } = await fetchJson<{ count: number }>("/api/audience/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          signal: controller.signal,
        });
        if (requestId === latestRequest.current) setResult({ key, count });
      } catch {
        if (!controller.signal.aborted && requestId === latestRequest.current) setResult({ key, error: true });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  const isCurrent = result?.key === key;
  const lastCount = result && "count" in result ? result.count : null;

  return (
    <aside aria-labelledby="estimate-heading" className="grid content-start gap-2 rounded-lg border p-4 lg:sticky lg:top-4">
      <h3 id="estimate-heading" className="text-sm font-medium text-muted-foreground">
        Estimated audience
      </h3>
      <div aria-live="polite" className="grid gap-1">
        {!key ? (
          <p className="text-sm text-muted-foreground">Complete the rules to see an estimate.</p>
        ) : result && isCurrent && "error" in result ? (
          <p className="text-sm text-destructive">Couldn&apos;t estimate right now. Change a rule to retry.</p>
        ) : (
          <>
            <p className={`text-3xl font-semibold tabular-nums ${isCurrent ? "" : "opacity-50"}`}>
              {lastCount === null ? "—" : compact.format(lastCount)}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isCurrent ? "people match these rules" : (
                <>
                  <Loader2 className="size-3 animate-spin" /> Updating…
                </>
              )}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
