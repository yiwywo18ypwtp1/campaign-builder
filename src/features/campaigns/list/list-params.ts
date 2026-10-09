import { z } from "zod";
import { campaignStatusSchema, objectiveSchema } from "../schemas";
import { COLUMN_KEYS, SORT_KEYS, type ColumnKey, type ListFilters, type SortKey } from "../list-query";

// The list page keeps its whole view in the URL, so a reload or a shared link restores it:
//   ?search=sale&status[]=running&status[]=paused&objective=conversion&owner=u_ben
//    &from=2026-10-01&to=2026-10-31&sort=name&order=asc&cols=name,status,budget&w=name:240,budget:140
//
// Parsing is lenient on purpose: every parameter is checked on its own and an invalid one is
// dropped (`?status[]=hack` → no status filter), instead of failing the whole page.
// The API is strict (bad input → 400); this module is what keeps garbage from reaching it.

export type ListViewState = {
  filters: ListFilters;
  sort: SortKey;
  order: "asc" | "desc";
  /** `null` = not in the URL, use the user's saved preferences. */
  columns: ColumnKey[] | null;
  widths: Partial<Record<ColumnKey, number>>;
};

export const DEFAULT_SORT: SortKey = "updatedAt";
export const DEFAULT_ORDER = "desc";
export const MIN_COLUMN_WIDTH = 60;
export const MAX_COLUMN_WIDTH = 800;

const dateSchema = z.iso.date();
const columnSchema = z.enum(COLUMN_KEYS);

function valid<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseListParams(params: URLSearchParams): ListViewState {
  const search = params.get("search")?.trim().slice(0, 100);
  const status = [...new Set(params.getAll("status[]"))].flatMap((value) => valid(campaignStatusSchema, value) ?? []);

  const columnsParam = params.get("cols");
  const columns = columnsParam === null ? null : [...new Set(columnsParam.split(","))].flatMap((value) => valid(columnSchema, value) ?? []);

  const widths: Partial<Record<ColumnKey, number>> = {};
  for (const pair of params.get("w")?.split(",") ?? []) {
    const [key, value] = pair.split(":");
    const column = valid(columnSchema, key);
    const width = Number(value);
    if (column && Number.isInteger(width) && width >= MIN_COLUMN_WIDTH && width <= MAX_COLUMN_WIDTH) {
      widths[column] = width;
    }
  }

  return {
    filters: {
      search: search || undefined,
      status: status.length > 0 ? status : undefined,
      objective: valid(objectiveSchema, params.get("objective")),
      owner: params.get("owner") || undefined,
      from: valid(dateSchema, params.get("from")),
      to: valid(dateSchema, params.get("to")),
    },
    sort: valid(z.enum(SORT_KEYS), params.get("sort")) ?? DEFAULT_SORT,
    order: valid(z.enum(["asc", "desc"]), params.get("order")) ?? DEFAULT_ORDER,
    // An empty column list would show an empty table: treat it as "not set".
    columns: columns && columns.length > 0 ? columns : null,
    widths,
  };
}

/** The inverse of `parseListParams`. Defaults are left out to keep links short. */
export function serializeListParams(state: ListViewState): URLSearchParams {
  const params = filtersToSearchParams(state.filters);
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);
  if (state.order !== DEFAULT_ORDER) params.set("order", state.order);
  if (state.columns) params.set("cols", state.columns.join(","));
  const widths = Object.entries(state.widths).map(([key, width]) => `${key}:${width}`);
  if (widths.length > 0) params.set("w", widths.join(","));
  return params;
}

/** Query string for `GET /api/campaigns` (same filter names as the page URL). */
export function toApiSearchParams(
  state: Pick<ListViewState, "filters" | "sort" | "order">,
  page: { cursor: string | null; limit: number },
): URLSearchParams {
  const params = filtersToSearchParams(state.filters);
  params.set("sort", state.sort);
  params.set("order", state.order);
  params.set("limit", String(page.limit));
  if (page.cursor) params.set("cursor", page.cursor);
  return params;
}

function filtersToSearchParams(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  for (const status of filters.status ?? []) params.append("status[]", status);
  if (filters.objective) params.set("objective", filters.objective);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params;
}

export function hasActiveFilters(filters: ListFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}
