# 模式：多卡（-m）

## 模板

`assets/poster_template.html`（固定高度 1440px，多张卡片）

## 占位符说明

| 占位符 | 内容 |
|--------|------|
| `{{BG_COLOR}}` | 背景色 |
| `{{ACCENT_COLOR}}` | 强调色 |
| `{{HEADER_BLOCK}}` | 续集卡片页眉（首张留空 `''`） |
| `{{TITLE_BLOCK}}` | 标题区 HTML（续集卡片可省略） |
| `{{BODY_HTML}}` | 本张卡片的正文内容 |
| `{{SOURCE}}` | 来源署名 |
| `{{PAGE_INFO}}` | 页码，如 `1 / 3` |

## 分卡策略

将内容按以下原则切分：

- **首张**：标题 + 导语 + 1-2 个要点，建立阅读期待
- **中间张**：每张聚焦 2-3 个要点，不超过屏幕可视高度
- **末张**：总结/金句 + 行动建议，可收尾有力

每张卡片内容量控制：正文 200-350 字，条目式内容 4-6 条。

## HEADER_BLOCK（续集用）

```html
<div class="header">
  <span class="running-title">系列标题（第 2 张起使用）</span>
</div>
```

## TITLE_BLOCK

```html
<div class="title-area">
  <h1>卡片标题</h1>
</div>
```

## 执行步骤

1. 阅读全文，规划分为 N 张（一般 2-5 张）
2. 对每张卡片确定：标题、要点列表、是否为首/末张
3. 选定统一的 BG_COLOR + ACCENT_COLOR（所有卡片保持一致）
4. 逐张生成 HTML 文件（命名 `{name}_1.html`、`{name}_2.html`…）
5. 逐张截图（固定 1080×1440，非 fullpage）
6. 清理所有临时 HTML，报告所有 PNG 路径
