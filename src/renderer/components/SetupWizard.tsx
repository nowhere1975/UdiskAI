import React, { useState, useCallback } from 'react';
import { i18nService } from '../services/i18n';
import { configService } from '../services/config';
import { AppConfig } from '../config';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

interface Provider {
  key: string;
  label: string;
  baseUrl: string;
  apiFormat: 'anthropic' | 'openai';
  defaultModel: string;
  defaultModelName: string;
  getKeyUrl: string;
}

const PROVIDERS: Provider[] = [
  {
    key: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    apiFormat: 'anthropic',
    defaultModel: 'deepseek-chat',
    defaultModelName: 'DeepSeek Chat',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    key: 'moonshot',
    label: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    apiFormat: 'anthropic',
    defaultModel: 'kimi-k2.5',
    defaultModelName: 'Kimi K2.5',
    getKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    key: 'qwen',
    label: '通义千问（阿里云）',
    baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    apiFormat: 'anthropic',
    defaultModel: 'qwen3.5-plus',
    defaultModelName: 'Qwen3.5 Plus',
    getKeyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    key: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    apiFormat: 'anthropic',
    defaultModel: 'glm-4.7',
    defaultModelName: 'GLM 4.7',
    getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    key: 'volcengine',
    label: '豆包（字节跳动）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/compatible',
    apiFormat: 'anthropic',
    defaultModel: 'doubao-seed-2-0-pro-260215',
    defaultModelName: 'Doubao-Seed-2.0-pro',
    getKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  },
];

type Step = 'welcome' | 'provider' | 'apikey';

interface SetupWizardProps {
  onComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyError, setKeyError] = useState('');

  const t = useCallback((key: string) => i18nService.t(key), []);

  const handleSelectProvider = useCallback((p: Provider) => {
    setSelectedProvider(p);
    setApiKey('');
    setKeyError('');
    setStep('apikey');
  }, []);

  const handleFinish = useCallback(async () => {
    if (!selectedProvider) return;
    if (!apiKey.trim()) {
      setKeyError(t('setupWizardApiKeyEmpty'));
      return;
    }
    setSaving(true);
    setKeyError('');

    try {
      const config = configService.getConfig();
      const providers = { ...(config.providers ?? {}) };

      // Enable the selected provider with the entered key
      providers[selectedProvider.key] = {
        ...(providers[selectedProvider.key] ?? {}),
        enabled: true,
        apiKey: apiKey.trim(),
        baseUrl: selectedProvider.baseUrl,
        apiFormat: selectedProvider.apiFormat,
        models: providers[selectedProvider.key]?.models ?? [
          { id: selectedProvider.defaultModel, name: selectedProvider.defaultModelName },
        ],
      };

      await configService.updateConfig({
        providers: providers as AppConfig['providers'],
        model: {
          ...config.model,
          defaultModel: selectedProvider.defaultModel,
          defaultModelProvider: selectedProvider.key,
        },
      });

      onComplete();
    } finally {
      setSaving(false);
    }
  }, [selectedProvider, apiKey, t, onComplete]);

  const handleOpenUrl = useCallback((url: string) => {
    window.electron.shell.openExternal(url);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl dark:bg-claude-darkSurface bg-white overflow-hidden">

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-6 pb-2">
          {(['welcome', 'provider', 'apikey'] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-6 bg-claude-accent'
                  : step === 'apikey' && s === 'provider'
                    ? 'w-1.5 bg-claude-accent/50'
                    : step === 'provider' && s === 'welcome'
                      ? 'w-1.5 bg-claude-accent/50'
                      : 'w-1.5 dark:bg-claude-darkBorder bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* ── Welcome ──────────────────────────────────────── */}
        {step === 'welcome' && (
          <div className="flex flex-col items-center px-8 pb-8 pt-4 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-claude-accent to-claude-accentHover flex items-center justify-center shadow-glow-accent mb-5">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold dark:text-claude-darkText text-claude-text mb-3">
              {t('setupWizardWelcomeTitle')}
            </h1>
            <p className="text-sm dark:text-claude-darkTextMuted text-claude-textMuted mb-8 leading-relaxed">
              {t('setupWizardWelcomeDesc')}
            </p>
            <button
              onClick={() => setStep('provider')}
              className="w-full py-3 rounded-xl bg-claude-accent hover:bg-claude-accentHover text-white font-medium transition-colors shadow-md"
            >
              {t('setupWizardWelcomeStart')}
            </button>
            <button
              onClick={onComplete}
              className="mt-3 text-sm dark:text-claude-darkTextMuted text-claude-textMuted hover:underline"
            >
              {t('setupWizardSkip')}
            </button>
          </div>
        )}

        {/* ── Provider ─────────────────────────────────────── */}
        {step === 'provider' && (
          <div className="px-6 pb-8 pt-2">
            <h2 className="text-xl font-bold dark:text-claude-darkText text-claude-text mb-1">
              {t('setupWizardProviderTitle')}
            </h2>
            <p className="text-sm dark:text-claude-darkTextMuted text-claude-textMuted mb-5">
              {t('setupWizardProviderDesc')}
            </p>
            <div className="space-y-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleSelectProvider(p)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border dark:border-claude-darkBorder border-gray-200 dark:bg-claude-darkBg bg-gray-50 hover:border-claude-accent dark:hover:border-claude-accent hover:bg-claude-accent/5 transition-all text-left group"
                >
                  <span className="font-medium dark:text-claude-darkText text-claude-text text-sm">
                    {p.label}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 dark:text-claude-darkTextMuted text-claude-textMuted group-hover:text-claude-accent transition-colors" />
                </button>
              ))}
            </div>
            <button
              onClick={onComplete}
              className="mt-5 w-full text-center text-sm dark:text-claude-darkTextMuted text-claude-textMuted hover:underline"
            >
              {t('setupWizardSkip')}
            </button>
          </div>
        )}

        {/* ── API Key ──────────────────────────────────────── */}
        {step === 'apikey' && selectedProvider && (
          <div className="px-6 pb-8 pt-2">
            <h2 className="text-xl font-bold dark:text-claude-darkText text-claude-text mb-1">
              {t('setupWizardApiKeyTitle')}
            </h2>
            <p className="text-sm dark:text-claude-darkTextMuted text-claude-textMuted mb-5">
              {selectedProvider.label}
            </p>

            <div className="relative mb-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyError(''); }}
                placeholder={t('setupWizardApiKeyPlaceholder')}
                autoFocus
                className="w-full pr-10 pl-4 py-3 rounded-xl border dark:border-claude-darkBorder border-gray-200 dark:bg-claude-darkBg bg-gray-50 dark:text-claude-darkText text-claude-text text-sm outline-none focus:border-claude-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 dark:text-claude-darkTextMuted text-claude-textMuted hover:text-claude-accent transition-colors"
                tabIndex={-1}
              >
                {showKey
                  ? <EyeSlashIcon className="h-4 w-4" />
                  : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>

            {keyError && (
              <p className="text-xs text-red-500 mb-3 pl-1">{keyError}</p>
            )}

            <button
              onClick={() => handleOpenUrl(selectedProvider.getKeyUrl)}
              className="text-xs text-claude-accent hover:underline mb-5 block"
            >
              {t('setupWizardApiKeyGetKey')}
            </button>

            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-claude-accent hover:bg-claude-accentHover disabled:opacity-60 text-white font-medium transition-colors shadow-md mb-3"
            >
              {saving ? t('setupWizardApiKeyTesting') : t('setupWizardApiKeyFinish')}
            </button>

            <button
              onClick={() => setStep('provider')}
              className="w-full text-center text-sm dark:text-claude-darkTextMuted text-claude-textMuted hover:underline"
            >
              {t('setupWizardBack')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupWizard;
