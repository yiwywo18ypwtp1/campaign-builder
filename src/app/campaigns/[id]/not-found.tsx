import Link from "next/link";
import { Button } from "@/components/ui/button";

// Rendered when the page calls notFound() (unknown id).
export default function CampaignNotFound() {
  return (
    <main className="mx-auto grid w-full max-w-5xl justify-items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Campaign not found</h1>
      <p className="text-muted-foreground">It may have been deleted, or the link is wrong.</p>
      <Button variant="outline" asChild>
        <Link href="/campaigns">Back to campaigns</Link>
      </Button>
    </main>
  );
}
