/**
 * 淨資產數字下方的迷你走勢線：最近 90 天的每日快照加上現在的即時淨資產。
 * 只示意走勢，不標數字；點它（連同上方數字）會打開趨勢與結構面板。
 */
import { type Dec, ONE, dec } from '@core';
import type { SnapshotPoint } from '../lib/api';

const WIDTH = 120;
const HEIGHT = 28;
const DAYS = 90;

export function Sparkline({ snapshots, live, today }: { snapshots: SnapshotPoint[]; live: Dec; today: string }) {
  const since = new Date(Date.parse(today) - DAYS * 86_400_000).toISOString().slice(0, 10);
  const values = [
    ...snapshots.filter((s) => s.date >= since && s.date < today).map((s) => Number(dec(s.netWorth) / ONE)),
    Number(live / ONE),
  ];
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * WIDTH;
  const y = (v: number) => 3 + (1 - (v - min) / span) * (HEIGHT - 6);
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const rising = values.at(-1)! >= values[0];

  return (
    <svg
      className={`sparkline ${rising ? 'sparkline--up' : 'sparkline--down'}`}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
    >
      <path d={path} />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r={2.5} />
    </svg>
  );
}
