"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { slugSchema } from "../schemas";

export type SlugStatus = "idle" | "checking" | "available" | "taken" | "error";

const DEBOUNCE_MS = 400;

/**
 * Checks slug uniqueness while the user types, without blocking the input:
 * - debounce: a request goes out only after a 400 ms pause;
 * - AbortController: a newer slug cancels the request for the older one, so a late answer
 *   for "autumn" can't overwrite the answer for "autumn-sale";
 * - cache: every answer is kept per slug, so a slug that was already checked (typing back and
 *   forth) is never requested again.
 * The server stays the authority: a slug taken in the meantime still fails on save (409).
 */
export function useSlugAvailability(slug: string, excludeId?: string): SlugStatus {
  // slug → answer. State (not a ref) because the returned status is derived from it.
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  // Failures are kept apart from answers: they aren't cached, the next edit of the slug retries.
  const [failedSlug, setFailedSlug] = useState<string | null>(null);

  const isValid = slugSchema.safeParse(slug).success;
  const cached = answers[slug];

  useEffect(() => {
    // Invalid format is reported by the form itself; a known answer needs no request.
    if (!isValid || cached !== undefined) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ slug });
      if (excludeId) params.set("excludeId", excludeId);
      setFailedSlug(null); // a retry shows "checking" again
      try {
        const { available } = await fetchJson<{ available: boolean }>(`/api/campaigns/slug-available?${params}`, {
          signal: controller.signal,
        });
        setAnswers((current) => ({ ...current, [slug]: available }));
      } catch {
        if (controller.signal.aborted) return; // superseded by a newer slug — not an error
        setFailedSlug(slug);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, excludeId, isValid, cached]);

  if (!isValid) return "idle";
  if (cached !== undefined) return cached ? "available" : "taken";
  return failedSlug === slug ? "error" : "checking";
}
