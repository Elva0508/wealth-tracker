/**
 * 匯出 CSV 與 Excel（.xlsx）。
 *
 * 為了不增加相依套件，.xlsx 由這裡直接產生：xlsx 本質上是一個 zip 檔，
 * 裡面放幾個 XML 檔案。這裡只做最基本的單一工作表、不壓縮的 zip，
 * Excel、Numbers、Google 試算表都能開啟。
 */
import { toFixedString } from './decimal.ts';
import { BASE_CURRENCY, type RateTable } from './fx.ts';
import { type BalanceItem, CATEGORY_LABELS, valueItem } from './balance.ts';

export type Cell = string | { number: string } | null;

export interface ExportTable {
  header: string[];
  rows: Cell[][];
}

/** 匯出內容不受首頁「隱藏金額」設定影響，一律輸出實際數字 */
export function itemsExportTable(
  items: (BalanceItem & { notes?: string | null })[],
  rates: RateTable,
  baseCurrency = BASE_CURRENCY,
): ExportTable {
  const header = ['類型', '分類', '名稱', '幣別', '原幣金額', '匯率', `${baseCurrency} 估值`, '狀態', '備註'];
  const rows = items.map((item): Cell[] => {
    const v = valueItem(item, rates, baseCurrency);
    return [
      item.kind === 'asset' ? '資產' : '負債',
      CATEGORY_LABELS[item.category],
      item.name,
      item.currency,
      { number: toFixedString(v.amountDec, 4) },
      v.rate === null ? '無匯率' : { number: toFixedString(v.rate) },
      v.amountBase === null ? null : { number: toFixedString(v.amountBase, 2) },
      item.status === 'active' ? '使用中' : '已封存',
      item.notes ?? '',
    ];
  });
  return { header, rows };
}

function cellText(cell: Cell): string {
  if (cell === null) return '';
  return typeof cell === 'string' ? cell : cell.number;
}

/** 產生 CSV。開頭加 BOM，讓 Excel 正確辨識 UTF-8 中文 */
export function toCsv(table: ExportTable): string {
  const escape = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const lines = [table.header, ...table.rows.map((row) => row.map(cellText))].map((row) =>
    row.map(escape).join(','),
  );
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ---------- .xlsx ----------

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML 1.0 不允許的控制字元
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(table: ExportTable): string {
  const allRows: Cell[][] = [table.header, ...table.rows];
  const rowsXml = allRows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === null) return '';
          const ref = `${columnName(c)}${r + 1}`;
          if (typeof cell === 'string') {
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
          }
          return `<c r="${ref}"><v>${cell.number}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rowsXml}</sheetData></worksheet>`
  );
}

export function toXlsx(table: ExportTable, sheetName = '資產負債'): Uint8Array {
  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${xmlEscape(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
      '</workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
    'xl/worksheets/sheet1.xml': sheetXml(table),
  };
  const encoder = new TextEncoder();
  return createZip(Object.entries(files).map(([name, text]) => ({ name, data: encoder.encode(text) })));
}

// ---------- 不壓縮的 zip ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  const UTF8_FLAG = 0x0800;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // 不壓縮
    lv.setUint16(10, 0, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    localParts.push(local, file.data);
    centralParts.push(central);
    offset += local.length + size;
  }

  const centralSize = centralParts.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...localParts, ...centralParts, end];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}
