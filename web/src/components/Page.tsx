/**
 * 每個畫面共用的外框：大標題或標題列、返回鍵、下拉更新。
 * - 分頁第一層用 largeTitle：只有跟著內容捲動的大標題，上方不另外出現標題列
 * - 下一層頁面給 backHref：標題列左上角出現返回鍵，也可從左緣滑動返回
 *
 * 換頁時整頁都在移動，頁面裡不要用 backdrop-filter，iPhone 每一幀都要重算模糊會嚴重卡頓
 */
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import type { ReactNode, Ref } from 'react';

interface Props {
  title: string;
  largeTitle?: boolean;
  backHref?: string;
  backText?: string;
  /** 標題列右側的按鈕 */
  end?: ReactNode;
  onRefresh?: () => Promise<void>;
  /** 固定在畫面上、不隨內容捲動的元素，例如浮動新增鍵 */
  fixed?: ReactNode;
  /** 給卡片式彈出面板當作後方縮小的頁面 */
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}

export function Page({ title, largeTitle, backHref, backText, end, onRefresh, fixed, ref, children }: Props) {
  return (
    <IonPage ref={ref}>
      {!largeTitle && (
        <IonHeader className="page-header">
          <IonToolbar>
            {backHref && (
              <IonButtons slot="start">
                <IonBackButton defaultHref={backHref} text={backText ?? '返回'} />
              </IonButtons>
            )}
            <IonTitle>{title}</IonTitle>
            {end && <IonButtons slot="end">{end}</IonButtons>}
          </IonToolbar>
        </IonHeader>
      )}
      <IonContent className={largeTitle ? 'content--large-title' : undefined}>
        {onRefresh && (
          <IonRefresher
            slot="fixed"
            onIonRefresh={async (e) => {
              try {
                await onRefresh();
              } finally {
                e.detail.complete();
              }
            }}
          >
            <IonRefresherContent />
          </IonRefresher>
        )}
        {largeTitle && (
          <>
            {/* 狀態列底下墊一層背景色，捲動的內容才不會和時間、電量疊在一起 */}
            <div slot="fixed" className="status-bar-scrim" />
            <header className="large-title">
              <h1>{title}</h1>
              {end && <div className="large-title__end">{end}</div>}
            </header>
          </>
        )}
        <div className="page-body">{children}</div>
        {fixed}
      </IonContent>
    </IonPage>
  );
}
