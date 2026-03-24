# 模式：视觉笔记（-v）

## 模板

`assets/sketchnote_template.html`

## 占位符说明

| 占位符 | 内容 |
|--------|------|
| `{{CUSTOM_CSS}}` | 补充样式 |
| `{{CONTENT_HTML}}` | 全部内容区 HTML |
| `{{SOURCE}}` | 来源署名 |
| `{{ARXIV_LINE}}` | 留空或补充信息 |

## 设计语言

sketchnote 风格：手绘感、笔记感、有机感，避免过度整齐。

### 可用视觉元素

**大标题（手写风）**
```html
<div style="font: 700 80px/1.1 var(--hand); color: var(--ink); padding: 60px 60px 0; position: relative; z-index: 1;">
  标题文字
</div>
```

**高亮条**
```html
<mark style="font: 500 36px/1.6 var(--hand); display: inline;">高亮关键词</mark>
```

**框注（便利贴风）**
```html
<div style="background: var(--marker); padding: 24px 28px; border-radius: 4px; font: 400 32px/1.6 var(--hand); color: var(--ink); display: inline-block; transform: rotate(-1deg);">
  便利贴内容
</div>
```

**绿色信息块**
```html
<div style="background: var(--block); border-radius: 8px; padding: 28px 32px; font: 400 30px/1.6 var(--hand); color: var(--ink);">
  信息块内容
</div>
```

**SVG 手绘箭头**
```html
<svg width="120" height="60" style="position: relative; z-index: 1;" viewBox="0 0 120 60">
  <path d="M 10 30 C 40 10, 80 50, 110 30" stroke="var(--ink)" stroke-width="2.5" fill="none" marker-end="url(#arrowhead)"/>
</svg>
```

**数字列表（手写风）**
```html
<div style="display: flex; gap: 24px; align-items: flex-start; margin-bottom: 24px; position: relative; z-index: 1;">
  <span style="font: 700 52px/1 var(--hand); color: var(--accent); flex-shrink: 0;">1</span>
  <p style="font: 400 32px/1.6 var(--hand); color: var(--ink); padding-top: 10px;">要点内容</p>
</div>
```

## 执行步骤

1. 提炼 4-7 个核心概念/要点
2. 规划布局：主标题 → 要点区 → 金句/总结
3. 每个区域选择合适的视觉元素（框注/高亮/列表/箭头）
4. 元素排列避免过于整齐，适当加轻微旋转（`transform: rotate(±1deg)`）
5. 所有内容元素设置 `position: relative; z-index: 1`（确保在 dotgrid 上方）
6. 填入模板，截图（fullpage），清理临时文件
