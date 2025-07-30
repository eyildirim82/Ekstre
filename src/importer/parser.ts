import ExcelJS from 'exceljs';
import { parseDate } from '../utils/date';
import { parseTL } from '../utils/number';

// ---- normalize helpers ----
const norm = (s: string) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// alias -> canonical
const HEADER_ALIASES: Record<string, string> = {
  'belge türü': 'belge türü',
  'tarih': 'tarih',
  'evrak no': 'evrak no',
  'açıklama': 'açıklama',
  'vade tarihi': 'vade tarihi',
  'matrah': 'matrah',
  'iskonto': 'iskonto',
  'i̇skonto': 'iskonto',
  'net matrah': 'net matrah',
  'kdv': 'kdv',
  'borç tutar': 'borç tutar',
  'borç tutarı': 'borç tutar',        // alias
  'alacak tutar': 'alacak tutar',
  'alacak tutarı': 'alacak tutar',    // alias
  'borç bakiye': 'borç bakiye',
  'alacak bakiye': 'alacak bakiye',
  '#': '#'
};

function canon(label: any): string {
  const key = norm(
    label && label.richText
      ? label.richText.map((p: any) => p.text).join('')
      : label
  );
  return HEADER_ALIASES[key] ?? key; // eşleşmezse de normalize edilmiş ham key
}

function cellToString(v: any): string {
  if (v == null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((p: any) => p.text).join('');
    }
    if ('text' in v && typeof (v as any).text === 'string') {
      return String((v as any).text);
    }
    if (v instanceof Date) return formatYMD(v); // fallback
    if ('result' in v) return String((v as any).result ?? ''); // formula result
    if ('formula' in v) return String((v as any).formula ?? '');
    if ('value' in v) return String((v as any).value ?? '');
  }
  return String(v);
}

function getText(row: ExcelJS.Row, col?: number) {
  if (!col) return '';
  
  try {
    const cell = row.getCell(col);
    
    // First try to get the value directly
    if (cell.value != null) {
      return cellToString(cell.value).trim();
    }
    
    // Only try to access cell.text if value is null/undefined
    // and wrap it in a try-catch to handle the toString error
    try {
      const text = cell.text;
      if (text != null) {
        return cellToString(text).trim();
      }
    } catch (textError: any) {
      // If cell.text fails, just return empty string
      console.warn(`Warning: Could not read text from cell at column ${col}:`, textError.message);
    }
    
    return '';
  } catch (error: any) {
    console.warn(`Warning: Could not read cell at column ${col}:`, error.message);
    return '';
  }
}

function isTL(s?: string) {
  if (!s) return false;
  const n = s.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(n);
}

function formatYMD(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

// ---- public helpers (revise) ----
export function rowContains(row: ExcelJS.Row, text: string) {
  const want = norm(text);
  const values = Array.isArray(row.values) ? row.values : [];
  return values.some((v: any) => {
    const s = cellToString(v);
    return norm(s).includes(want);
  });
}

export function rowIsEmpty(row: ExcelJS.Row) {
  const vs = Array.isArray(row.values) ? row.values : [];
  return vs.every((v: any) => norm(cellToString(v)) === '');
}

export function isTxHeaderRow(row: ExcelJS.Row) {
  const vals = Array.isArray(row.values) ? row.values.map(cellToString) : [];
  const normVals = vals.map(canon).filter(v => v && v !== '#');

  // Zorunlu minimum set: başlıkları katılaştırırsan artırırsın
  const requiredMin = ['belge türü', 'tarih', 'evrak no', 'borç tutar', 'alacak tutar'];
  const ok = requiredMin.every(r => normVals.includes(r));

  if (!ok) {
    if (process.env.DEBUG_IMPORT === '1') {
      console.log('[DEBUG] isTxHeaderRow normVals:', normVals);
    }
  }
  return ok;
}

export function buildTxHeaderMap(row: ExcelJS.Row, map: Record<string, number>) {
  if (!Array.isArray(row.values)) return;
  row.eachCell((cell, col) => {
    const key = canon(cell.value);
    if (key && !(key in map)) {
      map[key] = col; // normalize edilmiş (canonical) key
    }
  });
}

function col(map: Record<string, number>, label: string) {
  return map[canon(label)];
}

export function isTotalsRow(row: ExcelJS.Row, map: Record<string, number>) {
  try {
    const docType = getText(row, col(map, 'Belge Türü'));
    const tarih = getText(row, col(map, 'Tarih'));
    const matrah = getText(row, col(map, 'Matrah'));
    const borc   = getText(row, col(map, 'Borç Tutar'));
    const alacak = getText(row, col(map, 'Alacak Tutar'));
    const numericPresent = [matrah, borc, alacak].some(isTL);
    return !docType && !tarih && numericPresent;
  } catch (error: any) {
    console.warn('Warning: Error in isTotalsRow:', error.message);
    return false;
  }
}

export function readCustomerHeader(ws: ExcelJS.Worksheet, startRow: number) {
  const r1    = ws.getRow(startRow);
  const r2    = ws.getRow(startRow + 1);
  const r3    = ws.getRow(startRow + 2);
  const rAddr = ws.getRow(startRow + 4);

  const header = {
    code:       getPairRightOf(r1, 'Cari Kodu'),
    name:       getPairRightOf(r2, 'Cari Adı'),
    phone:      getPairRightOf(r1, 'Telefon'),
    address:    getPairRightOf(rAddr, 'Adres'),
    accountType:getPairRightOf(r3, 'Cari Hesap Türü'),
    tag1:       getPairRightOf(r3, 'Özel Kod(1)'),
    tag2:       getPairRightOf(r3, 'Özel Kod(2)'),
    reportedTotalDebit:   parseTL(getPairRightOf(r1, 'Borç')),
    reportedTotalCredit:  parseTL(getPairRightOf(r2, 'Alacak')),
    reportedDebtBalance:  parseTL(getPairRightOf(r1, 'Borç Bakiye')),
    reportedCreditBalance:parseTL(getPairRightOf(r2, 'Alacak Bakiye'))
  };

  // İşlem başlığını ara
  let nextRow = startRow + 1;
  while (nextRow <= ws.rowCount) {
    if (isTxHeaderRow(ws.getRow(nextRow))) break;
    nextRow++;
  }
  return { header, nextRow };
}

export function parseTxRow(row: ExcelJS.Row, map: Record<string, number>) {
  const t = (k: string) => getText(row, col(map, k));
  const n = (k: string) => parseTL(t(k));
  const dateOrNull = (s?: string) => (s ? parseDate(s) : null);

  // Tarih hücresinde Date nesnesi olabilir → t('Tarih') boşsa .value'dan oku
  let tarihStr = t('Tarih');
  if (!tarihStr) {
    const c = col(map, 'Tarih');
    const v = c ? row.getCell(c).value : undefined;
    if (v instanceof Date) tarihStr = `${String(v.getDate()).padStart(2,'0')}/${String(v.getMonth()+1).padStart(2,'0')}/${v.getFullYear()}`;
  }

  return {
    docType: t('Belge Türü') || undefined,
    txnDate: parseDate(tarihStr),
    voucherNo: t('Evrak No') || undefined,
    description: t('Açıklama') || undefined,
    dueDate: dateOrNull(t('Vade Tarihi')),
    amountBase: n('Matrah'),
    discount: n('iskonto'),
    amountNet: n('Net Matrah'),
    vat: n('KDV'),
    debit: n('Borç Tutar') || 0,
    credit: n('Alacak Tutar') || 0
  };
}

// Label:Value çifti gibi duran satırlarda, "Label"i bulup sağındaki hücreyi döndür
function getPairRightOf(row: ExcelJS.Row, label: string) {
  const cells = Array.isArray(row.values) ? row.values as any[] : [];
  const labelNorm = norm(label);
  for (let c = 1; c < cells.length; c++) {
    const left = cellToString(cells[c]);
    if (norm(left) === labelNorm) {
      return cellToString(cells[c + 1]).trim();
    }
  }
  return '';
}