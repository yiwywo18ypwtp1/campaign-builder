// Money is stored as an integer number of minor units (cents) to avoid floating-point errors.
// Assumption: every supported currency has 2 minor digits (see ARCHITECTURE.md).

const MINOR_PER_MAJOR = 100;

/** 123456 → "1,234.56" (for the input field, no currency symbol). */
export function formatAmount(minor: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    minor / MINOR_PER_MAJOR,
  );
}

/** 123456, "USD" → "$1,234.56" */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / MINOR_PER_MAJOR);
}

/**
 * Parses what a user typed into a money input and returns minor units, or `null` if it isn't a valid amount.
 * - Spaces and commas are thousands separators: "1 234.5", "1,234.50".
 * - A single comma followed by 1–2 digits at the end is a decimal separator: "12,5" → 12.50.
 * - At most 2 decimals.
 */
export function parseAmount(input: string): number | null {
  let value = input.replace(/\s/g, "");
  if (!value.includes(".") && /^\d+,\d{1,2}$/.test(value)) {
    value = value.replace(",", ".");
  }
  value = value.replace(/,/g, "");

  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value);
  if (!match) return null;

  const [, whole, fraction = ""] = match;
  return Number(whole) * MINOR_PER_MAJOR + Number(fraction.padEnd(2, "0"));
}
