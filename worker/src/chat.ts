export async function handleChat(db: D1Database, geminiApiKey: string, message: string) {
  // `SourceFile` schema has evolved in the past (some migrations use `active`
  // instead of `status`). Detect columns at runtime to avoid:
  //   SqliteError: no such column: "active"
  let where = "status='active'";
  try {
    const colInfo = (await db.prepare('PRAGMA table_info(SourceFile)').all()).results as any[];
    const cols = new Set(colInfo.map(c => c?.name).filter(Boolean));
    if (cols.has('status')) where = "status='active'";
    else if (cols.has('active')) where = "(active=1 OR active='active' OR active='true')";
  } catch {
    // Fallback to the legacy query.
  }

  const activeFiles = (await db.prepare(
    `SELECT id, originalFileName, updatedAt FROM SourceFile WHERE ${where}`
  ).all()).results as any[];

  if (!activeFiles.length) {
    return { answer: '目前沒有任何啟用的資料來源，請聯絡 PM 上傳資料。', status: '查無資料', sourceFiles: [], citations: [], ruleResult: 'no data' };
  }

  const activeFileIds = activeFiles.map(f => f.id);
  const placeholders = activeFileIds.map(() => '?').join(',');

  // Intent detection — 擴大關鍵字範圍
  let intent = 'unknown';
  const lower = message.toLowerCase();
  if (lower.includes('報價') || lower.includes('價格') || lower.includes('多少錢') || lower.includes('售價') ||
      lower.includes('多少') || lower.includes('費用') || lower.includes('方案') || lower.includes('有哪些') ||
      lower.includes('介紹') || lower.includes('規格') || lower.includes('種類') || lower.includes('產品')) intent = 'quote';
  else if (lower.includes('優惠') || lower.includes('折扣') || lower.includes('促銷') || lower.includes('活動')) intent = 'promotion';
  else if (lower.includes('負責人') || lower.includes('pm') || lower.includes('pdm') || lower.includes('聯絡人')) intent = 'pm';

  // Get all known products
  const allRecords = (await db.prepare(
    `SELECT DISTINCT productName, sku FROM ProductQuoteRecord WHERE sourceFileId IN (${placeholders})
     UNION SELECT DISTINCT productName, sku FROM PromotionRecord WHERE sourceFileId IN (${placeholders})
     UNION SELECT DISTINCT productName, sku FROM ProductPMRecord WHERE sourceFileId IN (${placeholders})`
  ).bind(...activeFileIds, ...activeFileIds, ...activeFileIds).all()).results as any[];

  const allProductNames = [...new Set(allRecords.map(r => r.productName).filter(Boolean))];
  const allSkus = [...new Set(allRecords.map(r => r.sku).filter(Boolean))];

  // Normalize query for partial/keyword search:
  // - lowercase
  // - remove spaces (both ASCII + full-width)
  // - trim
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, '') // includes ASCII whitespace
      .replace(/\u3000/g, '') // full-width space
      .trim();

  const normalMsg = normalize(message);

  // Match: either user message contains product name, OR product name contains user keyword
  const matchValue = (list: string[]) => [...list].sort((a, b) => b.length - a.length).find(v => {
    const n = normalize(v);
    if (!n) return false;
    return normalMsg.includes(n) || n.includes(normalMsg.replace(/報價|價格|多少錢|售價|優惠|折扣|負責人|pm|pdm/gi, '').trim());
  }) ?? '';

  // Extract keyword: only strip question/intent words, keep product tokens intact.
  // Strategy: try matching known product names first (longest match wins),
  // fall back to stripping common question words.
  let sku = matchValue(allSkus);
  let productName = matchValue(allProductNames);

  // Early return: if we already matched a product name from the DB, use it as
  // the search needle directly — don't strip it further.
  const keyword = productName || sku ||
    message
      .replace(/報價多少|報價是多少|價格多少|多少錢|售價|報價|有什麼優惠|優惠|折扣|負責人是誰|負責人|的PM是誰|PM是誰|pm|pdm|是多少|多少|有哪些方案|有哪些|哪些方案|方案介紹|介紹一下|怎麼買|如何購買|方案|介紹|規格|種類|？|\?|」|「/gi, '')
      .trim();
  const normalKeyword = normalize(keyword);

  if (!productName && keyword.length >= 2) {
    productName = allProductNames.find(p => normalize(p).includes(normalKeyword)) ?? '';
  }

  // Use keyword for search (broader), not the matched full productName.
  // Priority: matched productName (most precise) > matched sku > stripped keyword > full message
  // This ensures "Surface Pro" in the message triggers all Surface Pro records immediately.
  const searchNeedle = productName
    ? normalize(productName)
    : sku
      ? normalize(sku)
      : (normalKeyword.length >= 2 ? normalKeyword : normalMsg);
  const searchSkuNeedle = sku ? normalize(sku) : '';

  const normProductExpr = "LOWER(REPLACE(REPLACE(productName, ' ', ''), char(12288), ''))";
  const normSkuExpr = "LOWER(REPLACE(REPLACE(sku, ' ', ''), char(12288), ''))";

  // LLM intent + product extraction if needed
  const geminiAvailable = !!geminiApiKey;
  if (geminiAvailable && (intent === 'unknown' || (!productName && !sku))) {
    try {
      const resp = await callGemini(geminiApiKey, 'gemini-1.5-flash', {
        systemInstruction: '你是報價查詢助手，從使用者問題中提取意圖和產品名稱，只回覆 JSON。',
        userMessage: `分析這個問題，回傳 JSON {intent: "quote"|"promotion"|"pm"|"unknown", productName: string, sku: string}
問題：「${message}」`,
      });
      const parsed = safeParseJson(resp);
      if (parsed) {
        if (intent === 'unknown' && parsed.intent !== 'unknown') intent = parsed.intent;
        if (!productName && parsed.productName) productName = parsed.productName;
        if (!sku && parsed.sku) sku = parsed.sku;
      }
    } catch { /* ignore, fall back to rule-based */ }
  }

  if (intent === 'unknown') intent = 'quote';

  // Query structured records
  let records: any[] = [];
  console.log('[chat] message:', message, '| keyword:', keyword, '| productName:', productName, '| sku:', sku, '| searchNeedle:', searchNeedle, '| intent:', intent);
  if (searchNeedle || searchSkuNeedle) {
    const table = intent === 'promotion' ? 'PromotionRecord' : intent === 'pm' ? 'ProductPMRecord' : 'ProductQuoteRecord';
    const params: any[] = [...activeFileIds];
    const orConditions: string[] = [];

    if (searchNeedle) {
      orConditions.push(`${normProductExpr} LIKE ?`);
      params.push(`%${searchNeedle}%`);
      orConditions.push(`${normSkuExpr} LIKE ?`);
      params.push(`%${searchNeedle}%`);
    }
    if (searchSkuNeedle && searchSkuNeedle !== searchNeedle) {
      orConditions.push(`${normSkuExpr} LIKE ?`);
      params.push(`%${searchSkuNeedle}%`);
    }
    if (orConditions.length === 0) orConditions.push('1=0');
    const sql = `SELECT * FROM ${table} WHERE sourceFileId IN (${placeholders}) AND (${orConditions.join(' OR ')}) LIMIT 50`;
    records = (await db.prepare(sql).bind(...params).all()).results as any[];

    // If still no records and we have a multi-word keyword, try each token individually
    // so "Surface Pro 12" also matches records for just "Surface"
    if (!records.length && searchNeedle.length >= 2) {
      const tokens = keyword.split(/\s+/).map(normalize).filter(t => t.length >= 2);
      for (const token of tokens) {
        if (token === searchNeedle) continue; // already tried
        const tokenParams: any[] = [...activeFileIds, `%${token}%`, `%${token}%`];
        const tokenSql = `SELECT * FROM ${table} WHERE sourceFileId IN (${placeholders}) AND (${normProductExpr} LIKE ? OR ${normSkuExpr} LIKE ?) LIMIT 50`;
        const tokenResults = (await db.prepare(tokenSql).bind(...tokenParams).all()).results as any[];
        if (tokenResults.length) {
          records = tokenResults;
          break;
        }
      }
    }
  }

  // LLM alias matching if no records found
  if (!records.length && geminiAvailable && geminiApiKey && productName && allProductNames.length) {
    try {
      const resp = await callGemini(geminiApiKey, 'gemini-1.5-flash', {
        userMessage: `從以下產品清單找出最符合「${productName}」的項目，只回傳 JSON {matchedProductName: string}。清單：${JSON.stringify(allProductNames)}`,
      });
      const parsed = safeParseJson(resp);
      if (parsed?.matchedProductName) {
        productName = parsed.matchedProductName;
        const table = intent === 'promotion' ? 'PromotionRecord' : intent === 'pm' ? 'ProductPMRecord' : 'ProductQuoteRecord';
        records = (await db.prepare(
          `SELECT * FROM ${table} WHERE sourceFileId IN (${placeholders}) AND ${normProductExpr} LIKE ?`
        ).bind(...activeFileIds, `%${normalize(productName)}%`).all()).results as any[];
      }
    } catch { /* ignore */ }
  }

  // No records — try LLM full-text fallback
  if (!records.length) {
    if (geminiAvailable && geminiApiKey) {
      const chunks = (await db.prepare(
        `SELECT content FROM SourceChunk WHERE sourceFileId IN (${placeholders}) AND chunkType='full_text' LIMIT 20`
      ).bind(...activeFileIds).all()).results as any[];

      if (chunks.length) {
        const context = chunks.map(c => c.content).join('\n---\n').substring(0, 12000);
        try {
          const answer = await callGemini(geminiApiKey, 'gemini-1.5-flash', {
            systemInstruction: '你是報價小幫手。只根據提供的資料回答，資料中沒有就回答「找不到相關資訊」，不可自行編造。',
            userMessage: `參考資料：\n${context}\n\n問題：${message}`,
          });
          return { answer, status: '全文檢索', sourceFiles: activeFiles.map(f => f.originalFileName), citations: ['從原始文件搜尋'], ruleResult: 'fallback to raw text' };
        } catch { /* fall through */ }
      }
    }
    return { answer: '查無相關資料，請確認品牌或產品名稱後再試。', status: '查無資料', sourceFiles: [], citations: [], ruleResult: 'no data' };
  }

  // Conflict detection — only flag if same productName has different values from DIFFERENT files
  const valueMap = new Map<string, Set<string>>();
  for (const r of records) {
    if (!valueMap.has(r.productName)) valueMap.set(r.productName, new Set());
    const val = intent === 'quote' ? r.quoteValue : intent === 'promotion' ? r.promotionTitle : r.pmName;
    if (val) valueMap.get(r.productName)!.add(val);
  }

  // Check for real conflicts: same product, different values, from different source files
  const fileConflicts = [...valueMap.entries()].filter(([name, vals]) => {
    if (vals.size <= 1) return false;
    const productRecords = records.filter(r => r.productName === name);
    const fileIds = new Set(productRecords.map(r => r.sourceFileId));
    return fileIds.size > 1; // only conflict if from different files
  });

  if (fileConflicts.length > 0) {
    const sourceFileNames = [...new Set(records.map(r => activeFiles.find(f => f.id === r.sourceFileId)?.originalFileName))];
    return { answer: '發現同一產品在不同檔案中有不同資料（資料衝突），請 PM 確認最新版本。', status: '資料衝突', sourceFiles: sourceFileNames, citations: records.map(r => r.citation), ruleResult: 'conflict detected' };
  }

  // Multiple products — list all
  if (valueMap.size >= 1) {
    const intentLabel = intent === 'quote' ? '報價' : intent === 'promotion' ? '優惠活動' : '負責 PM';
    const lines = [...valueMap.entries()].map(([name, vals]) => `- ${name}：${[...vals].join('、')}`);
    let answer = `找到以下相關${intentLabel}資訊：\n${lines.join('\n')}`;

    if (geminiAvailable && geminiApiKey) {
      try {
        answer = await callGemini(geminiApiKey, 'gemini-1.5-flash', {
          systemInstruction: '你是報價小幫手，請用繁體中文條列整理以下產品方案資訊，格式清楚易讀，最後加上建議業務人員可進一步詢問的提示。',
          userMessage: lines.join('\n'),
        }) || answer;
      } catch { /* use plain answer */ }
    }
    return { answer, status: `已找到 ${valueMap.size} 筆`, sourceFiles: [...new Set(records.map(r => activeFiles.find(f => f.id === r.sourceFileId)?.originalFileName))], citations: records.map(r => r.citation), ruleResult: 'multiple products' };
  }
}

// ── Gemini helper ──────────────────────────────────────────────────────────
async function callGemini(apiKey: string, model: string, opts: { systemInstruction?: string; userMessage: string }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: opts.userMessage }] }],
    generationConfig: { maxOutputTokens: 1024 },
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.substring(0, 200)}`);
  }

  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function safeParseJson(text: string): any {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { } }
    return null;
  }
}
