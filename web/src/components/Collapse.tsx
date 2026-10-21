/**
 * 手風琴的展開區：打開與收起都有高度動畫。
 * 內容一直留在畫面上（收起時高度為 0），收起時設為 inert，不能被點到也不會被讀到。
 */
import type { ReactNode } from 'react';

export function Collapse({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div id={id} className={`collapse ${open ? 'collapse--open' : ''}`} inert={!open}>
      <div className="collapse__inner">{children}</div>
    </div>
  );
}
