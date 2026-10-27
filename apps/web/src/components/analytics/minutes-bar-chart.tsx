'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface MinutesPoint {
  /** Short axis label (e.g. "Mon", "3 Mar"). */
  label: string;
  /** Full label for the tooltip and table (e.g. "Monday 3 March"). */
  fullLabel: string;
  minutes: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MinutesPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{point.fullLabel}</p>
      <p className="font-semibold text-foreground tabular-nums">{point.minutes} min</p>
    </div>
  );
}

/**
 * Single-series bar chart of reading minutes. One hue (validated --chart-1), 4px rounded bar
 * tops, recessive grid, hover tooltip, and a table view for screen readers / exact values.
 */
export function MinutesBarChart({
  data,
  title,
  height = 180,
}: {
  data: MinutesPoint[];
  title: string;
  height?: number;
}) {
  return (
    <figure className="grid gap-2">
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            barCategoryGap="25%"
            // The wrapper is aria-hidden (the table view is the accessible version), so the chart
            // itself must not be focusable.
            accessibilityLayer={false}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)' }} />
            <Bar
              dataKey="minutes"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{title}</figcaption>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          View as table
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 font-medium">
                Period
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Minutes
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.fullLabel} className="border-t">
                <td className="py-1">{d.fullLabel}</td>
                <td className="py-1 text-right tabular-nums text-foreground">{d.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
