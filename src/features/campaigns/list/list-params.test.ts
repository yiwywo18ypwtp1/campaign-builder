import { describe, expect, it } from "vitest";
import { parseListParams, serializeListParams, toApiSearchParams, type ListViewState } from "./list-params";

const parse = (query: string) => parseListParams(new URLSearchParams(query));

describe("parseListParams", () => {
  it("returns defaults for an empty URL", () => {
    expect(parse("")).toEqual({
      filters: {
        search: undefined,
        status: undefined,
        objective: undefined,
        owner: undefined,
        from: undefined,
        to: undefined,
      },
      sort: "updatedAt",
      order: "desc",
      columns: null,
      widths: {},
    });
  });

  it("keeps search text literally (?search=%25 is a percent sign)", () => {
    expect(parse("search=%25").filters.search).toBe("%");
  });

  it("drops invalid values one by one instead of failing", () => {
    const state = parse(
      "status[]=hack&status[]=running&objective=nope&from=yesterday&to=2026-10-31&sort=drop&order=sideways&cols=name,evil&w=name:240,budget:5,evil:100",
    );
    expect(state.filters.status).toEqual(["running"]);
    expect(state.filters.objective).toBeUndefined();
    expect(state.filters.from).toBeUndefined();
    expect(state.filters.to).toBe("2026-10-31");
    expect(state.sort).toBe("updatedAt");
    expect(state.order).toBe("desc");
    expect(state.columns).toEqual(["name"]);
    expect(state.widths).toEqual({ name: 240 });
  });

  it("ignores a cursor in the page URL (pagination isn't part of the view)", () => {
    expect(parse("cursor=garbage")).toEqual(parse(""));
  });

  it("treats an empty column list as 'use preferences'", () => {
    expect(parse("cols=").columns).toBeNull();
    expect(parse("cols=evil").columns).toBeNull();
  });

  it("removes duplicate statuses and columns", () => {
    const state = parse("status[]=paused&status[]=paused&cols=name,name,spend");
    expect(state.filters.status).toEqual(["paused"]);
    expect(state.columns).toEqual(["name", "spend"]);
  });
});

describe("serializeListParams", () => {
  it("round-trips a full view", () => {
    const state: ListViewState = {
      filters: {
        search: "50% off",
        status: ["running", "paused"],
        objective: "conversion",
        owner: "u_ben",
        from: "2026-10-01",
        to: "2026-10-31",
      },
      sort: "name",
      order: "asc",
      columns: ["name", "status", "budget"],
      widths: { name: 240, budget: 140 },
    };
    expect(parseListParams(serializeListParams(state))).toEqual(state);
  });

  it("leaves defaults out of the URL", () => {
    expect(serializeListParams(parse("")).toString()).toBe("");
  });
});

describe("toApiSearchParams", () => {
  it("adds sort, limit and cursor for the API", () => {
    const state = parse("status[]=running&search=sale");
    const params = toApiSearchParams(state, { cursor: "abc", limit: 100 });
    expect(params.getAll("status[]")).toEqual(["running"]);
    expect(params.get("search")).toBe("sale");
    expect(params.get("sort")).toBe("updatedAt");
    expect(params.get("order")).toBe("desc");
    expect(params.get("limit")).toBe("100");
    expect(params.get("cursor")).toBe("abc");
  });
});
