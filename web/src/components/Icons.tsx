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

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
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

// ---------- 分類圖示（新增項目時的分類清單） ----------

const CATEGORY_ICON_PATHS: Record<Category, ReactNode> = {
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  ewallet: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
      <path d="M9 9h6v4H9z" />
    </>
  ),
  bank: (
    <>
      <path d="M3 9.5L12 4l9 5.5" />
      <path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7" />
      <path d="M3 20h18" />
    </>
  ),
  liquid_other: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth={2.6} />
    </>
  ),
  fund: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </>
  ),
  stock: (
    <>
      <path d="M3 17l5-5 4 3 8-8" />
      <path d="M15 7h5v5" />
    </>
  ),
  crypto: (
    <>
      <path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" />
      <path d="M10 8h3a2 2 0 0 1 0 4h-3zM10 12h3.5a2 2 0 0 1 0 4H10zM10 8v8" />
    </>
  ),
  metal: (
    <>
      <path d="M7 9h10l3 9H4z" />
      <path d="M9 5h6l1.3 4H7.7z" />
    </>
  ),
  investment_other: (
    <>
      <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
      <path d="M4 12l8 4.5 8-4.5" />
      <path d="M4 16.5l8 4.5 8-4.5" />
    </>
  ),
  real_estate: (
    <>
      <path d="M3.5 11L12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  fixed_other: (
    <>
      <path d="M12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z" />
      <path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" />
    </>
  ),
  lending: (
    <>
      <circle cx="9" cy="12" r="6" />
      <path d="M15 12h7M19 9l3 3-3 3" />
    </>
  ),
  receivable_other: (
    <>
      <path d="M3 13l2.5-8h13L21 13v6H3z" />
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
    </>
  ),
  credit_card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 9.5h19M6 15h4" />
    </>
  ),
  loan: (
    <>
      <path d="M6 2.5h9l4 4v15H6z" />
      <path d="M15 2.5v4h4" />
      <path d="M9.5 17l6-6M10 11.5h.01M15 16.5h.01" strokeWidth={2.2} />
    </>
  ),
  payable: (
    <>
      <path d="M5.5 3h13v18l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  liability_other: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth={2.6} />
    </>
  ),
};

export const CategoryIcon = ({ category, ...p }: IconProps & { category: Category }) => (
  <Svg {...p}>{CATEGORY_ICON_PATHS[category]}</Svg>
);
