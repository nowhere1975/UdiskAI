# 模式：漫画（-c）

## 模板

`assets/comic_template.html`

## 占位符说明

| 占位符 | 内容 |
|--------|------|
| `{{CUSTOM_CSS}}` | 补充样式（格子边框等） |
| `{{CONTENT_HTML}}` | 全部漫画格 HTML |
| `{{SOURCE}}` | 来源署名 |
| `{{ARXIV_LINE}}` | 留空 |

## 设计语言

日式黑白漫画风格：粗边框格子、内嵌对话气泡、半调网点阴影、手写感文字。

### 页面布局

漫画格采用 CSS Grid 排列，典型布局：

```html
<div style="padding: 40px; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto; gap: 4px; position: relative; z-index: 1;">
  <!-- 格子1 (占两列) -->
  <div style="grid-column: 1 / 3; border: 3px solid var(--ink); padding: 40px; min-height: 300px;">
    标题格
  </div>
  <!-- 格子2 -->
  <div style="border: 3px solid var(--ink); padding: 32px; min-height: 240px;">
    内容格A
  </div>
  <!-- 格子3 -->
  <div style="border: 3px solid var(--ink); padding: 32px; min-height: 240px;">
    内容格B
  </div>
</div>
```

### 对话气泡

```html
<!-- 普通气泡（圆形） -->
<div style="background: var(--white); border: 2.5px solid var(--ink); border-radius: 24px; padding: 20px 28px; font: 400 28px/1.5 var(--serif); color: var(--ink); display: inline-block; max-width: 80%; position: relative;">
  对话内容
  <!-- 气泡尾巴用伪元素或inline SVG实现 -->
</div>

<!-- 内心独白（云朵形，用虚线） -->
<div style="border: 2px dashed var(--ink); border-radius: 32px; padding: 20px 28px; font: 300 26px/1.6 var(--serif); color: var(--ink-mid); display: inline-block;">
  内心独白
</div>
```

### 音效字（拟声词）

```html
<div style="font: 900 72px/1 var(--serif); color: var(--ink); letter-spacing: -2px; transform: rotate(-5deg); display: inline-block;">
  ！
</div>
```

### 半调网点背景（阴影区）

```html
<div style="background: var(--tone); background-image: radial-gradient(circle, rgba(0,0,0,0.12) 1.5px, transparent 1.5px); background-size: 8px 8px; padding: 24px;">
  阴影内容区
</div>
```

### 文字框（叙述者框）

```html
<div style="background: var(--ink); color: var(--white); padding: 12px 20px; font: 400 24px/1.4 var(--serif); display: inline-block;">
  旁白文字
</div>
```

## 执行步骤

1. 将内容转化为 4-8 个叙事节点（场景/观点/转折/结论）
2. 规划格子布局（大格=重要场景，小格=过渡）
3. 每格决定：场景描述 + 对话/独白 + 视觉重点
4. 标题格用大字 + 音效字，内容格用对话气泡
5. 关键概念用网点阴影背景区分
6. 写入 CONTENT_HTML，CUSTOM_CSS 可加粗体字重覆盖
7. 填入模板，截图（fullpage），清理临时文件
