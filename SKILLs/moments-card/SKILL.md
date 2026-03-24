---
name: 朋友圈卡片
description: "将内容铸成适合发朋友圈的精美图片。六种风格：-l（默认）长图阅读卡、-i 信息图、-m 多卡（朋友圈九宫格）、-v 手绘视觉笔记、-c 漫画风、-w 白板框图。输出 PNG 到 ~/Downloads/。用户说「做成卡片」「做成图片」「朋友圈」「发朋友圈」「信息图」「视觉笔记」「漫画风」「白板」时触发。"
user_invocable: true
version: "1.0.0"
---

# 朋友圈卡片

将内容铸成适合发朋友圈的精美图片。内容进去，PNG 出来。

## 参数

| 参数 | 风格 | 尺寸 | 说明 |
|------|------|------|------|
| `-l`（默认） | 长图 | 1080 × auto | 单张阅读卡，内容自动撑高 |
| `-i` | 信息图 | 1080 × auto | 数据/流程驱动的自适应视觉布局 |
| `-m` | 多卡 | 1080 × 1440 | 自动切分为多张，适合九宫格 |
| `-v` | 视觉笔记 | 1080 × auto | 手绘 sketchnote 风格 |
| `-c` | 漫画 | 1080 × auto | 黑白漫画格风格 |
| `-w` | 白板 | 1080 × auto | 白板马克笔框图风格 |

## 获取技能目录

在执行前，先确定本 SKILL.md 所在目录（即技能根目录）。后续所有相对路径均基于此目录。

## 截图工具

```bash
node {skill_dir}/assets/capture.js {html_file} {output_png} 1080 1600 fullpage
```

固定高度（多卡模式）：
```bash
node {skill_dir}/assets/capture.js {html_file} {output_png} 1080 1440
```

首次使用需安装依赖：
```bash
cd {skill_dir} && npm install && npx playwright install chromium
```

## 品味准则

**所有模式执行前必读**：Read `{skill_dir}/references/taste.md`

核心：反 AI 生成痕迹——禁 Inter 字体、禁纯黑、禁三等分布局、禁居中 Hero、禁 AI 文案腔。

## 执行

### 1. 读取内容

- URL → WebFetch 获取
- 粘贴文本 → 直接使用
- 文件路径 → Read 获取

### 2. 确定模式

未指定时默认 `-l`。

### 3. 文件命名

从内容提取标题或核心思想作为 `{name}`（中文直接用，去标点，≤ 20 字符）。
输出路径：`~/Downloads/{name}.png`（多卡：`~/Downloads/{name}_1.png` 等）

### 4. 读取品味准则和模式文档

```
Read {skill_dir}/references/taste.md
Read {skill_dir}/references/mode-{模式}.md
```

模式文件对照：
- `-l` → `mode-long.md`
- `-i` → `mode-infograph.md`
- `-m` → `mode-poster.md`
- `-v` → `mode-sketchnote.md`
- `-c` → `mode-comic.md`
- `-w` → `mode-whiteboard.md`

### 5. 生成 HTML

按照模式文档中的步骤和模板占位符，生成完整 HTML 内容，写入临时文件 `/tmp/{name}.html`。

模板路径：
- `-l` → `{skill_dir}/assets/long_template.html`
- `-i` → `{skill_dir}/assets/infograph_template.html`
- `-m` → `{skill_dir}/assets/poster_template.html`
- `-v` → `{skill_dir}/assets/sketchnote_template.html`
- `-c` → `{skill_dir}/assets/comic_template.html`
- `-w` → `{skill_dir}/assets/whiteboard_template.html`

**`{{SOURCE}}`** 填写：用户提供的署名，或默认留空 `''`。
**`{{ARXIV_LINE}}`** 填写：`''`（朋友圈场景不需要 arxiv 标注）。

### 6. 截图

运行截图命令，等待完成。

### 7. 交付

1. 删除临时 HTML 文件
2. 报告输出 PNG 的完整路径
