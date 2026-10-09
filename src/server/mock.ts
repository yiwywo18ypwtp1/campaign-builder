import "server-only";
import type { ApiErrorBody } from "@/lib/result";

// Simulated network conditions for the mock API (Route Handlers and Server Actions only;
// Server Component reads are not affected, see ARCHITECTURE.md → D14).
//   MOCK_LATENCY_MS   — extra delay for every call (default 0)
//   MOCK_FAILURE_RATE — 0..1, share of calls that fail with 500 (default 0)

function envNumber(name: string): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Waits like a real network and sometimes fails.
 * `delay` overrides the latency for endpoints with their own simulated range (slug check, estimate).
 * Returns an error body when the call should fail, otherwise `null`.
 */
export async function simulateNetwork(delay?: { minMs: number; maxMs: number }): Promise<ApiErrorBody | null> {
  const ms = delay ? delay.minMs + Math.random() * (delay.maxMs - delay.minMs) : envNumber("MOCK_LATENCY_MS");
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));

  if (Math.random() < envNumber("MOCK_FAILURE_RATE")) {
    return { code: "INTERNAL", message: "Simulated server failure (MOCK_FAILURE_RATE)" };
  }
  return null;
}
