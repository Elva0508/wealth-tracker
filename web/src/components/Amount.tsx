import { type Dec, formatMoney, formatNumber } from '@core';
import { useAppData } from '../hooks/useAppData';

const MASK = '••••••';

/**
 * 金額顯示。首頁的隱藏狀態開啟時一律遮罩。
 * - currency 有給：顯示幣別符號，例如 US$ 1,000.00
 * - currency 沒給：只顯示數字（基準幣別、整數）
 */
export function Amount({
  value,
  currency,
  digits = 0,
  className,
  alwaysVisible = false,
}: {
  value: Dec | null;
  currency?: string;
  digits?: number;
  className?: string;
  alwaysVisible?: boolean;
}) {
  const { hidden } = useAppData();
  const masked = hidden && !alwaysVisible;
  let text: string;
  if (masked) text = currency ? `${currency} ${MASK}` : MASK;
  else if (value === null) text = '—';
  // 用真正的減號（−），比連字號（-）寬，視覺上與數字對齊
  else text = (currency ? formatMoney(value, currency) : formatNumber(value, digits)).replace('-', '−');
  return (
    <span className={`amount ${className ?? ''}`} aria-label={masked ? '金額已隱藏' : undefined}>
      {text}
    </span>
  );
}
