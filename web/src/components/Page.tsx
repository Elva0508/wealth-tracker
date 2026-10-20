/**
 * 每個畫面共用的外框：毛玻璃標題列、iOS 大標題、返回鍵、下拉更新。
 * - 分頁第一層用 largeTitle：往下捲時大標題會收合到標題列
 * - 下一層頁面給 backHref：左上角出現返回鍵，也可從左緣滑動返回
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
      <IonHeader translucent className="glass-header">
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
      <IonContent fullscreen>
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
          <IonHeader collapse="condense">
            <IonToolbar>
              <IonTitle size="large">{title}</IonTitle>
            </IonToolbar>
          </IonHeader>
        )}
        <div className="page-body">{children}</div>
        {fixed}
      </IonContent>
    </IonPage>
  );
}
