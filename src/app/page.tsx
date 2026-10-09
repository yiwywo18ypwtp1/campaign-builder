import Link from "next/link";

// Temporary start page; it will redirect to /campaigns once the list exists (phase 4).
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Campaign Builder</h1>
      <p className="mt-2 text-muted-foreground">
        The campaign list arrives in phase 4. For now, try the{" "}
        <Link href="/settings" className="underline underline-offset-4">
          settings page
        </Link>
        .
      </p>
    </main>
  );
}
