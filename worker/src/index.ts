import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';
import { processFile } from './parser';
import { handleChat } from './chat';

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// List files (exclude fileData blob)
app.get('/api/files', async (c) => {
  try {
    const files = (await c.env.DB.prepare(
      'SELECT id, fileName, originalFileName, fileType, mimeType, uploadedAt, updatedAt, status, parseStatus, parseMessage, product, pm, documentType FROM SourceFile ORDER BY uploadedAt DESC'
    ).all()).results;
    return c.json(files);
  } catch (err: any) {
    console.error('List files error:', err);
    return c.json({ error: err?.message ?? '取得檔案列表失敗' }, 500);
  }
});

// Upload file — store as base64 in D1
app.post('/api/files', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const product = (formData.get('product') as string) ?? '';
    const pm = (formData.get('pm') as string) ?? '';
    const documentType = (formData.get('documentType') as string) ?? '';

    if (!file) return c.json({ error: 'No file uploaded' }, 400);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const supported = ['xlsx', 'xls', 'csv', 'docx', 'doc', 'pdf', 'pptx', 'ppt', 'txt'];
    if (!supported.includes(ext)) {
      return c.json({ error: `不支援的格式：${ext}` }, 400);
    }

    if (file.size > 10_000_000) {
      return c.json({ error: '檔案過大，請上傳 10MB 以下的檔案' }, 400);
    }

    const fileId = uuidv4();
    const buffer = await file.arrayBuffer();

    // Don't store file binary in D1 — just metadata, then parse immediately
    await c.env.DB.prepare(`
      INSERT INTO SourceFile (id, fileName, originalFileName, fileType, mimeType, status, parseStatus, fileData, product, pm, documentType)
      VALUES (?, ?, ?, ?, ?, 'active', 'pending', '', ?, ?, ?)
    `).bind(fileId, file.name, file.name, `.${ext}`, file.type, product, pm, documentType).run();

    c.executionCtx.waitUntil(
      processFile(c.env.DB, fileId, buffer, file.name)
    );

    return c.json({ id: fileId, message: '檔案上傳成功，正在解析中...' });
  } catch (err: any) {
    console.error('Upload error:', err);
    return c.json({ error: err?.message ?? '上傳失敗' }, 500);
  }
});

// Delete file
app.delete('/api/files/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Missing file id' }, 400);
  try {
    // Verify file exists before deleting
    const existing = await c.env.DB.prepare('SELECT id FROM SourceFile WHERE id=?').bind(id).first();
    if (!existing) return c.json({ error: '找不到該檔案，可能已被刪除' }, 404);

    const results = await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM SourceChunk WHERE sourceFileId=?').bind(id),
      c.env.DB.prepare('DELETE FROM ProductQuoteRecord WHERE sourceFileId=?').bind(id),
      c.env.DB.prepare('DELETE FROM PromotionRecord WHERE sourceFileId=?').bind(id),
      c.env.DB.prepare('DELETE FROM ProductPMRecord WHERE sourceFileId=?').bind(id),
      c.env.DB.prepare('DELETE FROM ParseIssue WHERE sourceFileId=?').bind(id),
      c.env.DB.prepare('DELETE FROM SourceFile WHERE id=?').bind(id),
    ]);

    // Confirm the main SourceFile row was actually deleted
    const mainDeleted = results[5]?.meta?.changes ?? 0;
    if (mainDeleted === 0) {
      return c.json({ error: '刪除失敗：找不到對應記錄' }, 404);
    }

    return c.json({
      success: true,
      deleted: {
        chunks: results[0]?.meta?.changes ?? 0,
        quotes: results[1]?.meta?.changes ?? 0,
        promotions: results[2]?.meta?.changes ?? 0,
        pms: results[3]?.meta?.changes ?? 0,
        issues: results[4]?.meta?.changes ?? 0,
        file: mainDeleted,
      }
    });
  } catch (err: any) {
    console.error('Delete error:', err);
    return c.json({ error: err?.message ?? '刪除失敗，請稍後再試' }, 500);
  }
});

// Toggle status
app.patch('/api/files/:id/status', async (c) => {
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const { status } = body;
    if (!status) return c.json({ error: 'Missing status field' }, 400);
    await c.env.DB.prepare('UPDATE SourceFile SET status=? WHERE id=?').bind(status, id).run();
    return c.json({ success: true });
  } catch (err: any) {
    console.error('Toggle status error:', err);
    return c.json({ error: err?.message ?? '更新狀態失敗' }, 500);
  }
});

// File details
app.get('/api/files/:id/details', async (c) => {
  const id = c.req.param('id');
  try {
    const [file, chunks, quotes, promotions, pms, issues] = await Promise.all([
      c.env.DB.prepare('SELECT id, fileName, originalFileName, fileType, mimeType, uploadedAt, status, parseStatus, parseMessage, product, pm, documentType FROM SourceFile WHERE id=?').bind(id).first(),
      c.env.DB.prepare('SELECT * FROM SourceChunk WHERE sourceFileId=?').bind(id).all(),
      c.env.DB.prepare('SELECT * FROM ProductQuoteRecord WHERE sourceFileId=?').bind(id).all(),
      c.env.DB.prepare('SELECT * FROM PromotionRecord WHERE sourceFileId=?').bind(id).all(),
      c.env.DB.prepare('SELECT * FROM ProductPMRecord WHERE sourceFileId=?').bind(id).all(),
      c.env.DB.prepare('SELECT * FROM ParseIssue WHERE sourceFileId=?').bind(id).all(),
    ]);
    if (!file) return c.json({ error: 'File not found' }, 404);
    return c.json({ file, chunks: chunks.results, quotes: quotes.results, promotions: promotions.results, pms: pms.results, issues: issues.results });
  } catch (err: any) {
    console.error('File details error:', err);
    return c.json({ error: err?.message ?? '取得檔案詳情失敗' }, 500);
  }
});

// Chat
app.post('/api/chat', async (c) => {
  try {
    const { message } = await c.req.json();
    const result = await handleChat(c.env.DB, c.env.GEMINI_API_KEY ?? '', message);
    return c.json(result);
  } catch (err: any) {
    console.error('Chat error:', err);
    return c.json({ error: err?.message }, 500);
  }
});

export default app;
