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
  const FormData = (await import('form-data')).default;
  const fetch = (await import('electron')).net.fetch;

  const form = new FormData();
  form.append('file', fs.readFileSync(filePath), path.basename(filePath));
  form.append('output_format', 'markdown');

  const response = await fetch('https://mineru.net/api/v4/extract/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mineruApiKey}`,
      ...form.getHeaders(),
    },
    body: form.getBuffer() as unknown as BodyInit,
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
    const mineruApiKey = this.store.get<string>('kb:mineru_key') ?? '';
    const zhipuApiKey = this.store.get<string>('kb:zhipu_key') ?? '';

    if (!zhipuApiKey) {
      const msg = `[KB] skipping ${path.basename(filePath)}: Zhipu API key not configured`;
      console.warn(msg);
      errors.push(msg);
      this.store.upsertKBDoc({ folder_id: folderId, file_path: filePath, status: 'error', error_msg: 'Zhipu API key not configured' });
      return;
    }

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

export const callZhipuEmbeddingPublic = callZhipuEmbedding;
