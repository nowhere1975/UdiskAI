# 模式：信息图（-i）

## 模板

`assets/infograph_template.html`

## 占位符说明

| 占位符 | 内容 |
|--------|------|
| `{{CUSTOM_CSS}}` | 补充样式（可留空） |
| `{{CONTENT_HTML}}` | 全部内容区 HTML（自由布局） |
| `{{SOURCE}}` | 来源署名 |
| `{{ARXIV_LINE}}` | 留空 `''` 或 `<span class="arxiv">补充信息</span>` |

## 布局风格

信息图不使用固定结构，完全由内容驱动。常见布局：

### 数据密集型
```html
<section style="padding: 60px 60px 40px; position: relative; z-index: 1;">
  <div style="font: 700 96px/1 var(--serif); color: var(--ink); margin-bottom: 8px;">42%</div>
  <div style="font: 400 28px/1.5 var(--sans); color: var(--ink-light);">关键数据说明</div>
</section>
```

### 卡片网格型
```html
<section style="padding: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; position: relative; z-index: 1;">
  <div style="background: var(--white); border-radius: 16px; padding: 40px;">
    <div style="font: 700 56px/1 var(--serif); color: var(--ink);">要点一</div>
    <p style="font: 400 28px/1.6 var(--sans); color: var(--ink-light); margin-top: 16px;">说明文字</p>
  </div>
  <!-- 更多卡片 -->
</section>
```

### 时间线/流程型
```html
<section style="padding: 60px; position: relative; z-index: 1;">
  <div style="border-left: 3px solid var(--green); padding-left: 32px; margin-bottom: 40px;">
    <div style="font: 700 32px/1 var(--sans); color: var(--ink);">第一步</div>
    <p style="font: 400 26px/1.6 var(--sans); color: var(--ink-light); margin-top: 8px;">步骤描述</p>
  </div>
</section>
```

## 颜色变量

```css
var(--bg)       /* #F2F2F2 浅灰背景 */
var(--green)    /* #B8D8BE 柔和绿 */
var(--pink)     /* #E91E63 粉红强调 */
var(--yellow)   /* #FFF200 黄色高亮 */
var(--ink)      /* #2D2926 近黑 */
var(--ink-light)/* #5C5350 中灰 */
var(--white)    /* #FFFFFF 纯白 */
var(--serif)    /* 衬线字体 */
var(--sans)     /* 无衬线字体 */
```

## 执行步骤

1. 分析内容类型（数据/流程/对比/列举）
2. 选择最匹配的布局结构
3. 提炼 3-6 个核心信息点（不超过 6 个）
4. 编写完整 CONTENT_HTML（所有元素需 `position: relative; z-index: 1`）
5. `{{CUSTOM_CSS}}` 通常留空，如有特殊样式才填
6. 填入模板，截图（fullpage 模式），清理临时文件
