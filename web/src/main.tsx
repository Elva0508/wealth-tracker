import { setupIonicReact } from '@ionic/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './hooks/useAuth';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import './styles.css';

// 從主畫面開啟（全螢幕 App）時才用 Ionic 的左緣滑動返回。
// 在 Safari 瀏覽器裡，Safari 自己的左緣滑動也會同時退回上一頁，兩個一起觸發會讓頁面堆疊錯亂：
// 舊頁面留在畫面上、切換分頁沒有反應。瀏覽器裡就交給 Safari 的手勢處理。
const standalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// 所有平台都用 iOS 的外觀與過場動畫
setupIonicReact({ mode: 'ios', swipeBackEnabled: standalone });

// iOS Safari 不理會 viewport 的 user-scalable=no，雙指縮放要從手勢事件擋掉
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
