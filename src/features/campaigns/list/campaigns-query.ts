import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import type { CampaignListItem, CampaignPage } from "../list-query";
import { toApiSearchParams, type ListViewState } from "./list-params";

// Everything the list needs from React Query in one place: the key, the page fetcher and
// a helper that edits loaded rows in the cache.

export const PAGE_SIZE = 100;

type ListQueryInput = Pick<ListViewState, "filters" | "sort" | "order">;

/** Only filters and sort change the data; columns and widths are view-only, so they aren't in the key. */
export function campaignsQueryKey({ filters, sort, order }: ListQueryInput) {
  return ["campaigns", { filters, sort, order }] as const;
}

export function fetchCampaignPage(input: ListQueryInput, cursor: string | null, signal: AbortSignal) {
  const params = toApiSearchParams(input, { cursor, limit: PAGE_SIZE });
  return fetchJson<CampaignPage>(`/api/campaigns?${params}`, { signal });
}

/** Applies `patches[id]` to that row in every cached list (all filters/sorts). */
export function patchCampaignRows(queryClient: QueryClient, patches: Record<string, Partial<CampaignListItem>>) {
  queryClient.setQueriesData<InfiniteData<CampaignPage>>({ queryKey: ["campaigns"] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (patches[item.id] ? { ...item, ...patches[item.id] } : item)),
      })),
    };
  });
}
