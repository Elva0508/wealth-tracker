import { itemsExportTable, toCsv, toXlsx } from '@core';
import { Page } from '../../components/Page';
import { useAppData } from '../../hooks/useAppData';
import { downloadFile, fileStamp } from '../../lib/download';

export function ExportPage() {
  const { items, rates } = useAppData();

  const exportCsv = () =>
    downloadFile(toCsv(itemsExportTable(items, rates)), `資產負債-${fileStamp()}.csv`, 'text/csv;charset=utf-8');
  const exportXlsx = () =>
    downloadFile(
      toXlsx(itemsExportTable(items, rates)),
      `資產負債-${fileStamp()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

  return (
    <Page title="匯出到試算表" backHref="/settings" backText="設定">
      <section className="list-group">
        <div className="list">
          <button type="button" className="list-row list-row--button list-row--accent" onClick={exportCsv}>
            下載 CSV
          </button>
          <button type="button" className="list-row list-row--button list-row--accent" onClick={exportXlsx}>
            下載 Excel
          </button>
        </div>
        <p className="list-group__note">包含所有項目（含已封存）與目前匯率換算，不受隱藏金額設定影響。</p>
      </section>
    </Page>
  );
}
