import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import type { SqliteStore } from '../sqliteStore';
import { KBStore } from './store';
import { KBIndexer, containsTriggerWord, callZhipuEmbeddingPublic } from './indexer';
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
    const zhipuApiKey = this.store.get<string>('kb:zhipu_key') ?? '';
    if (!zhipuApiKey) return [];

    const isEmpty = await this.kbStore.isEmpty();
    if (isEmpty) return [];

    const k = topK ?? Number(this.store.get<string>('kb:top_k') ?? '5');
    const [queryVector] = await callZhipuEmbeddingPublic([query], zhipuApiKey);
    return this.kbStore.search(queryVector, k);
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
}
