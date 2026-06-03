# 飞书 - AGY 桥接器 (Feishu-AGY Bridge)

`feishu-agy-bridge` 是一个基于 Node.js 的守护进程，它将本地的 Antigravity CLI (`agy`) 会话与飞书（Lark）机器人连接起来。让用户可以直接在飞书聊天中接收 agy 的实时状态监视、告警推送，并直接与会话进行交互。

## 功能特性

- **实时状态监控**：通过增量文件读取，实时监听 agy 会话的 `transcript.jsonl` 日志文件。
- **双路事件检测**：同时监听 transcript JSONL 日志与 SQLite 会话数据库（`conversations/*.db`），可靠地检测问题、权限请求和错误事件。
- **交互式卡片推送**：对于关键事件（工具权限请求、运行错误、步骤完成、多选问题等）自动构建飞书卡片并推送到指定群聊或私聊。
- **双向交互注入**：当 agy 提示输入或需要工具执行权限确认时，可直接在飞书卡片上点击 ✅ 确认 或 ❌ 取消，程序会自动向 agy 进程的 stdin 和 IPC 消息目录注入对应回复。
- **动态切换模型**：通过飞书指令 `/model <model-alias>` 实时切换模型；不带参数时返回当前使用的模型及全部可用别名列表。
- **多会话管理**：支持同时监控和管理多个并行的 agy 终端会话。
- **安全鉴权**：仅允许来自配置 `FEISHU_DEFAULT_CHAT_ID` 的消息控制机器人，其他来源的消息将收到未授权错误提示。
- **macOS PTY 包装**：在 macOS 上，新会话通过 Python 的 `pty` 模块包装启动，以满足 agy 对 TTY 的要求，避免 stdin 死锁。

---

## 前置准备

- **Node.js**：v20 或更高版本。
- **Python 3**：宿主机需安装 Python 3，用于 macOS PTY 进程包装以及执行 `src/db-helper.py` 查询 SQLite 数据库。
- **Antigravity CLI (`agy`)**：本地已安装并初始化。
- **飞书自建应用**：已启用"机器人"和"事件订阅"，并且开通了 `card.action.trigger`（卡片交互）和 `im.message.receive_v1`（接收消息）的相关权限。

---

## 架构说明

```
飞书聊天
    │  (Webhook / 卡片交互)
    ▼
feishu-client.js  ──► messageHandler / actionHandler  (index.js)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        SessionRegistry  AGYInjector    spawn agy (PTY)
              │               │               │
              └───────┬───────┘               │
                      ▼                       │
               SessionWatcher ◄───────────────┘
               (chokidar)
               ├── transcript.jsonl  ──► EventClassifier ──► CardBuilder
               └── conversations/*.db ──► db-helper.py  ──► CardBuilder
```

### 模块说明

| 模块 | 职责 |
|:---|:---|
| `src/index.js` | 应用入口；串联所有模块，托管 `messageHandler` / `actionHandler` |
| `src/feishu-client.js` | Lark SDK 封装；处理 Webhook、发送消息和卡片 |
| `src/session-watcher.js` | 基于 chokidar 的文件系统监听，监控 transcript 文件和 SQLite 数据库 |
| `src/event-classifier.js` | 解析 JSONL transcript 行并将其分类为事件类型 |
| `src/card-builder.js` | 为每种事件类型构建飞书交互卡片 payload |
| `src/agy-injector.js` | 写入 IPC 消息文件，并更新 `settings.json` 以切换模型 |
| `src/session-registry.js` | 内存会话存储；跟踪所有活跃会话和默认会话 |
| `src/db-helper.py` | Python 脚本，由 `session-watcher.js` 调用，用于查询 SQLite 会话数据库中的待处理问题、权限提示和错误 |

---

## 环境变量配置

1. 复制配置文件模板：
   ```bash
   cp .env.example .env
   ```
2. 编辑 `.env` 文件，填入飞书机器人的相关凭证和本地 agy 路径：
   ```env
   FEISHU_APP_ID=cli_your_app_id
   FEISHU_APP_SECRET=your_app_secret
   FEISHU_DEFAULT_CHAT_ID=oc_your_default_group_or_dm_chat_id
   AGY_BRAIN_DIR=~/.gemini/antigravity-cli/brain
   AGY_SETTINGS_PATH=~/.gemini/antigravity-cli/settings.json
   LOG_LEVEL=info
   ```

---

## 安装与运行

1. 安装依赖包：
   ```bash
   npm install
   ```
2. 执行测试套件，确认测试全部通过：
   ```bash
   npm test
   ```
3. 启动桥接守护进程：
   ```bash
   npm start
   ```

---

## 飞书交互命令

在与飞书机器人的聊天窗口中，可以直接输入以下命令与本地的 `agy` 交互：

| 指令 | 描述/行为 |
|:---|:---|
| `/new <prompt>` | 在后台启动一个新的 `agy` 交互会话，并指定初始 Prompt。 |
| `/list` | 列出当前桥接器正在监听的所有活跃 agy 会话，默认会话以 ⭐ 标注。 |
| `/switch <session-id>` | 切换默认的交互会话。 |
| `/model` | 显示当前使用的模型及全部可用别名列表。 |
| `/model <model-alias>` | 切换当前会话所使用的模型配置（别名支持: `flash`, `medium`, `claude`, `gemini`）。 |
| `/stop` | 杀死当前的默认 agy 进程，并停止对其日志的监听。 |
| *直接发送普通文字* | 消息将作为文本输入直接注入到当前的默认活跃会话中；若会话当前正忙则返回提示。 |

---

## 事件卡片类型

桥接器会针对以下事件自动推送飞书交互卡片：

| 事件 | 卡片颜色 | 说明 |
|:---|:---|:---|
| 权限请求 | 🟡 黄色 | agy 请求工具执行确认，含 ✅ / ❌ 按钮 |
| 运行错误 | 🔴 红色 | agy 步骤执行出现异常 |
| 完成 / 等待输入 | 🟢 绿色 | agy 完成当前轮次，等待用户输入 |
| 会话结束 | ⚫ 灰色 | agy 进程已退出 |
| 多选问题 | 🟣 紫色 | agy 的 `ask_question` 工具触发，展示编号选项按钮 |
| 状态更新 | 🔵 蓝色 | 一般性状态变更通知 |

---

## 许可协议

MIT
