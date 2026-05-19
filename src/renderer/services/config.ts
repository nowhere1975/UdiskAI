import { AppConfig, CONFIG_KEYS, defaultConfig } from '../config';
import { localStore } from './store';

const getFixedProviderApiFormat = (providerKey: string): 'anthropic' | 'openai' | null => {
  if (providerKey === 'openai' || providerKey === 'gemini' || providerKey === 'stepfun' || providerKey === 'youdaozhiyun') {
    return 'openai';
  }
  if (providerKey === 'anthropic') {
    return 'anthropic';
  }
  return null;
};

const normalizeProviderBaseUrl = (providerKey: string, baseUrl: unknown): string => {
  if (typeof baseUrl !== 'string') {
    return '';
  }

  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (providerKey !== 'gemini') {
    return normalized;
  }

  if (!normalized || !normalized.includes('generativelanguage.googleapis.com')) {
    return normalized;
  }

  if (normalized.endsWith('/v1beta/openai') || normalized.endsWith('/v1/openai')) {
    return normalized;
  }
  if (normalized.endsWith('/v1beta')) {
    return `${normalized}/openai`;
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized.slice(0, -3)}v1beta/openai`;
  }

  return 'https://generativelanguage.googleapis.com/v1beta/openai';
};

const normalizeProviderApiFormat = (providerKey: string, apiFormat: unknown): 'anthropic' | 'openai' => {
  const fixed = getFixedProviderApiFormat(providerKey);
  if (fixed) {
    return fixed;
  }
  if (apiFormat === 'openai') {
    return 'openai';
  }
  return 'anthropic';
};

const normalizeProvidersConfig = (providers: AppConfig['providers']): AppConfig['providers'] => {
  if (!providers) {
    return providers;
  }

  return Object.fromEntries(
    Object.entries(providers).map(([providerKey, providerConfig]) => [
      providerKey,
      {
        ...providerConfig,
        baseUrl: normalizeProviderBaseUrl(providerKey, providerConfig.baseUrl),
        apiFormat: normalizeProviderApiFormat(providerKey, providerConfig.apiFormat),
      },
    ])
  ) as AppConfig['providers'];
};

// Model IDs that have been removed from specific providers.
// These will be filtered out from saved configs during migration.
const REMOVED_PROVIDER_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat'],
  qwen: ['qwen3-coder-plus'],
  youdaozhiyun: ['deepseek-chat', 'deepseek-inhouse-chat'],
  qianfan: ['deepseek-v3.2', 'deepseek-r1', 'glm-5', 'ernie-4.5-8k', 'ernie-4.5-turbo-8k'],
  openai: ['gpt-5.2-2025-12-11', 'gpt-5.2', 'gpt-5.3-codex', 'gpt-5.2-codex'],
  gemini: ['gemini-3-pro-preview'],
  anthropic: ['claude-sonnet-4-5-20250929'],
  openrouter: [
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-opus-4.6',
    'openai/gpt-5.2-codex',
    'google/gemini-3-pro-preview',
  ],
};

// Models to inject into existing saved configs (for existing users).
// These models will be added on every startup if missing from the stored config.
// Note: users cannot permanently remove these models — they will be re-injected
// on next launch. Once all users have upgraded, entries here should be removed
// so the models follow normal user-editable behavior (same as other models).
// position: 'start' inserts at the beginning, 'end' appends at the end.
const ADDED_PROVIDER_MODELS: Record<string, { models: Array<{ id: string; name: string; supportsImage?: boolean }>; position: 'start' | 'end' }> = {
  deepseek: {
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsImage: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', supportsImage: false },
    ],
    position: 'start',
  },
  moonshot: {
    models: [
      { id: 'kimi-k2.6', name: 'Kimi K2.6', supportsImage: true },
      { id: 'kimi-k2.5', name: 'Kimi K2.5', supportsImage: true },
    ],
    position: 'start',
  },
  qwen: {
    models: [
      { id: 'qwen3.6-plus', name: 'Qwen3.6 Plus', supportsImage: true },
      { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', supportsImage: true },
    ],
    position: 'start',
  },
  zhipu: {
    models: [
      { id: 'glm-5.1', name: 'GLM 5.1', supportsImage: false },
      { id: 'glm-5', name: 'GLM 5', supportsImage: false },
      { id: 'glm-4.7', name: 'GLM 4.7', supportsImage: false },
    ],
    position: 'start',
  },
  minimax: {
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', supportsImage: false },
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', supportsImage: false },
    ],
    position: 'start',
  },
  qianfan: {
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', supportsImage: false },
      { id: 'glm-5.1', name: 'GLM 5.1', supportsImage: false },
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', supportsImage: false },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false },
      { id: 'ernie-4.5-turbo-20260402', name: 'ERNIE 4.5 Turbo', supportsImage: false },
    ],
    position: 'start',
  },
  openai: {
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', supportsImage: true },
      { id: 'gpt-5.5', name: 'GPT-5.5', supportsImage: true },
    ],
    position: 'start',
  },
  gemini: {
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', supportsImage: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', supportsImage: true },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', supportsImage: true },
    ],
    position: 'end',
  },
  anthropic: {
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', supportsImage: true },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', supportsImage: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', supportsImage: true },
    ],
    position: 'start',
  },
  openrouter: {
    models: [
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', supportsImage: true },
      { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', supportsImage: true },
      { id: 'openai/gpt-5.5', name: 'GPT 5.5', supportsImage: true },
      { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', supportsImage: true },
    ],
    position: 'start',
  },
  xiaomi: {
    models: [
      { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', supportsImage: false },
      { id: 'mimo-v2.5', name: 'MiMo V2.5', supportsImage: true },
      { id: 'mimo-v2-pro', name: 'MiMo V2 Pro', supportsImage: false },
      { id: 'mimo-v2-omni', name: 'MiMo V2 Omni', supportsImage: true },
      { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', supportsImage: false },
    ],
    position: 'end',
  },
};

class ConfigService {
  private config: AppConfig = defaultConfig;

  async init() {
    try {
      const storedConfig = await localStore.getItem<AppConfig>(CONFIG_KEYS.APP_CONFIG);
      if (storedConfig) {
        const mergedProviders = storedConfig.providers
          ? Object.fromEntries(
              Object.entries({
                ...(defaultConfig.providers ?? {}),
                ...storedConfig.providers,
              }).map(([providerKey, providerConfig]) => [
                providerKey,
                (() => {
                  const mergedProvider = {
                    ...(defaultConfig.providers as Record<string, any>)?.[providerKey],
                    ...providerConfig,
                  };
                  // Filter out removed models
                  const removedIds = REMOVED_PROVIDER_MODELS[providerKey];
                  if (removedIds && mergedProvider.models) {
                    mergedProvider.models = mergedProvider.models.filter(
                      (m: { id: string }) => !removedIds.includes(m.id)
                    );
                  }
                  // Inject added models (for existing users who already have saved config)
                  const addedConfig = ADDED_PROVIDER_MODELS[providerKey];
                  if (addedConfig && mergedProvider.models) {
                    const existingIds = new Set(mergedProvider.models.map((m: { id: string }) => m.id));
                    const newModels = addedConfig.models.filter(m => !existingIds.has(m.id));
                    if (newModels.length > 0) {
                      mergedProvider.models = addedConfig.position === 'start'
                        ? [...newModels, ...mergedProvider.models]
                        : [...mergedProvider.models, ...newModels];
                    }
                  }
                  return {
                    ...mergedProvider,
                    baseUrl: normalizeProviderBaseUrl(providerKey, mergedProvider.baseUrl),
                    apiFormat: normalizeProviderApiFormat(providerKey, mergedProvider.apiFormat),
                  };
                })(),
              ])
            )
          : defaultConfig.providers;

        // Migrate model.defaultModel if it was removed
        const allRemovedIds = Object.values(REMOVED_PROVIDER_MODELS).flat();
        const migratedModel = { ...defaultConfig.model, ...storedConfig.model };
        if (allRemovedIds.includes(migratedModel.defaultModel)) {
          migratedModel.defaultModel = defaultConfig.model.defaultModel;
        }
        if (migratedModel.availableModels) {
          migratedModel.availableModels = migratedModel.availableModels.filter(
            (m: { id: string }) => !allRemovedIds.includes(m.id)
          );
        }

        this.config = {
          ...defaultConfig,
          ...storedConfig,
          api: {
            ...defaultConfig.api,
            ...storedConfig.api,
          },
          model: migratedModel,
          app: {
            ...defaultConfig.app,
            ...storedConfig.app,
          },
          shortcuts: {
            ...defaultConfig.shortcuts!,
            ...(storedConfig.shortcuts ?? {}),
          } as AppConfig['shortcuts'],
          providers: mergedProviders as AppConfig['providers'],
        };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  async updateConfig(newConfig: Partial<AppConfig>) {
    const normalizedProviders = normalizeProvidersConfig(newConfig.providers as AppConfig['providers'] | undefined);
    this.config = {
      ...this.config,
      ...newConfig,
      ...(normalizedProviders ? { providers: normalizedProviders } : {}),
    };
    await localStore.setItem(CONFIG_KEYS.APP_CONFIG, this.config);
  }

  getApiConfig() {
    return {
      apiKey: this.config.api.key,
      baseUrl: this.config.api.baseUrl,
    };
  }
}

export const configService = new ConfigService(); 
