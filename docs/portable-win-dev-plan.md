# 便携版开发计划

**版本** 0.1 · **日期** 2026-03-19
**范围** 数据便携化 + 打包脚本 + 首次配置向导（排除 cn-docx 集成和 IM 裁剪）

---

## Step 1 — 数据目录便携化

**文件**：`src/main/main.ts`，`configureUserDataPath()`（line 310）

### 改动逻辑

```typescript
const configureUserDataPath = (): void => {
  // 便携模式：PORTABLE_MODE=1 环境变量由 启动.bat 注入
  if (process.env.PORTABLE_MODE === '1') {
    const exeDir = path.dirname(app.getPath('exe'));
    const portableDataDir = path.join(exeDir, 'data');
    app.setPath('userData', portableDataDir);
    app.setPath('logs', path.join(portableDataDir, 'logs'));
    return;
  }
  // 原版逻辑保持不变
  const appDataPath = app.getPath('appData');
  const preferredUserDataPath = path.join(appDataPath, APP_NAME);
  const currentUserDataPath = app.getPath('userData');
  if (currentUserDataPath !== preferredUserDataPath) {
    app.setPath('userData', preferredUserDataPath);
  }
};
```

**注意**：必须在 `app.ready` 之前调用，`configureUserDataPath()` 已在顶层调用，位置正确。

### 验证

启动后检查：SQLite 文件出现在 exe 同级 `data/` 目录，而非 `%APPDATA%`。

---

## Step 2 — 启动.bat

**文件**：`scripts/portable-assets/启动.bat`（构建时复制到输出目录）

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORTABLE_MODE=1
start "" "%~dp0LobsterAI.exe"
```

**为什么用环境变量而非 `--user-data-dir`**：
`--user-data-dir` 是 Chromium 级参数，Electron 会用它设置 Chromium profile 路径，但不影响 `app.getPath('userData')`，两者分离会导致数据分裂。`PORTABLE_MODE` 环境变量在 main 进程代码中检测，更可靠。

---

## Step 3 — 打包脚本

### 3.1 electron-builder.json

`win.target` 保持 `nsis`（原版发行渠道），额外加 `dir`（便携构建基础）：

```json
"win": {
  "target": [
    "nsis",
    { "target": "dir", "arch": ["x64"] }
  ]
}
```

实际上 `build:portable-win` 脚本会直接调用 `electron-builder --win --dir`，无需修改 json，避免影响 `dist:win`。

### 3.2 package.json 新增脚本

```json
"predist:portable-win": "npm run openclaw:runtime:win-x64",
"build:portable-win": "npm run setup:mingit && npm run setup:python-runtime && npm run build && npm run compile:electron && npm run build:skills && node scripts/build-portable-win.js"
```

### 3.3 scripts/build-portable-win.js 逻辑

```
1. 调用 electron-builder --win --dir --x64（输出到 release/win-unpacked/）
2. 将 scripts/portable-assets/启动.bat 写入 release/win-unpacked/
3. 创建 release/win-unpacked/data/.gitkeep（空目录占位）
4. 用 archiver 或 powershell Compress-Archive 打包为：
   release/AI助手-portable-win.zip
```

依赖：`archiver`（已在 devDependencies 中检查，若无则用 PowerShell fallback）

---

## Step 4 — 首次配置向导

### 4.1 触发逻辑（App.tsx）

在 `initializeApp()` 完成、`setIsInitialized(true)` 之前：

```typescript
// 检测是否需要显示首次配置向导
const needsSetup = !config.api.key &&
  (!config.providers || Object.values(config.providers).every(p => !p.enabled || !p.apiKey));
setShowSetupWizard(needsSetup);
```

### 4.2 SetupWizard 组件

**文件**：`src/renderer/components/SetupWizard.tsx`

三步向导：

**Step 1 - 欢迎**
- 标题："欢迎使用 AI 办公助手"
- 说明："首次使用需要配置 AI 服务，只需 1 分钟"
- 按钮："开始配置"

**Step 2 - 选择服务商**

预设列表（复用 config.ts 中已有的 provider 结构）：

| 显示名 | providerKey | defaultBaseUrl | 推荐模型 |
|---|---|---|---|
| DeepSeek | deepseek | https://api.deepseek.com | deepseek-chat |
| Kimi（月之暗面） | moonshot | https://api.moonshot.cn/v1 | moonshot-v1-8k |
| 通义千问 | qwen | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |
| 智谱 GLM | zhipu | https://open.bigmodel.cn/api/paas/v4 | glm-4-flash |
| 豆包（字节） | volcengine | https://ark.cn-beijing.volces.com/api/v3 | doubao-pro-32k |

**Step 3 - 填写 API Key**
- 输入框 + 眼睛图标切换明文
- "获取 API Key" 链接（打开服务商文档）
- "完成配置" 按钮：写入选中 provider 的 apiKey 和 enabled，设置 defaultModel，关闭向导

### 4.3 i18n

`src/renderer/services/i18n.ts` 新增 key（zh + en 双语）：

```
setupWizard.welcome.title
setupWizard.welcome.desc
setupWizard.welcome.start
setupWizard.provider.title
setupWizard.provider.desc
setupWizard.apikey.title
setupWizard.apikey.placeholder
setupWizard.apikey.getKey
setupWizard.apikey.finish
setupWizard.apikey.testing
setupWizard.apikey.testFailed
```

---

## 验收清单

- [ ] 解压到含中文路径，双击 `启动.bat` 能启动
- [ ] `%APPDATA%/LobsterAI` 目录未创建
- [ ] `data/lobsterai.sqlite` 在 exe 同级目录生成
- [ ] 首次启动弹出配置向导
- [ ] 填入 API Key 后能正常对话
- [ ] 关闭重启后配置仍在
- [ ] 将目录复制到另一台 Windows 10+ 机器，能启动
- [ ] `npm run build:portable-win` 输出 zip 文件

---

## 未实施项（后续版本）

- cn-docx 中文公文 skill（需另行评估 generate.js 实现方案）
- IM/定时任务功能裁剪（改动面大，需专项评估）
