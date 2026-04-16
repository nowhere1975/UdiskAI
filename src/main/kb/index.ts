import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import type { BrowserWindow } from 'electron';
import type { SqliteStore } from '../sqliteStore';
import { KBStore } from './store';
import { KBIndexer, containsTriggerWord, callEmbeddingPublic } from './indexer';
import { KBWatcher } from './watcher';
import type { KBFolder, KBSearchResult, KBStats, KBIndexProgress } from './types';

// The KB folder is always located at {userDataPath}/知识库.
// This relative name is stored in kb_folders.path so the record is
// drive-letter-independent. The absolute path is resolved at runtime.
const KB_RELATIVE_DIR = '知识库';
const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

export class KBManager extends EventEmitter {
  private store: SqliteStore;
  private kbStore: KBStore;
  private indexer: KBIndexer;
  private watcher: KBWatcher;
  private windows: Set<BrowserWindow> = new Set();
  private userDataPath: string;
  private folderId: number = -1;

  constructor(store: SqliteStore, userDataPath: string) {
    super();
    this.store = store;
    this.userDataPath = userDataPath;
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

  // Returns the absolute path to the KB folder on the current machine.
  getKBFolderPath(): string {
    return path.join(this.userDataPath, KB_RELATIVE_DIR);
  }

  async init(): Promise<void> {
    await this.kbStore.init();

    // Ensure the KB directory exists on disk.
    const absPath = this.getKBFolderPath();
    fs.mkdirSync(absPath, { recursive: true });

    // Migration: remove any old records that stored absolute paths, then
    // ensure exactly one record exists with the relative path '知识库'.
    const existing = this.store.listKBFolders();
    const hasRelative = existing.some((f) => f.path === KB_RELATIVE_DIR);
    if (!hasRelative) {
      // Delete stale absolute-path records (and their docs).
      for (const f of existing) {
        this.store.removeKBFolder(f.id);
      }
      console.log('[KBManager] migrated kb_folders to relative path storage');
    }

    this.folderId = this.store.addKBFolder(KB_RELATIVE_DIR);
    this.watcher.watch(this.folderId, absPath);
    console.log(`[KBManager] initialized, watching ${absPath}`);
  }

  registerWindow(win: BrowserWindow): void {
    this.windows.add(win);
    win.on('closed', () => this.windows.delete(win));
  }

  // ── Folder info ────────────────────────────────────────────────────────────

  listFolders(): KBFolder[] {
    const docs = this.store.listKBDocsByFolder(this.folderId);
    const indexingCount = docs.filter((d) => d.status === 'indexing' || d.status === 'pending').length;
    return [{
      id: this.folderId,
      path: this.getKBFolderPath(),
      created_at: Date.now(),
      doc_count: docs.length,
      status: (indexingCount > 0 || this.indexer.running ? 'indexing' : 'idle') as 'idle' | 'indexing',
    }];
  }

  // ── Rebuild ────────────────────────────────────────────────────────────────

  async rebuild(): Promise<void> {
    await this.kbStore.deleteTable();
    await this.kbStore.init();
    this.store.clearKBDocsByFolder(this.folderId);
    await this.watcher.unwatch(this.folderId);
    this.watcher.watch(this.folderId, this.getKBFolderPath());
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
    const zhipuApiKey = this.getZhipuApiKey();
    if (!zhipuApiKey) return [];

    const isEmpty = await this.kbStore.isEmpty();
    if (isEmpty) return [];

    const k = topK ?? Number(this.store.get<string>('kb:top_k') ?? '5');
    const [queryVector] = await callEmbeddingPublic([query], zhipuApiKey);
    return this.kbStore.search(queryVector, k);
  }

  // ── Scope summary ──────────────────────────────────────────────────────────

  getScope(): string {
    return this.store.get<string>('kb:scope') ?? '';
  }

  async generateScope(): Promise<string> {
    const zhipuApiKey = this.getZhipuApiKey();
    if (!zhipuApiKey) return '';

    const samples = await this.kbStore.sampleChunks(20);
    if (samples.length === 0) return '';

    const context = samples.map((t, i) => `[片段${i + 1}] ${t}`).join('\n\n');
    const prompt = `以下是知识库中随机抽取的文档片段，请根据这些内容，用一到两句话概括这个知识库涵盖的主题和领域。只输出概括内容，不要有前缀或解释。\n\n${context}`;

    try {
      const fetch = (await import('electron')).net.fetch;
      const resp = await fetch(`${ZHIPU_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${zhipuApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          stream: false,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) return '';
      const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const scope = json.choices?.[0]?.message?.content?.trim() ?? '';
      if (scope) this.store.set('kb:scope', scope);
      return scope;
    } catch (err) {
      console.error('[KBManager] scope generation failed:', err);
      return '';
    }
  }

  // ── Trigger word detection ──────────────────────────────────────────────────

  hasTriggerWord(message: string): boolean {
    const raw = this.store.get<string>('kb:trigger_words') ?? '知识库';
    const words = raw.split(',').map((w: string) => w.trim()).filter(Boolean);
    return containsTriggerWord(message, words);
  }

  async destroy(): Promise<void> {
    await this.watcher.unwatchAll();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getZhipuApiKey(): string {
    const appConfig = this.store.get<{ providers?: Record<string, { apiKey?: string }> }>('app_config');
    return appConfig?.providers?.zhipu?.apiKey?.trim() ?? '';
  }
}
