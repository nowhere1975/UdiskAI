# Knowledge Base Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local knowledge base feature to UdiskAI — users point it at folders of documents, the app indexes them with vector embeddings, and Cowork sessions can search the KB when the user types a trigger word.

**Architecture:** Main-process `src/main/kb/` module owns all indexing and retrieval logic. It exposes a clean `KBManager` interface; IPC handlers in `main.ts` bridge it to the renderer. `coworkRunner.ts` calls `KBManager.search()` before each prompt run when a trigger word is detected. The module is designed so `indexer.ts` can be moved to a Worker Thread later without touching IPC or the renderer.

**Tech Stack:** `@lancedb/lancedb` (vector store), `@langchain/textsplitters` (chunking), `chokidar` (file watching), `xlsx` (Excel parsing), MinerU API (PDF/Word/PPT/image parsing), Zhipu embedding-3 API (vectors).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/main/kb/types.ts` | Shared types: KBFolder, KBDoc, KBSearchResult, KBStats |
| Create | `src/main/kb/store.ts` | LanceDB open/create/search/delete wrapper |
| Create | `src/main/kb/indexer.ts` | Parse → chunk → embed → write; queue processing |
| Create | `src/main/kb/watcher.ts` | chokidar folder monitoring, delegates to indexer |
| Create | `src/main/kb/index.ts` | KBManager public interface (facade over above) |
| Create | `src/main/kb/indexer.test.ts` | Unit tests: chunking, trigger detection, Excel parsing |
| Create | `src/renderer/services/kb.ts` | IPC wrapper for renderer |
| Create | `src/renderer/components/kb/KBManagePage.tsx` | KB management UI |
| Modify | `src/main/sqliteStore.ts` | Add `kb_folders` and `kb_docs` tables |
| Modify | `src/main/main.ts` | Init KBManager, register `kb:*` IPC handlers |
| Modify | `src/main/preload.ts` | Expose `window.electron.kb` namespace |
| Modify | `src/main/libs/coworkRunner.ts` | Trigger word detection + KB context injection |
| Modify | `src/renderer/App.tsx` | Add `'kb'` to `mainView`, render KBManagePage |
| Modify | `src/renderer/components/Sidebar.tsx` | Add KB nav button |
| Modify | `src/renderer/services/i18n.ts` | Add KB i18n keys |
| Modify | `src/main/i18n.ts` | No changes needed (KB has no main-process user-visible text) |

---

## Task 1: Install Dependencies

**Files:** `package.json`

- [ ] **Step 1: Install new packages**

```bash
cd /Users/nowhere/mycode/LobsterAI
npm install @lancedb/lancedb @langchain/textsplitters chokidar xlsx
```

- [ ] **Step 2: Verify install succeeded**

```bash
node -e "require('@lancedb/lancedb'); require('@langchain/textsplitters'); require('chokidar'); require('xlsx'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add lancedb, langchain textsplitters, chokidar, xlsx"
```

---

## Task 2: SQLite Schema — Add KB Tables

**Files:**
- Modify: `src/main/sqliteStore.ts`

- [ ] **Step 1: Add table creation in `initializeTables()`**

In `src/main/sqliteStore.ts`, find the last `this.db.run(...)` call inside `initializeTables()` and append after it:

```typescript
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kb_folders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        path       TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS kb_docs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id   INTEGER NOT NULL REFERENCES kb_folders(id),
        file_path   TEXT NOT NULL UNIQUE,
        file_hash   TEXT,
        status      TEXT NOT NULL DEFAULT 'pending',
        error_msg   TEXT,
        chunk_count INTEGER,
        updated_at  INTEGER
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_kb_docs_folder_id ON kb_docs(folder_id);
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_kb_docs_file_path ON kb_docs(file_path);
    `);
```

- [ ] **Step 2: Add KB CRUD methods to SqliteStore**

Add these methods to the `SqliteStore` class (after the existing cowork methods):

```typescript
  // ── KB Folders ──────────────────────────────────────────────────────────

  addKBFolder(folderPath: string): number {
    this.db.run(
      `INSERT OR IGNORE INTO kb_folders (path, created_at) VALUES (?, ?)`,
      [folderPath, Date.now()]
    );
    const rows = this.db.exec(
      `SELECT id FROM kb_folders WHERE path = ?`,
      [folderPath]
    );
    const id = rows[0]?.values[0]?.[0] as number;
    this.save();
    return id;
  }

  removeKBFolder(folderId: number): void {
    this.db.run(`DELETE FROM kb_docs WHERE folder_id = ?`, [folderId]);
    this.db.run(`DELETE FROM kb_folders WHERE id = ?`, [folderId]);
    this.save();
  }

  listKBFolders(): Array<{ id: number; path: string; created_at: number }> {
    const rows = this.db.exec(`SELECT id, path, created_at FROM kb_folders ORDER BY created_at ASC`);
    if (!rows.length) return [];
    return rows[0].values.map(([id, path, created_at]) => ({
      id: id as number,
      path: path as string,
      created_at: created_at as number,
    }));
  }

  // ── KB Docs ──────────────────────────────────────────────────────────────

  upsertKBDoc(doc: {
    folder_id: number;
    file_path: string;
    file_hash?: string;
    status: string;
    error_msg?: string;
    chunk_count?: number;
  }): void {
    this.db.run(
      `INSERT INTO kb_docs (folder_id, file_path, file_hash, status, error_msg, chunk_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_path) DO UPDATE SET
         file_hash = excluded.file_hash,
         status = excluded.status,
         error_msg = excluded.error_msg,
         chunk_count = excluded.chunk_count,
         updated_at = excluded.updated_at`,
      [
        doc.folder_id,
        doc.file_path,
        doc.file_hash ?? null,
        doc.status,
        doc.error_msg ?? null,
        doc.chunk_count ?? null,
        Date.now(),
      ]
    );
    this.save();
  }

  getKBDoc(filePath: string): { id: number; folder_id: number; file_path: string; file_hash: string | null; status: string; error_msg: string | null; chunk_count: number | null } | null {
    const rows = this.db.exec(
      `SELECT id, folder_id, file_path, file_hash, status, error_msg, chunk_count FROM kb_docs WHERE file_path = ?`,
      [filePath]
    );
    if (!rows.length || !rows[0].values.length) return null;
    const [id, folder_id, file_path, file_hash, status, error_msg, chunk_count] = rows[0].values[0];
    return { id: id as number, folder_id: folder_id as number, file_path: file_path as string, file_hash: file_hash as string | null, status: status as string, error_msg: error_msg as string | null, chunk_count: chunk_count as number | null };
  }

  deleteKBDoc(filePath: string): void {
    this.db.run(`DELETE FROM kb_docs WHERE file_path = ?`, [filePath]);
    this.save();
  }

  listKBDocsByFolder(folderId: number): Array<{ id: number; file_path: string; file_hash: string | null; status: string; error_msg: string | null; chunk_count: number | null }> {
    const rows = this.db.exec(
      `SELECT id, file_path, file_hash, status, error_msg, chunk_count FROM kb_docs WHERE folder_id = ? ORDER BY file_path ASC`,
      [folderId]
    );
    if (!rows.length) return [];
    return rows[0].values.map(([id, file_path, file_hash, status, error_msg, chunk_count]) => ({
      id: id as number,
      file_path: file_path as string,
      file_hash: file_hash as string | null,
      status: status as string,
      error_msg: error_msg as string | null,
      chunk_count: chunk_count as number | null,
    }));
  }

  getKBStats(): { total_docs: number; done_docs: number; error_docs: number; total_chunks: number } {
    const rows = this.db.exec(`
      SELECT
        COUNT(*) as total_docs,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_docs,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_docs,
        COALESCE(SUM(chunk_count), 0) as total_chunks
      FROM kb_docs
    `);
    if (!rows.length || !rows[0].values.length) return { total_docs: 0, done_docs: 0, error_docs: 0, total_chunks: 0 };
    const [total_docs, done_docs, error_docs, total_chunks] = rows[0].values[0];
    return {
      total_docs: total_docs as number,
      done_docs: done_docs as number,
      error_docs: error_docs as number,
      total_chunks: total_chunks as number,
    };
  }

  listKBErrorDocs(): Array<{ file_path: string; error_msg: string | null }> {
    const rows = this.db.exec(
      `SELECT file_path, error_msg FROM kb_docs WHERE status = 'error' ORDER BY file_path ASC`
    );
    if (!rows.length) return [];
    return rows[0].values.map(([file_path, error_msg]) => ({
      file_path: file_path as string,
      error_msg: error_msg as string | null,
    }));
  }

  clearKBDocsByFolder(folderId: number): void {
    this.db.run(`DELETE FROM kb_docs WHERE folder_id = ?`, [folderId]);
    this.save();
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/nowhere/mycode/LobsterAI
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/main/sqliteStore.ts
git commit -m "feat(kb): add kb_folders and kb_docs SQLite tables and CRUD methods"
```

---

## Task 3: KB Types

**Files:**
- Create: `src/main/kb/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/main/kb/types.ts

export interface KBFolder {
  id: number;
  path: string;
  created_at: number;
  doc_count?: number;
  status?: 'idle' | 'indexing';
  last_sync?: number;
}

export interface KBDoc {
  id: number;
  folder_id: number;
  file_path: string;
  file_hash: string | null;
  status: 'pending' | 'indexing' | 'done' | 'error';
  error_msg: string | null;
  chunk_count: number | null;
  updated_at?: number;
}

export interface KBSearchResult {
  file_path: string;
  chunk_index: number;
  text: string;
  score: number;
}

export interface KBStats {
  total_docs: number;
  done_docs: number;
  error_docs: number;
  total_chunks: number;
  error_files: Array<{ file_path: string; error_msg: string | null }>;
}

export interface KBIndexProgress {
  total: number;
  done: number;
  current_file: string;
  errors: string[];
}

export const KB_SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff',
  '.xlsx',
  '.md',
]);
```

- [ ] **Step 2: Compile check**

```bash
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/main/kb/types.ts
git commit -m "feat(kb): add KB type definitions"
```

---

## Task 4: KB LanceDB Store

**Files:**
- Create: `src/main/kb/store.ts`

This wraps LanceDB. Each vector record has: `id` (string, `${file_path}::${chunk_index}`), `file_path`, `chunk_index`, `text`, `vector` (number[]).

- [ ] **Step 1: Create store.ts**

```typescript
// src/main/kb/store.ts
import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import type { KBSearchResult } from './types';

const TABLE_NAME = 'kb_chunks';
const EMBEDDING_DIM = 2048; // Zhipu embedding-3 default dimensions
const SIMILARITY_THRESHOLD = 0.5;

export interface KBChunkRecord {
  id: string;         // `${file_path}::${chunk_index}`
  file_path: string;
  chunk_index: number;
  text: string;
  vector: number[];
}

export class KBStore {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  constructor(userDataPath: string) {
    this.dbPath = path.join(userDataPath, 'kb.lance');
  }

  async init(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    }
    // Table created lazily on first write
  }

  async upsertChunks(chunks: KBChunkRecord[]): Promise<void> {
    if (!this.db) throw new Error('[KBStore] not initialized');
    if (!chunks.length) return;

    if (!this.table) {
      this.table = await this.db.createTable(TABLE_NAME, chunks, { mode: 'overwrite' });
    } else {
      // Delete existing chunks for this file first
      const filePath = chunks[0].file_path;
      try {
        await this.table.delete(`file_path = '${filePath.replace(/'/g, "''")}'`);
      } catch {
        // Table may be empty, ignore
      }
      await this.table.add(chunks);
    }
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    if (!this.table) return;
    try {
      await this.table.delete(`file_path = '${filePath.replace(/'/g, "''")}'`);
    } catch {
      // ignore if table is empty
    }
  }

  async search(queryVector: number[], topK: number): Promise<KBSearchResult[]> {
    if (!this.table) return [];
    try {
      const results = await this.table
        .vectorSearch(queryVector)
        .limit(topK)
        .toArray();

      return results
        .map((row: Record<string, unknown>) => ({
          file_path: row['file_path'] as string,
          chunk_index: row['chunk_index'] as number,
          text: row['text'] as string,
          score: 1 - (row['_distance'] as number), // cosine distance → similarity
        }))
        .filter((r) => r.score >= SIMILARITY_THRESHOLD);
    } catch {
      return [];
    }
  }

  async isEmpty(): Promise<boolean> {
    if (!this.table) return true;
    try {
      const rows = await this.table.countRows();
      return rows === 0;
    } catch {
      return true;
    }
  }

  async deleteTable(): Promise<void> {
    if (!this.db || !this.table) return;
    await this.db.dropTable(TABLE_NAME);
    this.table = null;
  }
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/main/kb/store.ts
git commit -m "feat(kb): add LanceDB store wrapper"
```

---

## Task 5: KB Indexer

**Files:**
- Create: `src/main/kb/indexer.ts`
- Create: `src/main/kb/indexer.test.ts`

The indexer calls MinerU API for PDF/Word/PPT/images, uses the `xlsx` library for Excel, reads `.md` files directly, then chunks with `@langchain/textsplitters`, calls Zhipu Embedding API, and writes to LanceDB.

- [ ] **Step 1: Write failing tests for chunking and Excel parsing**

```typescript
// src/main/kb/indexer.test.ts
import { describe, test, expect } from 'vitest';
import { chunkMarkdown, chunkExcel, containsTriggerWord } from './indexer';

describe('chunkMarkdown', () => {
  test('splits long text into chunks with overlap', async () => {
    const text = Array(200).fill('这是一段测试内容。').join('\n');
    const chunks = await chunkMarkdown(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should not be empty
    chunks.forEach((c) => expect(c.trim().length).toBeGreaterThan(0));
  });

  test('returns single chunk for short text', async () => {
    const text = '这是一段很短的文字。';
    const chunks = await chunkMarkdown(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });
});

describe('chunkExcel', () => {
  test('prepends header to each chunk', () => {
    const rows = [
      ['姓名', '部门', '金额'],
      ['张三', '财务处', '5000'],
      ['李四', '人事处', '6000'],
      ['王五', '技术部', '7000'],
    ];
    const chunks = chunkExcel(rows, 'Sheet1', 2);
    expect(chunks.length).toBe(2);
    // Each chunk starts with header
    chunks.forEach((c) => expect(c).toContain('姓名'));
    expect(chunks[0]).toContain('张三');
    expect(chunks[0]).toContain('李四');
    expect(chunks[1]).toContain('王五');
  });

  test('handles empty sheet', () => {
    const chunks = chunkExcel([], 'Sheet1', 10);
    expect(chunks).toEqual([]);
  });

  test('handles sheet with only header', () => {
    const rows = [['姓名', '部门']];
    const chunks = chunkExcel(rows, 'Sheet1', 10);
    expect(chunks).toEqual([]);
  });
});

describe('containsTriggerWord', () => {
  test('detects default trigger word', () => {
    expect(containsTriggerWord('查一下知识库里有没有这个政策', ['知识库'])).toBe(true);
  });

  test('returns false when no trigger word', () => {
    expect(containsTriggerWord('帮我写一封邮件', ['知识库'])).toBe(false);
  });

  test('supports multiple trigger words', () => {
    expect(containsTriggerWord('查文档库里的内容', ['知识库', '文档库'])).toBe(true);
  });

  test('case insensitive for English trigger words', () => {
    expect(containsTriggerWord('search the KB for this', ['kb'])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- indexer
```

Expected: FAIL — `chunkMarkdown`, `chunkExcel`, `containsTriggerWord` not defined

- [ ] **Step 3: Create indexer.ts with the exported functions and full indexer class**

```typescript
// src/main/kb/indexer.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { MarkdownTextSplitter } from '@langchain/textsplitters';
import * as XLSX from 'xlsx';
import type { SqliteStore } from '../sqliteStore';
import type { KBStore } from './store';
import type { KBChunkRecord } from './store';
import type { KBIndexProgress } from './types';
import { KB_SUPPORTED_EXTENSIONS } from './types';

const CHUNK_SIZE = 500;           // tokens ≈ chars for CJK
const CHUNK_OVERLAP = 100;
const ROWS_PER_CHUNK = 20;        // Excel rows per chunk
const EMBED_BATCH_SIZE = 16;      // Zhipu embedding batch size

// ── Pure helpers (exported for testing) ─────────────────────────────────────

export async function chunkMarkdown(text: string): Promise<string[]> {
  const splitter = new MarkdownTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const docs = await splitter.createDocuments([text]);
  return docs.map((d) => d.pageContent).filter((c) => c.trim().length > 0);
}

export function chunkExcel(
  rows: string[][],
  sheetName: string,
  rowsPerChunk: number = ROWS_PER_CHUNK
): string[] {
  if (rows.length < 2) return []; // need at least header + 1 data row
  const header = rows[0];
  const dataRows = rows.slice(1);
  const chunks: string[] = [];

  for (let i = 0; i < dataRows.length; i += rowsPerChunk) {
    const batch = dataRows.slice(i, i + rowsPerChunk);
    const lines = batch.map((row) =>
      header.map((h, idx) => `${h}: ${row[idx] ?? ''}`).join(', ')
    );
    chunks.push(`[Sheet: ${sheetName}]\n` + lines.join('\n'));
  }
  return chunks;
}

export function containsTriggerWord(message: string, triggerWords: string[]): boolean {
  const lower = message.toLowerCase();
  return triggerWords.some((word) => lower.includes(word.toLowerCase()));
}

function fileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── API clients ──────────────────────────────────────────────────────────────

async function callMinerUAPI(filePath: string, mineruApiKey: string): Promise<string> {
  // MinerU API: upload file, get back markdown text
  // Endpoint confirmed at: https://mineru.net/api/v4/extract/upload
  // See MinerU API docs for auth headers and multipart form upload
  const FormData = (await import('form-data')).default;
  const fetch = (await import('electron')).net.fetch;

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), path.basename(filePath));
  form.append('output_format', 'markdown');

  const response = await fetch('https://mineru.net/api/v4/extract/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mineruApiKey}`,
      ...form.getHeaders(),
    },
    body: form.getBuffer(),
  });

  if (!response.ok) {
    throw new Error(`MinerU API error ${response.status}: ${await response.text()}`);
  }

  const json = await response.json() as { data?: { markdown?: string } };
  const markdown = json?.data?.markdown;
  if (!markdown) throw new Error('MinerU returned empty markdown');
  return markdown;
}

async function callZhipuEmbedding(texts: string[], zhipuApiKey: string): Promise<number[][]> {
  const fetch = (await import('electron')).net.fetch;

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${zhipuApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'embedding-3', input: texts }),
  });

  if (!response.ok) {
    throw new Error(`Zhipu embedding error ${response.status}: ${await response.text()}`);
  }

  const json = await response.json() as { data: Array<{ embedding: number[] }> };
  return json.data.map((item) => item.embedding);
}

// ── Excel parser ─────────────────────────────────────────────────────────────

function parseExcelToChunks(filePath: string): string[] {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const allChunks: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as string[][];

    // Expand merged cells: XLSX.utils already fills merged cell values when raw:false
    const chunks = chunkExcel(rows, sheetName);
    allChunks.push(...chunks);
  }

  return allChunks;
}

// ── KBIndexer ────────────────────────────────────────────────────────────────

export class KBIndexer extends EventEmitter {
  private store: SqliteStore;
  private kbStore: KBStore;
  private isRunning = false;
  private queue: Array<{ filePath: string; folderId: number; action: 'upsert' | 'delete' }> = [];

  constructor(store: SqliteStore, kbStore: KBStore) {
    super();
    this.store = store;
    this.kbStore = kbStore;
  }

  enqueue(filePath: string, folderId: number, action: 'upsert' | 'delete'): void {
    // Deduplicate: replace existing entry for same path
    this.queue = this.queue.filter((q) => q.filePath !== filePath);
    this.queue.push({ filePath, folderId, action });
    if (!this.isRunning) {
      void this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.isRunning = true;
    const errors: string[] = [];
    let done = 0;
    const total = this.queue.length;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      this.emit('progress', {
        total: total,
        done,
        current_file: item.filePath,
        errors,
      } satisfies KBIndexProgress);

      if (item.action === 'delete') {
        await this.kbStore.deleteByFilePath(item.filePath);
        this.store.deleteKBDoc(item.filePath);
      } else {
        await this.indexFile(item.filePath, item.folderId, errors);
      }

      done++;
      await new Promise<void>((resolve) => setImmediate(resolve)); // yield to event loop
    }

    this.emit('progress', {
      total,
      done,
      current_file: '',
      errors,
    } satisfies KBIndexProgress);

    this.isRunning = false;
  }

  private async indexFile(filePath: string, folderId: number, errors: string[]): Promise<void> {
    const mineruApiKey = this.store.get('kb:mineru_key') ?? '';
    const zhipuApiKey = this.store.get('kb:zhipu_key') ?? '';

    if (!zhipuApiKey) {
      const msg = `[KB] skipping ${path.basename(filePath)}: Zhipu API key not configured`;
      console.warn(msg);
      errors.push(msg);
      this.store.upsertKBDoc({ folder_id: folderId, file_path: filePath, status: 'error', error_msg: 'Zhipu API key not configured' });
      return;
    }

    // Check if file changed
    let hash: string;
    try {
      hash = fileHash(filePath);
    } catch {
      this.store.upsertKBDoc({ folder_id: folderId, file_path: filePath, status: 'error', error_msg: 'Cannot read file' });
      errors.push(filePath);
      return;
    }

    const existing = this.store.getKBDoc(filePath);
    if (existing?.file_hash === hash && existing.status === 'done') {
      return; // unchanged
    }

    this.store.upsertKBDoc({ folder_id: folderId, file_path: filePath, file_hash: hash, status: 'indexing' });

    try {
      const chunks = await this.extractChunks(filePath, mineruApiKey);
      if (!chunks.length) {
        this.store.upsertKBDoc({ folder_id: folderId, file_path: filePath, file_hash: hash, status: 'done', chunk_count: 0 });
        return;
      }

      // Embed in batches
      const allVectors: number[][] = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
        const vectors = await callZhipuEmbedding(batch, zhipuApiKey);
        allVectors.push(...vectors);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      const records: KBChunkRecord[] = chunks.map((text, idx) => ({
        id: `${filePath}::${idx}`,
        file_path: filePath,
        chunk_index: idx,
        text,
        vector: allVectors[idx],
      }));

      await this.kbStore.upsertChunks(records);
      this.store.upsertKBDoc({ folder_id: folderId, file_path: filePath, file_hash: hash, status: 'done', chunk_count: chunks.length });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[KBIndexer] failed to index ${filePath}:`, error);
      this.store.upsertKBDoc({ folder_id: folderId, file_path: filePath, file_hash: hash, status: 'error', error_msg: msg });
      errors.push(`${path.basename(filePath)}: ${msg}`);
    }
  }

  private async extractChunks(filePath: string, mineruApiKey: string): Promise<string[]> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.xlsx') {
      return parseExcelToChunks(filePath);
    }

    if (ext === '.md') {
      const text = fs.readFileSync(filePath, 'utf-8');
      return chunkMarkdown(text);
    }

    // PDF, DOCX, PPTX, images → MinerU
    if (!mineruApiKey) throw new Error('MinerU API key not configured');
    const markdown = await callMinerUAPI(filePath, mineruApiKey);
    return chunkMarkdown(markdown);
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get running(): boolean {
    return this.isRunning;
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- indexer
```

Expected: all tests PASS

- [ ] **Step 5: Compile check**

```bash
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/main/kb/indexer.ts src/main/kb/indexer.test.ts
git commit -m "feat(kb): add KB indexer with chunking, Excel parsing, and MinerU/Zhipu API calls"
```

---

## Task 6: KB Watcher

**Files:**
- Create: `src/main/kb/watcher.ts`

- [ ] **Step 1: Create watcher.ts**

```typescript
// src/main/kb/watcher.ts
import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import { KB_SUPPORTED_EXTENSIONS } from './types';
import type { KBIndexer } from './indexer';

interface WatchedFolder {
  folderId: number;
  folderPath: string;
  watcher: FSWatcher;
}

export class KBWatcher {
  private watched = new Map<number, WatchedFolder>(); // folderId → entry
  private indexer: KBIndexer;

  constructor(indexer: KBIndexer) {
    this.indexer = indexer;
  }

  watch(folderId: number, folderPath: string): void {
    if (this.watched.has(folderId)) return;

    const watcher = chokidar.watch(folderPath, {
      persistent: true,
      ignoreInitial: false,
      depth: 10,
      ignored: /(^|[/\\])\../,  // ignore dotfiles
    });

    watcher
      .on('add', (filePath) => this.onFileChange(filePath, folderId, 'upsert'))
      .on('change', (filePath) => this.onFileChange(filePath, folderId, 'upsert'))
      .on('unlink', (filePath) => this.onFileChange(filePath, folderId, 'delete'));

    this.watched.set(folderId, { folderId, folderPath, watcher });
    console.log(`[KBWatcher] watching folder ${folderPath}`);
  }

  async unwatch(folderId: number): Promise<void> {
    const entry = this.watched.get(folderId);
    if (!entry) return;
    await entry.watcher.close();
    this.watched.delete(folderId);
    console.log(`[KBWatcher] stopped watching folder ${entry.folderPath}`);
  }

  async unwatchAll(): Promise<void> {
    for (const folderId of this.watched.keys()) {
      await this.unwatch(folderId);
    }
  }

  private onFileChange(filePath: string, folderId: number, action: 'upsert' | 'delete'): void {
    const ext = path.extname(filePath).toLowerCase();
    if (!KB_SUPPORTED_EXTENSIONS.has(ext)) return;
    this.indexer.enqueue(filePath, folderId, action);
  }
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/main/kb/watcher.ts
git commit -m "feat(kb): add chokidar-based folder watcher"
```

---

## Task 7: KB Manager (Facade)

**Files:**
- Create: `src/main/kb/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
// src/main/kb/index.ts
import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import type { SqliteStore } from '../sqliteStore';
import { KBStore } from './store';
import { KBIndexer, containsTriggerWord } from './indexer';
import { KBWatcher } from './watcher';
import type { KBFolder, KBSearchResult, KBStats, KBIndexProgress } from './types';

export class KBManager extends EventEmitter {
  private store: SqliteStore;
  private kbStore: KBStore;
  private indexer: KBIndexer;
  private watcher: KBWatcher;
  private windows: Set<BrowserWindow> = new Set();

  constructor(store: SqliteStore, userDataPath: string) {
    super();
    this.store = store;
    this.kbStore = new KBStore(userDataPath);
    this.indexer = new KBIndexer(store, this.kbStore);
    this.watcher = new KBWatcher(this.indexer);

    this.indexer.on('progress', (progress: KBIndexProgress) => {
      for (const win of this.windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('kb:onIndexProgress', progress);
        }
      }
    });
  }

  async init(): Promise<void> {
    await this.kbStore.init();
    // Resume watching all persisted folders
    const folders = this.store.listKBFolders();
    for (const folder of folders) {
      this.watcher.watch(folder.id, folder.path);
    }
    console.log(`[KBManager] initialized with ${folders.length} watched folder(s)`);
  }

  registerWindow(win: BrowserWindow): void {
    this.windows.add(win);
    win.on('closed', () => this.windows.delete(win));
  }

  // ── Folder management ──────────────────────────────────────────────────────

  addFolder(folderPath: string): KBFolder {
    const id = this.store.addKBFolder(folderPath);
    this.watcher.watch(id, folderPath);
    console.log(`[KBManager] added folder ${folderPath}`);
    return { id, path: folderPath, created_at: Date.now() };
  }

  removeFolder(folderId: number): void {
    void this.watcher.unwatch(folderId);
    this.store.removeKBFolder(folderId);
    console.log(`[KBManager] removed folder id=${folderId}`);
  }

  clearFolderIndex(folderId: number): void {
    const docs = this.store.listKBDocsByFolder(folderId);
    for (const doc of docs) {
      this.indexer.enqueue(doc.file_path, folderId, 'delete');
    }
    this.store.clearKBDocsByFolder(folderId);
    console.log(`[KBManager] cleared index for folder id=${folderId}`);
  }

  listFolders(): KBFolder[] {
    const folders = this.store.listKBFolders();
    return folders.map((f) => {
      const docs = this.store.listKBDocsByFolder(f.id);
      const indexingCount = docs.filter((d) => d.status === 'indexing' || d.status === 'pending').length;
      return {
        ...f,
        doc_count: docs.length,
        status: (indexingCount > 0 || this.indexer.running ? 'indexing' : 'idle') as 'idle' | 'indexing',
      };
    });
  }

  // ── Rebuild ────────────────────────────────────────────────────────────────

  async rebuild(): Promise<void> {
    const folders = this.store.listKBFolders();
    await this.kbStore.deleteTable();
    await this.kbStore.init();
    for (const folder of folders) {
      this.store.clearKBDocsByFolder(folder.id);
      const docs = this.store.listKBDocsByFolder(folder.id);
      for (const doc of docs) {
        this.indexer.enqueue(doc.file_path, folder.id, 'upsert');
      }
      // Re-watch triggers initial scan via chokidar ignoreInitial:false
      await this.watcher.unwatch(folder.id);
      this.watcher.watch(folder.id, folder.path);
    }
    console.log('[KBManager] full rebuild triggered');
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getStats(): KBStats {
    const stats = this.store.getKBStats();
    const error_files = this.store.listKBErrorDocs();
    return { ...stats, error_files };
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async search(query: string, topK?: number): Promise<KBSearchResult[]> {
    const zhipuApiKey = this.store.get('kb:zhipu_key') ?? '';
    if (!zhipuApiKey) return [];

    const isEmpty = await this.kbStore.isEmpty();
    if (isEmpty) return [];

    const { callZhipuEmbeddingPublic } = await import('./indexer');
    const k = topK ?? Number(this.store.get('kb:top_k') ?? '5');
    const [queryVector] = await callZhipuEmbeddingPublic([query], zhipuApiKey);
    return this.kbStore.search(queryVector, k);
  }

  // ── Trigger word detection ──────────────────────────────────────────────────

  hasTriggerWord(message: string): boolean {
    const raw = this.store.get('kb:trigger_words') ?? '知识库';
    const words = raw.split(',').map((w) => w.trim()).filter(Boolean);
    return containsTriggerWord(message, words);
  }

  async destroy(): Promise<void> {
    await this.watcher.unwatchAll();
  }
}
```

> **Note:** The `search()` method imports `callZhipuEmbeddingPublic` from `indexer.ts`. You need to export this function from `indexer.ts` by adding:

```typescript
// At the bottom of indexer.ts, add:
export const callZhipuEmbeddingPublic = callZhipuEmbedding;
```

- [ ] **Step 2: Add the export to indexer.ts**

At the bottom of `src/main/kb/indexer.ts`, append:

```typescript
export const callZhipuEmbeddingPublic = callZhipuEmbedding;
```

- [ ] **Step 3: Compile check**

```bash
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/main/kb/index.ts src/main/kb/indexer.ts
git commit -m "feat(kb): add KBManager facade and callZhipuEmbeddingPublic export"
```

---

## Task 8: IPC Handlers + Preload

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`

### 8a: Register IPC handlers in main.ts

- [ ] **Step 1: Import and init KBManager in main.ts**

Find the imports at the top of `src/main/main.ts` and add:

```typescript
import { KBManager } from './kb';
```

Find where `SqliteStore` is created (look for `SqliteStore.create(`) and add KBManager initialization after it. Look for a pattern like `const store = await SqliteStore.create(...)` and after that block, add:

```typescript
  const kbManager = new KBManager(store, app.getPath('userData'));
  await kbManager.init();
```

Also register windows with kbManager when they're created — find where `new BrowserWindow(` is called and after the window is created, add:

```typescript
  kbManager.registerWindow(mainWindow);
```

- [ ] **Step 2: Add IPC handlers for kb:* channels**

Find the section in `main.ts` where IPC handlers are registered (look for `ipcMain.handle('store:`) and add a new block:

```typescript
  // ── KB IPC handlers ──────────────────────────────────────────────────────

  ipcMain.handle('kb:addFolder', async (_event, folderPath: string) => {
    return kbManager.addFolder(folderPath);
  });

  ipcMain.handle('kb:removeFolder', (_event, folderId: number) => {
    kbManager.removeFolder(folderId);
  });

  ipcMain.handle('kb:clearFolderIndex', (_event, folderId: number) => {
    kbManager.clearFolderIndex(folderId);
  });

  ipcMain.handle('kb:listFolders', () => {
    return kbManager.listFolders();
  });

  ipcMain.handle('kb:rebuild', async () => {
    await kbManager.rebuild();
  });

  ipcMain.handle('kb:getStats', () => {
    return kbManager.getStats();
  });

  ipcMain.handle('kb:selectFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('kb:getConfig', () => {
    return {
      trigger_words: store.get('kb:trigger_words') ?? '知识库',
      top_k: store.get('kb:top_k') ?? '5',
      mineru_key: store.get('kb:mineru_key') ?? '',
      zhipu_key: store.get('kb:zhipu_key') ?? '',
    };
  });

  ipcMain.handle('kb:setConfig', (_event, config: { trigger_words?: string; top_k?: string; mineru_key?: string; zhipu_key?: string }) => {
    if (config.trigger_words !== undefined) store.set('kb:trigger_words', config.trigger_words);
    if (config.top_k !== undefined) store.set('kb:top_k', config.top_k);
    if (config.mineru_key !== undefined) store.set('kb:mineru_key', config.mineru_key);
    if (config.zhipu_key !== undefined) store.set('kb:zhipu_key', config.zhipu_key);
  });
```

- [ ] **Step 3: Add kb namespace to preload.ts**

In `src/main/preload.ts`, inside the `contextBridge.exposeInMainWorld('electron', { ... })` block, add a `kb` property alongside the existing ones (e.g., after the `mcp` block):

```typescript
  kb: {
    addFolder: (folderPath: string) => ipcRenderer.invoke('kb:addFolder', folderPath),
    removeFolder: (folderId: number) => ipcRenderer.invoke('kb:removeFolder', folderId),
    clearFolderIndex: (folderId: number) => ipcRenderer.invoke('kb:clearFolderIndex', folderId),
    listFolders: () => ipcRenderer.invoke('kb:listFolders'),
    rebuild: () => ipcRenderer.invoke('kb:rebuild'),
    getStats: () => ipcRenderer.invoke('kb:getStats'),
    selectFolder: () => ipcRenderer.invoke('kb:selectFolder'),
    getConfig: () => ipcRenderer.invoke('kb:getConfig'),
    setConfig: (config: Record<string, string>) => ipcRenderer.invoke('kb:setConfig', config),
    onIndexProgress: (callback: (progress: {
      total: number;
      done: number;
      current_file: string;
      errors: string[];
    }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: unknown) => callback(progress as {
        total: number; done: number; current_file: string; errors: string[];
      });
      ipcRenderer.on('kb:onIndexProgress', handler);
      return () => ipcRenderer.removeListener('kb:onIndexProgress', handler);
    },
  },
```

- [ ] **Step 4: Pass kbManager to CoworkRunner**

Find where `CoworkRunner` is instantiated in `main.ts`, and add `kbManager` to it. First check the `CoworkRunner` constructor signature in `src/main/libs/coworkRunner.ts` — you'll modify it in Task 13. For now, just ensure the `kbManager` variable is in scope when CoworkRunner is created.

- [ ] **Step 5: Compile check**

```bash
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts src/main/preload.ts
git commit -m "feat(kb): add IPC handlers and preload kb namespace"
```

---

## Task 9: Renderer KB Service

**Files:**
- Create: `src/renderer/services/kb.ts`

- [ ] **Step 1: Create kb.ts**

```typescript
// src/renderer/services/kb.ts

export interface KBFolder {
  id: number;
  path: string;
  created_at: number;
  doc_count?: number;
  status?: 'idle' | 'indexing';
}

export interface KBStats {
  total_docs: number;
  done_docs: number;
  error_docs: number;
  total_chunks: number;
  error_files: Array<{ file_path: string; error_msg: string | null }>;
}

export interface KBIndexProgress {
  total: number;
  done: number;
  current_file: string;
  errors: string[];
}

export interface KBConfig {
  trigger_words: string;
  top_k: string;
  mineru_key: string;
  zhipu_key: string;
}

export const kbService = {
  async addFolder(folderPath: string): Promise<KBFolder> {
    return window.electron.kb.addFolder(folderPath);
  },

  async removeFolder(folderId: number): Promise<void> {
    return window.electron.kb.removeFolder(folderId);
  },

  async clearFolderIndex(folderId: number): Promise<void> {
    return window.electron.kb.clearFolderIndex(folderId);
  },

  async listFolders(): Promise<KBFolder[]> {
    return window.electron.kb.listFolders();
  },

  async rebuild(): Promise<void> {
    return window.electron.kb.rebuild();
  },

  async getStats(): Promise<KBStats> {
    return window.electron.kb.getStats();
  },

  async selectFolder(): Promise<string | null> {
    return window.electron.kb.selectFolder();
  },

  async getConfig(): Promise<KBConfig> {
    return window.electron.kb.getConfig();
  },

  async setConfig(config: Partial<KBConfig>): Promise<void> {
    return window.electron.kb.setConfig(config as Record<string, string>);
  },

  onIndexProgress(callback: (progress: KBIndexProgress) => void): () => void {
    return window.electron.kb.onIndexProgress(callback);
  },
};
```

- [ ] **Step 2: Add `kb` to the global `window.electron` type declaration**

Find the type declaration file for `window.electron`. Search for it:

```bash
grep -r "exposeInMainWorld\|window.electron" src/renderer --include="*.ts" --include="*.tsx" -l
```

Then in that type declaration (likely a `.d.ts` file or in `preload.ts`), add the `kb` namespace type alongside the others.

- [ ] **Step 3: Compile renderer**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/kb.ts
git commit -m "feat(kb): add renderer KB service"
```

---

## Task 10: i18n Keys

**Files:**
- Modify: `src/renderer/services/i18n.ts`

- [ ] **Step 1: Add KB keys to both zh and en sections**

In `src/renderer/services/i18n.ts`, find the `zh` section and add:

```typescript
    // Knowledge Base
    knowledgeBase: '知识库',
    kbWatchedFolders: '监控文件夹',
    kbAddFolder: '添加文件夹',
    kbRebuild: '重建索引',
    kbIndexStatus: '索引状态',
    kbTotalDocs: '共 {total} 份文档 · {chunks} 个分块',
    kbErrorFiles: '{count} 份文件处理失败',
    kbViewErrors: '查看详情',
    kbTriggerWords: '触发词设置',
    kbTriggerWordsHint: '在对话中输入触发词，AI 将自动检索知识库。多个触发词用逗号分隔。',
    kbApiKeys: 'API 密钥',
    kbMineruKey: 'MinerU API Key',
    kbMineruKeyHint: '用于解析 PDF、Word、PPT 和图片（含 OCR）',
    kbZhipuKey: '智谱 API Key',
    kbZhipuKeyHint: '用于生成文本向量（embedding-3 模型）',
    kbStatusIdle: '已同步',
    kbStatusIndexing: '索引中…',
    kbDeleteFolderConfirm: '移除此文件夹监控？已建立的索引将保留。',
    kbClearIndex: '清除该文件夹索引',
    kbClearIndexConfirm: '确认清除此文件夹的向量索引？',
    kbRetrievedChunks: '已检索知识库 · {count} 个相关片段',
    kbEmptyHint: '知识库暂无内容，请先添加文件夹并等待索引完成。',
    kbApiKeyMissing: '请先配置智谱 API Key 才能使用知识库功能',
```

In the `en` section, add:

```typescript
    // Knowledge Base
    knowledgeBase: 'Knowledge Base',
    kbWatchedFolders: 'Watched Folders',
    kbAddFolder: 'Add Folder',
    kbRebuild: 'Rebuild Index',
    kbIndexStatus: 'Index Status',
    kbTotalDocs: '{total} documents · {chunks} chunks',
    kbErrorFiles: '{count} file(s) failed',
    kbViewErrors: 'View Details',
    kbTriggerWords: 'Trigger Words',
    kbTriggerWordsHint: 'Type a trigger word in conversation to search the knowledge base. Separate multiple words with commas.',
    kbApiKeys: 'API Keys',
    kbMineruKey: 'MinerU API Key',
    kbMineruKeyHint: 'Used to parse PDF, Word, PPT and images (with OCR)',
    kbZhipuKey: 'Zhipu API Key',
    kbZhipuKeyHint: 'Used to generate text embeddings (embedding-3 model)',
    kbStatusIdle: 'Synced',
    kbStatusIndexing: 'Indexing…',
    kbDeleteFolderConfirm: 'Remove this folder from monitoring? Existing index will be kept.',
    kbClearIndex: 'Clear Folder Index',
    kbClearIndexConfirm: 'Clear the vector index for this folder?',
    kbRetrievedChunks: 'Searched KB · {count} relevant chunks',
    kbEmptyHint: 'Knowledge base is empty. Add a folder and wait for indexing to complete.',
    kbApiKeyMissing: 'Please configure Zhipu API Key to use the knowledge base',
```

- [ ] **Step 2: Compile check**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/services/i18n.ts
git commit -m "feat(kb): add i18n keys for knowledge base UI"
```

---

## Task 11: KB Management Page

**Files:**
- Create: `src/renderer/components/kb/KBManagePage.tsx`

- [ ] **Step 1: Create the KB management page component**

```tsx
// src/renderer/components/kb/KBManagePage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { i18nService } from '../../services/i18n';
import { kbService, type KBFolder, type KBStats, type KBIndexProgress, type KBConfig } from '../../services/kb';
import FolderIcon from '../icons/FolderIcon';
import TrashIcon from '../icons/TrashIcon';

const KBManagePage: React.FC = () => {
  const t = (key: string, vars?: Record<string, string | number>) => {
    let s = i18nService.t(key);
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, String(v)); });
    }
    return s;
  };

  const [folders, setFolders] = useState<KBFolder[]>([]);
  const [stats, setStats] = useState<KBStats>({ total_docs: 0, done_docs: 0, error_docs: 0, total_chunks: 0, error_files: [] });
  const [config, setConfig] = useState<KBConfig>({ trigger_words: '知识库', top_k: '5', mineru_key: '', zhipu_key: '' });
  const [progress, setProgress] = useState<KBIndexProgress | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState<number | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const refresh = useCallback(async () => {
    const [f, s, c] = await Promise.all([kbService.listFolders(), kbService.getStats(), kbService.getConfig()]);
    setFolders(f);
    setStats(s);
    setConfig(c);
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = kbService.onIndexProgress((p) => {
      setProgress(p);
      if (p.done === p.total && p.total > 0 && p.current_file === '') {
        // indexing complete
        void refresh();
        setProgress(null);
      }
    });
    return unsub;
  }, [refresh]);

  const handleAddFolder = async () => {
    const folderPath = await kbService.selectFolder();
    if (!folderPath) return;
    await kbService.addFolder(folderPath);
    await refresh();
  };

  const handleRemoveFolder = async (folderId: number) => {
    if (!confirm(t('kbDeleteFolderConfirm'))) return;
    await kbService.removeFolder(folderId);
    await refresh();
  };

  const handleClearIndex = async (folderId: number) => {
    await kbService.clearFolderIndex(folderId);
    setShowClearConfirm(null);
    await refresh();
  };

  const handleRebuild = async () => {
    setIsRebuilding(true);
    await kbService.rebuild();
    setIsRebuilding(false);
    await refresh();
  };

  const handleSaveConfig = async (partial: Partial<KBConfig>) => {
    const next = { ...config, ...partial };
    setConfig(next);
    await kbService.setConfig(partial);
  };

  const isIndexing = folders.some((f) => f.status === 'indexing') || (progress !== null && progress.current_file !== '');

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 max-w-2xl mx-auto gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
          {t('knowledgeBase')}
        </h1>
        <button
          onClick={handleRebuild}
          disabled={isRebuilding}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-claude-accent/10 text-claude-accent hover:bg-claude-accent/20 transition-colors disabled:opacity-50"
        >
          {isRebuilding ? '…' : t('kbRebuild')}
        </button>
      </div>

      {/* Watched Folders */}
      <section className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-claude-darkBorder border-claude-border">
          <span className="text-sm font-medium dark:text-claude-darkText text-claude-text">{t('kbWatchedFolders')}</span>
          <button
            onClick={handleAddFolder}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-claude-accent text-white hover:bg-claude-accentHover transition-colors"
          >
            + {t('kbAddFolder')}
          </button>
        </div>
        {folders.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {t('kbEmptyHint')}
          </div>
        ) : (
          <ul className="divide-y dark:divide-claude-darkBorder divide-claude-border">
            {folders.map((folder) => (
              <li key={folder.id} className="px-4 py-3 flex items-start gap-3">
                <FolderIcon className="h-5 w-5 mt-0.5 shrink-0 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate">{folder.path}</div>
                  <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mt-0.5">
                    {folder.doc_count ?? 0} {t('kbStatusIdle') === t('kbStatusIdle') ? '份文档' : 'docs'} ·{' '}
                    {folder.status === 'indexing' ? (
                      <span className="text-yellow-500">{t('kbStatusIndexing')}</span>
                    ) : (
                      <span>{t('kbStatusIdle')}</span>
                    )}
                  </div>
                  {showClearConfirm === folder.id && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="dark:text-claude-darkTextSecondary text-claude-textSecondary">{t('kbClearIndexConfirm')}</span>
                      <button onClick={() => void handleClearIndex(folder.id)} className="text-red-500 font-medium">确认</button>
                      <button onClick={() => setShowClearConfirm(null)} className="dark:text-claude-darkTextSecondary text-claude-textSecondary">取消</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setShowClearConfirm(showClearConfirm === folder.id ? null : folder.id)}
                    className="px-2 py-1 text-xs rounded dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {t('kbClearIndex')}
                  </button>
                  <button
                    onClick={() => void handleRemoveFolder(folder.id)}
                    className="p-1 rounded dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-red-500 transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Index Status */}
      <section className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3">
        <div className="text-sm font-medium dark:text-claude-darkText text-claude-text mb-2">{t('kbIndexStatus')}</div>
        {isIndexing && progress && (
          <div className="mb-2">
            <div className="flex justify-between text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
              <span className="truncate max-w-xs">{progress.current_file ? `处理中: ${progress.current_file.split(/[/\\]/).pop()}` : '等待中…'}</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <div className="w-full bg-claude-border dark:bg-claude-darkBorder rounded-full h-1.5">
              <div
                className="bg-claude-accent h-1.5 rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
        <div className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {t('kbTotalDocs', { total: stats.total_docs, chunks: stats.total_chunks })}
        </div>
        {stats.error_docs > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowErrors(!showErrors)}
              className="text-xs text-yellow-500 hover:underline"
            >
              ⚠ {t('kbErrorFiles', { count: stats.error_docs })} · {t('kbViewErrors')}
            </button>
            {showErrors && (
              <ul className="mt-2 space-y-1">
                {stats.error_files.map((f) => (
                  <li key={f.file_path} className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    <span className="font-medium">{f.file_path.split(/[/\\]/).pop()}</span>
                    {f.error_msg && <span className="ml-1 text-red-400">{f.error_msg}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* API Keys */}
      <section className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3 space-y-4">
        <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">{t('kbApiKeys')}</div>
        <div className="space-y-1">
          <label className="text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">{t('kbZhipuKey')}</label>
          <input
            type="password"
            value={config.zhipu_key}
            onChange={(e) => void handleSaveConfig({ zhipu_key: e.target.value })}
            placeholder="zhipu api key"
            className="w-full px-3 py-2 text-sm rounded-lg dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted dark:text-claude-darkText text-claude-text border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-1 focus:ring-claude-accent"
          />
          <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">{t('kbZhipuKeyHint')}</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">{t('kbMineruKey')}</label>
          <input
            type="password"
            value={config.mineru_key}
            onChange={(e) => void handleSaveConfig({ mineru_key: e.target.value })}
            placeholder="mineru api key"
            className="w-full px-3 py-2 text-sm rounded-lg dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted dark:text-claude-darkText text-claude-text border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-1 focus:ring-claude-accent"
          />
          <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">{t('kbMineruKeyHint')}</p>
        </div>
      </section>

      {/* Trigger Words */}
      <section className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3 space-y-2">
        <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">{t('kbTriggerWords')}</div>
        <input
          type="text"
          value={config.trigger_words}
          onChange={(e) => void handleSaveConfig({ trigger_words: e.target.value })}
          className="w-full px-3 py-2 text-sm rounded-lg dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted dark:text-claude-darkText text-claude-text border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-1 focus:ring-claude-accent"
        />
        <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">{t('kbTriggerWordsHint')}</p>
      </section>
    </div>
  );
};

export default KBManagePage;
```

- [ ] **Step 2: Compile check**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/kb/KBManagePage.tsx
git commit -m "feat(kb): add KBManagePage component"
```

---

## Task 12: Navigation Integration

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/App.tsx`

### 12a: Add KB icon (reuse existing FolderIcon or AcademicCapIcon)

Use `AcademicCapIcon` from `@heroicons/react` as the KB nav icon, consistent with existing icon usage.

- [ ] **Step 1: Update Sidebar.tsx**

Add `'kb'` to the `activeView` type and add a nav button. Find the `SidebarProps` interface and change:

```typescript
  activeView: 'cowork' | 'skills' | 'mcp';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowMcp: () => void;
```

to:

```typescript
  activeView: 'cowork' | 'skills' | 'mcp' | 'kb';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowMcp: () => void;
  onShowKB: () => void;
```

Then update the destructuring in the component:

```typescript
const Sidebar: React.FC<SidebarProps> = ({
  onShowSettings,
  activeView,
  onShowSkills,
  onShowCowork,
  onShowMcp,
  onShowKB,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  updateBadge,
}) => {
```

Add the import at the top:

```typescript
import { AcademicCapIcon } from '@heroicons/react/24/outline';
```

Add a KB button after the MCP button (find the MCP button block and add after its closing `</button>`):

```tsx
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowKB();
            }}
            className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              activeView === 'kb'
                ? 'bg-claude-accent/10 text-claude-accent hover:bg-claude-accent/20'
                : 'dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-text dark:hover:text-claude-darkText hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover'
            }`}
          >
            <AcademicCapIcon className="h-4 w-4" />
            {i18nService.t('knowledgeBase')}
          </button>
```

- [ ] **Step 2: Update App.tsx**

Add KB view to `mainView` state and render `KBManagePage`. Find:

```typescript
  const [mainView, setMainView] = useState<'cowork' | 'skills' | 'mcp'>('cowork');
```

Change to:

```typescript
  const [mainView, setMainView] = useState<'cowork' | 'skills' | 'mcp' | 'kb'>('cowork');
```

Add import at top of App.tsx:

```typescript
import KBManagePage from './components/kb/KBManagePage';
```

Find where `<SkillsView />` and `<McpView />` are conditionally rendered (look for `mainView === 'skills'`) and add after:

```tsx
          {mainView === 'kb' && <KBManagePage />}
```

Find where `<Sidebar>` is rendered and add the `onShowKB` prop:

```tsx
            onShowKB={() => setMainView('kb')}
```

Also update the `Sidebar` `activeView` prop to pass `mainView` directly (it already should).

- [ ] **Step 3: Compile check**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 4: Manual smoke test**

```bash
npm run electron:dev
```

- Click the "知识库" nav button — KB management page should appear
- Add a folder via "+ 添加文件夹"
- Verify the folder appears in the list

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Sidebar.tsx src/renderer/App.tsx
git commit -m "feat(kb): add KB navigation to Sidebar and App"
```

---

## Task 13: Cowork Trigger Word Integration

**Files:**
- Modify: `src/main/libs/coworkRunner.ts`
- Modify: `src/main/main.ts` (pass kbManager to CoworkRunner)

The injection point is in `coworkRunner.ts` at the `continueSession` and `startSession` calls, just before `buildPromptPrefix()`. We add a KB context block to the `effectivePrompt`.

- [ ] **Step 1: Add kbManager to CoworkRunner constructor**

In `src/main/libs/coworkRunner.ts`, find the class definition and constructor:

```typescript
export class CoworkRunner {
  private store: CoworkStore;
  // ... other fields
  
  constructor(store: CoworkStore, ...) {
```

Add `kbManager` as an optional field and parameter:

```typescript
import type { KBManager } from '../kb';

export class CoworkRunner {
  private store: CoworkStore;
  private kbManager?: KBManager;
  // ... other fields

  constructor(store: CoworkStore, kbManager?: KBManager, ...) {
    this.store = store;
    this.kbManager = kbManager;
```

- [ ] **Step 2: Add buildKBContext private method**

Inside `CoworkRunner` class, add:

```typescript
  private async buildKBContext(userMessage: string): Promise<{ context: string; chunksCount: number } | null> {
    if (!this.kbManager) return null;
    if (!this.kbManager.hasTriggerWord(userMessage)) return null;

    const results = await this.kbManager.search(userMessage);
    if (!results.length) return null;

    const sections = results.map((r) => {
      const fileName = r.file_path.split(/[/\\]/).pop() ?? r.file_path;
      return `[来源：${fileName}]\n${r.text}`;
    });

    const context = `\n--- 知识库相关内容 ---\n${sections.join('\n\n')}\n--- 知识库内容结束 ---`;
    return { context, chunksCount: results.length };
  }
```

- [ ] **Step 3: Inject KB context into startSession**

Find `startSession` in `coworkRunner.ts`. Locate this pattern:

```typescript
      const promptPrefix = this.buildPromptPrefix();
      let effectivePrompt = promptPrefix ? `${promptPrefix}\n\n---\n\n${prompt}` : prompt;
```

Replace with:

```typescript
      const promptPrefix = this.buildPromptPrefix();
      let effectivePrompt = promptPrefix ? `${promptPrefix}\n\n---\n\n${prompt}` : prompt;

      const kbContext = await this.buildKBContext(prompt);
      if (kbContext) {
        effectivePrompt = effectivePrompt + kbContext.context;
        console.log(`[CoworkRunner] injected KB context: ${kbContext.chunksCount} chunks`);
      }
```

- [ ] **Step 4: Inject KB context into continueSession**

Find the `continueSession` method's similar block:

```typescript
      const promptPrefix = this.buildPromptPrefix();
      const effectivePrompt = promptPrefix ? `${promptPrefix}\n\n---\n\n${prompt}` : prompt;
      await this.runClaudeCode(activeSession, effectivePrompt, sessionCwd, effectiveSystemPrompt, options.imageAttachments);
```

Replace with:

```typescript
      const promptPrefix = this.buildPromptPrefix();
      let effectivePrompt = promptPrefix ? `${promptPrefix}\n\n---\n\n${prompt}` : prompt;

      const kbContext = await this.buildKBContext(prompt);
      if (kbContext) {
        effectivePrompt = effectivePrompt + kbContext.context;
        console.log(`[CoworkRunner] injected KB context: ${kbContext.chunksCount} chunks`);
      }

      await this.runClaudeCode(activeSession, effectivePrompt, sessionCwd, effectiveSystemPrompt, options.imageAttachments);
```

- [ ] **Step 5: Pass kbManager when constructing CoworkRunner in main.ts**

Find `new CoworkRunner(` in `main.ts` and pass `kbManager` as the second argument. Note: you need to read the exact constructor call first to insert at the right position, then adjust the parameter order if needed.

- [ ] **Step 6: Compile check**

```bash
npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 7: Manual integration test**

```bash
npm run electron:dev
```

1. Go to KB page, configure Zhipu API key
2. Add a folder with at least one `.md` file, wait for indexing
3. In Cowork, type a message containing "知识库" plus a topic from the indexed docs
4. Verify: Claude receives relevant context (check the prompt in dev tools or add a temp `console.debug`)

- [ ] **Step 8: Commit**

```bash
git add src/main/libs/coworkRunner.ts src/main/main.ts
git commit -m "feat(kb): inject KB context into Cowork when trigger word detected"
```

---

## Task 14: Cowork KB Badge UI

Show a small badge below the user message turn when KB retrieval occurred.

**Files:**
- Modify: `src/renderer/components/cowork/CoworkSessionDetail.tsx` (or `LazyRenderTurn.tsx`)

When KB is triggered in `coworkRunner.ts`, emit a `kb:retrieval` IPC event to the renderer. The renderer stores which messages triggered KB search and shows a badge.

- [ ] **Step 1: Emit kb:retrieval event from coworkRunner.ts**

In `coworkRunner.ts`, inside `buildKBContext` after computing results, emit to all windows. Since `CoworkRunner` doesn't have direct access to windows, emit it via the store's session event mechanism. Find where `cowork:stream:message` events are sent (look for `win.webContents.send`) and follow the same pattern.

Add to `CoworkRunner` constructor the ability to send events via a provided emitter or add a `windowsSender` callback:

```typescript
  private sendToWindows?: (channel: string, ...args: unknown[]) => void;

  setSendToWindows(fn: (channel: string, ...args: unknown[]) => void): void {
    this.sendToWindows = fn;
  }
```

Then in `buildKBContext`, after computing results:

```typescript
    if (this.sendToWindows) {
      this.sendToWindows('kb:retrieval', {
        sessionId: /* current sessionId - pass as param */,
        chunksCount: results.length,
        sources: results.map((r) => r.file_path.split(/[/\\]/).pop()),
      });
    }
```

Update `buildKBContext` signature to accept `sessionId: string`.

- [ ] **Step 2: In main.ts, set the sendToWindows callback after creating CoworkRunner**

```typescript
coworkRunner.setSendToWindows((channel, ...args) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  }
});
```

- [ ] **Step 3: Add kb retrieval listener to preload.ts**

```typescript
    onKBRetrieval: (callback: (data: { sessionId: string; chunksCount: number; sources: string[] }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) =>
        callback(data as { sessionId: string; chunksCount: number; sources: string[] });
      ipcRenderer.on('kb:retrieval', handler);
      return () => ipcRenderer.removeListener('kb:retrieval', handler);
    },
```

- [ ] **Step 4: In kbService (renderer), add onKBRetrieval method**

```typescript
  onKBRetrieval(callback: (data: { sessionId: string; chunksCount: number; sources: string[] }) => void): () => void {
    return window.electron.kb.onKBRetrieval(callback);
  },
```

- [ ] **Step 5: In CoworkView or CoworkSessionDetail, listen and display badge**

Find where user messages are rendered in `CoworkSessionDetail.tsx` or `LazyRenderTurn.tsx`. Add state to track KB retrievals per message:

```typescript
  const [kbRetrievals, setKBRetrievals] = useState<Map<string, { chunksCount: number; sources: string[] }>>(new Map());
```

Subscribe in useEffect:

```typescript
  useEffect(() => {
    const unsub = kbService.onKBRetrieval(({ sessionId, chunksCount, sources }) => {
      if (sessionId !== currentSessionId) return;
      setKBRetrievals((prev) => {
        const next = new Map(prev);
        // Associate with last user message
        next.set('latest', { chunksCount, sources });
        return next;
      });
    });
    return unsub;
  }, [currentSessionId]);
```

Then render badge after user message turn:

```tsx
{kbRetrievals.has('latest') && (
  <div className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary flex items-center gap-1 mt-1 ml-2">
    🔍 {i18nService.t('kbRetrievedChunks').replace('{count}', String(kbRetrievals.get('latest')!.chunksCount))}
  </div>
)}
```

> **Note:** For a production-quality badge, associate the retrieval event with specific message IDs (not just "latest"). This MVP implementation shows the badge on the last user turn during the session.

- [ ] **Step 6: Compile check**

```bash
npx tsc -p tsconfig.json --noEmit && npx tsc -p electron-tsconfig.json --noEmit
```

Expected: no errors

- [ ] **Step 7: Manual smoke test**

```bash
npm run electron:dev
```

- Trigger KB search in Cowork
- Verify badge appears below user message: "🔍 已检索知识库 · N 个相关片段"

- [ ] **Step 8: Final commit**

```bash
git add src/main/libs/coworkRunner.ts src/main/main.ts src/main/preload.ts src/renderer/services/kb.ts src/renderer/components/cowork/
git commit -m "feat(kb): add KB retrieval badge in Cowork UI"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Multi-folder support (Task 2, 7, 11)
- ✅ PDF/Word/PPT/Image via MinerU (Task 5)
- ✅ Excel local parsing with header-per-chunk (Task 5)
- ✅ Markdown native reading (Task 5)
- ✅ LanceDB vector storage (Task 4)
- ✅ Zhipu embedding-3 (Task 5)
- ✅ chokidar file watching (Task 6)
- ✅ Trigger word detection (Task 5 `containsTriggerWord`, Task 13)
- ✅ KB management page with folder list, index status, error display (Task 11)
- ✅ Trigger word config UI (Task 11)
- ✅ API key config (Task 11)
- ✅ kb_folders + kb_docs schema (Task 2)
- ✅ All 7 IPC channels (Task 8)
- ✅ Sidebar nav (Task 12)
- ✅ Cowork badge UI (Task 14)
- ✅ i18n (Task 10)
- ✅ Module boundary designed for Worker Thread migration (indexer.ts isolation in Tasks 5-7)

**One gap flagged:** Task 13 Step 5 says "read the exact constructor call first" — the implementer must check the actual `new CoworkRunner(` call in `main.ts` before editing. The CoworkRunner constructor has many parameters; `kbManager` should be injected without breaking the existing signature (add as last optional parameter).
