"use client";

import { Columns3, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLUMN_KEYS, COLUMN_LABELS, type ColumnKey, type ListFilters } from "../list-query";
import { campaignStatusSchema, objectiveSchema } from "../schemas";
import { hasActiveFilters } from "./list-params";

const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all"; // Radix Select can't use "" as a value, so "no filter" gets a sentinel

type Props = {
  filters: ListFilters;
  owners: { id: string; name: string }[];
  visibleColumns: ColumnKey[];
  onFiltersChange: (patch: Partial<ListFilters>) => void;
  onColumnsChange: (columns: ColumnKey[]) => void;
};

export function FiltersBar({ filters, owners, visibleColumns, onFiltersChange, onColumnsChange }: Props) {
  // The input owns its text while typing; the URL is updated after a pause.
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  function handleSearchChange(value: string) {
    setSearchText(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onFiltersChange({ search: value.trim() || undefined }), SEARCH_DEBOUNCE_MS);
  }

  function toggleStatus(status: (typeof campaignStatusSchema.options)[number], checked: boolean) {
    const current = filters.status ?? [];
    const next = checked ? [...current, status] : current.filter((s) => s !== status);
    onFiltersChange({ status: next.length > 0 ? next : undefined });
  }

  function resetFilters() {
    clearTimeout(searchTimer.current);
    setSearchText("");
    onFiltersChange({ search: undefined, status: undefined, objective: undefined, owner: undefined, from: undefined, to: undefined });
  }

  const statusCount = filters.status?.length ?? 0;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search campaigns by name or slug"
          placeholder="Search…"
          value={searchText}
          onChange={(event) => handleSearchChange(event.target.value)}
          className="w-64 pl-8"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Status{statusCount > 0 ? ` · ${statusCount}` : ""}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {campaignStatusSchema.options.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              className="capitalize"
              checked={filters.status?.includes(status) ?? false}
              onCheckedChange={(checked) => toggleStatus(status, checked)}
              onSelect={(event) => event.preventDefault()} // keep the menu open for multi-select
            >
              {status}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Select
        value={filters.objective ?? ALL}
        onValueChange={(value) => onFiltersChange({ objective: value === ALL ? undefined : objectiveSchema.parse(value) })}
      >
        <SelectTrigger aria-label="Objective" className="w-40">
          <SelectValue>{filters.objective ? `Objective: ${filters.objective}` : "Any objective"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any objective</SelectItem>
          {objectiveSchema.options.map((objective) => (
            <SelectItem key={objective} value={objective} className="capitalize">
              {objective}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.owner ?? ALL} onValueChange={(value) => onFiltersChange({ owner: value === ALL ? undefined : value })}>
        <SelectTrigger aria-label="Owner" className="w-44">
          <SelectValue>{owners.find((owner) => owner.id === filters.owner)?.name ?? "Any owner"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any owner</SelectItem>
          {owners.map((owner) => (
            <SelectItem key={owner.id} value={owner.id}>
              {owner.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <label htmlFor="start-from" className="text-sm text-muted-foreground">
          Start
        </label>
        <Input
          id="start-from"
          type="date"
          aria-label="Start date from"
          value={filters.from ?? ""}
          max={filters.to}
          onChange={(event) => onFiltersChange({ from: event.target.value || undefined })}
          className="w-38"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          aria-label="Start date to"
          value={filters.to ?? ""}
          min={filters.from}
          onChange={(event) => onFiltersChange({ to: event.target.value || undefined })}
          className="w-38"
        />
      </div>

      {hasActiveFilters(filters) && (
        <Button variant="ghost" onClick={resetFilters}>
          <X /> Reset
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="ml-auto">
            <Columns3 /> Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {COLUMN_KEYS.map((key) => {
            const checked = visibleColumns.includes(key);
            return (
              <DropdownMenuCheckboxItem
                key={key}
                checked={checked}
                disabled={checked && visibleColumns.length === 1} // keep at least one column
                onCheckedChange={(next) => onColumnsChange(COLUMN_KEYS.filter((k) => (k === key ? next : visibleColumns.includes(k))))}
                onSelect={(event) => event.preventDefault()}
              >
                {COLUMN_LABELS[key]}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
