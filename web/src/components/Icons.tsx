/** 線條圖示。全部繼承文字顏色（currentColor），裝飾用途所以 aria-hidden */
import type { Category } from '@core';
import type { ReactNode } from 'react';

type IconProps = { size?: number };

function Svg({ size = 20, children, strokeWidth = 1.8 }: IconProps & { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M4 7h16M4 12h10M4 17h13" />
  </Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19V5M4 19h16" />
    <path d="M7 15l4-4 3 3 5-6" />
  </Svg>
);

export const LoanIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
);

export const BankIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10l9-6 9 6" />
    <path d="M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" />
  </Svg>
);

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="7" width="16" height="13" rx="2" />
    <path d="M9 7V5h6v2" />
  </Svg>
);

export const CardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 15h4" />
  </Svg>
);

export function CategoryIcon({ category, size }: { category: Category; size?: number }) {
  switch (category) {
    case 'cash_bank':
      return <BankIcon size={size} />;
    case 'securities':
      return <ChartIcon size={size} />;
    case 'other_asset':
      return <BoxIcon size={size} />;
    case 'loan':
      return <LoanIcon size={size} />;
    case 'daily_liability':
      return <CardIcon size={size} />;
  }
}
