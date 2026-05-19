import { ChevronDownIcon, SignalIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { EyeIcon, EyeSlashIcon, XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import React from 'react';

import { defaultConfig } from '../../config';
import { i18nService } from '../../services/i18n';
import {
  AnthropicIcon,
  CustomProviderIcon,
  DeepSeekIcon,
  DoubaoIcon,
  GeminiIcon,
  MiniMaxIcon,
  MoonshotIcon,
  OllamaIcon,
  OpenAIIcon,
  OpenRouterIcon,
  QianfanIcon,
  QwenIcon,
  StepfunIcon,
  XiaomiIcon,
  YouDaoZhiYunIcon,
  ZhipuIcon,
} from '../icons/providers';
import PencilIcon from '../icons/PencilIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import TrashIcon from '../icons/TrashIcon';

type ProviderType =
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'minimax'
  | 'volcengine'
  | 'qwen'
  | 'qianfan'
  | 'youdaozhiyun'
  | 'stepfun'
  | 'xiaomi'
  | 'openrouter'
  | 'ollama'
  | 'custom';

type ProviderModel = {
  id: string;
  name: string;
  supportsImage?: boolean;
  contextWindow?: number;
};

type ProviderConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  apiFormat?: 'anthropic' | 'openai';
  codingPlanEnabled?: boolean;
  models?: ProviderModel[];
  displayName?: string;
};

type ProvidersConfig = Record<string, ProviderConfig>;

type ProviderMeta = Record<ProviderType, { label: string; icon: React.ReactNode }>;

const providerMeta: ProviderMeta = {
  openai: { label: 'OpenAI', icon: <OpenAIIcon /> },
  gemini: { label: 'Gemini', icon: <GeminiIcon /> },
  anthropic: { label: 'Anthropic', icon: <AnthropicIcon /> },
  deepseek: { label: 'DeepSeek', icon: <DeepSeekIcon /> },
  moonshot: { label: 'Moonshot', icon: <MoonshotIcon /> },
  zhipu: { label: 'Zhipu', icon: <ZhipuIcon /> },
  minimax: { label: 'MiniMax', icon: <MiniMaxIcon /> },
  volcengine: { label: '豆包', icon: <DoubaoIcon /> },
  qwen: { label: 'Qwen', icon: <QwenIcon /> },
  qianfan: { label: 'Qianfan', icon: <QianfanIcon /> },
  youdaozhiyun: { label: 'Youdao', icon: <YouDaoZhiYunIcon /> },
  stepfun: { label: 'StepFun', icon: <StepfunIcon /> },
  xiaomi: { label: 'Xiaomi', icon: <XiaomiIcon /> },
  openrouter: { label: 'OpenRouter', icon: <OpenRouterIcon /> },
  ollama: { label: 'Ollama', icon: <OllamaIcon /> },
  custom: { label: 'Custom', icon: <CustomProviderIcon /> },
};

const providerRequiresApiKey = (provider: ProviderType): boolean => provider !== 'ollama';

const getFixedApiFormatForProvider = (provider: string): 'anthropic' | 'openai' | null => {
  if (provider === 'openai' || provider === 'gemini' || provider === 'stepfun' || provider === 'qianfan') {
    return 'openai';
  }
  if (provider === 'youdaozhiyun') {
    return 'openai';
  }
  if (provider === 'anthropic') {
    return 'anthropic';
  }
  return null;
};

const getEffectiveApiFormat = (provider: string, value: unknown): 'anthropic' | 'openai' => (
  getFixedApiFormatForProvider(provider) ?? (value === 'openai' ? 'openai' : 'anthropic')
);

const shouldShowApiFormatSelector = (provider: string): boolean => getFixedApiFormatForProvider(provider) === null;

const getProviderDefaultBaseUrl = (provider: ProviderType, apiFormat: 'anthropic' | 'openai'): string | null => {
  const defaults: Partial<Record<ProviderType, { anthropic: string; openai: string }>> = {
    deepseek: {
      anthropic: 'https://api.deepseek.com/anthropic',
      openai: 'https://api.deepseek.com',
    },
    moonshot: {
      anthropic: 'https://api.moonshot.cn/anthropic',
      openai: 'https://api.moonshot.cn/v1',
    },
    zhipu: {
      anthropic: 'https://open.bigmodel.cn/api/anthropic',
      openai: 'https://open.bigmodel.cn/api/paas/v4',
    },
    minimax: {
      anthropic: 'https://api.minimaxi.com/anthropic',
      openai: 'https://api.minimaxi.com/v1',
    },
    qwen: {
      anthropic: 'https://dashscope.aliyuncs.com/apps/anthropic',
      openai: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    qianfan: {
      anthropic: 'https://qianfan.baidubce.com/v2',
      openai: 'https://qianfan.baidubce.com/v2/coding/chat/completions',
    },
    xiaomi: {
      anthropic: 'https://api.xiaomimimo.com/anthropic',
      openai: 'https://api.xiaomimimo.com/v1/chat/completions',
    },
    volcengine: {
      anthropic: 'https://ark.cn-beijing.volces.com/api/compatible',
      openai: 'https://ark.cn-beijing.volces.com/api/v3',
    },
    openrouter: {
      anthropic: 'https://openrouter.ai/api',
      openai: 'https://openrouter.ai/api/v1',
    },
    ollama: {
      anthropic: 'http://localhost:11434',
      openai: 'http://localhost:11434/v1',
    },
    custom: {
      anthropic: '',
      openai: '',
    },
  };
  const entry = defaults[provider];
  return entry ? entry[apiFormat] : null;
};

const getDisplayBaseUrl = (providerKey: ProviderType, provider: ProviderConfig): string => {
  if (providerKey === 'zhipu' && provider.codingPlanEnabled) {
    return getEffectiveApiFormat('zhipu', provider.apiFormat) === 'anthropic'
      ? 'https://open.bigmodel.cn/api/anthropic'
      : 'https://open.bigmodel.cn/api/coding/paas/v4';
  }
  if (providerKey === 'moonshot' && provider.codingPlanEnabled) {
    return getEffectiveApiFormat('moonshot', provider.apiFormat) === 'anthropic'
      ? 'https://api.kimi.com/coding'
      : 'https://api.kimi.com/coding/v1';
  }
  if (providerKey === 'volcengine' && provider.codingPlanEnabled) {
    return getEffectiveApiFormat('volcengine', provider.apiFormat) === 'anthropic'
      ? 'https://ark.cn-beijing.volces.com/api/coding'
      : 'https://ark.cn-beijing.volces.com/api/coding/v3';
  }
  if (providerKey === 'qianfan' && provider.codingPlanEnabled) {
    return 'https://qianfan.baidubce.com/v2/coding/chat/completions';
  }
  return provider.baseUrl;
};

const CW_MIN = 32000;
const CW_MAX = 2_000_000;
const CW_LOG_MIN = Math.log(CW_MIN);
const CW_LOG_MAX = Math.log(CW_MAX);
const CW_DEFAULT = 200_000;
const CW_SCALE_EXP = 1.5;

function contextWindowToSlider(value: number): number {
  const t = (Math.log(Math.max(CW_MIN, Math.min(CW_MAX, value))) - CW_LOG_MIN) / (CW_LOG_MAX - CW_LOG_MIN);
  return Math.pow(t, CW_SCALE_EXP);
}

function sliderToContextWindow(t: number): number {
  const logT = Math.pow(Math.max(0, Math.min(1, t)), 1 / CW_SCALE_EXP);
  return Math.round(Math.exp(CW_LOG_MIN + logT * (CW_LOG_MAX - CW_LOG_MIN)) / 1000) * 1000;
}

const CW_SNAP_THRESHOLD = 0.025;
const CW_MARKER_STOPS = [
  { label: '32K', value: CW_MIN },
  { label: '64K', value: 64000 },
  { label: '200K', value: 200000 },
  { label: '1M', value: 1000000 },
  { label: '2M', value: CW_MAX },
].map(m => ({ ...m, pos: contextWindowToSlider(m.value) }));

function snapSliderValue(t: number): number {
  for (const m of CW_MARKER_STOPS) {
    if (Math.abs(t - m.pos) < CW_SNAP_THRESHOLD) return m.pos;
  }
  return t;
}

function parseContextWindowInput(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, '');
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/);
  if (!match) return null;
  let num = parseFloat(match[1]);
  if (match[2] === 'k') num *= 1000;
  else if (match[2] === 'm') num *= 1_000_000;
  const result = Math.round(num);
  if (result < CW_MIN || result > CW_MAX) return null;
  return result;
}

function formatContextWindow(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}K`;
  return value.toLocaleString();
}

type ModelSettingsSectionProps = {
  providers: ProvidersConfig;
  visibleProviders: ProvidersConfig;
  activeProvider: ProviderType;
  providerExpanded: boolean;
  setProviderExpanded: (value: boolean) => void;
  showApiKey: boolean;
  setShowApiKey: (value: boolean) => void;
  isImportingProviders: boolean;
  isExportingProviders: boolean;
  importInputRef: React.RefObject<HTMLInputElement>;
  handleImportProvidersClick: () => void;
  handleExportProviders: () => void;
  handleImportProviders: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleProviderChange: (provider: ProviderType) => void;
  toggleProviderEnabled: (provider: ProviderType) => void;
  handleProviderConfigChange: (provider: ProviderType, field: string, value: string) => void;
  handleTestConnection: () => void;
  isTesting: boolean;
  handleAddModel: () => void;
  handleEditModel: (modelId: string, modelName: string, supportsImage?: boolean, contextWindow?: number) => void;
  handleDeleteModel: (modelId: string) => void;
  isAddingModel: boolean;
  isEditingModel: boolean;
  newModelName: string;
  setNewModelName: (value: string) => void;
  newModelId: string;
  setNewModelId: (value: string) => void;
  newModelSupportsImage: boolean;
  setNewModelSupportsImage: (value: boolean) => void;
  newModelContextWindow?: number;
  setNewModelContextWindow: (value: number | undefined) => void;
  modelFormError: string | null;
  setModelFormError: (value: string | null) => void;
  handleSaveNewModel: () => void;
  handleCancelModelEdit: () => void;
  handleModelDialogKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

const ModelSettingsSection: React.FC<ModelSettingsSectionProps> = ({
  providers,
  visibleProviders,
  activeProvider,
  providerExpanded,
  setProviderExpanded,
  showApiKey,
  setShowApiKey,
  isImportingProviders,
  isExportingProviders,
  importInputRef,
  handleImportProvidersClick,
  handleExportProviders,
  handleImportProviders,
  handleProviderChange,
  toggleProviderEnabled,
  handleProviderConfigChange,
  handleTestConnection,
  isTesting,
  handleAddModel,
  handleEditModel,
  handleDeleteModel,
  isAddingModel,
  isEditingModel,
  newModelName,
  setNewModelName,
  newModelId,
  setNewModelId,
  newModelSupportsImage,
  setNewModelSupportsImage,
  newModelContextWindow,
  setNewModelContextWindow,
  modelFormError,
  setModelFormError,
  handleSaveNewModel,
  handleCancelModelEdit,
  handleModelDialogKeyDown,
}) => {
  const [newModelContextWindowText, setNewModelContextWindowText] = React.useState<string | null>(null);
  const wasModelDialogOpenRef = React.useRef(false);

  React.useEffect(() => {
    const isOpen = isAddingModel || isEditingModel;
    if (isOpen && !wasModelDialogOpenRef.current) {
      setNewModelContextWindowText(null);
    }
    wasModelDialogOpenRef.current = isOpen;
  }, [isAddingModel, isEditingModel]);

  return (
    <div className="flex-shrink-0 pb-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
          {i18nService.t('onboardingOwnKey')}
        </span>
        <div className="flex items-center gap-1.5">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportProviders}
          />
          <button
            type="button"
            onClick={handleImportProvidersClick}
            disabled={isImportingProviders || isExportingProviders}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurface hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {i18nService.t('import')}
          </button>
          <button
            type="button"
            onClick={handleExportProviders}
            disabled={isImportingProviders || isExportingProviders}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurface hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {i18nService.t('export')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {Object.entries(visibleProviders).map(([provider, config]) => {
          const providerKey = provider as ProviderType;
          const providerInfo = providerMeta[providerKey];
          const isOpen = activeProvider === providerKey && providerExpanded;
          const missingApiKey = providerRequiresApiKey(providerKey) && !config.apiKey.trim();
          const canToggle = config.enabled || !missingApiKey;
          const displayBaseUrl = getDisplayBaseUrl(providerKey, providers[providerKey] ?? config);

          return (
            <div
              key={provider}
              className={`rounded-xl border transition-colors duration-150 dark:bg-claude-darkSurface bg-white ${
                isOpen
                  ? 'dark:border-claude-accent/40 border-claude-accent/30'
                  : 'dark:border-claude-darkBorder border-gray-200'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (isOpen) {
                    setProviderExpanded(false);
                  } else {
                    handleProviderChange(providerKey);
                    setProviderExpanded(true);
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl dark:hover:bg-claude-darkSurfaceHover hover:bg-gray-50 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg dark:bg-claude-darkBg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  {providerInfo?.icon}
                </div>
                <span className="flex-1 text-sm font-medium dark:text-claude-darkText text-claude-text">
                  {providerInfo?.label ?? provider.charAt(0).toUpperCase() + provider.slice(1)}
                </span>
                {config.enabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium flex-shrink-0">
                    {i18nService.t('providerStatusOn')}
                  </span>
                )}
                <div
                  title={!canToggle ? i18nService.t('configureApiKey') : undefined}
                  className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${
                    config.enabled ? 'bg-claude-accent' : 'dark:bg-claude-darkBorder bg-gray-300'
                  } ${canToggle ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canToggle) toggleProviderEnabled(providerKey);
                  }}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    config.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 dark:text-claude-darkTextSecondary text-claude-textSecondary ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="border-t dark:border-claude-darkBorder border-gray-100 px-4 pb-5 pt-4 space-y-4">
                  {providerRequiresApiKey(providerKey) && (
                    <div>
                      <label htmlFor={`${providerKey}-apiKey`} className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-1.5">
                        {i18nService.t('apiKey')}
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          id={`${providerKey}-apiKey`}
                          value={providers[providerKey].apiKey}
                          onChange={(e) => handleProviderConfigChange(providerKey, 'apiKey', e.target.value)}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-xs"
                          placeholder={i18nService.t('apiKeyPlaceholder')}
                        />
                        <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                          {providers[providerKey].apiKey && (
                            <button
                              type="button"
                              onClick={() => handleProviderConfigChange(providerKey, 'apiKey', '')}
                              className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                            >
                              <XCircleIconSolid className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                          >
                            {showApiKey ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor={`${providerKey}-baseUrl`} className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-1.5">
                      {i18nService.t('baseUrl')}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id={`${providerKey}-baseUrl`}
                        value={displayBaseUrl}
                        onChange={(e) => handleProviderConfigChange(providerKey, 'baseUrl', e.target.value)}
                        disabled={(providerKey === 'zhipu' && providers.zhipu.codingPlanEnabled) || (providerKey === 'moonshot' && providers.moonshot.codingPlanEnabled) || (providerKey === 'volcengine' && providers.volcengine.codingPlanEnabled) || (providerKey === 'qianfan' && providers.qianfan.codingPlanEnabled)}
                        className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-xs"
                        placeholder={getProviderDefaultBaseUrl(providerKey, getEffectiveApiFormat(providerKey, providers[providerKey].apiFormat)) || defaultConfig.providers?.[providerKey]?.baseUrl || i18nService.t('baseUrlPlaceholder')}
                      />
                      {providers[providerKey].baseUrl && !(providerKey === 'zhipu' && providers.zhipu.codingPlanEnabled) && !(providerKey === 'moonshot' && providers.moonshot.codingPlanEnabled) && !(providerKey === 'volcengine' && providers.volcengine.codingPlanEnabled) && !(providerKey === 'qianfan' && providers.qianfan.codingPlanEnabled) && (
                        <div className="absolute right-2 inset-y-0 flex items-center">
                          <button
                            type="button"
                            onClick={() => handleProviderConfigChange(providerKey, 'baseUrl', '')}
                            className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                          >
                            <XCircleIconSolid className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {shouldShowApiFormatSelector(providerKey) && (
                    <div>
                      <label className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-1.5">
                        {i18nService.t('apiFormat')}
                      </label>
                      <div className="flex gap-2">
                        {(['anthropic', 'openai'] as const).map((fmt) => (
                          <label key={fmt} className={`flex-1 flex items-center justify-center py-2 px-3 rounded-xl border cursor-pointer transition-colors text-xs font-medium ${
                            getEffectiveApiFormat(providerKey, providers[providerKey].apiFormat) === fmt
                              ? 'dark:border-claude-accent/50 border-claude-accent/50 dark:bg-claude-accent/10 bg-claude-accent/5 text-claude-accent'
                              : 'dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurface hover:bg-gray-50'
                          }`}>
                            <input type="radio" name={`${providerKey}-apiFormat`} value={fmt}
                              checked={getEffectiveApiFormat(providerKey, providers[providerKey].apiFormat) === fmt}
                              onChange={() => handleProviderConfigChange(providerKey, 'apiFormat', fmt)}
                              className="sr-only"
                            />
                            {fmt === 'anthropic' ? i18nService.t('apiFormatNative') : 'OpenAI'}
                          </label>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {i18nService.t('apiFormatHint')}
                      </p>
                    </div>
                  )}

                  {(providerKey === 'zhipu' || providerKey === 'moonshot' || providerKey === 'volcengine' || providerKey === 'qianfan') && (
                    <div className="flex items-center justify-between p-3 rounded-xl dark:bg-claude-darkSurface/50 bg-claude-surface/50 border dark:border-claude-darkBorder border-claude-border">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium dark:text-claude-darkText text-claude-text">
                            {providerKey === 'zhipu' ? 'GLM Coding Plan' : 'Coding Plan'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-claude-accent/10 text-claude-accent">Beta</span>
                        </div>
                        <p className="mt-0.5 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                          {providerKey === 'zhipu'
                            ? i18nService.t('zhipuCodingPlanHint')
                            : providerKey === 'volcengine'
                              ? i18nService.t('volcengineCodingPlanHint')
                              : providerKey === 'qianfan'
                                ? i18nService.t('qianfanCodingPlanHint')
                                : i18nService.t('moonshotCodingPlanHint')}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-3">
                        <input
                          type="checkbox"
                          checked={providers[providerKey].codingPlanEnabled ?? false}
                          onChange={(e) => handleProviderConfigChange(providerKey, 'codingPlanEnabled', e.target.checked ? 'true' : 'false')}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-claude-accent/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-claude-accent"></div>
                      </label>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium dark:text-claude-darkText text-claude-text">
                      {i18nService.t('availableModels')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || (providerRequiresApiKey(providerKey) && !providers[providerKey].apiKey)}
                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-xl border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <SignalIcon className="h-3.5 w-3.5 mr-1.5" />
                        {isTesting ? i18nService.t('testing') : i18nService.t('testConnection')}
                      </button>
                      <button
                        type="button"
                        onClick={handleAddModel}
                        className="inline-flex items-center text-xs text-claude-accent hover:text-claude-accentHover"
                      >
                        <PlusCircleIcon className="h-3.5 w-3.5 mr-1" />
                        {i18nService.t('addModel')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {providers[providerKey].models?.map((model) => (
                      <div key={model.id} className="dark:bg-claude-darkSurface/50 bg-claude-surface/50 p-2 rounded-xl dark:border-claude-darkBorder border-claude-border border transition-colors hover:border-claude-accent group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                            <span className="dark:text-claude-darkText text-claude-text font-medium text-[11px]">{model.name}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-[10px] px-1.5 py-0.5 bg-claude-surfaceHover dark:bg-claude-darkSurfaceHover rounded-md dark:text-claude-darkTextSecondary text-claude-textSecondary">{model.id}</span>
                            {model.supportsImage && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-claude-accent/10 text-claude-accent">{i18nService.t('imageInput')}</span>
                            )}
                            <button type="button" onClick={() => handleEditModel(model.id, model.name, model.supportsImage, model.contextWindow)} className="p-0.5 dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-accent opacity-0 group-hover:opacity-100 transition-opacity">
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDeleteModel(model.id)} className="p-0.5 dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!providers[providerKey].models || providers[providerKey].models.length === 0) && (
                      <div className="dark:bg-claude-darkSurface/20 bg-claude-surface/20 p-2.5 rounded-xl border dark:border-claude-darkBorder/50 border-claude-border/50 text-center">
                        <p className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">{i18nService.t('noModelsAvailable')}</p>
                        <button type="button" onClick={handleAddModel} className="mt-1.5 inline-flex items-center text-[11px] font-medium text-claude-accent hover:text-claude-accentHover">
                          <PlusCircleIcon className="h-3 w-3 mr-1" />
                          {i18nService.t('addFirstModel')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(isAddingModel || isEditingModel) && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4 rounded-2xl"
          onClick={handleCancelModelEdit}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isEditingModel ? i18nService.t('editModel') : i18nService.t('addNewModel')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModelDialogKeyDown}
            className="w-full max-w-md rounded-2xl dark:bg-claude-darkSurface bg-claude-bg dark:border-claude-darkBorder border-claude-border border shadow-modal p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                {isEditingModel ? i18nService.t('editModel') : i18nService.t('addNewModel')}
              </h4>
              <button
                type="button"
                onClick={handleCancelModelEdit}
                className="p-1 dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:text-claude-darkText hover:text-claude-text rounded-md dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover"
              >
                <XCircleIcon className="h-4 w-4" />
              </button>
            </div>

            {modelFormError && (
              <p className="mb-3 text-xs text-red-600 dark:text-red-400">
                {modelFormError}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                  {i18nService.t('modelName')}
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newModelName}
                  onChange={(e) => {
                    setNewModelName(e.target.value);
                    if (modelFormError) setModelFormError(null);
                  }}
                  className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                  placeholder="GPT-4"
                />
              </div>
              <div>
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                  {i18nService.t('modelId')}
                </label>
                <input
                  type="text"
                  value={newModelId}
                  onChange={(e) => {
                    setNewModelId(e.target.value);
                    if (modelFormError) setModelFormError(null);
                  }}
                  className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                  placeholder="gpt-4"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  id="supportsImage"
                  type="checkbox"
                  checked={newModelSupportsImage}
                  onChange={(e) => setNewModelSupportsImage(e.target.checked)}
                  className="h-3.5 w-3.5 text-claude-accent focus:ring-claude-accent dark:bg-claude-darkSurface bg-claude-surface border-claude-border dark:border-claude-darkBorder rounded"
                />
                <label htmlFor="supportsImage" className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {i18nService.t('supportsImageInput')}
                </label>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {i18nService.t('contextWindow')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newModelContextWindowText ?? formatContextWindow(newModelContextWindow ?? CW_DEFAULT)}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setNewModelContextWindowText(nextValue);
                    const parsed = parseContextWindowInput(nextValue);
                    if (parsed !== null) {
                      setNewModelContextWindow(parsed);
                    }
                    if (modelFormError) setModelFormError(null);
                  }}
                  className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                  placeholder="200K"
                />
                <div className="relative h-10 px-2">
                  <div className="absolute left-2 right-2 top-4 h-1 rounded-full bg-claude-surfaceHover dark:bg-claude-darkSurfaceHover" />
                  {CW_MARKER_STOPS.map((stop) => (
                    <div
                      key={stop.label}
                      className="absolute top-3 flex flex-col items-center"
                      style={{ left: `${stop.pos * 100}%`, transform: 'translateX(-50%)' }}
                    >
                      <div className="h-2 w-0.5 rounded bg-claude-border dark:bg-claude-darkBorder" />
                      <span className="mt-1 text-[10px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                        {stop.label}
                      </span>
                    </div>
                  ))}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.001"
                    value={contextWindowToSlider(newModelContextWindow ?? CW_DEFAULT)}
                    onChange={(e) => {
                      const snapped = snapSliderValue(Number(e.target.value));
                      setNewModelContextWindow(sliderToContextWindow(snapped));
                      setNewModelContextWindowText(null);
                      if (modelFormError) setModelFormError(null);
                    }}
                    className="absolute inset-0 w-full h-full appearance-none cursor-pointer bg-transparent z-[2] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-claude-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.2)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-runnable-track]:bg-transparent"
                  />
                </div>
                <p className="text-[11px] dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70">
                  {i18nService.t('contextWindowHint')}
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={handleCancelModelEdit}
                className="px-3 py-1.5 text-xs dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl border dark:border-claude-darkBorder border-claude-border"
              >
                {i18nService.t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveNewModel}
                className="px-3 py-1.5 text-xs text-white bg-claude-accent hover:bg-claude-accentHover rounded-xl active:scale-[0.98]"
              >
                {i18nService.t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSettingsSection;
