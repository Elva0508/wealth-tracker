/**
 * 新增項目的卡片式彈出面板：從底部滑上來、後方頁面縮小，可往下拖動關閉。
 */
import type { Category, ItemKind } from '@core';
import { IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { useRef, useState } from 'react';
import { ItemForm } from './ItemForm';

export interface CreateRequest {
  kind: ItemKind;
  category?: Category;
}

export function ItemCreateModal({
  request,
  presentingElement,
  onClose,
}: {
  /** null 時面板關閉 */
  request: CreateRequest | null;
  presentingElement: HTMLElement | null;
  onClose: () => void;
}) {
  // 關閉動畫播放時 request 已是 null，沿用上一次的內容，畫面才不會先變空白
  const last = useRef<CreateRequest | null>(null);
  if (request) last.current = request;
  // 每次打開都換一個 key，表單回到空白狀態
  const [openCount, setOpenCount] = useState(0);

  return (
    <IonModal
      isOpen={request !== null}
      presentingElement={presentingElement ?? undefined}
      onWillPresent={() => setOpenCount((n) => n + 1)}
      onDidDismiss={onClose}
      className="glass-modal"
    >
      <IonHeader className="glass-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onClose}>取消</IonButton>
          </IonButtons>
          <IonTitle>新增項目</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="page-body page-body--modal">
          {last.current && (
            <ItemForm
              key={openCount}
              initialKind={last.current.kind}
              initialCategory={last.current.category}
              onSaved={onClose}
            />
          )}
        </div>
      </IonContent>
    </IonModal>
  );
}
