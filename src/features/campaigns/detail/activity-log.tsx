"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/fetch-json";
import type { ActivityItem, ActivityPage } from "../types";

// Times are shown in UTC on purpose: the first page is rendered on the server, and using the
// browser's timezone would make the server and client HTML differ (hydration mismatch).
const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "UTC" });

type Props = { campaignId: string; initialPage: ActivityPage };

/** The first page comes from the server; "Load more" follows the cursor. */
export function ActivityLog({ campaignId, initialPage }: Props) {
  const [items, setItems] = useState<ActivityItem[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function loadMore() {
    if (!nextCursor || state === "loading") return; // the disabled button also prevents double requests
    setState("loading");
    try {
      const page = await fetchJson<ActivityPage>(`/api/campaigns/${campaignId}/activity?cursor=${encodeURIComponent(nextCursor)}`);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setState("idle");
    } catch {
      setState("error"); // keep what is already loaded; the user can retry
    }
  }

  return (
    <section aria-labelledby="activity-heading" className="grid gap-3">
      <h2 id="activity-heading" className="text-lg font-medium">
        Activity
      </h2>
      <ol className="grid gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap gap-x-2 text-sm">
            <time dateTime={item.at} className="text-muted-foreground tabular-nums">
              {timeFormat.format(new Date(item.at))} UTC
            </time>
            <span>
              <span className="font-medium">{item.actorName}</span> {item.message}
            </span>
          </li>
        ))}
      </ol>
      {nextCursor && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={state === "loading"}>
            {state === "loading" ? "Loading…" : state === "error" ? "Retry" : "Load more"}
          </Button>
          {state === "error" && (
            <span role="alert" className="text-sm text-destructive">
              Couldn&apos;t load more activity.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
