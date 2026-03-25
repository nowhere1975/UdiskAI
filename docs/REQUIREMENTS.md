# UdiskAI 内置充值系统 · 需求文档

> 目标：让 UdiskAI 用户开箱即用，新用户获得免费额度，用完后可在 app 内充值，
> 全程无需用户自己申请 API Key。

---

## 一、整体架构

```
UdiskAI 客户端（Electron）
    │
    │  所有 AI 请求不再直连大模型厂商
    │  改为打到「UdiskAI 服务端」
    ▼
UdiskAI 服务端（Node.js / Express）
    ├── 用户注册 & 额度管理
    ├── 虎皮椒支付集成
    └── DeepSeek API 代理
    │
    ▼
DeepSeek API（使用服务端统一 API Key）
```

---

## 二、服务端需求

### 2.1 技术选型

- 运行时：Node.js 20+
- 框架：Express
- 数据库：SQLite（使用 better-sqlite3，同步操作，简单可靠）
- 部署：单文件，支持 `node server.js` 直接启动
- 配置：读取 `.env` 文件

### 2.2 环境变量（.env）

```
PORT=3000
DEEPSEEK_API_KEY=sk-xxx          # DeepSeek 官方 API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
HUPIJIAO_APP_ID=xxx              # 虎皮椒 App ID
HUPIJIAO_APP_SECRET=xxx          # 虎皮椒 App Secret
HUPIJIAO_NOTIFY_URL=https://你的域名/pay/notify
FREE_CREDITS=2000000             # 新用户免费额度（token 数），默认 200万
```

### 2.3 数据库表结构

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  device_id  TEXT PRIMARY KEY,
  credits    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  order_id   TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL,
  amount     REAL NOT NULL,      -- 付款金额（元）
  credits    INTEGER NOT NULL,   -- 对应额度（tokens）
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending / paid
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2.4 API 接口

#### POST /auth/register
新设备首次注册，获取初始免费额度。

请求体：
```json
{ "deviceId": "唯一设备ID" }
```

逻辑：
1. 检查 deviceId 是否已存在
2. 若不存在：插入 users 表，credits = FREE_CREDITS
3. 若已存在：直接返回当前信息（幂等）

响应：
```json
{
  "deviceId": "xxx",
  "credits": 2000000,
  "isNew": true
}
```

---

#### GET /credits?deviceId=xxx
查询用户当前额度。

响应：
```json
{ "deviceId": "xxx", "credits": 1850000 }
```

若 deviceId 不存在返回 404。

---

#### POST /chat
代理 AI 请求，扣减额度。

请求体：
```json
{
  "deviceId": "xxx",
  "messages": [...],       // 标准 OpenAI messages 格式
  "model": "deepseek-chat" // 可选，默认 deepseek-chat
}
```

逻辑：
1. 查询用户额度，若 credits <= 0 返回 402 错误
2. 用服务端 DEEPSEEK_API_KEY 转发请求到 DeepSeek
3. 请求成功后，读取响应中的 usage.total_tokens
4. 扣减用户 credits：credits -= usage.total_tokens
5. 返回 DeepSeek 的原始响应，并在响应头附加剩余额度

响应头附加：
```
X-Credits-Remaining: 1847500
X-Credits-Used: 2500
```

错误情况：
- 额度不足：`{ "error": "INSUFFICIENT_CREDITS", "credits": 0 }`  HTTP 402
- DeepSeek 调用失败：透传 DeepSeek 的错误，HTTP 502

支持 streaming（stream: true）：流式透传 DeepSeek 响应，在流结束后异步扣减额度。

---

#### POST /pay/create
创建充值订单。

请求体：
```json
{
  "deviceId": "xxx",
  "packageId": "pkg_10"   // 套餐 ID，见套餐定义
}
```

套餐定义（硬编码在服务端）：
```javascript
const PACKAGES = {
  pkg_10:  { amount: 10,  credits: 10000000  }, // ¥10  → 1000万 tokens
  pkg_30:  { amount: 30,  credits: 35000000  }, // ¥30  → 3500万 tokens（优惠）
  pkg_100: { amount: 100, credits: 130000000 }, // ¥100 → 1.3亿 tokens（更优惠）
}
```

逻辑：
1. 根据 packageId 查套餐
2. 生成订单号：`udiskai_{deviceId}_{timestamp}`
3. 插入 orders 表，status = pending
4. 调用虎皮椒 API 创建支付订单，获取支付链接
5. 返回支付链接

响应：
```json
{
  "orderId": "udiskai_xxx_1234567890",
  "payUrl": "https://...",   // 供客户端用系统浏览器打开
  "amount": 10,
  "credits": 10000000
}
```

---

#### POST /pay/notify
虎皮椒支付回调（此接口由虎皮椒服务器调用，非客户端调用）。

逻辑：
1. 验证虎皮椒签名，签名不合法直接返回 `fail`
2. 检查订单是否已处理（status = paid），若已处理返回 `success`（幂等）
3. 从 order_id 解析出 deviceId
4. 查询订单的 credits 数量
5. 给用户加额度：UPDATE users SET credits = credits + ? WHERE device_id = ?
6. 更新订单状态为 paid
7. 返回 `success`（虎皮椒要求收到此字符串才认为回调成功）

---

#### GET /pay/status?orderId=xxx
客户端轮询支付结果。

响应：
```json
{
  "orderId": "xxx",
  "status": "pending",  // pending / paid
  "credits": 10000000   // 仅 paid 时返回
}
```

---

### 2.5 安全要求

- 所有接口对 deviceId 做基础格式校验（非空、长度合理）
- `/pay/notify` 必须验签，验签失败直接拒绝
- `/chat` 接口做简单限流：同一 deviceId 每秒最多 5 个请求
- 订单号生成保证唯一性，防止重复创建

---

## 三、客户端改动需求

### 3.1 新增配置项

在现有设置存储中新增：
```typescript
interface CloudConfig {
  deviceId: string        // 首次启动自动生成，永久保存
  serverUrl: string       // 服务端地址，默认内置
  credits: number         // 本地缓存的余额，定期同步
  lastSyncAt: number      // 上次同步时间戳
}
```

### 3.2 设备 ID 生成

使用 `node-machine-id` 包获取机器唯一 ID：
```typescript
import { machineIdSync } from 'node-machine-id'
const deviceId = machineIdSync(true)
```

首次启动时调用 `/auth/register` 注册，将返回的初始额度存入本地。

### 3.3 AI 请求改造

找到现有代码中调用大模型 API 的出口（配置 baseURL 和 apiKey 的地方）。

改造逻辑：
- **有服务端模式（默认）**：将请求打到 `{serverUrl}/chat`，带上 deviceId，不需要 apiKey
- **自带 Key 模式**：用户在设置里填了自己的 API Key，则走原有直连逻辑（保留此模式，给高级用户）

两种模式在设置页切换，默认使用服务端模式。

### 3.4 额度缓存策略

避免每次对话都请求服务器影响体验：

- 本地缓存 credits 值
- 每次 `/chat` 响应头里的 `X-Credits-Remaining` 更新本地缓存
- 额外：每 5 分钟主动调用 `/credits` 同步一次
- 本地 credits <= 0 时，强制调用 `/credits` 确认（防止缓存误差导致误提示）

### 3.5 充值 UI

在设置页面（或侧边栏）新增「我的额度」区块：

```
┌─────────────────────────────┐
│  剩余额度                    │
│  185万 tokens               │
│  约可对话 370 次             │
│                             │
│  [立即充值]                  │
└─────────────────────────────┘
```

点击「立即充值」：
1. 弹出套餐选择对话框，展示三个套餐（¥10 / ¥30 / ¥100）
2. 用户选择套餐，调用 `/pay/create`
3. 用系统默认浏览器打开支付链接（`shell.openExternal(payUrl)`）
4. 同时开始轮询 `/pay/status`，每 3 秒一次，最多轮询 10 分钟
5. 检测到 `status: paid` 后，更新本地额度，弹出「充值成功」提示，停止轮询

「约可对话 N 次」的计算：假设平均每次对话消耗 5000 tokens，credits / 5000。

### 3.6 额度不足提示

当服务端返回 HTTP 402（额度不足）时：
- 中断当前对话
- 在对话界面显示提示：「额度已用完，充值后继续使用」，附带「去充值」按钮
- 点击按钮触发充值流程

---

## 四、开发顺序建议

1. **服务端**：先实现 `/auth/register` + `/credits` + `/chat` 三个接口，跑通 AI 代理
2. **客户端**：接入服务端，改造 AI 请求出口，验证能正常对话
3. **服务端**：实现 `/pay/create` + `/pay/notify` + `/pay/status`
4. **客户端**：实现充值 UI 和轮询逻辑
5. **联调**：端到端跑通完整充值流程

---

## 五、暂不需要做的

- 用户登录 / 注册账号（设备 ID 足够）
- 发票 / 退款流程
- 管理后台
- 多设备同步

---

## 六、虎皮椒接入参考

官网：https://xunhupay.com  
注册后在后台获取 `appid` 和 `appsecret`。

创建订单 API 文档参考虎皮椒官方文档，核心参数：
- `appid`：应用 ID
- `trade_order_id`：你生成的订单号（即 order_id）
- `total_fee`：金额（元）
- `title`：商品名称，如「UdiskAI 1000万tokens」
- `notify_url`：回调地址
- `nonce_str`：随机字符串
- `hash`：MD5 签名

回调验签算法：将所有非空参数按 key 字母排序拼接，加上 appsecret，MD5 后与 hash 比对。
