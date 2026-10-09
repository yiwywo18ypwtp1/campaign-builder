"use client";

import {
  useTable,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type OnChangeFn,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COLUMN_KEYS, COLUMN_LABELS, SORT_KEYS, type CampaignListItem, type ColumnKey, type SortKey } from "../list-query";
import { columns, features, type CampaignTableMeta } from "./columns";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "./list-params";

const ROW_HEIGHT = 44; // fixed: the virtualizer knows every row's position without measuring
const LOAD_MORE_THRESHOLD = 30; // start loading the next page this many rows before the end

type Props = {
  rows: CampaignListItem[];
  meta: CampaignTableMeta;
  visibleColumns: ColumnKey[];
  widths: Partial<Record<ColumnKey, number>>;
  onWidthsChange: (widths: Partial<Record<ColumnKey, number>>) => void;
  sort: SortKey;
  order: "asc" | "desc";
  onSortChange: (sort: SortKey) => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isNextPageError: boolean;
  fetchNextPage: () => void;
  /** sessionStorage key for the scroll position of this exact view (filters + sort). */
  scrollKey: string;
};

export function CampaignsTable(props: Props) {
  const { rows, meta, visibleColumns, widths, sort, order, hasNextPage, isFetchingNextPage, fetchNextPage } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);

  // Derived from props, memoized because TanStack Table needs stable state objects:
  // a new object on every render would look like a state change.
  const columnVisibility = useMemo<ColumnVisibilityState>(
    () => ({
      select: meta.role !== "viewer",
      ...Object.fromEntries(COLUMN_KEYS.map((key) => [key, visibleColumns.includes(key)])),
    }),
    [meta.role, visibleColumns],
  );
  const columnSizing = useMemo<ColumnSizingState>(() => ({ ...widths }), [widths]);

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => row.id,
    meta,
    state: { columnVisibility, columnSizing, rowSelection: props.rowSelection },
    onRowSelectionChange: props.onRowSelectionChange,
    // "onEnd": widths are committed once when the drag ends, so the URL is written once
    // and the rows don't re-render on every mouse move.
    columnResizeMode: "onEnd",
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      const nextWidths: Partial<Record<ColumnKey, number>> = {};
      for (const key of COLUMN_KEYS) {
        if (next[key] !== undefined) {
          nextWidths[key] = Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, next[key])));
        }
      }
      props.onWidthsChange(nextWidths);
    },
  });

  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    // Coming back to the list: the pages are still in the React Query cache, so the rows exist
    // on the first render and we can jump straight to where the user was.
    initialOffset: () => readScrollTop(props.scrollKey),
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Infinite scroll: when the last rendered row gets close to the end, load the next page.
  const lastIndex = virtualItems.at(-1)?.index ?? -1;
  useEffect(() => {
    if (lastIndex >= tableRows.length - LOAD_MORE_THRESHOLD && hasNextPage && !isFetchingNextPage && !props.isNextPageError) {
      fetchNextPage();
    }
  }, [lastIndex, tableRows.length, hasNextPage, isFetchingNextPage, props.isNextPageError, fetchNextPage]);

  // Remember the scroll position when leaving the page (e.g. opening a campaign).
  const { scrollKey } = props;
  useEffect(() => () => writeScrollTop(scrollKey, scrollTopRef.current), [scrollKey]);

  const totalWidth = table.getTotalSize();
  const resizingDelta = table.state.columnResizing.deltaOffset ?? 0;

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => (scrollTopRef.current = event.currentTarget.scrollTop)}
      className="relative min-h-0 flex-1 overflow-auto rounded-lg border"
    >
      {/* display: grid lets rows be absolutely positioned while keeping table semantics. */}
      <table className="grid text-sm" style={{ width: totalWidth }} aria-rowcount={tableRows.length + 1}>
        <thead className="sticky top-0 z-10 grid border-b bg-background">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="flex">
              {group.headers.map((header) => {
                const key = header.column.id;
                const sortable = (SORT_KEYS as readonly string[]).includes(key);
                const isSorted = sort === key;
                return (
                  <th
                    key={header.id}
                    className="relative flex h-10 items-center px-3 text-left font-medium text-muted-foreground"
                    style={{ width: header.getSize() }}
                    aria-sort={isSorted ? (order === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        aria-label={`Sort by ${COLUMN_LABELS[key as ColumnKey]}`}
                        onClick={() => props.onSortChange(key as SortKey)}
                        className="flex min-w-0 items-center gap-1 hover:text-foreground"
                      >
                        <span className="truncate">
                          <table.FlexRender header={header} />
                        </span>
                        {isSorted && (order === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                    {header.column.getCanResize() && (
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${key} column`}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className={cn(
                          "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40",
                          header.column.getIsResizing() && "bg-primary",
                        )}
                        style={{ transform: header.column.getIsResizing() ? `translateX(${resizingDelta}px)` : undefined }}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((item) => {
            const row = tableRows[item.index];
            return (
              <tr
                key={row.id}
                aria-rowindex={item.index + 2}
                aria-selected={row.getIsSelected()}
                className="absolute flex w-full border-b hover:bg-muted/50 aria-selected:bg-muted"
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="flex min-w-0 items-center overflow-hidden px-3" style={{ width: cell.column.getSize() }}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {(isFetchingNextPage || props.isNextPageError) && (
        <div className="sticky left-0 flex h-12 items-center justify-center gap-3 text-sm text-muted-foreground">
          {isFetchingNextPage ? (
            "Loading more…"
          ) : (
            <>
              <span className="text-destructive">Couldn&apos;t load more campaigns.</span>
              <Button size="sm" variant="outline" onClick={fetchNextPage}>
                Retry
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// sessionStorage can be unavailable (privacy modes) — scroll restoration is a nicety, never an error.
function readScrollTop(key: string): number {
  try {
    return Number(sessionStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeScrollTop(key: string, value: number) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}
