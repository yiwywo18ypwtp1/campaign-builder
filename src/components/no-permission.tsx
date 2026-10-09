import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Shown by a page when the role can't use it (e.g. a viewer opens /campaigns/new by a direct link).
 * This only hides the UI; the Server Actions behind it check the role again.
 */
export function NoPermission({ message }: { message: string }) {
  return (
    <main className="mx-auto grid w-full max-w-3xl justify-items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">No access</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/settings">Switch role</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    </main>
  );
}
