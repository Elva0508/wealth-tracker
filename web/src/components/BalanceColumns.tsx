/**
 * 首頁「資產與負債」直立雙柱：資產 = 負債 + 淨資產。
 *
 * - 左柱：資產各分類；負債大於資產時，上方補一段虛線斜紋「資不抵債」
 * - 右柱：負債各分類；資產大於負債時，上方補一段虛線「淨資產」
 * - 兩柱共用比例尺（資產與負債較大者），所以永遠一樣高
 * - 比例計算全部在 @core 的 balanceBars()，這裡只負責畫與動畫
 *
 * 動畫：第一次出現時柱子從底部長出來；資料變動時高度平滑過渡。
 * 系統開啟「減少動態效果」時由 CSS 關閉動畫。
 */
import {
  type BalanceSummary,
  type BarSegment,
  type Category,
  CATEGORY_LABELS,
  balanceBars,
  isCategory,
  percentOf,
} from '@core';
import { type CSSProperties, useEffect, useState } from 'react';
import { CATEGORY_COLORS } from '../lib/constants';
import { Amount } from './Amount';

/** 占比達到這個百分比，就用大字版面（大號百分比＋名稱＋金額） */
const BIG_BLOCK_PERCENT = 25;
/** 深色底的分類，文字用白色 */
const DARK_CATEGORIES = new Set<string>(['securities', 'loan']);

interface Props {
  summary: BalanceSummary;
  /** 點區塊後在詳細卡片按「展開明細」 */
  onOpenCategory: (category: Category) => void;
}

export function BalanceColumns({ summary, onOpenCategory }: Props) {
  const bars = balanceBars(summary);
  const [grown, setGrown] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // 先以高度 0 畫出來，下一個畫面再設定實際高度，CSS transition 就會播放「長出來」的動畫
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (bars.assetRow.length === 0 && bars.liabilityRow.length === 0) return null;

  // 由上而下：虛線段在最上面，金額最大的分類在最底
  const order = (row: BarSegment[]) => {
    const dashed = row.filter((s) => s.kind === 'net_worth' || s.kind === 'shortfall');
    const solid = row.filter((s) => s.kind === 'asset' || s.kind === 'liability').sort((a, b) => a.percent - b.percent);
    return [...dashed, ...solid];
  };
  const assetColumn = order(bars.assetRow);
  const liabilityColumn = order(bars.liabilityRow);
  const all = [...assetColumn, ...liabilityColumn];
  const detail = all.find((s) => s.key === selected) ?? null;
  const negative = summary.netWorth < 0n;

  const column = (segments: BarSegment[], label: string, delayOffset: number) => (
    <div className="columns__col" role="group" aria-label={label}>
      {segments.map((s, i) => (
        <Block
          key={s.key}
          segment={s}
          grown={grown}
          delayMs={(i + delayOffset) * 110}
          radius={blockRadius(i, segments.length)}
          selected={selected === s.key}
          dimmed={selected !== null && selected !== s.key}
          onClick={() => setSelected((prev) => (prev === s.key ? null : s.key))}
        />
      ))}
    </div>
  );

  return (
    <section className="card columns" aria-labelledby="columns-title">
      <div className="columns__head">
        <h2 id="columns-title">資產與負債</h2>
        {negative ? (
          <span className="pill pill--warn">
            負債比資產多 <Amount value={-summary.netWorth} />
          </span>
        ) : (
          bars.liabilityRatio !== null && (
            <span className="pill">負債佔資產 {Math.round(bars.liabilityRatio)}%</span>
          )
        )}
      </div>

      <div className="columns__totals">
        <div>
          <span className="muted small">總資產</span>
          <Amount value={summary.totalAssets} className="columns__total" />
        </div>
        <div>
          <span className="muted small">總負債</span>
          <Amount value={summary.totalLiabilities} className="columns__total" />
        </div>
      </div>

      <div className="columns__chart">
        {column(assetColumn, '資產', 0)}
        {column(liabilityColumn, '負債與淨資產', 1)}
      </div>

      {detail && (
        <div className="columns__detail" key={detail.key}>
          <span className="columns__detail-text">
            <strong>{detail.label}</strong>
            <span className="muted small">{detailNote(detail, summary)}</span>
          </span>
          <span className="columns__detail-side">
            <Amount value={detail.value} className="columns__detail-amount" />
            {isCategory(detail.key) && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  onOpenCategory(detail.key as Category);
                  setSelected(null);
                }}
              >
                展開明細
              </button>
            )}
          </span>
        </div>
      )}
    </section>
  );
}

function Block({
  segment,
  grown,
  delayMs,
  radius,
  selected,
  dimmed,
  onClick,
}: {
  segment: BarSegment;
  grown: boolean;
  delayMs: number;
  radius: string;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const big = segment.percent >= BIG_BLOCK_PERCENT;
  const pct = `${Math.round(segment.percent)}%`;
  const color = isCategory(segment.key) ? CATEGORY_COLORS[segment.key] : undefined;

  const style: CSSProperties = {
    height: grown ? `calc(${segment.percent.toFixed(2)}% - 3px)` : '0%',
    borderRadius: radius,
    transitionDelay: grown ? `${delayMs}ms` : '0ms',
    backgroundColor: color,
    color: DARK_CATEGORIES.has(segment.key) ? '#fff' : undefined,
  };

  return (
    <button
      type="button"
      className={[
        'block',
        `block--${segment.kind}`,
        big ? 'block--big' : 'block--small',
        grown ? 'block--grown' : '',
        selected ? 'block--selected' : '',
        dimmed ? 'block--dimmed' : '',
      ].join(' ')}
      style={style}
      aria-pressed={selected}
      aria-label={`${segment.label} ${pct}`}
      onClick={onClick}
    >
      {big ? (
        <span className="block__label block__label--big">
          <span className="block__pct">{pct}</span>
          <span className="block__name">{segment.label}</span>
          <Amount value={segment.value} className="block__amount" />
        </span>
      ) : (
        <span className="block__label block__label--row">
          <span>{segment.label}</span>
          <span className="block__pct-small">{pct}</span>
        </span>
      )}
    </button>
  );
}

function blockRadius(index: number, count: number): string {
  if (count === 1) return '16px';
  if (index === 0) return '16px 16px 5px 5px';
  if (index === count - 1) return '5px 5px 16px 16px';
  return '5px';
}

function detailNote(segment: BarSegment, summary: BalanceSummary): string {
  if (segment.kind === 'net_worth') return '資產扣掉負債後，真正屬於你的部分';
  if (segment.kind === 'shortfall') return '負債超過資產的部分';
  if (segment.kind === 'asset') {
    return `佔總資產 ${Math.round(percentOf(segment.value, summary.totalAssets))}%`;
  }
  const label = isCategory(segment.key) ? CATEGORY_LABELS[segment.key] : segment.label;
  return summary.totalAssets > 0n
    ? `${label}佔資產 ${Math.round(percentOf(segment.value, summary.totalAssets))}%`
    : '目前沒有資產';
}
