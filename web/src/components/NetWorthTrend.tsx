/**
 * 「趨勢」分頁：每日快照連成一條線，最後一點是現在的即時淨資產；圖下方列出區間的起點、最高、最低。
 *
 * - 單一數列：不需要圖例，標題就說明了畫的是什麼
 * - 2px 線＋很淡的面積、最後一點加端點；只標最新值，其他交給 Y 軸與觸控讀數
 * - 手指按住或滑過：垂直線對齊最近的日期，上方顯示當天金額
 * - 隱藏金額時，Y 軸與讀數都遮起來，只留走勢
 * - 螢幕閱讀器讀到的是摘要文字（起訖日期、起訖金額、增減）
 */
import { type Dec, ONE, dec, formatNumber } from '@core';
import { type PointerEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import type { SnapshotPoint } from '../lib/api';
import { formatDate } from '../lib/constants';

const RANGES = [
  { key: '1m', label: '1 個月', days: 31 },
  { key: '3m', label: '3 個月', days: 92 },
  { key: '1y', label: '1 年', days: 366 },
  { key: 'all', label: '全部', days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const HEIGHT = 260;
const PAD = { top: 12, right: 12, bottom: 22, left: 44 };
const MASK = '••••';

interface Point {
  date: string;
  value: Dec;
  live: boolean;
}

/** 金額以「萬」為單位顯示在 Y 軸，例如 102萬、-5萬 */
function compact(value: number): string {
  const wan = value / 10000;
  const digits = Math.abs(wan) < 10 && wan % 1 !== 0 ? 1 : 0;
  return `${wan.toFixed(digits)}萬`;
}

/** 介於 min 與 max 之間、好讀的 3～4 個刻度 */
function niceTicks(min: number, max: number): number[] {
  const span = max - min || Math.abs(max) || 10000;
  const raw = span / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(t);
  return ticks;
}

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

export function NetWorthTrend({ snapshots, liveNetWorth }: { snapshots: SnapshotPoint[]; liveNetWorth: Dec }) {
  const { hidden, today } = useAppData();
  const [range, setRange] = useState<RangeKey>('3m');
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [snapshots.length > 0]);

  const points = useMemo<Point[]>(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const all: Point[] = snapshots
      .filter((s) => s.date < today)
      .map((s) => ({ date: s.date, value: dec(s.netWorth), live: false }));
    all.push({ date: today, value: liveNetWorth, live: true });
    return Number.isFinite(days) ? all.filter((p) => daysBetween(p.date, today) <= days) : all;
  }, [snapshots, liveNetWorth, today, range]);

  if (points.length < 2) {
    return (
      <section className="trend" aria-labelledby="trend-title">
        <h2 id="trend-title" className="trend__label">
          淨資產趨勢
        </h2>
        <p className="muted small">每天早上 6 點會記錄前一天的淨資產，累積兩天後這裡就會畫出走勢。</p>
      </section>
    );
  }

  // 只用來畫圖的數值；金額本身仍以 @core 的精確值顯示
  const values = points.map((p) => Number(p.value / ONE));
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks.at(-1)! === yMin ? yMin + 1 : ticks.at(-1)!;
  const first = points[0].date;
  const spanDays = Math.max(1, daysBetween(first, today));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (date: string) => PAD.left + (daysBetween(first, date) / spanDays) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(values[i]).toFixed(1)}`)
    .join('');
  const area = `${line}L${x(today).toFixed(1)},${PAD.top + plotH}L${x(first).toFixed(1)},${PAD.top + plotH}Z`;
  const last = points.at(-1)!;
  const change = last.value - points[0].value;
  const shown = active ?? points.length - 1;
  const focus = points[shown];
  const money = (v: Dec) => (hidden ? MASK : formatNumber(v, 0).replace('-', '−'));
  // 區間最高與最低（同值取最近的一天）
  const peak = points.reduce((best, p) => (p.value >= best.value ? p : best), points[0]);
  const trough = points.reduce((best, p) => (p.value <= best.value ? p : best), points[0]);
  const when = (p: Point) => (p.live ? '現在' : formatDate(p.date, today));

  // 手指或滑鼠移動時，找最近的一天
  const track = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    });
    setActive(best);
  };

  const summary = `淨資產從 ${formatDate(first)} 的 ${money(points[0].value)} 元，到今天 ${money(last.value)} 元，${
    change >= 0n ? '增加' : '減少'
  } ${money(change < 0n ? -change : change)} 元`;

  return (
    <section className="trend" aria-labelledby="trend-title">
      <div className="trend__head" aria-live="polite">
        <h2 id="trend-title" className="trend__label">
          淨資產 · {focus.live ? '現在' : formatDate(focus.date, today)}
        </h2>
        <span className="trend__value">{money(focus.value)}</span>
        <span className={`trend__change ${change >= 0n ? 'trend__change--up' : 'trend__change--down'}`}>
          {RANGES.find((r) => r.key === range)!.label}
          {change >= 0n ? ' 增加 ' : ' 減少 '}
          {money(change < 0n ? -change : change)}
        </span>
      </div>

      <div className="segmented segmented--four" role="group" aria-label="期間">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => {
              setRange(r.key);
              setActive(null);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="trend__plot" ref={wrapRef}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={summary}
          onPointerDown={track}
          onPointerMove={track}
          onPointerLeave={() => setActive(null)}
          onPointerCancel={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="trend__grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="trend__tick" x={PAD.left - 6} y={y(t)} dy="0.35em" textAnchor="end">
                {hidden ? '' : compact(t)}
              </text>
            </g>
          ))}
          <text className="trend__tick" x={PAD.left} y={HEIGHT - 4} textAnchor="start">
            {formatDate(first, today)}
          </text>
          <text className="trend__tick" x={width - PAD.right} y={HEIGHT - 4} textAnchor="end">
            今天
          </text>
          <path className="trend__area" d={area} />
          <path className="trend__line" d={line} />
          {active !== null && (
            <line className="trend__cursor" x1={x(focus.date)} x2={x(focus.date)} y1={PAD.top} y2={PAD.top + plotH} />
          )}
          <circle className="trend__dot" cx={x(focus.date)} cy={y(values[shown])} r={4.5} />
        </svg>
      </div>

      <dl className="stats">
        <div>
          <dt>起點 · {when(points[0])}</dt>
          <dd>{money(points[0].value)}</dd>
        </div>
        <div>
          <dt>變動</dt>
          <dd className={change >= 0n ? 'stats--up' : 'stats--down'}>
            {change >= 0n && !hidden ? '+' : ''}
            {money(change)}
          </dd>
        </div>
        <div>
          <dt>最高 · {when(peak)}</dt>
          <dd>{money(peak.value)}</dd>
        </div>
        <div>
          <dt>最低 · {when(trough)}</dt>
          <dd>{money(trough.value)}</dd>
        </div>
      </dl>
      <p className="footnote">
        每天早上 6 點記錄前一天的淨資產；最後一點是現在的即時金額。按住圖表可以看每一天的數字。
      </p>
    </section>
  );
}
