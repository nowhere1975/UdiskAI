# PRD · U盘便携 AI 办公助手（基于 LobsterAI fork）

**版本** 0.1 · **日期** 2026-03-18  
**实现方式** 交给 claude code cli 执行

---

## 一、项目背景

Fork `netease-youdao/LobsterAI`，将其改造为 **Windows U盘便携版**，面向政府机关/国企/事业单位办公人员，插上 U 盘即可使用，不安装任何软件，不影响宿主系统。

参考仓库：https://github.com/netease-youdao/LobsterAI

---

## 二、目标用户

- 政府/国企/事业单位办公人员
- 熟悉 WPS/QQ，不会配置开发环境
- 对数据上云敏感，要求数据不出本机

---

## 三、核心改动（相对 LobsterAI 原版）

### 3.1 便携化（最高优先级）

**目标：解压 zip 即用，不写注册表，不创建系统目录**

需要做的改动：

1. **数据目录重定向**
   - 原版：数据写入 `%APPDATA%/LobsterAI/`
   - 改后：数据写入应用自身目录 `./data/`
   - 实现：Electron 启动时设置 `app.setPath('userData', path.join(process.resourcesPath, '../../data'))`
   - 注意：U盘路径可能含中文/空格，需做路径转义处理

2. **便携 Node.js 运行时打包**
   - LobsterAI 原版打包依赖系统 Node.js
   - 改后：使用 Electron 内置 Node.js，无需系统安装
   - claude CLI 调用路径改为相对路径

3. **便携 Python 运行时**
   - LobsterAI README 中已有 Windows embeddable Python 方案，直接复用
   - Python 打包到 `resources/python-win/`
   - skill 的 Python 依赖在首次运行时自动安装到 `./data/python-packages/`

4. **打包产物**
   - 目标：生成一个 zip 文件，解压后双击 `启动.bat` 即可运行
   - 不做 NSIS 安装包
   - 打包脚本：`npm run build:portable-win`

### 3.2 功能裁剪（去掉与目标用户无关的功能）

去掉：
- IM 通道（Telegram/Discord/DingTalk/Feishu）
- 定时任务
- 沙箱 VM 模式（保留本地执行模式即可）
- 视频生成 skill
- 图片生成 skill

保留：
- Cowork 对话核心
- skill 系统
- 记忆系统
- 权限门控
- 中英文切换

### 3.3 新增功能

1. **内置 cn-docx skill**
   - 将 `skills/cn-docx/` 目录整体放入 `SKILLs/cn-docx/`
   - 在 `SKILLs/skills.config.json` 中注册启用
   - skill 文件见：本仓库 `skills/cn-docx/`（generate.js + SKILL.md）

2. **首次启动配置向导**
   - 原版需要手动配置 API Key
   - 改后：首次启动弹出简洁向导，引导用户填写 API Key 和选择模型
   - 支持的模型预设：DeepSeek、Kimi、通义千问、智谱、豆包（优先国内服务）

3. **界面汉化**
   - 原版已支持中文，确认默认语言为中文
   - 去掉英文选项（目标用户不需要）

### 3.4 不改动的部分

- Electron + React 技术栈保持不变
- Claude Agent SDK 调用方式保持不变
- SQLite 存储结构保持不变
- skill 系统协议保持不变（SKILL.md 格式兼容）
- 权限门控 UI 保持不变

---

## 四、目录结构（便携版解压后）

```
AI助手/
├── 启动.bat                    ← 用户双击入口
├── LobsterAI.exe               ← Electron 主程序
├── resources/
│   ├── app.asar                ← 前端代码
│   ├── python-win/             ← 便携 Python（来自 LobsterAI 原有方案）
│   └── SKILLs/
│       ├── skills.config.json
│       └── cn-docx/
│           ├── SKILL.md
│           └── generate.js
└── data/                       ← 用户数据（首次运行自动创建）
    ├── lobsterai.sqlite
    ├── config.json
    └── output/                 ← 生成文件输出目录
```

---

## 五、启动.bat 内容

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "%~dp0LobsterAI.exe" --user-data-dir="%~dp0data"
```

---

## 六、数据隔离实现细节

在 Electron 主进程 `src/main/main.ts` 的最顶部（`app.ready` 之前）添加：

```typescript
import path from 'path';
import { app } from 'electron';

// 便携版：将所有用户数据重定向到应用自身目录
if (process.env.PORTABLE_MODE || process.argv.includes('--portable')) {
  const portableDataDir = path.join(path.dirname(app.getPath('exe')), 'data');
  app.setPath('userData', portableDataDir);
  app.setPath('logs', path.join(portableDataDir, 'logs'));
}
```

---

## 七、cn-docx skill 集成

### 7.1 文件放置

将以下文件放入 `SKILLs/cn-docx/`：
- `generate.js`（核心生成库）
- `SKILL.md`（AI 调用说明）
- `package.json`（依赖声明：`docx ^9.0.0`）

### 7.2 依赖自动安装

在 skillManager.ts 中，skill 首次启用时检查并安装依赖：

```typescript
// 检查 skill 目录下是否有 package.json，有则自动 npm install
async function installSkillDeps(skillDir: string) {
  const pkgPath = path.join(skillDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const nodeModules = path.join(skillDir, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
      await execAsync('npm install', { cwd: skillDir });
    }
  }
}
```

### 7.3 skills.config.json 注册

```json
{
  "skills": [
    {
      "name": "cn-docx",
      "dir": "cn-docx",
      "enabled": true,
      "description": "中文公文和通用文档生成"
    }
  ]
}
```

---

## 八、打包流程

### 8.1 新增打包命令

在 `package.json` 中添加：

```json
{
  "scripts": {
    "build:portable-win": "npm run build && node scripts/build-portable-win.js"
  }
}
```

### 8.2 build-portable-win.js 逻辑

```
1. electron-builder 打包 Windows（不生成 NSIS，生成 dir 格式）
2. 复制 python-win/ 到输出目录 resources/
3. 复制 SKILLs/ 到输出目录 resources/
4. 写入 启动.bat
5. 创建空 data/ 目录
6. 压缩整个目录为 AI助手-portable-win.zip
```

---

## 九、验收标准

1. **便携性**：将 zip 解压到任意路径（含中文路径），双击 `启动.bat` 能启动
2. **数据隔离**：不在 `%APPDATA%`、注册表或其他系统目录写入任何数据
3. **cn-docx**：对话中说"帮我写个通知"，能生成符合格式的 .docx 文件到 `data/output/`
4. **首次配置**：无 API Key 时弹出配置向导，填入后正常对话
5. **换机使用**：将整个目录复制到另一台 Windows 10+ 电脑，双击即用

---

## 十、实施建议（给 claude code 的提示）

1. 先 fork LobsterAI 仓库，在本地跑通原版
2. 再做数据目录重定向，验证便携性
3. 再做功能裁剪（去掉 IM/定时任务等）
4. 最后集成 cn-docx skill 并打包

**不要试图一次性改完所有内容，按上述顺序逐步推进，每步验证后再进行下一步。**
