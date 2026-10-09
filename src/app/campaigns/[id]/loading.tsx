// Shown instantly while the server renders the campaign page.
export default function Loading() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-6" aria-busy="true" aria-label="Loading campaign">
      <div className="grid gap-3">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-80 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-18 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-36 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
