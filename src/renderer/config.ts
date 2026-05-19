export interface ProviderModelConfig {
  id: string;
  name: string;
  supportsImage?: boolean;
  contextWindow?: number;
}

// 配置类型定义
export interface AppConfig {
  // API 配置
  api: {
    key: string;
    baseUrl: string;
  };
  // 模型配置
  model: {
    availableModels: ProviderModelConfig[];
    defaultModel: string;
    defaultModelProvider?: string;
  };
  // 多模型提供商配置
  providers?: {
    openai: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      // API 协议格式：anthropic 为 Anthropic 兼容，openai 为 OpenAI 兼容
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    deepseek: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    moonshot: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      /** 是否启用 Moonshot Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      models?: ProviderModelConfig[];
    };
    zhipu: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      /** 是否启用 GLM Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      models?: ProviderModelConfig[];
    };
    minimax: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    youdaozhiyun: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    qwen: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      /** 是否启用 Qwen Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      models?: ProviderModelConfig[];
    };
    qianfan: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      /** 是否启用 Qianfan Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      models?: ProviderModelConfig[];
    };
    openrouter: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    gemini: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    anthropic: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    volcengine: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      /** 是否启用 Volcengine Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      models?: ProviderModelConfig[];
    };
    xiaomi: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    stepfun: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    ollama: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    custom: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      models?: ProviderModelConfig[];
    };
    [key: string]: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai';
      codingPlanEnabled?: boolean;
      models?: ProviderModelConfig[];
    };
  };
  // 主题配置
  theme: 'light' | 'dark' | 'system';
  // 语言配置
  language: 'zh' | 'en';
  // 是否使用系统代理
  useSystemProxy: boolean;
  // 语言初始化标记 (用于判断是否是首次启动)
  language_initialized?: boolean;
  // 应用配置
  app: {
    port: number;
    isDevelopment: boolean;
    testMode?: boolean;
  };
  // 快捷键配置
  shortcuts?: {
    newChat: string;
    search: string;
    settings: string;
    [key: string]: string | undefined;
  };
}

// 默认配置
export const defaultConfig: AppConfig = {
  api: {
    key: '',
    baseUrl: 'https://api.deepseek.com/anthropic',
  },
  model: {
    availableModels: [
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', supportsImage: false },
    ],
    defaultModel: 'deepseek-reasoner',
    defaultModelProvider: 'deepseek',
  },
  providers: {
    openai: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.openai.com',
      apiFormat: 'openai',
      models: [
        { id: 'gpt-5.4', name: 'GPT-5.4', supportsImage: true },
        { id: 'gpt-5.5', name: 'GPT-5.5', supportsImage: true }
      ]
    },
    gemini: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiFormat: 'openai',
      models: [
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', supportsImage: true }
      ]
    },
    anthropic: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      apiFormat: 'anthropic',
      models: [
        { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', supportsImage: true }
      ]
    },
    deepseek: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiFormat: 'anthropic',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsImage: false }
      ]
    },
    moonshot: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.moonshot.cn/anthropic',
      apiFormat: 'anthropic',
      codingPlanEnabled: false,
      models: [
        { id: 'kimi-k2.6', name: 'Kimi K2.6', supportsImage: true }
      ]
    },
    zhipu: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      apiFormat: 'anthropic',
      codingPlanEnabled: false,
      models: [
        { id: 'glm-5.1', name: 'GLM 5.1', supportsImage: false }
      ]
    },
    minimax: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiFormat: 'anthropic',
      models: [
        { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', supportsImage: false }
      ]
    },
    youdaozhiyun: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://openapi.youdao.com/llmgateway/api/v1/chat/completions',
      apiFormat: 'openai',
      models: [
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', supportsImage: false },
        { id: 'deepseek-inhouse-reasoner', name: 'DeepSeek Reasoner (安全)', supportsImage: false }
      ]
    },
    qwen: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
      apiFormat: 'anthropic',
      codingPlanEnabled: false,
      models: [
        { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', supportsImage: true }
      ]
    },
    qianfan: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://qianfan.baidubce.com/v2',
      apiFormat: 'openai',
      codingPlanEnabled: false,
      models: [
        { id: 'kimi-k2.5', name: 'Kimi K2.5', supportsImage: false },
        { id: 'glm-5.1', name: 'GLM 5.1', supportsImage: false },
        { id: 'minimax-m2.5', name: 'MiniMax M2.5', supportsImage: false },
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false },
        { id: 'ernie-4.5-turbo-20260402', name: 'ERNIE 4.5 Turbo', supportsImage: false }
      ]
    },
    xiaomi: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.xiaomimimo.com/anthropic',
      apiFormat: 'anthropic',
      models: [
        { id: 'mimo-v2-omni', name: 'MiMo V2 Omni', supportsImage: true }
      ]
    },
    stepfun: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.stepfun.com/v1',
      apiFormat: 'openai',
      models: [
        { id: 'step-3.5-flash', name: 'Step 3.5 Flash', supportsImage: false }
      ]
    },
    volcengine: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/compatible',
      apiFormat: 'anthropic',
      codingPlanEnabled: false,
      models: [
        { id: 'ark-code-latest', name: 'Auto', supportsImage: false },
        { id: 'doubao-seed-2-0-pro-260215', name: 'Doubao-Seed-2.0-pro', supportsImage: false },
        { id: 'doubao-seed-2-0-lite-260215', name: 'Doubao-Seed-2.0-lite', supportsImage: false },
        { id: 'doubao-seed-2-0-mini-260215', name: 'Doubao-Seed-2.0-mini', supportsImage: false }
      ]
    },
    openrouter: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api',
      apiFormat: 'anthropic',
      models: [
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', supportsImage: true },
        { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', supportsImage: true },
        { id: 'openai/gpt-5.5', name: 'GPT 5.5', supportsImage: true },
        { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', supportsImage: true },
      ]
    },
    ollama: {
      enabled: false,
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
      apiFormat: 'openai',
      models: [
        { id: 'qwen3-coder-next', name: 'Qwen3-Coder-Next', supportsImage: false },
        { id: 'glm-4.7-flash', name: 'GLM 4.7 Flash', supportsImage: false }
      ]
    },
    custom: {
      enabled: false,
      apiKey: '',
      baseUrl: '',
      apiFormat: 'openai',
      models: []
    }
  },
  theme: 'system',
  language: 'zh',
  useSystemProxy: false,
  app: {
    port: 3000,
    isDevelopment: process.env.NODE_ENV === 'development',
    testMode: process.env.NODE_ENV === 'development',
  },
  shortcuts: {
    newChat: 'Ctrl+N',
    search: 'Ctrl+F',
    settings: 'Ctrl+,',
  },
};

// 配置存储键
export const CONFIG_KEYS = {
  APP_CONFIG: 'app_config',
  AUTH: 'auth_state',
  CONVERSATIONS: 'conversations',
  PROVIDERS_EXPORT_KEY: 'providers_export_key',
  SKILLS: 'skills',
};

// 模型提供商分类
export const CHINA_PROVIDERS = ['deepseek', 'volcengine', 'moonshot', 'zhipu', 'minimax', 'qianfan', 'custom'] as const;
export const GLOBAL_PROVIDERS = ['openai', 'gemini', 'anthropic', 'openrouter'] as const;
export const EN_PRIORITY_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;

/**
 * 根据语言获取可见的模型提供商
 */
export const getVisibleProviders = (_language: 'zh' | 'en'): readonly string[] => {
  return CHINA_PROVIDERS;
};
