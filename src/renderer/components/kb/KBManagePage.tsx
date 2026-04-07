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
            onClick={() => void handleAddFolder()}
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
                    {folder.doc_count ?? 0} 份文档 ·{' '}
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
