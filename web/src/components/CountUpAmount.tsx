/**
 * 數字往上數的金額，用在首頁淨資產大數字。
 *
 * 動畫期間的中間值只用來顯示（一般 number 即可）；
 * 動畫結束後一定顯示 @core 精確計算的最終值，不會有誤差。
 */
import { type Dec, ONE, formatNumber } from '@core';
import { useEffect, useRef, useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { Amount } from './Amount';

const DURATION_MS = 900;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CountUpAmount({ value, className }: { value: Dec; className?: string }) {
  const { hidden } = useAppData();
  const target = Number(value / ONE); // 轉成整數元，只用於動畫
  const [shown, setShown] = useState<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (hidden || prefersReducedMotion()) {
      fromRef.current = target;
      setShown(null);
      return;
    }
    const from = fromRef.current ?? 0;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else setShown(null); // 結束：交回精確值顯示
    };
    frame = requestAnimationFrame(step);
    fromRef.current = target;
    return () => cancelAnimationFrame(frame);
  }, [target, hidden]);

  if (shown === null) return <Amount value={value} className={className} />;
  const text = shown < 0 ? `−${Math.abs(shown).toLocaleString('en-US')}` : shown.toLocaleString('en-US');
  return (
    <span className={`amount ${className ?? ''}`} aria-label={formatNumber(value, 0)}>
      {text}
    </span>
  );
}
