"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/permissions";
import type { Result } from "@/lib/result";
import type { Preferences } from "@/features/settings/preferences";
import { savePreferencesAction } from "@/features/settings/actions";
import { bulkStatusAction, changeStatusAction } from "../actions";
import type { CampaignListItem, ColumnKey, ListFilters, SortKey } from "../list-query";
import type { StatusAction } from "../status";
import type { CampaignStatus } from "../types";
import { BulkBar } from "./bulk-bar";
import { campaignsQueryKey, fetchCampaignPage, patchCampaignRows } from "./campaigns-query";
import { CampaignsTable } from "./campaigns-table";
import type { CampaignTableMeta } from "./columns";
import { FiltersBar } from "./filters-bar";
import { parseListParams, serializeListParams, type ListViewState } from "./list-params";

const EMPTY_ROWS: CampaignListItem[] = []; // stable fallback: a new [] each render would rebuild the table model

/** Status the row will most likely have after the action; the server response corrects it. */
const PREDICTED_STATUS: Record<StatusAction, CampaignStatus> = { pause: "paused", resume: "running", archive: "archived" };

type Props = {
  role: Role;
  owners: { id: string; name: string }[];
  preferences: Preferences;
};

export function CampaignsView({ role, owners, preferences }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = parseListParams(searchParams);
  const visibleColumns = view.columns ?? preferences.columns.visible;
  const widths = Object.keys(view.widths).length > 0 ? view.widths : preferences.columns.widths;

  const queryClient = useQueryClient();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  /**
   * The URL is the source of truth for the view. We write it with the native History API:
   * `useSearchParams` picks the change up, but there is no server round-trip like with
   * `router.replace` (the data comes from the API, not from the page). The patch is applied
   * to the *current* URL, so a delayed update (debounced search) can't undo a newer change.
   */
  function updateView(patch: Partial<ListViewState>) {
    const current = parseListParams(new URLSearchParams(window.location.search));
    const query = serializeListParams({ ...current, ...patch }).toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  function updateFilters(patch: Partial<ListFilters>) {
    const current = parseListParams(new URLSearchParams(window.location.search));
    updateView({ filters: { ...current.filters, ...patch } });
    setRowSelection({}); // selected rows may not be in the new result
    setRowErrors({});
  }

  function updateSort(sort: SortKey) {
    updateView({ sort, order: view.sort === sort && view.order === "asc" ? "desc" : "asc" });
  }

  function updateColumns(columns: ColumnKey[]) {
    updateView({ columns });
    // Visibility is also saved per user on the server, so it's the default next time.
    void savePreferencesAction({ ...preferences, columns: { ...preferences.columns, visible: columns } }).then((result) => {
      if (!result.ok) toast.error(`Couldn't save column preferences: ${result.error.message}`);
    });
  }

  const queryInput = { filters: view.filters, sort: view.sort, order: view.order };
  const query = useInfiniteQuery({
    queryKey: campaignsQueryKey(queryInput),
    // `signal` aborts the request when the key changes (a newer filter) or the list unmounts.
    queryFn: ({ pageParam, signal }) => fetchCampaignPage(queryInput, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Justified memo: flattening every loaded page is O(rows), and TanStack Table needs a stable
  // `data` reference — a new array on each render would rebuild its row model each time.
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? EMPTY_ROWS, [query.data]);
  const total = query.data?.pages[0]?.total;

  /* Inline status change: optimistic, rolled back on error. */
  const statusMutation = useMutation({
    mutationFn: async ({ campaign, action }: { campaign: CampaignListItem; action: StatusAction }) =>
      unwrap(await changeStatusAction(campaign.id, action)),
    onMutate: async ({ campaign, action }) => {
      // Stop in-flight fetches so an older response can't overwrite the optimistic row.
      await queryClient.cancelQueries({ queryKey: ["campaigns"] });
      patchCampaignRows(queryClient, { [campaign.id]: { status: PREDICTED_STATUS[action] } });
      setRowErrors((errors) => {
        const next = { ...errors };
        delete next[campaign.id];
        return next;
      });
    },
    onSuccess: (updated) => {
      patchCampaignRows(queryClient, {
        [updated.id]: { status: updated.status, version: updated.version, updatedAt: updated.updatedAt },
      });
    },
    onError: (error, { campaign }) => {
      // Roll back only this row (not a snapshot of the whole cache), so other rows changed
      // meanwhile keep their state.
      patchCampaignRows(queryClient, { [campaign.id]: { status: campaign.status } });
      setRowErrors((errors) => ({ ...errors, [campaign.id]: error.message }));
      toast.error(`${campaign.name}: ${error.message}`);
    },
  });

  /* Bulk: one request with the selected ids; failures are shown per row. */
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: StatusAction }) => unwrap(await bulkStatusAction(ids, action)),
    onSuccess: (result) => {
      patchCampaignRows(queryClient, Object.fromEntries(result.ok.map(({ id, status }) => [id, { status }])));
      setRowErrors(Object.fromEntries(result.failed.map(({ id, reason }) => [id, reason])));
      // Keep only the failed rows selected, so the user can see and retry them.
      setRowSelection(Object.fromEntries(result.failed.map(({ id }) => [id, true])));
      // Loaded rows are patched; filtered views may now be outdated (a paused row in a
      // "running" filter), so refetch them the next time they are shown.
      void queryClient.invalidateQueries({ queryKey: ["campaigns"], refetchType: "none" });

      const summary = `${result.ok.length} updated`;
      if (result.failed.length > 0) toast.warning(`${summary}, ${result.failed.length} failed — see the highlighted rows`);
      else toast.success(summary);
    },
    onError: (error) => toast.error(`Bulk action failed: ${error.message}`),
  });

  const meta: CampaignTableMeta = {
    role,
    rowErrors,
    onStatusAction: (campaign, action) => statusMutation.mutate({ campaign, action }),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FiltersBar
        filters={view.filters}
        owners={owners}
        visibleColumns={visibleColumns}
        onFiltersChange={updateFilters}
        onColumnsChange={updateColumns}
      />

      <div className="flex min-h-8 items-center text-sm text-muted-foreground">
        {total !== undefined && <span>{total.toLocaleString("en-US")} campaigns</span>}
      </div>

      {selectedIds.length > 0 && role !== "viewer" && (
        <BulkBar
          role={role}
          selectedCount={selectedIds.length}
          pendingAction={bulkMutation.isPending ? bulkMutation.variables.action : null}
          onAction={(action) => bulkMutation.mutate({ ids: selectedIds, action })}
          onClear={() => {
            setRowSelection({});
            setRowErrors({});
          }}
        />
      )}

      {query.isPending ? (
        <p className="py-10 text-center text-muted-foreground">Loading campaigns…</p>
      ) : query.isError && rows.length === 0 ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-10">
          <p className="text-destructive">Couldn&apos;t load campaigns: {query.error.message}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No campaigns match these filters.</p>
      ) : (
        <CampaignsTable
          // A new filter/sort is a new list: remount to start from the top (or its saved position).
          key={campaignsQueryKeyString(queryInput)}
          scrollKey={`campaigns-scroll:${campaignsQueryKeyString(queryInput)}`}
          rows={rows}
          meta={meta}
          visibleColumns={visibleColumns}
          widths={widths}
          onWidthsChange={(next) => updateView({ widths: next })}
          sort={view.sort}
          order={view.order}
          onSortChange={updateSort}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          isNextPageError={query.isFetchNextPageError}
          fetchNextPage={() => void query.fetchNextPage()}
        />
      )}
    </div>
  );
}

function campaignsQueryKeyString(input: Pick<ListViewState, "filters" | "sort" | "order">) {
  return serializeListParams({ ...input, columns: null, widths: {} }).toString();
}

/** Server Actions return `Result`; React Query expects a thrown error for failures. */
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
