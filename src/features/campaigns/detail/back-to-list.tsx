"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readLastListUrl } from "../list/last-list-url";

const noSubscription = () => () => {};

/**
 * "← Campaigns" that returns to the list as the user left it (filters, sort, columns).
 * The list stores its last URL in sessionStorage. `useSyncExternalStore` reads it with a
 * separate server snapshot (`null`): the server HTML links to /campaigns, and the browser
 * switches to the stored URL during hydration without a mismatch.
 */
export function BackToList() {
  const saved = useSyncExternalStore(noSubscription, readLastListUrl, () => null);

  return (
    <Link href={saved ?? "/campaigns"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Campaigns
    </Link>
  );
}
