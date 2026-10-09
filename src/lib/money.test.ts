import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney, parseAmount } from "./money";

describe("parseAmount", () => {
  it.each([
    ["1234", 123_400],
    ["1234.5", 123_450],
    ["1234.56", 123_456],
    ["1,234.56", 123_456],
    ["1 234.56", 123_456],
    ["12,5", 1_250],
    ["12,50", 1_250],
    ["1,234", 123_400],
    ["0.07", 7],
    ["10.", 1_000],
  ])("%s → %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "-5", "1.2.3", "1e3"])("rejects %j", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats minor units for the input", () => {
    expect(formatAmount(123_456)).toBe("1,234.56");
    expect(formatAmount(5)).toBe("0.05");
  });

  it("formats with a currency symbol", () => {
    expect(formatMoney(123_456, "USD")).toBe("$1,234.56");
  });

  it("round-trips through format and parse", () => {
    expect(parseAmount(formatAmount(987_654_321))).toBe(987_654_321);
  });
});
