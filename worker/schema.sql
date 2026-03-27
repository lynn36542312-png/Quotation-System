-- Run once with: wrangler d1 execute quotebot-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS SourceFile (
  id TEXT PRIMARY KEY,
  fileName TEXT,
  originalFileName TEXT,
  fileType TEXT,
  mimeType TEXT,
  uploadedAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'active',
  parseStatus TEXT DEFAULT 'pending',
  parseMessage TEXT,
  fileData TEXT,
  product TEXT,
  pm TEXT,
  documentType TEXT
);

CREATE TABLE IF NOT EXISTS SourceChunk (
  id TEXT PRIMARY KEY,
  sourceFileId TEXT,
  chunkType TEXT,
  content TEXT,
  citation TEXT,
  pageOrSlide TEXT,
  section TEXT,
  rowIndex INTEGER,
  sheetName TEXT,
  tableName TEXT,
  FOREIGN KEY(sourceFileId) REFERENCES SourceFile(id)
);

CREATE TABLE IF NOT EXISTS ProductQuoteRecord (
  id TEXT PRIMARY KEY,
  productName TEXT,
  sku TEXT,
  quoteValue TEXT,
  sourceFileId TEXT,
  citation TEXT,
  FOREIGN KEY(sourceFileId) REFERENCES SourceFile(id)
);

CREATE TABLE IF NOT EXISTS PromotionRecord (
  id TEXT PRIMARY KEY,
  productName TEXT,
  sku TEXT,
  promotionTitle TEXT,
  sourceFileId TEXT,
  citation TEXT,
  FOREIGN KEY(sourceFileId) REFERENCES SourceFile(id)
);

CREATE TABLE IF NOT EXISTS ProductPMRecord (
  id TEXT PRIMARY KEY,
  productName TEXT,
  sku TEXT,
  pmName TEXT,
  sourceFileId TEXT,
  citation TEXT,
  FOREIGN KEY(sourceFileId) REFERENCES SourceFile(id)
);

CREATE TABLE IF NOT EXISTS ParseIssue (
  id TEXT PRIMARY KEY,
  sourceFileId TEXT,
  severity TEXT,
  issueType TEXT,
  message TEXT,
  citation TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(sourceFileId) REFERENCES SourceFile(id)
);
