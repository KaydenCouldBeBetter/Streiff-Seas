// The Figma "Stats chart" (PRF-01c, Figma 187:10383): one row of filter chips above one chart
// card, drawn by hand (HTML and SVG; the app has no chart library). One series in
// color/bg/primary, so no colour key; bars and columns start at zero; a 2 px line with 10 px
// points and a 2 px ring in the card's colour; labels only where they help. "Table" shows the
// same numbers as a list (the accessible view), tapping a point shows its value (nothing
// depends on hover), and each chart has a one-sentence spoken summary.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { CHART_CHIPS, parseChartId, type ChartId, type FinishesChart, type ProfileStats, type TableRow, type TimeOfDayChart, type WeeklyChart } from "../lib/profileStats";
import { placeLabel } from "../lib/format";
import { Button } from "./ui";

// The chart is remembered on this phone only, never sent anywhere (Figma note).
const STORAGE_KEY = "cf.profile.chart";

export function readChart(): ChartId {
  try {
    return parseChartId(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private windows and blocked site data: the chart just isn't remembered.
    return "species";
  }
}

function rememberChart(chart: ChartId): void {
  try {
    localStorage.setItem(STORAGE_KEY, chart);
  } catch {
    // As above.
  }
}

/** The width of an element, kept up to date, so a plot is drawn at the size it has (320 px phones too). */
function useWidth(initial: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => setWidth(element.clientWidth || initial);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [initial]);
  return [ref, width];
}

// ---------------------------------------------------------------------------------------------
// Line plots (Weekly, and Finishes with its inverted axis). Geometry follows the Figma frames:
// a 140 px high plot, axis labels in a 30 px column at the left, points 53 to 78 px apart.

const PLOT_HEIGHT = 140;
const AXIS_WIDTH = 30;
const LABEL_ROW_Y = 116;

interface LineTick {
  y: number;
  label: string;
}

interface LinePoint {
  /** The x-axis label ("Jul 4"). */
  label: string;
  /** The point's centre, px from the top of the plot. */
  y: number;
  /** The direct label above the point, only where it helps. */
  valueLabel?: string;
  /** What tapping the point shows, and what a screen reader hears. */
  readout: string;
}

interface LinePlotProps {
  ticks: readonly LineTick[];
  points: readonly LinePoint[];
  selected: number | null;
  onSelect: (index: number) => void;
}

function LinePlot({ ticks, points, selected, onSelect }: LinePlotProps) {
  const [ref, width] = useWidth(326);
  const last = points.length - 1;
  const spacing = last > 0 ? Math.min(78, (width - 60) / last) : 0;
  const center = (40 + width - 20) / 2;
  const x = (index: number) => center + (index - last / 2) * spacing;
  // Thin the x labels on a long run, keeping the latest week.
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((width - AXIS_WIDTH) / 44))));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <div className="plot" ref={ref} style={{ height: PLOT_HEIGHT }}>
      <div aria-hidden="true">
        {ticks.map((tick) => (
          <div key={tick.label}>
            <span className="plot-grid" style={{ top: tick.y, left: AXIS_WIDTH }} />
            <span className="plot-axis t-footnote" style={{ top: tick.y - 9 }}>
              {tick.label}
            </span>
          </div>
        ))}
        <svg className="plot-line" width={width} height={PLOT_HEIGHT} viewBox={`0 0 ${width} ${PLOT_HEIGHT}`} focusable="false">
          {points.length > 1 && <path d={path} fill="none" stroke="var(--cf-color-bg-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((point, index) => (
            <g key={point.label}>
              <circle cx={x(index)} cy={point.y} r={7} fill="var(--cf-color-bg-sunken)" />
              <circle cx={x(index)} cy={point.y} r={5} fill="var(--cf-color-bg-primary)" />
            </g>
          ))}
        </svg>
        {points.map((point, index) => (
          <span key={point.label}>
            {point.valueLabel !== undefined && (
              <span className="plot-value t-footnote-strong" style={{ left: x(index), top: point.y - 26 }}>
                {point.valueLabel}
              </span>
            )}
            {(last - index) % every === 0 && (
              <span className="plot-x t-footnote" style={{ left: x(index), top: LABEL_ROW_Y }}>
                {point.label}
              </span>
            )}
          </span>
        ))}
      </div>
      {points.map((point, index) => (
        <button
          key={point.label}
          type="button"
          className="plot-hit"
          style={{ left: x(index), top: point.y }}
          aria-label={point.readout}
          aria-pressed={selected === index}
          onClick={() => onSelect(index)}
        />
      ))}
    </div>
  );
}

function WeeklyPlot({ chart, selected, onSelect }: { chart: WeeklyChart; selected: number | null; onSelect: (i: number) => void }) {
  const top = chart.ticks[chart.ticks.length - 1] ?? 1;
  const y = (count: number) => 100 - (88 * count) / top;
  const max = Math.max(...chart.points.map((p) => p.count));
  const lastIndex = chart.points.length - 1;
  return (
    <LinePlot
      ticks={chart.ticks.map((tick) => ({ y: y(tick) + 0.5, label: String(tick) }))}
      points={chart.points.map((point, index) => ({
        label: point.label,
        y: y(point.count),
        // Labels only on the peaks and the latest week.
        valueLabel: point.count === max || index === lastIndex ? String(point.count) : undefined,
        readout: `Week of ${point.label}: ${point.count} fish`,
      }))}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function FinishesPlot({ chart, selected, onSelect }: { chart: FinishesChart; selected: number | null; onSelect: (i: number) => void }) {
  // Inverted: 1st is at the top, and the last labelled place at the bottom.
  const bottom = chart.ticks[chart.ticks.length - 1]!;
  const y = (place: number) => 14 + (87 * (place - 1)) / Math.max(1, bottom - 1);
  return (
    <LinePlot
      ticks={chart.ticks.map((tick) => ({ y: y(tick) + 0.5, label: placeLabel(tick, false) }))}
      points={chart.points.map((point) => ({
        label: point.label,
        y: y(point.place),
        valueLabel: point.text,
        readout: `${point.label}: ${point.text}`,
      }))}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Bars and columns

function SpeciesBars({ chart }: { chart: ProfileStats["species"] }) {
  return (
    <ul className="plot-bars" aria-hidden="true">
      {chart.bars.map((bar) => (
        <li key={bar.label}>
          <p className="plot-bar-labels t-callout">
            <span>{bar.label}</span>
            <span className="t-callout-strong">{bar.count} fish</span>
          </p>
          <span className="plot-bar" style={{ width: `${bar.share * 100}%` }} />
        </li>
      ))}
    </ul>
  );
}

function TimeColumns({ chart }: { chart: TimeOfDayChart }) {
  const max = Math.max(1, ...chart.columns.map((column) => column.count));
  return (
    <div className="plot-columns" aria-hidden="true">
      {chart.columns.map((column) => (
        <div key={column.label} className="plot-column">
          <span className="t-footnote-strong">{column.count}</span>
          <span className="plot-column-bar" style={{ height: (88 * column.count) / max }} />
          <span className="plot-baseline" />
          <span className="t-footnote t-secondary">{column.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The card

function TableView({ rows, label }: { rows: readonly TableRow[]; label: string }) {
  return (
    <dl className="chart-table t-callout" aria-label={label}>
      {rows.map((row) => (
        <div className="fact" key={row.label}>
          <dt className="t-secondary">{row.label}</dt>
          <dd className="t-callout-strong">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface StatsChartProps {
  stats: ProfileStats;
  chart: ChartId;
  onChart: (chart: ChartId) => void;
}

export function StatsChart({ stats, chart, onChart }: StatsChartProps) {
  const [table, setTable] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const active = { species: stats.species, weekly: stats.weekly, time: stats.timeOfDay, finishes: stats.finishes }[chart];

  function choose(next: ChartId) {
    rememberChart(next);
    setPicked(null);
    setTable(false);
    onChart(next);
  }

  const readouts =
    chart === "weekly"
      ? stats.weekly.points.map((p) => `Week of ${p.label}: ${p.count} fish`)
      : chart === "finishes"
        ? stats.finishes.points.map((p) => `${p.label}: ${p.text}`)
        : [];
  const note = chart === "time" ? stats.timeOfDay.note : chart === "finishes" && active.empty === null ? stats.finishes.note : null;

  return (
    <div className="stats-chart">
      <div className="chart-chips" role="group" aria-label="Chart">
        {CHART_CHIPS.map((chip) => (
          <button key={chip.id} type="button" className="chart-chip t-footnote-strong" aria-pressed={chip.id === chart} onClick={() => choose(chip.id)}>
            {chip.label}
          </button>
        ))}
      </div>
      <div className="chart-card">
        <div className="chart-card-title">
          <h3 className="t-headline">{active.title}</h3>
          {active.empty === null && (
            <Button variant="text" onClick={() => setTable((on) => !on)}>
              {table ? "Chart" : "Table"}
            </Button>
          )}
        </div>
        <p className="t-footnote t-secondary">{active.subtitle}</p>
        <div className="chart-spacer" />
        {active.empty !== null ? (
          <p className="t-callout t-secondary">{active.empty}</p>
        ) : table ? (
          <TableView rows={active.table} label={active.title} />
        ) : (
          <>
            <p className="visually-hidden">{active.summary}</p>
            {chart === "species" && <SpeciesBars chart={stats.species} />}
            {chart === "weekly" && <WeeklyPlot chart={stats.weekly} selected={picked} onSelect={setPicked} />}
            {chart === "time" && <TimeColumns chart={stats.timeOfDay} />}
            {chart === "finishes" && <FinishesPlot chart={stats.finishes} selected={picked} onSelect={setPicked} />}
            {picked !== null && readouts[picked] !== undefined && (
              <p className="chart-readout t-callout-strong" role="status">
                {readouts[picked]}
              </p>
            )}
          </>
        )}
        {note !== null && !table && <p className="t-footnote t-secondary">{note}</p>}
      </div>
    </div>
  );
}
