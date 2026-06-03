# Feishu-AGY Bridge 设计文档

## 概述

**项目名称**：`feishu-agy-bridge`  
**目标**：在 Antigravity CLI (`agy`) 与飞书机器人之间建立双向通信桥接，让用户可以通过飞书接收 agy 的关键事件通知，并直接在飞书中与正在运行的 agy 会话交互。

### 背景

Antigravity CLI (`agy`) 是 Antigravity IDE 的命令行入口。它以交互方式运行，将会话数据写入本地文件系统。对比调研了 `agent-feishu-channel`、`Claude-to-IM`、`hermes-agent` 等现有项目后发现：这些项目均基于 Claude Code SDK 事件流，无法直接适配 agy 架构。本设计是业界首个针对 agy 的飞书桥接实现。

---

## 需求

### 核心需求

1. **状态捕获**：实时监听 agy CLI 运行状态
2. **飞书通知**：关键事件推送到飞书群组或私信，带交互按钮
3. **双向交互**：用户在飞书点击/输入后，回复注入到 agy 当前会话
4. **本地运行**：无需公网 IP（利用飞书长连接 WebSocket）
5. **多 session 支持**：同时管理多个并行 agy 会话

### 通知事件类型

| 事件 | 触发条件 | 卡片样式 |
|------|----------|---------|
| 需要确认 | agy 请求权限（`ASK_PERMISSION` 类型步骤） | 黄色警告卡 + 确认/取消按钮 |
| 报错/异常 | 步骤状态为 `ERROR`，或内容含错误关键词 | 红色告警卡 + 摘要 + 详情链接 |
| 任务完成 | 一次对话轮次结束（模型响应完成且无后续工具调用） | 绿色完成卡 + 摘要 + 耗时 |
| 状态变化 | 开始新工具调用、对话开始/结束 | 蓝色信息卡 |

### 用户在飞书的交互命令

| 操作 | 行为 |
|------|------|
| 点击 `✅ 确认` 按钮 | 向 agy 会话发送确认 |
| 点击 `❌ 取消` 按钮 | 向 agy 会话发送取消 |
| 直接文字回复 | 作为消息注入当前 agy 会话 |
| `/new <prompt>` | 启动新的 agy 会话（指定目录） |
| `/list` | 列出当前所有活跃 session |
| `/switch <session-id>` | 切换默认交互 session |
| `/model <model-name>` | 切换当前 session 使用的 agy 模型 |
| `/stop` | 停止当前 session 监听 |

---

## 系统架构

```
[用户在终端运行 agy] ─────────────────────────────────────────┐
                                                             │
                       agy 写入 transcript.jsonl              │
                              │                              ▼
                    ┌─────────▼──────────────┐    ~/.gemini/antigravity-cli/
                    │   Session Watcher      │     brain/<session-id>/
                    │  (FSWatcher + tail)    │     .system_generated/logs/
                    └─────────┬──────────────┘     transcript.jsonl
                              │
                    ┌─────────▼──────────────┐
                    │   Event Classifier     │  解析 transcript step:
                    │  (transcript parser)   │  - ASK_PERMISSION → 需确认
                    └─────────┬──────────────┘  - ERROR status → 报错
                              │                 - DONE (无后续) → 完成
                    ┌─────────▼──────────────┐  - TOOL_CALL start → 状态变化
                    │   Session Registry     │
                    │  (session ↔ chat map)  │
                    └─────────┬──────────────┘
                              │
              ┌───────────────┼───────────────────┐
              ▼               ▼                   ▼
    ┌──────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │ Feishu Client│ │  Card Builder    │ │  AGY Injector    │
    │ (WS长连接)   │ │ (卡片模板生成)    │ │ (消息注入机制)   │
    └──────┬───────┘ └──────────────────┘ └──────────────────┘
           │
    ┌──────▼───────┐
    │  飞书群组/DM  │
    │  (用户看到)   │
    └──────────────┘
           │ 用户点击按钮/输入文字
           ▼
    [Feishu WebSocket 接收] → [AGY Injector] → 写入 messages/ 目录
```

---

## 模块设计

### 1. `session-watcher.js` — Session 发现与监听

**职责**：
- 用 `chokidar` 监听 `~/.gemini/antigravity-cli/brain/` 目录
- 当发现新的 `transcript.jsonl` 文件时，触发 Session 注册
- 实时 tail 该文件，将新行传给 Event Classifier

**接口**：
```js
class SessionWatcher extends EventEmitter {
  start()  // 开始监听
  stop()   // 停止监听
  // events: 'session:new', 'session:end', 'transcript:line'
}
```

**发现逻辑**：
- 扫描 `brain/*/` 目录
- 检查 `.system_generated/logs/transcript.jsonl` 是否存在且 mtime 在 30 分钟内
- 用文件 inode 变化触发增量读取（避免重复处理）

### 2. `event-classifier.js` — 事件分类器

**职责**：解析 transcript.jsonl 的每一行 JSON，判断事件类型

**判断规则**：
```
step.type === 'ASK_PERMISSION'           → EVENT_PERMISSION_REQUIRED
step.status === 'ERROR'                  → EVENT_ERROR
step.type === 'TOOL_CALL' + status=START → EVENT_STATUS_CHANGE
step.type === 'PLANNER_RESPONSE'         → EVENT_STATUS_CHANGE (正在思考)
连续无工具调用的 MODEL_RESPONSE 结束     → EVENT_COMPLETED
```

**输出格式**：
```js
{
  eventType: 'PERMISSION_REQUIRED' | 'ERROR' | 'COMPLETED' | 'STATUS_CHANGE',
  sessionId: string,
  summary: string,        // 关键摘要（≤ 200字）
  fullContent: string,    // 完整内容（用于"查看详情"）
  metadata: { ... }       // 附加信息（工具名、耗时等）
}
```

### 3. `session-registry.js` — Session 注册表

**职责**：维护多个并行 session 的状态

**数据结构**：
```js
Map<sessionId, {
  path: string,          // transcript.jsonl 路径
  startTime: Date,
  feishuChatId: string,  // 对应的飞书会话 ID
  lastMessageId: string, // 最近一条飞书消息 ID（用于更新卡片）
  status: 'active' | 'idle' | 'ended'
}>
```

### 4. `card-builder.js` — 飞书卡片构建器

基于飞书卡片 JSON 格式，生成不同类型的交互卡片：

**权限确认卡片**（黄色）：
```json
{
  "type": "template",
  "data": {
    "template_id": "...",
    "template_variable": {
      "title": "⚠️ AGY 需要你的确认",
      "content": "{{ summary }}",
      "session_id": "{{ sessionId }}",
      "buttons": [
        { "text": "✅ 确认", "value": "approve", "type": "primary" },
        { "text": "❌ 取消", "value": "reject", "type": "danger" }
      ]
    }
  }
}
```

**报错卡片**（红色）、**完成卡片**（绿色）、**状态更新卡片**（蓝色）设计类似。

### 5. `feishu-client.js` — 飞书长连接客户端

**职责**：
- 通过飞书 WebSocket 长连接接收消息和按钮回调（无需公网 IP）
- 发送消息/卡片到指定群组或 DM
- 处理消息路由（用户命令解析）

**使用飞书 SDK**：`@larksuiteoapi/node-sdk`

**配置**：
```
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
FEISHU_DEFAULT_CHAT_ID=...  # 默认通知群组
```

### 6. `agy-injector.js` — AGY 消息注入器

**职责**：将用户在飞书的回复注入到 agy 正在运行的会话

**注入机制**：向 agy 的 `.system_generated/messages/` 目录写入 JSON 消息文件。

**消息格式**（参考现有消息结构）：
```json
{
  "id": "<uuid>",
  "recipient": "<session-id>",
  "sender": "feishu-bridge",
  "priority": "MESSAGE_PRIORITY_NORMAL",
  "timestamp": "<ISO-timestamp>",
  "content": "<用户在飞书输入的内容>"
}
```

**注意**：当前实验性——需要实际测试 agy 是否会拾取此类外部消息。备选方案是写入 agy 的 stdin 管道（若进程 PID 可知）。

**模型切换（`/model` 命令）**：

用户在飞书发送 `/model <model-name>` 后，注入器将修改 `~/.gemini/antigravity-cli/settings.json` 中的 `model` 字段，agy 会在下一次对话轮次自动拾取新模型配置。

```js
// 支持的模型名称示例（与 agy 设置中的 label 一致）
const MODEL_ALIASES = {
  'flash':   'Gemini 3.5 Flash (High)',
  'claude':  'Claude Sonnet 4.6 (Thinking)',
  'gemini':  'Gemini 2.5 Pro',
};
```

飞书返回确认卡片：`✅ 模型已切换为 Claude Sonnet 4.6 (Thinking)`

### 7. `config.js` — 配置管理

通过 `.env` 文件读取：
```env
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxxx
FEISHU_DEFAULT_CHAT_ID=oc_xxxxx  # 群组 ID 或用户 open_id
AGY_BRAIN_DIR=~/.gemini/antigravity-cli/brain
LOG_LEVEL=info
```

---

## 项目结构

```
feishu-agy-bridge/
├── src/
│   ├── index.js              # 主入口，组装所有模块
│   ├── session-watcher.js    # Session 发现与监听
│   ├── event-classifier.js   # 事件分类
│   ├── session-registry.js   # Session 状态管理
│   ├── card-builder.js       # 飞书卡片模板
│   ├── feishu-client.js      # 飞书 SDK 封装
│   └── agy-injector.js       # 消息注入
├── .env.example              # 配置模板
├── package.json
└── README.md
```

---

## 数据流

### 场景 1：agy 请求权限

```
1. agy 写入 ASK_PERMISSION step 到 transcript.jsonl
2. SessionWatcher 检测到新行 → EventClassifier 识别为 PERMISSION_REQUIRED
3. CardBuilder 生成黄色确认卡片
4. FeishuClient 发送卡片到默认群组
5. 用户点击"✅ 确认"
6. FeishuClient 接收按钮回调
7. AGYInjector 向对应 session 的 messages/ 目录写入确认消息
8. （可选）更新飞书卡片为"已确认"状态
```

### 场景 2：用户从飞书发新任务

```
1. 用户在飞书发送 "/new 帮我写一个 Python 爬虫"
2. FeishuClient 接收消息，解析为 NEW_SESSION 命令
3. AGYInjector 在指定工作目录执行 agy --prompt-interactive "帮我写一个 Python 爬虫"
4. SessionWatcher 发现新 session，注册到 SessionRegistry
5. 飞书收到"✅ 已启动新会话 #abc123"确认消息
```

### 场景 3：任务完成通知

```
1. agy 完成一轮对话（MODEL_RESPONSE，无后续工具调用）
2. EventClassifier 判断为 COMPLETED，提取摘要
3. CardBuilder 生成绿色完成卡片，内含摘要
4. 超出 200 字的内容附"查看完整输出"链接（本地 HTTP 服务器或 agy 日志路径）
```

---

## 技术选型

| 类别 | 选择 | 理由 |
|------|------|------|
| 语言 | Node.js 20+ | 飞书 SDK 原生支持，async 文件监听 |
| 飞书 SDK | `@larksuiteoapi/node-sdk` | 官方 SDK，支持 WS 长连接 |
| 文件监听 | `chokidar` | 跨平台可靠，支持 FSEvents（macOS） |
| 配置 | `dotenv` | 标准 .env 支持 |
| 测试 | `vitest` | 轻量快速 |

---

## 已知风险与缓解措施

| 风险 | 描述 | 缓解 |
|------|------|------|
| agy 消息注入不确定 | 不确定 agy 是否会拾取外部写入的 messages | 先实验验证；备选方案：找 agy PID，向其 stdin 写入 |
| Transcript 格式变化 | agy 更新可能改变 transcript.jsonl 结构 | 做 schema 版本检测，发现未知格式时告警而非崩溃 |
| Session 识别不准 | 多个 session 同时活跃时路由错误 | SessionRegistry 维护显式映射，支持用户用 /switch 切换 |
| 大量输出截断 | agy 输出很长，飞书卡片有长度限制 | 启动本地 HTTP 服务（`localhost:xxxx`）托管完整输出，卡片提供链接 |

---

## 验证计划

1. **端对端测试**：运行 `agy`，执行一个会触发权限确认的任务，观察飞书是否收到卡片
2. **按钮交互测试**：点击确认按钮，验证 agy 是否继续执行
3. **多 session 测试**：同时运行 2 个 agy 会话，验证路由正确性
4. **消息注入测试**：在飞书输入文字，验证 agy 会话是否接收到

---

*文档版本：v1.1*  
*日期：2026-06-03*  
*变更：新增 `/model` 命令支持从飞书切换 agy 模型*
