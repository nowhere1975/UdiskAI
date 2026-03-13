import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { CoworkConfig, CoworkExecutionMode } from '../coworkStore';
import type { TelegramOpenClawConfig, DiscordOpenClawConfig } from '../im/types';
import type { DingTalkOpenClawConfig, FeishuOpenClawConfig, QQOpenClawConfig, WecomOpenClawConfig } from '../im/types';
import { resolveRawApiConfig } from './claudeSettings';
import type { OpenClawEngineManager } from './openclawEngineManager';
import type { McpToolManifestEntry } from './mcpServerManager';

export type McpBridgeConfig = {
  callbackUrl: string;
  secret: string;
  tools: McpToolManifestEntry[];
};

const mapExecutionModeToSandboxMode = (mode: CoworkExecutionMode): 'off' | 'non-main' | 'all' => {
  if (mode === 'local') return 'off';
  if (mode === 'sandbox') return 'all';
  return 'non-main';
};

const mapApiTypeToOpenClawApi = (apiType: 'anthropic' | 'openai' | undefined): 'anthropic-messages' | 'openai-completions' => {
  return apiType === 'openai' ? 'openai-completions' : 'anthropic-messages';
};

const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const normalizeModelName = (modelId: string): string => {
  const trimmed = modelId.trim();
  if (!trimmed) return 'default-model';
  const slashIndex = trimmed.lastIndexOf('/');
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
};

const readPreinstalledPluginIds = (): string[] => {
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const plugins = pkg.openclaw?.plugins;
    if (!Array.isArray(plugins)) return [];
    return plugins
      .map((p: { id?: string }) => p.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
};

export type OpenClawConfigSyncResult = {
  ok: boolean;
  changed: boolean;
  configPath: string;
  error?: string;
};

type OpenClawConfigSyncDeps = {
  engineManager: OpenClawEngineManager;
  getCoworkConfig: () => CoworkConfig;
  getTelegramOpenClawConfig?: () => TelegramOpenClawConfig | null;
  getDiscordOpenClawConfig?: () => DiscordOpenClawConfig | null;
  getDingTalkConfig: () => DingTalkOpenClawConfig | null;
  getFeishuConfig: () => FeishuOpenClawConfig | null;
  getQQConfig: () => QQOpenClawConfig | null;
  getWecomConfig: () => WecomOpenClawConfig | null;
  getMcpBridgeConfig?: () => McpBridgeConfig | null;
};

export class OpenClawConfigSync {
  private readonly engineManager: OpenClawEngineManager;
  private readonly getCoworkConfig: () => CoworkConfig;
  private readonly getTelegramOpenClawConfig?: () => TelegramOpenClawConfig | null;
  private readonly getDiscordOpenClawConfig?: () => DiscordOpenClawConfig | null;
  private readonly getDingTalkConfig: () => DingTalkOpenClawConfig | null;
  private readonly getFeishuConfig: () => FeishuOpenClawConfig | null;
  private readonly getQQConfig: () => QQOpenClawConfig | null;
  private readonly getWecomConfig: () => WecomOpenClawConfig | null;
  private readonly getMcpBridgeConfig?: () => McpBridgeConfig | null;

  constructor(deps: OpenClawConfigSyncDeps) {
    this.engineManager = deps.engineManager;
    this.getCoworkConfig = deps.getCoworkConfig;
    this.getTelegramOpenClawConfig = deps.getTelegramOpenClawConfig;
    this.getDiscordOpenClawConfig = deps.getDiscordOpenClawConfig;
    this.getDingTalkConfig = deps.getDingTalkConfig;
    this.getFeishuConfig = deps.getFeishuConfig;
    this.getQQConfig = deps.getQQConfig;
    this.getWecomConfig = deps.getWecomConfig;
    this.getMcpBridgeConfig = deps.getMcpBridgeConfig;
  }

  sync(reason: string): OpenClawConfigSyncResult {
    const configPath = this.engineManager.getConfigPath();
    const coworkConfig = this.getCoworkConfig();
    const apiResolution = resolveRawApiConfig();

    if (!apiResolution.config) {
      // No API/model configured yet (fresh install).
      // Write a minimal config so the gateway can start — it just won't have
      // any model provider until the user configures one.
      return this.writeMinimalConfig(configPath, reason);
    }

    const { baseURL, apiKey, model, apiType } = apiResolution.config;
    const modelId = model.trim();
    if (!modelId) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: 'OpenClaw config sync failed: resolved model is empty.',
      };
    }

    const providerModelName = normalizeModelName(modelId);
    const providerApi = mapApiTypeToOpenClawApi(apiType);
    const sandboxMode = mapExecutionModeToSandboxMode(coworkConfig.executionMode || 'auto');

    const workspaceDir = (coworkConfig.workingDirectory || '').trim();

    const preinstalledPluginIds = readPreinstalledPluginIds();

    const dingTalkConfig = this.getDingTalkConfig();
    // DingTalk runs through OpenClaw plugin but still needs the gateway HTTP endpoint (chatCompletions)
    const hasDingTalkOpenClaw = !!(dingTalkConfig?.enabled && dingTalkConfig.clientId);

    const feishuConfig = this.getFeishuConfig();
    // Feishu now runs fully through OpenClaw plugin, handled separately below like Telegram
    const hasFeishu = false; // Legacy in-line feishu channel disabled; OpenClaw plugin used instead

    const qqConfig = this.getQQConfig();

    const wecomConfig = this.getWecomConfig();

    const hasAnyChannel = hasDingTalkOpenClaw;

    const managedConfig: Record<string, unknown> = {
      gateway: {
        mode: 'local',
        ...(hasAnyChannel ? {
          http: {
            endpoints: {
              chatCompletions: { enabled: true },
            },
          },
        } : {}),
      },
      models: {
        mode: 'replace',
        providers: {
          lobster: {
            baseUrl: baseURL,
            api: providerApi,
            apiKey,
            auth: 'api-key',
            models: [
              {
                id: modelId,
                name: providerModelName,
                api: providerApi,
                input: ['text'],
              },
            ],
          },
        },
      },
      agents: {
        defaults: {
          model: {
            primary: `lobster/${modelId}`,
          },
          sandbox: {
            mode: sandboxMode,
          },
          ...(workspaceDir ? { workspace: workspaceDir } : {}),
        },
      },
      session: {
        dmScope: 'per-channel-peer',
      },
      ...(preinstalledPluginIds.length > 0
        ? {
            plugins: {
              entries: {
                ...Object.fromEntries(
                  preinstalledPluginIds.map((id) => [id, { enabled: true }]),
                ),
                // Disable the built-in feishu plugin when the official one is preinstalled
                ...(preinstalledPluginIds.includes('feishu-openclaw-plugin')
                  ? { feishu: { enabled: false } }
                  : {}),
                'mcp-bridge': { enabled: true },
              },
            },
          }
        : {
            plugins: {
              entries: {
                'mcp-bridge': { enabled: true },
              },
            },
          }),
    };

    // Sync MCP Bridge config
    const mcpBridgeCfg = this.getMcpBridgeConfig?.();
    if (mcpBridgeCfg && mcpBridgeCfg.tools.length > 0) {
      managedConfig.mcpBridge = {
        callbackUrl: mcpBridgeCfg.callbackUrl,
        secret: mcpBridgeCfg.secret,
        tools: mcpBridgeCfg.tools,
      };
    }

    // Sync Telegram OpenClaw channel config
    const tgConfig = this.getTelegramOpenClawConfig?.();
    if (tgConfig?.enabled && tgConfig.botToken) {
      const telegramChannel: Record<string, unknown> = {
        enabled: true,
        botToken: tgConfig.botToken,
        dmPolicy: tgConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = tgConfig.allowFrom?.length ? [...tgConfig.allowFrom] : [];
          if (tgConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: tgConfig.groupPolicy || 'allowlist',
        groupAllowFrom: (() => {
          const ids = tgConfig.groupAllowFrom?.length ? [...tgConfig.groupAllowFrom] : [];
          if (tgConfig.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groups: tgConfig.groups && Object.keys(tgConfig.groups).length > 0
          ? tgConfig.groups
          : { '*': { requireMention: true } },
        historyLimit: tgConfig.historyLimit || 50,
        replyToMode: tgConfig.replyToMode || 'off',
        linkPreview: tgConfig.linkPreview ?? true,
        streaming: tgConfig.streaming || 'off',
        mediaMaxMb: tgConfig.mediaMaxMb || 5,
      };
      if (tgConfig.proxy) {
        telegramChannel.proxy = tgConfig.proxy;
      }
      if (tgConfig.webhookUrl) {
        telegramChannel.webhookUrl = tgConfig.webhookUrl;
        if (tgConfig.webhookSecret) {
          telegramChannel.webhookSecret = tgConfig.webhookSecret;
        }
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), telegram: telegramChannel };
    } else if (tgConfig) {
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), telegram: { enabled: false } };
    }

    // Sync Discord OpenClaw channel config
    const dcConfig = this.getDiscordOpenClawConfig?.();
    if (dcConfig?.enabled && dcConfig.botToken) {
      const discordChannel: Record<string, unknown> = {
        enabled: true,
        token: dcConfig.botToken,
        dm: {
          policy: dcConfig.dmPolicy || 'open',
          allowFrom: (() => {
            const ids = dcConfig.allowFrom?.length ? [...dcConfig.allowFrom] : [];
            if (dcConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
            return ids;
          })(),
        },
        groupPolicy: dcConfig.groupPolicy || 'allowlist',
        guilds: (() => {
          const guilds: Record<string, unknown> = {};
          // Add allowed guilds from groupAllowFrom
          if (dcConfig.groupAllowFrom?.length) {
            for (const guildId of dcConfig.groupAllowFrom) {
              guilds[guildId] = dcConfig.guilds?.[guildId] || {};
            }
          }
          // Merge per-guild configs
          if (dcConfig.guilds && Object.keys(dcConfig.guilds).length > 0) {
            for (const [key, guildConfig] of Object.entries(dcConfig.guilds)) {
              const existing = (guilds[key] || {}) as Record<string, unknown>;
              guilds[key] = {
                ...existing,
                ...(guildConfig.requireMention !== undefined ? { requireMention: guildConfig.requireMention } : {}),
                ...(guildConfig.allowFrom?.length ? { users: guildConfig.allowFrom } : {}),
                ...(guildConfig.systemPrompt ? { systemPrompt: guildConfig.systemPrompt } : {}),
              };
            }
          }
          return Object.keys(guilds).length > 0 ? guilds : { '*': { requireMention: true } };
        })(),
        historyLimit: dcConfig.historyLimit || 50,
        streaming: dcConfig.streaming || 'off',
        mediaMaxMb: dcConfig.mediaMaxMb || 25,
      };
      if (dcConfig.proxy) {
        discordChannel.proxy = dcConfig.proxy;
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), discord: discordChannel };
    } else if (dcConfig) {
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), discord: { enabled: false } };
    }

    // Sync Feishu OpenClaw channel config (via feishu-openclaw-plugin)
    if (feishuConfig?.enabled && feishuConfig.appId) {
      const feishuChannel: Record<string, unknown> = {
        enabled: true,
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
        domain: feishuConfig.domain || 'feishu',
        dmPolicy: feishuConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = feishuConfig.allowFrom?.length ? [...feishuConfig.allowFrom] : [];
          if (feishuConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: feishuConfig.groupPolicy || 'allowlist',
        groupAllowFrom: (() => {
          const ids = feishuConfig.groupAllowFrom?.length ? [...feishuConfig.groupAllowFrom] : [];
          if (feishuConfig.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groups: feishuConfig.groups && Object.keys(feishuConfig.groups).length > 0
          ? feishuConfig.groups
          : { '*': { requireMention: true } },
        historyLimit: feishuConfig.historyLimit || 50,
        replyMode: feishuConfig.replyMode || 'auto',
        mediaMaxMb: feishuConfig.mediaMaxMb || 30,
      };
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), feishu: feishuChannel };
    } else if (feishuConfig) {
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), feishu: { enabled: false } };
    }

    // Sync DingTalk OpenClaw channel config (via dingtalk-connector plugin)
    if (dingTalkConfig?.enabled && dingTalkConfig.clientId) {
      const gatewayToken = this.engineManager.getGatewayToken();
      const dingtalkChannel: Record<string, unknown> = {
        enabled: true,
        clientId: dingTalkConfig.clientId,
        clientSecret: dingTalkConfig.clientSecret,
        dmPolicy: dingTalkConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = dingTalkConfig.allowFrom?.length ? [...dingTalkConfig.allowFrom] : [];
          if (dingTalkConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: dingTalkConfig.groupPolicy || 'open',
        sessionTimeout: dingTalkConfig.sessionTimeout ?? 1800000,
        ...(gatewayToken ? { gatewayToken } : {}),
      };
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'dingtalk-connector': dingtalkChannel };
    } else if (dingTalkConfig) {
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'dingtalk-connector': { enabled: false } };
    }

    // Sync QQ OpenClaw channel config (via qqbot plugin)
    if (qqConfig?.enabled && qqConfig.appId) {
      const qqChannel: Record<string, unknown> = {
        enabled: true,
        appId: qqConfig.appId,
        clientSecret: qqConfig.appSecret,
        dmPolicy: qqConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = qqConfig.allowFrom?.length ? [...qqConfig.allowFrom] : [];
          if (qqConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: qqConfig.groupPolicy || 'open',
        groupAllowFrom: (() => {
          const ids = qqConfig.groupAllowFrom?.length ? [...qqConfig.groupAllowFrom] : [];
          if (qqConfig.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        historyLimit: qqConfig.historyLimit || 50,
        markdownSupport: qqConfig.markdownSupport ?? true,
      };
      if (qqConfig.imageServerBaseUrl) {
        qqChannel.imageServerBaseUrl = qqConfig.imageServerBaseUrl;
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), qqbot: qqChannel };
    } else if (qqConfig) {
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), qqbot: { enabled: false } };
    }

    // Sync WeCom OpenClaw channel config (via wecom-openclaw-plugin)
    if (wecomConfig?.enabled && wecomConfig.botId) {
      const wecomChannel: Record<string, unknown> = {
        enabled: true,
        botId: wecomConfig.botId,
        secret: wecomConfig.secret,
        dmPolicy: wecomConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = wecomConfig.allowFrom?.length ? [...wecomConfig.allowFrom] : [];
          if (wecomConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: wecomConfig.groupPolicy || 'open',
        groupAllowFrom: (() => {
          const ids = wecomConfig.groupAllowFrom?.length ? [...wecomConfig.groupAllowFrom] : [];
          if (wecomConfig.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        sendThinkingMessage: wecomConfig.sendThinkingMessage ?? true,
      };
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), wecom: wecomChannel };
    } else if (wecomConfig) {
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), wecom: { enabled: false } };
    }

    const nextContent = `${JSON.stringify(managedConfig, null, 2)}\n`;
    let currentContent = '';
    try {
      currentContent = fs.readFileSync(configPath, 'utf8');
    } catch {
      currentContent = '';
    }

    if (currentContent === nextContent) {
      return {
        ok: true,
        changed: false,
        configPath,
      };
    }

    try {
      ensureDir(path.dirname(configPath));
      const tmpPath = `${configPath}.tmp-${Date.now()}`;
      fs.writeFileSync(tmpPath, nextContent, 'utf8');
      fs.renameSync(tmpPath, configPath);
      return {
        ok: true,
        changed: true,
        configPath,
      };
    } catch (error) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Write a minimal openclaw.json that lets the gateway start without any
   * model/provider configured.  The full config will be synced once the
   * user sets up a model in the UI.
   */
  private writeMinimalConfig(configPath: string, _reason: string): OpenClawConfigSyncResult {
    const preinstalledPluginIds = readPreinstalledPluginIds();

    const minimalConfig: Record<string, unknown> = {
      gateway: {
        mode: 'local',
      },
      // Don't enable plugins in minimal config — plugin loading via jiti happens
      // synchronously BEFORE the HTTP server binds, and can block gateway startup
      // for minutes on a fresh install.  Plugins will be enabled when the user
      // configures an API model and a full config sync runs.
    };

    const nextContent = `${JSON.stringify(minimalConfig, null, 2)}\n`;
    let currentContent = '';
    try {
      currentContent = fs.readFileSync(configPath, 'utf8');
    } catch {
      currentContent = '';
    }

    // If the file already has a meaningful config (from a previous sync or
    // user configuration), don't downgrade it to the minimal version.
    // Check for models (API configured), plugin entries (IM channels like
    // DingTalk/WeCom), or gateway.mode already set.
    if (currentContent && currentContent !== nextContent) {
      try {
        const existing = JSON.parse(currentContent);
        if (
          existing.models?.providers ||
          existing.plugins?.entries ||
          existing.gateway?.mode
        ) {
          // Already has a config with substance — keep it.
          return { ok: true, changed: false, configPath };
        }
      } catch {
        // Malformed JSON — overwrite with minimal config.
      }
    }

    if (currentContent === nextContent) {
      return { ok: true, changed: false, configPath };
    }

    try {
      ensureDir(path.dirname(configPath));
      const tmpPath = `${configPath}.tmp-${Date.now()}`;
      fs.writeFileSync(tmpPath, nextContent, 'utf8');
      fs.renameSync(tmpPath, configPath);
      return { ok: true, changed: true, configPath };
    } catch (error) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
