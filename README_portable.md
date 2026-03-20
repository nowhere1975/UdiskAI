# LobsterAI · Windows U盘便携版

> 基于 [netease-youdao/LobsterAI](https://github.com/netease-youdao/LobsterAI) fork，面向政府机关/国企/事业单位办公人员。

**插上 U 盘即用，不安装任何软件，不写注册表，数据不出本机。**

---

## 快速开始

1. 下载 `AI助手-portable-win.zip`，解压到任意位置（含中文路径可用）
2. 双击 `启动.bat`
3. 首次启动弹出配置向导，选择 AI 服务商并填写 API Key
4. 开始使用

```
AI助手/
├── 启动.bat                ← 双击这里启动
├── LobsterAI.exe
├── resources/
│   ├── app.asar
│   ├── python-win/         ← 内置 Python，无需安装
│   ├── mingit/             ← 内置 Git
│   └── SKILLs/             ← 内置技能包
└── data/                   ← 用户数据（首次运行自动创建）
    ├── lobsterai.sqlite
    └── output/             ← 生成文件保存位置
```

---

## 支持的 AI 服务商

首次配置向导预设以下国内服务商（也可填写任意 OpenAI 兼容接口）：

| 服务商 | 推荐模型 |
|---|---|
| DeepSeek | deepseek-chat |
| Kimi（月之暗面） | moonshot-v1-8k |
| 通义千问（阿里） | qwen-plus |
| 智谱 GLM | glm-4-flash |
| 豆包（字节） | doubao-pro-32k |

> API Key 存储在本机 `data/lobsterai.sqlite` 中，不上传任何服务器。

---

## 内置技能

| 技能 | 说明 |
|---|---|
| docx | Word 文档生成 |
| xlsx | Excel 表格生成 |
| pptx | PPT 演示文稿生成 |
| pdf | PDF 读取与处理 |
| web-search | 网页搜索 |
| canvas-design | 海报/图片设计 |
| playwright | 网页自动化操作 |
| local-tools | 本地文件/命令操作 |

---

## 便携性说明

- **数据隔离**：所有数据写入 `data/` 子目录，不写入 `%APPDATA%`、注册表或其他系统目录
- **换机使用**：将整个目录复制到另一台 Windows 10+ 电脑，双击 `启动.bat` 即可继续使用
- **路径兼容**：支持含中文、空格的路径
- **系统要求**：Windows 10 或更高版本，无需预装 Node.js、Python、Git

---

## 自行构建便携包

需要 macOS/Linux/Windows 构建机，且已配置好开发环境（见主 README 的开发说明）。

```bash
# 安装依赖
npm install

# 构建 Windows 便携 zip
npm run build:portable-win
```

输出文件：`release/AI助手-portable-win.zip`

---

## 与原版的区别

| 功能 | 原版 LobsterAI | 便携版 |
|---|---|---|
| 安装方式 | NSIS 安装包 | 解压即用 |
| 数据目录 | `%APPDATA%/LobsterAI` | `./data/`（随程序走） |
| 首次配置 | 手动进设置填 API Key | 启动向导引导 |
| 默认语言 | 跟随系统 | 中文 |
| IM 通道 | 支持 Telegram/钉钉/飞书等 | 保留（可选配置） |

---

## 开发计划

当前实施范围：

- [x] 数据目录便携化（`PORTABLE_MODE` 环境变量检测）
- [x] `启动.bat` 入口
- [x] `npm run build:portable-win` 打包脚本
- [x] 首次配置向导 UI（国内服务商预设）
- [ ] cn-docx 中文公文 skill 集成（待后续版本）
- [ ] IM/定时任务功能裁剪（待评估后决策）

---

## License

MIT · 基于 [netease-youdao/LobsterAI](https://github.com/netease-youdao/LobsterAI)
