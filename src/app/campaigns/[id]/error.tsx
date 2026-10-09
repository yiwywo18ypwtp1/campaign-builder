"use client"; // error boundaries must be Client Components

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Only for unexpected failures while rendering the page. Expected errors (a failed action,
// a failed poll, "load more") are handled where they happen and never reach this boundary.
export default function CampaignError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto grid w-full max-w-5xl justify-items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Couldn&apos;t load this campaign</h1>
      <p className="text-muted-foreground">
        Something went wrong on our side.{error.digest && <> Reference: <code>{error.digest}</code></>}
      </p>
      <div className="flex gap-2">
        {/* retry() re-fetches the page from the server, unlike reset() which only re-renders. */}
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    </main>
  );
}
