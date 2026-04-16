import React, { useEffect, useState, useCallback } from 'react';
import { i18nService } from '../../services/i18n';
import { kbService, type KBFolder, type KBStats, type KBIndexProgress, type KBConfig, type KBDoc } from '../../services/kb';
import FolderIcon from '../icons/FolderIcon';

const INITIAL_FILES_SHOWN = 10;

const KBManagePage: React.FC = () => {
  const t = (key: string, vars?: Record<string, string | number>) => {
    let s = i18nService.t(key);
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, String(v)); });
    return s;
  };

  const [folder, setFolder] = useState<KBFolder | null>(null);
  const [folderPath, setFolderPath] = useState('');
  const [stats, setStats] = useState<KBStats>({ total_docs: 0, done_docs: 0, error_docs: 0, total_chunks: 0, error_files: [] });
  const [config, setConfig] = useState<KBConfig>({ trigger_words: '知识库', top_k: '5' });
  const [progress, setProgress] = useState<KBIndexProgress | null>(null);
  const [scope, setScope] = useState('');
  const [scopeGenerating, setScopeGenerating] = useState(false);
  const [docs, setDocs] = useState<KBDoc[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [hasZhipuKey, setHasZhipuKey] = useState(true);

  const refresh = useCallback(async () => {
    const [folders, s, c, kbPath] = await Promise.all([
      kbService.listFolders(),
      kbService.getStats(),
      kbService.getConfig(),
      kbService.getKBFolderPath(),
    ]);
    const f = folders[0] ?? null;
    setFolder(f);
    setFolderPath(kbPath);
    setStats(s);
    setConfig(c);
    if (f) {
      const allDocs = await kbService.listDocs(f.id);
      setDocs(allDocs);
      // KB is functional only when Zhipu is configured; detect via error on first doc
      const noKey = allDocs.some(d => d.error_msg === 'Zhipu API key not configured');
      setHasZhipuKey(!noKey || allDocs.every(d => d.status === 'done'));
    }
  }, []);

  useEffect(() => {
    void refresh();
    void kbService.getScope().then(setScope);
    const unsub = kbService.onIndexProgress((p) => {
      setProgress(p);
      if (p.done === p.total && p.total > 0 && p.current_file === '') {
        void refresh();
        setProgress(null);
      }
    });
    return unsub;
  }, [refresh]);

  const handleRebuild = async () => {
    setIsRebuilding(true);
    await kbService.rebuild();
    setIsRebuilding(false);
    await refresh();
  };

  const handleSaveConfig = async (partial: Partial<KBConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    await kbService.setConfig(partial);
  };

  const handleGenerateScope = async () => {
    setScopeGenerating(true);
    const result = await kbService.generateScope();
    if (result) setScope(result);
    setScopeGenerating(false);
  };

  const isIndexing = folder?.status === 'indexing' || (progress !== null && progress.current_file !== '');
  const shown = expanded ? docs : docs.slice(0, INITIAL_FILES_SHOWN);
  const hasMore = docs.length > INITIAL_FILES_SHOWN;

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col p-6 max-w-2xl mx-auto gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
            {t('knowledgeBase')}
          </h1>
          <button
            onClick={() => void handleRebuild()}
            disabled={isRebuilding}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-claude-accent/10 text-claude-accent hover:bg-claude-accent/20 transition-colors disabled:opacity-50"
          >
            {isRebuilding ? '…' : t('kbRebuild')}
          </button>
        </div>

        {/* Zhipu key warning */}
        {!hasZhipuKey && (
          <div className="rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
            {t('kbNoZhipuKey')}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3">
            <div className="text-2xl font-bold dark:text-claude-darkText text-claude-text">
              {stats.total_docs}
            </div>
            <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mt-0.5">
              {t('kbStatDocs')}
            </div>
          </div>
          <div className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3">
            <div className="text-2xl font-bold dark:text-claude-darkText text-claude-text">
              {stats.total_chunks.toLocaleString()}
            </div>
            <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mt-0.5">
              {t('kbStatChunks')}
            </div>
          </div>
          <div className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3">
            <div className="text-2xl font-bold">
              <span className="text-green-500">{stats.done_docs}</span>
              <span className="text-base font-normal dark:text-claude-darkTextSecondary text-claude-textSecondary mx-1">/</span>
              {stats.error_docs > 0
                ? <span className="text-orange-400">{stats.error_docs}</span>
                : <span className="text-base dark:text-claude-darkTextSecondary text-claude-textSecondary">0</span>
              }
            </div>
            <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mt-0.5">
              {t('kbStatSuccessFail')}
            </div>
          </div>
        </div>

        {/* Indexing progress bar */}
        {isIndexing && progress && (
          <div className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3">
            <div className="flex justify-between text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mb-2">
              <span className="truncate max-w-xs">
                {progress.current_file ? progress.current_file.split(/[/\\]/).pop() : '等待中…'}
              </span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="w-full bg-claude-border dark:bg-claude-darkBorder rounded-full h-1.5">
              <div
                className="bg-claude-accent h-1.5 rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Knowledge Scope */}
        <div className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-claude-darkBorder border-claude-border">
            <span className="text-sm font-medium dark:text-claude-darkText text-claude-text">
              {t('kbScope')}
            </span>
            <button
              onClick={() => void handleGenerateScope()}
              disabled={scopeGenerating || stats.total_docs === 0}
              className="px-2 py-1 text-xs font-medium rounded-lg bg-claude-accent/10 text-claude-accent hover:bg-claude-accent/20 transition-colors disabled:opacity-40"
            >
              {scopeGenerating ? t('kbScopeGenerating') : scope ? t('kbScopeRefresh') : t('kbScopeGenerate')}
            </button>
          </div>
          <div className="px-4 py-3 border-l-2 border-claude-accent">
            <p className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary leading-relaxed">
              {scope || t('kbScopeEmpty')}
            </p>
          </div>
        </div>

        {/* KB Folder */}
        <section>
          <div className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border overflow-hidden">
            {/* Folder header */}
            <div className="flex items-start gap-3 px-4 py-3 border-b dark:border-claude-darkBorder border-claude-border">
              <FolderIcon className="h-5 w-5 mt-0.5 shrink-0 text-claude-accent opacity-80" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate" title={folderPath}>
                  {folderPath || '知识库'}
                </div>
                <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mt-0.5">
                  {docs.length} {t('kbStatDocs')} ·{' '}
                  {isIndexing
                    ? <span className="text-yellow-500">{t('kbStatusIndexing')}</span>
                    : <span>{t('kbStatusIdle')}</span>
                  }
                </div>
              </div>
              <button
                onClick={() => void kbService.openFolder()}
                className="shrink-0 px-2 py-1 text-xs font-medium rounded-lg bg-claude-accent/10 text-claude-accent hover:bg-claude-accent/20 transition-colors"
              >
                {t('kbOpenFolder')}
              </button>
            </div>

            {/* Hint when empty */}
            {docs.length === 0 && (
              <div className="px-4 py-6 text-sm text-center dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {t('kbFolderHint')}
              </div>
            )}

            {/* File list */}
            {docs.length > 0 && (
              <>
                {shown.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 px-4 py-2 border-b dark:border-claude-darkBorder border-claude-border"
                  >
                    <span className={`shrink-0 w-2 h-2 rounded-full ${
                      doc.status === 'done' ? 'bg-green-500' :
                      doc.status === 'error' ? 'bg-orange-400' : 'bg-yellow-400'
                    }`} />
                    <span
                      className="flex-1 text-xs dark:text-claude-darkText text-claude-text truncate"
                      title={doc.file_path}
                    >
                      {doc.file_path.split(/[/\\]/).pop()}
                    </span>
                    {doc.status === 'done' && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {t('kbChunkCount', { n: doc.chunk_count ?? 0 })}
                      </span>
                    )}
                    {doc.status === 'error' && (
                      <span className="shrink-0 text-xs text-orange-400" title={doc.error_msg ?? ''}>
                        {t('kbDocStatusError')}
                      </span>
                    )}
                    {doc.status !== 'done' && doc.status !== 'error' && (
                      <span className="shrink-0 text-xs text-yellow-400">{t('kbDocStatusPending')}</span>
                    )}
                  </div>
                ))}
                {hasMore && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="w-full px-4 py-2.5 text-xs text-center dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {expanded ? t('kbCollapse') : t('kbShowAll', { n: docs.length })}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Trigger Words */}
        <section className="dark:bg-claude-darkSurface bg-claude-surface rounded-xl border dark:border-claude-darkBorder border-claude-border px-4 py-3 space-y-2">
          <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
            {t('kbTriggerWords')}
          </div>
          <input
            type="text"
            value={config.trigger_words}
            onChange={(e) => void handleSaveConfig({ trigger_words: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted dark:text-claude-darkText text-claude-text border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-1 focus:ring-claude-accent"
          />
          <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {t('kbTriggerWordsHint')}
          </p>
        </section>

      </div>
    </div>
  );
};

export default KBManagePage;
