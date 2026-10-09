import { formatMoney } from "@/lib/money";

// Inline SVG line chart for 60 points: no chart library needed, so nothing heavy to lazy-load.

const WIDTH = 600;
const HEIGHT = 140;
const PADDING = 4;

type Props = { points: { minute: string; spend: number }[]; currency: string };

export function SpendChart({ points, currency }: Props) {
  const max = Math.max(1, ...points.map((point) => point.spend));
  const x = (index: number) => PADDING + (index / Math.max(1, points.length - 1)) * (WIDTH - 2 * PADDING);
  const y = (value: number) => HEIGHT - PADDING - (value / max) * (HEIGHT - 2 * PADDING);
  const line = points.map((point, index) => `${x(index)},${y(point.spend)}`).join(" ");
  const total = points.reduce((sum, point) => sum + point.spend, 0);

  return (
    <figure className="grid gap-1">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-36 w-full rounded-md bg-muted/40"
        role="img"
        aria-label={`Spend per minute over the last 60 minutes, ${formatMoney(total, currency)} in total`}
      >
        <polyline points={`${x(0)},${HEIGHT} ${line} ${x(points.length - 1)},${HEIGHT}`} className="fill-primary/10 stroke-none" />
        <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" className="stroke-primary" strokeWidth={2} />
      </svg>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span>60 min ago</span>
        <span>
          Peak {formatMoney(max, currency)} / min · {formatMoney(total, currency)} in the last hour
        </span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}
