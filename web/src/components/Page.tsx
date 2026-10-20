/**
 * 每個畫面共用的外框：大標題或標題列、返回鍵。
 * - 分頁第一層用 largeTitle：只有跟著內容捲動的大標題，上方不另外出現標題列
 * - 下一層頁面給 backHref：標題列左上角出現返回鍵
 *
 * 換頁時整頁都在移動，頁面裡不要用 backdrop-filter，iPhone 每一幀都要重算模糊會嚴重卡頓
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeftIcon } from './Icons';

interface Props {
  title: string;
  largeTitle?: boolean;
  backHref?: string;
  backText?: string;
  /** 標題右側的按鈕 */
  end?: ReactNode;
  children: ReactNode;
}

export function Page({ title, largeTitle, backHref, backText, end, children }: Props) {
  const navigate = useNavigate();

  // 有上一頁就退回去（返回時會回到原本捲到的位置）；從網址直接打開時沒有上一頁，改到上一層
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else if (backHref) navigate(backHref, { replace: true });
  };

  if (largeTitle) {
    return (
      <>
        {/* 狀態列底下墊一層背景色，捲動的內容才不會和時間、電量疊在一起 */}
        <div className="status-bar-scrim" aria-hidden="true" />
        <header className="large-title">
          <h1>{title}</h1>
          {end && <div className="large-title__end">{end}</div>}
        </header>
        <div className="page-body page-body--large-title">{children}</div>
      </>
    );
  }

  return (
    <>
      <header className="nav-bar">
        <div className="nav-bar__side">
          {backHref && (
            <button type="button" className="nav-bar__back" onClick={back}>
              <ChevronLeftIcon size={22} />
              <span>{backText ?? '返回'}</span>
            </button>
          )}
        </div>
        <h1 className="nav-bar__title">{title}</h1>
        <div className="nav-bar__side nav-bar__side--end">{end}</div>
      </header>
      <div className="page-body">{children}</div>
    </>
  );
}
