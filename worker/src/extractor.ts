import { v4 as uuidv4 } from 'uuid';

// ── Synonym lists ─────────────────────────────────────────────────────────────
// Intentionally broad to cover Surface pricing sheets (Chinese + English)

const productSynonyms = [
  '產品', '品名', '方案名稱', 'product', 'sku name', '商品', '項目', '廠牌', '品牌',
  '原廠編號', '料品說明', '主機', '配件', '型號', '產品名稱', '規格', '品項', '機型',
  '說明', '商品名稱', '品項說明', '產品說明', '產品型號', '設備名稱',
];

const priceSynonyms = [
  '價格', '報價', '售價', '參考價格', 'quote', 'price', '金額', '費用', '單價',
  '定價', '經銷價', '建議售價', '未稅', '含稅', '建議零售價', 'msrp', '參考售價',
  '市場建議售價', '未稅售價', '含稅售價', '政府採購價', '校園價', '商用價',
  '經銷商價', '特價', '優惠價', '教育優惠價', '商用優惠價', '教育價', '政府價',
  '一般售價', '標準售價', '參考報價',
];

const pmSynonyms = ['pm', '產品經理', '負責人', 'owner', 'pic', '聯絡人', '負責pdm', 'pdm'];

const promotionSynonyms = [
  '優惠', '折扣', '促案', 'promotion', 'discount', '特價', '活動', 'big grid',
  'special price', 'deal', '促銷', '優惠活動', '促銷活動', '限時優惠',
];

const skuSynonyms = [
  '料號', '料號編列', 'sku', 'ep2', 'ep1', '型號', '零件號碼',
  'part no', 'part number', '產品編號', '編號', '序號', '貨號',
];

// ── Note/skip row markers ────────────────────────────────────────────────────
// Rows starting with these characters are notes/conditions, not products
const NOTE_PREFIXES = ['※', '★', '●', '■', '▶', '◆', '◎', '□', '▪', '♦', '*', '#', '‧', '•', '·'];
const NOTE_KEYWORDS = ['注意', '備註', '說明', '適用', '不含', '排除', '限制', '僅限', '需搭配', '條件', '例外'];
const SUBTOTAL_KEYWORDS = ['小計', '合計', 'total', '總計'];

// ── Sheet purpose ─────────────────────────────────────────────────────────────
export type SheetPurpose = 'main_product' | 'accessory' | 'promotion' | 'bundle' | 'notes' | 'general';

export interface SheetMeta {
  sheetName: string;
  purpose: SheetPurpose;
  recordsExtracted: number;
  priceColumns: string[];      // column header labels of price columns found
  sectionTitles: string[];     // mid-sheet section titles found
  nonEmptyRows: number;
  headerFound: boolean;
  explanation: string;         // Chinese human-readable explanation
}

/**
 * Classify a worksheet by name and content into a structured purpose category.
 */
export function classifySheetPurpose(sheetName: string, data: any[][]): SheetPurpose {
  const n = sheetName.toLowerCase();
  if (/配件|周邊|accessory|accessories/.test(n)) return 'accessory';
  if (/促銷|促案|big deal|special|promotion|deal/.test(n)) return 'promotion';
  if (/bundle|組合|套裝/.test(n)) return 'bundle';
  if (/說明|注意|條件|規範|terms|note|readme|免責/.test(n)) return 'notes';
  if (/pro|laptop|go|studio|book|主機|device|設備|surface/.test(n)) return 'main_product';
  // Fallback: scan content for clues
  const allText = data.flat().map(c => String(c ?? '')).join(' ').toLowerCase();
  if (/配件|周邊/.test(allText)) return 'accessory';
  if (/促銷|優惠|折扣活動/.test(allText)) return 'promotion';
  return 'general';
}

/**
 * Generate a Chinese human-readable explanation for a single worksheet.
 */
export function generateSheetExplanation(meta: SheetMeta): string {
  const purposeLabel: Record<SheetPurpose, string> = {
    main_product: '主機產品報價',
    accessory: '共用配件報價',
    promotion: '限時促銷優惠',
    bundle: '套裝組合方案',
    notes: '說明條件與注意事項',
    general: '一般資料',
  };
  const priceInfo = meta.priceColumns.length > 0
    ? `，價格欄位：${meta.priceColumns.join('、')}`
    : '';
  const sectionInfo = meta.sectionTitles.length > 0
    ? `，商品分類：${meta.sectionTitles.slice(0, 5).join('、')}${meta.sectionTitles.length > 5 ? '等' : ''}`
    : '';
  const recordInfo = meta.recordsExtracted > 0
    ? `，已擷取 ${meta.recordsExtracted} 筆報價記錄`
    : '，未能擷取結構化報價（可能為說明或條件頁）';
  return `【工作表】${meta.sheetName}（${purposeLabel[meta.purpose]}）：共 ${meta.nonEmptyRows} 列有效資料${priceInfo}${sectionInfo}${recordInfo}。`;
}

// ── Row classification ────────────────────────────────────────────────────────
type RowClass = 'empty' | 'section_title' | 'column_header' | 'product' | 'note' | 'subtotal';

function normalizeHeader(h: string): string {
  return String(h ?? '').toLowerCase().replace(/[\s\n\r(（）)（）\/\\]/g, '').trim();
}

function findColumnIndex(headers: string[], synonyms: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const header = normalizeHeader(headers[i]);
    if (!header) continue;
    if (synonyms.some(syn => header.includes(normalizeHeader(syn)) || normalizeHeader(syn).includes(header))) return i;
  }
  return -1;
}

/** Find ALL column indices that match any synonym — for multi-price-column sheets */
function findAllColumnIndices(headers: string[], synonyms: string[]): number[] {
  const results: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    const header = normalizeHeader(headers[i]);
    if (!header) continue;
    if (synonyms.some(syn => header.includes(normalizeHeader(syn)) || normalizeHeader(syn).includes(header))) {
      results.push(i);
    }
  }
  return results;
}

function looksLikePrice(text: string): boolean {
  // Detects values like "NT$35,900", "35900", "$1,200", "1,200元"
  const stripped = text.replace(/[NT$¥€£,，\s元]/g, '');
  return /^\d{2,}(\.\d+)?$/.test(stripped) && parseInt(stripped, 10) > 50;
}

function isNoteRow(row: any[]): boolean {
  const firstNonEmpty = row.map(c => String(c ?? '').trim()).find(Boolean) ?? '';
  if (NOTE_PREFIXES.some(p => firstNonEmpty.startsWith(p))) return true;
  if (NOTE_KEYWORDS.some(k => firstNonEmpty.includes(k))) return true;
  return false;
}

function isSubtotalRow(row: any[]): boolean {
  const text = row.map(c => String(c ?? '').trim().toLowerCase()).join(' ');
  return SUBTOTAL_KEYWORDS.some(k => text.includes(k));
}

function isHeaderRow(cells: string[]): boolean {
  const hasProduct = findColumnIndex(cells, productSynonyms) !== -1;
  const hasPrice = findColumnIndex(cells, priceSynonyms) !== -1;
  const hasSku = findColumnIndex(cells, skuSynonyms) !== -1;
  return (hasProduct || hasSku) && (hasPrice || hasProduct);
}

function classifyRow(row: any[]): RowClass {
  if (!row || row.length === 0) return 'empty';
  const cells = row.map(c => String(c ?? '').trim());
  const nonEmpty = cells.filter(Boolean);
  if (nonEmpty.length === 0) return 'empty';

  // Notes/conditions rows take highest priority
  if (isNoteRow(row)) return 'note';
  if (isSubtotalRow(row)) return 'subtotal';

  // Column header detection
  if (isHeaderRow(cells)) return 'column_header';

  // Section title: 1-2 non-empty cells, no price values, reasonable text length
  if (nonEmpty.length <= 2) {
    if (!nonEmpty.some(c => looksLikePrice(c)) && nonEmpty[0].length >= 2 && nonEmpty[0].length <= 80) {
      return 'section_title';
    }
  }

  return 'product';
}

// ── Main extractor ────────────────────────────────────────────────────────────
/**
 * Extract structured quote/PM/promo records from a table (2D array of rows).
 * Supports multiple sections within a single sheet (state machine approach).
 * Returns SheetMeta for workbook-level summary generation.
 */
export async function extractRecordsFromTable(
  db: D1Database,
  fileId: string,
  tableData: any[][],
  citationPrefix: string,
  sheetName?: string,
): Promise<SheetMeta> {
  const meta: SheetMeta = {
    sheetName: sheetName ?? citationPrefix,
    purpose: 'general',
    recordsExtracted: 0,
    priceColumns: [],
    sectionTitles: [],
    nonEmptyRows: 0,
    headerFound: false,
    explanation: '',
  };

  // Count non-empty rows for metadata
  meta.nonEmptyRows = tableData.filter(r => r && r.some(c => String(c ?? '').trim())).length;

  if (tableData.length < 2) {
    meta.explanation = generateSheetExplanation(meta);
    return meta;
  }

  // Classify sheet purpose
  meta.purpose = classifySheetPurpose(sheetName ?? '', tableData);

  if (meta.purpose === 'notes') {
    meta.explanation = generateSheetExplanation(meta);
    return meta; // Don't try to extract quotes from notes sheets
  }

  const stmts: D1PreparedStatement[] = [];
  const priceColumnSet = new Set<string>();

  // ── State machine ──────────────────────────────────────────────────────────
  // We scan every row. When we see a column_header row, we reset the column
  // mapping for the new section. When we see a section_title row, we update
  // the currentSection context. Product rows are extracted using current state.

  let currentHeaders: string[] = [];
  let currentPriceIndices: number[] = [];
  let productIdx = -1;
  let pmIdx = -1;
  let promoIdx = -1;
  let skuIdx = -1;
  let currentSection = ''; // e.g. "Surface Pro 12吋"
  let hasAnyHeader = false;

  for (let i = 0; i < tableData.length; i++) {
    const row = tableData[i];
    if (!row || row.length === 0) continue;

    const rowClass = classifyRow(row);

    if (rowClass === 'empty') continue;
    if (rowClass === 'note') continue;
    if (rowClass === 'subtotal') continue;

    if (rowClass === 'column_header') {
      // New section starts — reset column mapping
      currentHeaders = row.map((h: any) => String(h ?? '').trim());
      currentPriceIndices = findAllColumnIndices(currentHeaders, priceSynonyms);
      productIdx = findColumnIndex(currentHeaders, productSynonyms);
      pmIdx = findColumnIndex(currentHeaders, pmSynonyms);
      promoIdx = findColumnIndex(currentHeaders, promotionSynonyms);
      skuIdx = findColumnIndex(currentHeaders, skuSynonyms);
      hasAnyHeader = true;
      meta.headerFound = true;

      // Track unique price column names for meta
      currentPriceIndices.forEach(pi => {
        const label = currentHeaders[pi];
        if (label) priceColumnSet.add(label);
      });
      continue;
    }

    if (rowClass === 'section_title') {
      const nonEmpty = row.map((c: any) => String(c ?? '').trim()).filter(Boolean);
      if (nonEmpty.length > 0) {
        currentSection = nonEmpty[0];
        if (!meta.sectionTitles.includes(currentSection)) {
          meta.sectionTitles.push(currentSection);
        }
      }
      continue;
    }

    // rowClass === 'product'
    if (!hasAnyHeader) continue; // No header found yet — skip
    if (productIdx === -1 && skuIdx === -1) continue; // Can't identify product column

    const rawProduct = productIdx !== -1 ? String(row[productIdx] ?? '').replace(/\n/g, ' ').trim() : '';
    const rawSku = skuIdx !== -1 ? String(row[skuIdx] ?? '').replace(/\n/g, ' ').trim() : '';

    // Product name: use actual cell content, then fall back to section or sku
    const productName = rawProduct || rawSku || currentSection;
    const sku = rawSku || rawProduct;

    if (!productName) continue;

    // Skip repeat-header rows (a row whose content matches a column header label)
    if (currentHeaders.some(h => normalizeHeader(h) === normalizeHeader(productName) && h.length > 1)) continue;

    const sectionCtx = currentSection ? ` [${currentSection}]` : '';
    const citation = `${citationPrefix}${sectionCtx}, Row ${i + 1}`;

    // Extract price — one record per price column (handles sheets with multiple price tiers)
    if (currentPriceIndices.length > 0) {
      for (const pi of currentPriceIndices) {
        const rawPrice = row[pi];
        const rawStr = typeof rawPrice === 'number'
          ? `NT$${rawPrice.toLocaleString()}`
          : String(rawPrice ?? '').replace(/\n/g, ' ').trim();

        if (!rawStr || rawStr === '0' || rawStr === '-' || rawStr === 'N/A' || rawStr === '') continue;

        // Format: "NT$35,900（建議售價）" when multiple price columns
        const colLabel = currentHeaders[pi] || '';
        const quoteValue = currentPriceIndices.length > 1 && colLabel
          ? `${rawStr}（${colLabel}）`
          : rawStr;

        stmts.push(db.prepare(
          'INSERT INTO ProductQuoteRecord (id, productName, sku, quoteValue, sourceFileId, citation) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(uuidv4(), productName, sku, quoteValue, fileId, citation));
        meta.recordsExtracted++;
      }
    }

    // PM record
    if (pmIdx !== -1) {
      const pmName = String(row[pmIdx] ?? '').replace(/\n/g, ' ').trim();
      if (pmName) {
        stmts.push(db.prepare(
          'INSERT INTO ProductPMRecord (id, productName, sku, pmName, sourceFileId, citation) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(uuidv4(), productName, sku, pmName, fileId, citation));
      }
    }

    // Promotion record
    if (promoIdx !== -1) {
      const promo = String(row[promoIdx] ?? '').replace(/\n/g, ' ').trim();
      if (promo) {
        stmts.push(db.prepare(
          'INSERT INTO PromotionRecord (id, productName, sku, promotionTitle, sourceFileId, citation) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(uuidv4(), productName, sku, promo, fileId, citation));
      }
    }
  }

  // Flush DB inserts in batches of 50
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }

  meta.priceColumns = [...priceColumnSet];
  meta.explanation = generateSheetExplanation(meta);
  return meta;
}

// ── Text-based extractor (for PDF, DOCX, TXT) — unchanged ────────────────────
export async function extractRecordsFromText(db: D1Database, fileId: string, text: string, citationPrefix: string) {
  if (!text || text.trim().length < 3) return;

  const stmts: D1PreparedStatement[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let currentProduct = '';
  let currentSku = '';

  for (const line of lines) {
    const colonMatch = line.match(/^([^:：]+)[：:]\s*(.+)$/);
    if (!colonMatch) continue;
    const key = normalizeHeader(colonMatch[1]);
    const value = colonMatch[2].trim();

    if (productSynonyms.some(s => key.includes(normalizeHeader(s)))) {
      currentProduct = value;
    } else if (skuSynonyms.some(s => key.includes(normalizeHeader(s)))) {
      currentSku = value;
    } else if (currentProduct || currentSku) {
      if (priceSynonyms.some(s => key.includes(normalizeHeader(s)))) {
        stmts.push(db.prepare(
          'INSERT INTO ProductQuoteRecord (id, productName, sku, quoteValue, sourceFileId, citation) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(uuidv4(), currentProduct, currentSku, value, fileId, citationPrefix));
      } else if (pmSynonyms.some(s => key.includes(normalizeHeader(s)))) {
        stmts.push(db.prepare(
          'INSERT INTO ProductPMRecord (id, productName, sku, pmName, sourceFileId, citation) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(uuidv4(), currentProduct, currentSku, value, fileId, citationPrefix));
      } else if (promotionSynonyms.some(s => key.includes(normalizeHeader(s)))) {
        stmts.push(db.prepare(
          'INSERT INTO PromotionRecord (id, productName, sku, promotionTitle, sourceFileId, citation) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(uuidv4(), currentProduct, currentSku, value, fileId, citationPrefix));
      }
    }
  }

  const inlinePriceRe = /([^\s,，。\n]{2,30})\s*(報價|售價|價格|定價|單價|經銷價|建議售價)[為是：:﹕]?\s*(NT\$?[\d,]+|USD?\s*[\d,]+|[\d,]+\s*元)/gi;
  let m: RegExpExecArray | null;
  while ((m = inlinePriceRe.exec(text)) !== null) {
    if (m[1].length >= 2) {
      stmts.push(db.prepare(
        'INSERT INTO ProductQuoteRecord (id, productName, quoteValue, sourceFileId, citation) VALUES (?, ?, ?, ?, ?)'
      ).bind(uuidv4(), m[1].trim(), m[3].trim(), fileId, citationPrefix));
    }
  }

  const promoRe = /([^\s,，。\n]{2,30})\s*(優惠|折扣|促銷|活動)[：:﹕]?\s*([^\s,，。\n]{1,30})/gi;
  while ((m = promoRe.exec(text)) !== null) {
    if (m[1].length >= 2) {
      stmts.push(db.prepare(
        'INSERT INTO PromotionRecord (id, productName, promotionTitle, sourceFileId, citation) VALUES (?, ?, ?, ?, ?)'
      ).bind(uuidv4(), m[1].trim(), m[3].trim(), fileId, citationPrefix));
    }
  }

  if (stmts.length > 0) {
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50));
    }
  }
}
