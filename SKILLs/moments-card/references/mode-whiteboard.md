# 模式：白板（-w）

## 模板

`assets/whiteboard_template.html`

## 占位符说明

| 占位符 | 内容 |
|--------|------|
| `{{CUSTOM_CSS}}` | 补充样式 |
| `{{CONTENT_HTML}}` | 全部内容区 HTML |
| `{{SOURCE}}` | 来源署名 |
| `{{ARXIV_LINE}}` | 留空或补充信息 |

## 设计语言

白板风格：马克笔书写感、框图结构、彩色标记区分层次。

### 颜色系统

```
var(--red)    #D1495B  重点/危险/否定
var(--blue)   #2B6CB0  主要流程/概念
var(--green)  #2D8659  正向结果/成功
var(--orange) #D97706  注意/过渡
var(--ink)    #1A1A1A  主文字
```

### 可用视觉元素

**马克笔大标题**
```html
<div style="padding: 60px 60px 32px; position: relative; z-index: 1;">
  <div style="font: 700 72px/1.15 var(--marker); color: var(--ink);">标题</div>
  <div style="height: 4px; background: var(--red); width: 80px; margin-top: 16px;"></div>
</div>
```

**流程框**
```html
<div style="border: 2.5px solid var(--blue); border-radius: 8px; padding: 24px 32px; font: 400 30px/1.5 var(--hand); color: var(--ink);">
  流程步骤内容
</div>
```

**SVG 箭头连线**
```html
<svg width="60" height="40" viewBox="0 0 60 40" style="position: relative; z-index: 1;">
  <line x1="30" y1="2" x2="30" y2="35" stroke="var(--blue)" stroke-width="2.5" marker-end="url(#arrow-b)"/>
</svg>
```

**高亮色块（背景标记）**
```html
<span style="background: var(--marker-bg); padding: 4px 12px; font: 500 32px/1.5 var(--hand);">关键词</span>
```

**便利贴**
```html
<div style="background: rgba(255,237,74,0.4); padding: 20px 24px; border-radius: 4px; font: 400 28px/1.5 var(--hand); color: var(--ink); transform: rotate(1.5deg);">
  旁注内容
</div>
```

**圆角彩色标签**
```html
<span style="background: var(--blue); color: white; border-radius: 20px; padding: 6px 18px; font: 500 24px/1 var(--sans);">标签</span>
```

## 执行步骤

1. 分析内容结构（流程/对比/层次/网络）
2. 选择核心框图类型（线性流程/矩阵/树形）
3. 用 flexbox/grid 或绝对定位排布框图
4. 用箭头 SVG 连接节点（使用已定义的 marker：#arrow-r/#arrow-b/#arrow-k/#arrow-g）
5. 关键词用高亮色块，次要信息用便利贴风格
6. 所有内容设置 `position: relative; z-index: 1`
7. 填入模板，截图（fullpage），清理临时文件
