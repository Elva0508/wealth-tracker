/**
 * 底部浮動導覽列與各分頁的路由。
 * 每個分頁有自己的頁面堆疊：在分頁內往下一層會以 iOS 的左右推移進場，可從左緣滑動返回。
 */
import { IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react';
import { useEffect, useRef } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { CategoryPage } from '../pages/CategoryPage';
import { ComingSoonPage } from '../pages/ComingSoonPage';
import { ItemPage } from '../pages/ItemPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ArchivedPage } from '../pages/settings/ArchivedPage';
import { BackupPage } from '../pages/settings/BackupPage';
import { ExportPage } from '../pages/settings/ExportPage';
import { ChartIcon, ListIcon, LoanIcon, SettingsIcon } from './Icons';

/** 放開手指後，換頁動畫最長大約這麼久；超過就當作結束事件漏掉，解除鎖定 */
const NAV_LOCK_TIMEOUT_MS = 2000;

export function AppTabs() {
  const outletRef = useRef<HTMLIonRouterOutletElement>(null);

  // 換頁動畫或滑動返回進行中切換分頁，Ionic 的頁面堆疊會錯亂（多個頁面同時顯示、之後點不動），
  // 所以這段期間暫時讓導覽列不能點
  useEffect(() => {
    const outlet = outletRef.current;
    if (!outlet) return;
    let timer = 0;
    let touching = false;
    const unlock = () => {
      window.clearTimeout(timer);
      document.body.classList.remove('nav-busy');
    };
    // 滑動返回時手指還按著就一直鎖住，放開後才開始計時
    const armFallback = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (touching ? armFallback() : unlock()), NAV_LOCK_TIMEOUT_MS);
    };
    const lock = () => {
      document.body.classList.add('nav-busy');
      armFallback();
    };
    const onTouch = (e: TouchEvent) => {
      touching = e.touches.length > 0;
    };
    outlet.addEventListener('ionNavWillChange', lock);
    outlet.addEventListener('ionNavDidChange', unlock);
    for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
      document.addEventListener(type, onTouch, { capture: true, passive: true });
    }
    return () => {
      outlet.removeEventListener('ionNavWillChange', lock);
      outlet.removeEventListener('ionNavDidChange', unlock);
      for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
        document.removeEventListener(type, onTouch, { capture: true });
      }
      unlock();
    };
  }, []);

  return (
    <IonTabs>
      <IonRouterOutlet ref={outletRef}>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/overview/:category" element={<CategoryPage />} />
        <Route path="/overview/:category/:itemId" element={<ItemPage />} />
        <Route
          path="/investments"
          element={
            <ComingSoonPage
              title="投資管理"
              stage="V1b"
              description="券商帳戶與交割戶、逐筆買賣、手續費與交易稅、加權平均與 FIFO 成本、自動股價與股利。"
            />
          }
        />
        <Route
          path="/loans"
          element={
            <ComingSoonPage
              title="貸款管理"
              stage="V1c"
              description="還款表、固定與浮動利率、自有與貸款資金分類、利息分攤，以及淨資產趨勢圖。"
            />
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/archived" element={<ArchivedPage />} />
        <Route path="/settings/export" element={<ExportPage />} />
        <Route path="/settings/backup" element={<BackupPage />} />
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </IonRouterOutlet>

      {/* 導覽列後方墊一層漸層背景色，捲到底下的文字不會和導覽列疊在一起 */}
      <div className="tabbar-scrim" aria-hidden="true" />
      <IonTabBar slot="bottom" className="glass-tabbar">
        <IonTabButton tab="overview" href="/overview">
          <ListIcon size={20} />
          <IonLabel>總覽</IonLabel>
        </IonTabButton>
        <IonTabButton tab="investments" href="/investments">
          <ChartIcon size={20} />
          <IonLabel>投資</IonLabel>
        </IonTabButton>
        <IonTabButton tab="loans" href="/loans">
          <LoanIcon size={20} />
          <IonLabel>貸款</IonLabel>
        </IonTabButton>
        <IonTabButton tab="settings" href="/settings">
          <SettingsIcon size={20} />
          <IonLabel>設定</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}
