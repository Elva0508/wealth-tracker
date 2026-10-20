/** 新增項目的底部彈出面板 */
import type { Category, ItemKind } from '@core';
import { ItemForm } from './ItemForm';
import { Sheet } from './Sheet';

export interface CreateRequest {
  kind: ItemKind;
  category?: Category;
}

export function ItemCreateModal({ request, onClose }: { request: CreateRequest | null; onClose: () => void }) {
  if (!request) return null;
  return (
    <Sheet title="新增項目" onClose={onClose}>
      {(close) => <ItemForm initialKind={request.kind} initialCategory={request.category} onSaved={close} />}
    </Sheet>
  );
}
