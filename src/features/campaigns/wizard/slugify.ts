/** "Black Friday — 50% OFF!" → "black-friday-50-off" (fits the slug schema: a-z, 0-9, single dashes, ≤ 60). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD") // "é" → "e" + accent mark…
    .replace(/[̀-ͯ]/g, "") // …and drop the accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, ""); // the cut may end on a dash
}
