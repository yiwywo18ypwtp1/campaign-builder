"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/fetch-json";

// React Query is used for client-side lists only (ARCHITECTURE.md → D1).
export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser tab; useState keeps it across re-renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Long enough that "open a campaign → back" shows the cached pages without refetching.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            // 4xx won't succeed on retry; network errors and 5xx might.
            retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
