# 模式：长图（-l）

## 模板

`assets/long_template.html`

## 占位符说明

| 占位符 | 内容 |
|--------|------|
| `{{BG_COLOR}}` | 背景色，推荐：`#FFFEF9`（暖白）、`#F5F5F0`（米白）、`#1C1C1E`（深色） |
| `{{ACCENT_COLOR}}` | 强调色，推荐：`#E85D3A`（橙红）、`#2563EB`（蓝）、`#16A34A`（绿）、`#7C3AED`（紫） |
| `{{TITLE_BLOCK}}` | 标题区 HTML，见下方结构 |
| `{{BODY_HTML}}` | 正文内容 HTML |
| `{{SOURCE}}` | 来源署名，如"微信公众号 · XXX" |

## TITLE_BLOCK 结构

```html
<div class="title-area">
  <h1>标题文字</h1>
</div>
```

## BODY_HTML 可用组件

```html
<!-- 普通段落 -->
<p>正文段落文字</p>

<!-- 高亮引用块 -->
<div class="highlight">重点句子或金句</div>

<!-- 二级标题 -->
<h2>小节标题</h2>

<!-- 带标签的条目 -->
<div class="item">
  <div class="label">条目标签</div>
  <p>条目描述文字</p>
</div>

<!-- 无序列表 -->
<ul>
  <li>列表项一</li>
  <li>列表项二</li>
</ul>

<!-- 引言 -->
<blockquote><p>引用的话语</p></blockquote>

<!-- 分割线 -->
<div class="divider"></div>

<!-- 首字下沉（用于正文第一段） -->
<p class="dropcap">首字下沉段落文字……</p>

<!-- 灰色小标 -->
<div class="subtitle">CHAPTER ONE</div>
```

## 执行步骤

1. 读取内容，提炼核心观点（≤ 1 句话）
2. 决定背景色（浅色内容用暖白，夜间/深沉内容用深色）
3. 选强调色（与主题气质匹配）
4. 起草 TITLE_BLOCK：主标题 ≤ 20 字
5. 编写 BODY_HTML：正文 400-800 字为宜，适当使用 highlight/item/h2
6. 填入模板，保存为临时 HTML 文件
7. 运行截图命令（fullpage 模式）
8. 删除临时文件，报告 PNG 路径
