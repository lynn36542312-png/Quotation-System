# QuoteBot — Cloudflare 版本

完全部署在 Cloudflare 上，零伺服器費用（免費額度內完全免費）。

## 架構

```
┌─────────────────────────────────────────┐
│           Cloudflare 全家桶              │
│                                         │
│  Pages (前端 React)                     │
│    └─ /api/* → Workers (後端 API)       │
│                  ├─ D1 (SQLite 資料庫)  │
│                  └─ R2 (檔案儲存)       │
└─────────────────────────────────────────┘
```

## 免費額度（夠用）

| 服務 | 免費額度 |
|------|---------|
| Pages | 無限靜態請求 |
| Workers | 每日 100,000 次請求 |
| D1 | 每日 5M 次讀取，100K 次寫入，5GB 儲存 |
| R2 | 每月 10GB 儲存，100萬次操作 |

---

## 部署步驟

### 前置需求

```bash
npm install -g wrangler
wrangler login
```

### 步驟 1：建立 D1 資料庫

```bash
wrangler d1 create quotebot-db
```

複製輸出的 `database_id`，貼到 `worker/wrangler.toml`：
```toml
database_id = "貼上你的 database_id"
```

初始化資料庫 schema：
```bash
npm run db:init
```

### 步驟 2：建立 R2 儲存桶

```bash
wrangler r2 bucket create quotebot-files
```

### 步驟 3：設定 Gemini API Key

```bash
cd worker
wrangler secret put GEMINI_API_KEY
# 輸入你的 key（在 https://aistudio.google.com/app/apikey 申請）
```

### 步驟 4：部署 Worker

```bash
npm run deploy:worker
```

記下輸出的 Worker URL，例如：`https://quotebot-worker.你的帳號.workers.dev`

### 步驟 5：部署前端到 Pages

**方法 A：GitHub 自動部署（推薦）**

1. 把整個專案推上 GitHub
2. 前往 [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
3. 連接 GitHub repo
4. 設定 Build：
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Build output directory**: `frontend/dist`
5. 部署

**方法 B：直接上傳**

```bash
npm run build:frontend
cd worker && wrangler pages deploy ../frontend/dist --project-name=quotebot
```

### 步驟 6：連結 Worker 到 Pages

在 Cloudflare Dashboard → Pages → 你的專案 → Settings → Functions：
- **KV namespace bindings** / **Service bindings**: 加入 Worker binding
- 或使用 Pages Functions proxy（`frontend/functions/api/[[path]].ts`）

**最簡單的方式** — 在 Pages 專案設定加入 Worker route：

1. Pages → Settings → Functions → Service bindings
2. 新增：Variable name = `API`，Service = `quotebot-worker`

或者直接在前端 `vite.config.ts` 的生產環境指向 Worker URL（見下方）。

---

## 本機開發

```bash
# 安裝依賴
npm run setup

# 初始化本機 D1
npm run db:init:local

# Terminal 1：啟動 Worker
npm run dev:worker

# Terminal 2：啟動前端（proxy /api -> localhost:8787）
npm run dev:frontend
```

開啟 http://localhost:5173

---

## 環境變數

| 變數 | 設定方式 | 說明 |
|------|---------|------|
| `GEMINI_API_KEY` | `wrangler secret put` | Gemini API 金鑰 |

---

## 支援的檔案格式

xlsx / xls / csv / docx / doc / pdf / pptx / ppt / txt

---

## 專案結構

```
├── frontend/          # React + Vite (Cloudflare Pages)
│   ├── src/
│   │   ├── pages/     # SalesPage, AdminPage, PmOwnersPage, BrandFilesPage
│   │   ├── components/
│   │   └── data/      # brandDirectory.ts
│   └── public/
│       └── _routes.json
│
└── worker/            # Cloudflare Worker (Hono)
    ├── src/
    │   ├── index.ts   # API routes (Hono)
    │   ├── parser.ts  # 檔案解析（所有格式）
    │   ├── extractor.ts # 結構化資料提取
    │   └── chat.ts    # 對話邏輯 + Gemini
    ├── schema.sql     # D1 資料庫 schema
    └── wrangler.toml  # Cloudflare 設定
```
