import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { unzipSync } from 'fflate';
import { extractRecordsFromTable, extractRecordsFromText, SheetMeta } from './extractor';

export async function processFile(
  db: D1Database,
  fileId: string,
  fileBuffer: ArrayBuffer,
  originalName: string
) {
  try {
    const ext = originalName.split('.').pop()?.toLowerCase() ?? '';

    // Some upload flows (e.g. "BrandFile-based" uploads) may kick off parsing
    // without first inserting the expected SourceFile parent row.
    // Insert a minimal SourceFile record to keep foreign-key constraints valid.
    const existing = await db.prepare('SELECT id FROM SourceFile WHERE id=?').bind(fileId).first();
    if (!existing) {
      await db.prepare(`
        INSERT INTO SourceFile (id, fileName, originalFileName, fileType, mimeType, status, parseStatus, parseMessage, product, pm, documentType)
        VALUES (?, ?, ?, ?, ?, 'active', 'pending', '', '', '', '')
      `).bind(
        fileId,
        originalName,
        originalName,
        `.${ext}`,
        '' // mimeType unknown in this path
      ).run();
    }

    await db.prepare('UPDATE SourceFile SET parseStatus=?, parseMessage=? WHERE id=?')
      .bind('processing', 'Starting...', fileId).run();

    if (ext === 'xlsx' || ext === 'xls') {
      await parseExcel(db, fileId, fileBuffer);
    } else if (ext === 'csv') {
      await parseCsv(db, fileId, fileBuffer);
    } else if (ext === 'docx' || ext === 'doc') {
      await parseDocx(db, fileId, fileBuffer);
    } else if (ext === 'pdf') {
      await parsePdf(db, fileId, fileBuffer);
    } else if (ext === 'pptx' || ext === 'ppt') {
      await parsePptx(db, fileId, fileBuffer);
    } else if (ext === 'txt') {
      await parseTxt(db, fileId, fileBuffer);
    } else {
      throw new Error(`不支援的格式：${ext}。支援：xlsx, xls, csv, docx, pdf, pptx, ppt, txt`);
    }

    await db.prepare('UPDATE SourceFile SET parseStatus=?, parseMessage=? WHERE id=?')
      .bind('success', '解析完成', fileId).run();
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';
    await db.prepare('UPDATE SourceFile SET parseStatus=?, parseMessage=? WHERE id=?')
      .bind('error', msg, fileId).run();
    await db.prepare(
      'INSERT INTO ParseIssue (id, sourceFileId, severity, issueType, message, citation) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(uuidv4(), fileId, 'error', 'file_parse_error', msg, 'File Level').run();
  }
}

async function saveChunk(db: D1Database, fileId: string, type: string, content: string, citation: string, extra: Record<string, any> = {}) {
  if (!content?.trim()) return;
  await db.prepare(
    'INSERT INTO SourceChunk (id, sourceFileId, chunkType, content, citation, sheetName, section, pageOrSlide, tableName, rowIndex) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    uuidv4(), fileId, type, content, citation,
    extra.sheetName ?? null, extra.section ?? null,
    extra.pageOrSlide ?? null, extra.tableName ?? null,
    extra.rowIndex ?? null
  ).run();
}

// ── Excel ──────────────────────────────────────────────────────────────────
async function parseExcel(db: D1Database, fileId: string, buffer: ArrayBuffer) {
  // Cloudflare/D1 provides ArrayBuffer; xlsx.readFile expects a filename,
  // so we must use xlsx.read(..., { type: 'array' }).
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const wb = XLSX.read(u8, { type: 'array' });

  const allSheetTexts: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    const nonEmptyRows = data.filter(r => r?.some((c: any) => String(c ?? '').trim() !== ''));
    if (!nonEmptyRows.length) continue;

    const sheetTextLines: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row?.length) continue;
      const content = row.map((c: any) => String(c ?? '')).join(' | ');
      if (content.trim()) {
        await saveChunk(db, fileId, 'row', content, `Sheet: ${sheetName}, Row: ${i + 1}`, { sheetName, rowIndex: i });
        sheetTextLines.push(content);
      }
    }

    // Save per-sheet full_text so LLM fallback can search per sheet
    const sheetFullText = `[工作表：${sheetName}]\n` + sheetTextLines.join('\n');
    if (sheetFullText.trim()) {
      await saveChunk(db, fileId, 'full_text', sheetFullText.substring(0, 8000), `Sheet: ${sheetName} (full)`, { sheetName, section: sheetName });
      allSheetTexts.push(sheetFullText);
    }

    await extractRecordsFromTable(db, fileId, data, `Sheet: ${sheetName}`, sheetName);
  }

  // Save combined full_text across all sheets for cross-sheet LLM queries
  if (allSheetTexts.length > 1) {
    const combined = allSheetTexts.join('\n\n---\n\n').substring(0, 12000);
    await saveChunk(db, fileId, 'full_text', combined, 'All Sheets (combined)', { section: 'All Sheets' });
  }
}

// ── CSV ────────────────────────────────────────────────────────────────────
async function parseCsv(db: D1Database, fileId: string, buffer: ArrayBuffer) {
  const text = new TextDecoder('utf-8').decode(buffer);
  const wb = XLSX.read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row?.length) continue;
    const content = row.map((c: any) => String(c ?? '')).join(' | ');
    if (content.trim()) {
      await saveChunk(db, fileId, 'row', content, `CSV Row ${i + 1}`, { sheetName: 'CSV', rowIndex: i });
    }
  }
  await extractRecordsFromTable(db, fileId, data, 'CSV');
}

// ── TXT ────────────────────────────────────────────────────────────────────
async function parseTxt(db: D1Database, fileId: string, buffer: ArrayBuffer) {
  const text = new TextDecoder('utf-8').decode(buffer);
  const lines = text.split('\n');
  const chunkSize = 20;

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize).join('\n').trim();
    if (chunk) {
      await saveChunk(db, fileId, 'page_text', chunk, `Lines ${i + 1}-${i + chunkSize}`, { section: `Section ${Math.floor(i / chunkSize) + 1}` });
      await extractRecordsFromText(db, fileId, chunk, `Lines ${i + 1}-${i + chunkSize}`);
    }
  }

  // Table detection
  const tableLines: string[][] = [];
  for (const line of lines) {
    const cells = line.split(/\t|  {2,}/).map(c => c.trim()).filter(Boolean);
    if (cells.length >= 2) tableLines.push(cells);
  }
  if (tableLines.length >= 2) await extractRecordsFromTable(db, fileId, tableLines, 'TXT Table');

  // Full text for LLM fallback
  await saveChunk(db, fileId, 'full_text', text.substring(0, 8000), 'Full TXT', { section: 'Full Text' });
}

async function parseDocx(db: D1Database, fileId: string, buffer: ArrayBuffer) {
  try {
    const data = new Uint8Array(buffer);
    let unzipped: Record<string, Uint8Array>;

    try {
      unzipped = unzipSync(data);
    } catch {
      // Fallback: raw text extraction
      const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
      const cleaned = text.replace(/<[^>]+>/g, ' ').replace(/[^\x20-\x7E\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/g, ' ').replace(/\s{2,}/g, '\n').trim();
      if (cleaned.length > 50) {
        await saveChunk(db, fileId, 'full_text', cleaned.substring(0, 8000), 'DOCX text (fallback)', { section: 'Full Text' });
        await extractRecordsFromText(db, fileId, cleaned, 'DOCX');
      }
      return;
    }

    const docXml = unzipped['word/document.xml'];
    if (!docXml) return;

    const xmlStr = new TextDecoder().decode(docXml);

    // Extract paragraphs
    const paragraphs: string[] = [];
    const paraRe = /<w:p[ >]([\s\S]*?)<\/w:p>/g;
    let pm: RegExpExecArray | null;
    while ((pm = paraRe.exec(xmlStr)) !== null) {
      const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let tm: RegExpExecArray | null;
      let paraText = '';
      while ((tm = tRe.exec(pm[1])) !== null) paraText += tm[1];
      if (paraText.trim()) paragraphs.push(paraText.trim());
    }

    for (let i = 0; i < paragraphs.length; i++) {
      await saveChunk(db, fileId, 'paragraph', paragraphs[i], `Paragraph ${i + 1}`, { section: `Paragraph ${i + 1}` });
      await extractRecordsFromText(db, fileId, paragraphs[i], `Paragraph ${i + 1}`);
    }

    // Sliding window of 3 paragraphs for better context
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const combined = paragraphs.slice(i, Math.min(i + 3, paragraphs.length)).join('\n');
      await extractRecordsFromText(db, fileId, combined, `Paragraphs ${i + 1}-${Math.min(i + 3, paragraphs.length)}`);
    }

    // Extract tables
    const tableRe = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
    let tableMatch: RegExpExecArray | null;
    let tableIdx = 0;
    while ((tableMatch = tableRe.exec(xmlStr)) !== null) {
      tableIdx++;
      const tableData: string[][] = [];
      const rowRe = /<w:tr[ >]([\s\S]*?)<\/w:tr>/g;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(tableMatch[1])) !== null) {
        const cells: string[] = [];
        const cellRe = /<w:tc>([\s\S]*?)<\/w:tc>/g;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
          const tRe2 = /<w:t[^>]*>([^<]*)<\/w:t>/g;
          let tm2: RegExpExecArray | null;
          let cellText = '';
          while ((tm2 = tRe2.exec(cellMatch[1])) !== null) cellText += tm2[1];
          cells.push(cellText.trim());
        }
        if (cells.length) tableData.push(cells);
      }
      if (tableData.length >= 2) {
        await extractRecordsFromTable(db, fileId, tableData, `DOCX Table ${tableIdx}`);
      }
    }

    // Full text for LLM fallback
    const fullText = paragraphs.join('\n').substring(0, 8000);
    if (fullText) await saveChunk(db, fileId, 'full_text', fullText, 'DOCX full text', { section: 'Full Text' });

  } catch (e: any) {
    throw new Error(`DOCX 解析失敗：${e?.message ?? e}`);
  }
}

// ── PDF ────────────────────────────────────────────────────────────────────
async function parsePdf(db: D1Database, fileId: string, buffer: ArrayBuffer) {
  try {
    // pdfjs-dist/legacy/build/pdf.mjs is the ESM build compatible with Workers
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    // Workers has no worker threads — disable the worker
    (pdfjsLib as any).GlobalWorkerOptions = { workerSrc: '' };

    const loadingTask = (pdfjsLib as any).getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const allText: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = (content.items as any[])
        .map((item: any) => item.str)
        .join(' ')
        .trim();

      if (!pageText) continue;

      allText.push(pageText);
      await saveChunk(db, fileId, 'page_text', pageText, `Page ${pageNum}`, { section: `Page ${pageNum}` });
      await extractRecordsFromText(db, fileId, pageText, `Page ${pageNum}`);

      // Table detection: find lines with multiple whitespace-separated columns
      const lines = pageText.split(/\n/);
      const tableLines: string[][] = [];
      for (const line of lines) {
        const cells = line.split(/  {2,}|\t/).map((c: string) => c.trim()).filter(Boolean);
        if (cells.length >= 3) tableLines.push(cells);
      }
      if (tableLines.length >= 3) {
        await extractRecordsFromTable(db, fileId, tableLines, `Page ${pageNum} Table`);
      }
    }

    // Full text for LLM fallback
    const fullText = allText.join('\n---\n').substring(0, 8000);
    if (fullText) {
      await saveChunk(db, fileId, 'full_text', fullText, 'Full PDF text', { section: 'Full Text' });
    }
  } catch (e: any) {
    throw new Error(`PDF 解析失敗：${e?.message ?? e}。請確認 PDF 非純圖片掃描版。`);
  }
}

async function parsePptx(db: D1Database, fileId: string, buffer: ArrayBuffer) {
  try {
    const unzipped = unzipSync(new Uint8Array(buffer));
    const slideKeys = Object.keys(unzipped)
      .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] ?? '0');
        const nb = parseInt(b.match(/\d+/)?.[0] ?? '0');
        return na - nb;
      });

    const allTexts: string[] = [];

    for (let si = 0; si < slideKeys.length; si++) {
      const xmlStr = new TextDecoder().decode(unzipped[slideKeys[si]]);
      const paraRe = /<a:p>([\s\S]*?)<\/a:p>/g;
      const paragraphs: string[] = [];
      let pm: RegExpExecArray | null;

      while ((pm = paraRe.exec(xmlStr)) !== null) {
        const tRe = /<a:t>([^<]*)<\/a:t>/g;
        let tm: RegExpExecArray | null;
        let paraText = '';
        while ((tm = tRe.exec(pm[1])) !== null) paraText += tm[1];
        if (paraText.trim()) paragraphs.push(paraText.trim());
      }

      if (paragraphs.length) {
        const slideText = paragraphs.join('\n');
        allTexts.push(slideText);
        await saveChunk(db, fileId, 'slide', slideText, `Slide ${si + 1}`, { pageOrSlide: `Slide ${si + 1}` });
        await extractRecordsFromText(db, fileId, slideText, `Slide ${si + 1}`);

        // Table detection within slides
        const tableData: string[][] = [];
        for (const p of paragraphs) {
          const cells = p.split(/\t|  {2,}/).map(c => c.trim()).filter(Boolean);
          if (cells.length >= 2) tableData.push(cells);
        }
        if (tableData.length >= 2) {
          await extractRecordsFromTable(db, fileId, tableData, `Slide ${si + 1} Table`);
        }
      }
    }

    const fullText = allTexts.join('\n---\n').substring(0, 8000);
    if (fullText) await saveChunk(db, fileId, 'full_text', fullText, 'All Slides', { section: 'Full Text' });

  } catch (e: any) {
    throw new Error(`PPTX 解析失敗：${e?.message ?? e}`);
  }
}
