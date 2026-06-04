# 飞书 - AGY 桥接器 (Feishu-AGY Bridge)

`feishu-agy-bridge` 是一个基于 Node.js 的守护进程，它将本地的 Antigravity CLI (`agy`) 会话与飞书（Lark）机器人连接起来。让用户可以直接在飞书聊天中接收 agy 的实时状态监视、告警推送，并直接与会话进行交互。

> [!NOTE]
> 本仓库中存在一个 **`local-cli-notify`** 分支。如果您更倾向于一种“纯通知”模式（即只在飞书中接收会话状态变更，而权限确认和决策提问仍旧在本地终端内操作，去除了飞书卡片上的交互按钮），请切换至 `local-cli-notify` 分支。

## 功能特性

- **实时状态监控**：通过增量文件读取，实时监听 agy 会话的 `transcript.jsonl` 日志文件。
- **双路事件检测**：同时监听 transcript JSONL 日志与 SQLite 会话数据库（`conversations/*.db`），可靠地检测问题、权限请求和错误事件。
- **交互式卡片推送**：对于关键事件（工具权限请求、运行错误、步骤完成、多选问题等）自动构建飞书卡片并推送到指定群聊或私聊。
- **双向交互注入**：可直接在飞书卡片上点击按钮与活跃 agy 会话交互。确认或拒绝工具权限请求时，回复会写入 agy 的 stdin；对于多选权限，程序会动态解析 stdout 中的选项，并在点击时模拟 PTY 方向键导航完成选择。
- **动态切换模型**：通过飞书指令 `/model <model-alias>` 实时切换模型；不带参数时返回当前使用的模型及全部可用别名列表。
- **多会话与序号管理**：支持同时监控和管理多个并行的 agy 终端会话，支持通过更便捷的会话序号（Index）快捷执行命令。
- **动态多语言支持（i18n）**：提供完整的中英文双语界面，根据配置动态适配，提供无缝的本地化体验。
- **交互式配置设置**：提供专用的 `/settings` 卡片界面，支持直接在飞书中配置语言、卡片主题以及开启/关闭宽屏模式。
- **本地化帮助指南**：内置 `/help` 指令，能够根据当前语言设置，动态返回格式化后的用户使用手册。
- **安全鉴权**：仅允许来自配置 `FEISHU_DEFAULT_CHAT_ID` 的消息控制机器人，其他来源的消息将收到未授权错误提示。
- **macOS PTY 包装**：在 macOS 上，新会话通过 Python 的 `pty` 模块包装启动，以满足 agy 对 TTY 的要求，并配置标准窗口大小 (80x24) 以解决 TUI 输入捕获死锁问题。

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
| `src/settings-manager.js` | 管理项目的设置配置（包含语言偏好、卡片主题、以及宽屏布局开关） |
| `src/i18n.js` | 本地化翻译模块，存储所有中英文翻译字段并提供动态翻译辅助方法 |

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
4. 如果你要在其他目录（比如 `/path/to/a`）运行项目，并保持当前工作目录不变：
   ```bash
   cd /path/to/a
   node /feishu-agy-bridge/run-from-cwd.js
   ```

   这样会从 `/feishu-agy-bridge` 加载代码和 `.env`，但 `process.cwd()` 仍然是 `/path/to/a`。
   ```bash
   cd /path/to/a
   AGY_BRAIN_DIR=/other/path/brain AGY_SETTINGS_PATH=/other/path/settings.json node /feishu-agy-bridge/run-from-cwd.js
   ```

---

## 飞书交互命令

在与飞书机器人的聊天窗口中，可以直接输入以下命令与本地的 `agy` 交互：

| 指令 | 描述/行为 |
|:---|:---|
| `/new <prompt>` | 在后台启动一个新的 `agy` 交互会话，并指定初始 Prompt。 |
| `/list` | 列出当前桥接器正在监听的所有活跃 agy 会话，显示运行状态（🟢 运行中，⚪ 已停止）和默认会话（⭐ 标识）。 |
| `/switch <序号/会话ID>` | 切换默认的交互会话，支持输入序号或会话 ID。 |
| `/model` | 显示当前使用的模型及全部可用别名列表。 |
| `/model <model-alias>` | 切换当前会话所使用的模型配置（别名支持: `flash`, `medium`, `claude`, `gemini`）。 |
| `/stop [序号/会话ID]` | 停止目标会话的运行进程（默认停止当前会话），并停止对其日志的监听。支持输入序号或会话 ID。 |
| `/del <序号/会话ID/all>` | 强制结束目标会话，并清理其本地的日志和 SQLite 数据库。使用 `/del all` 可一键清理所有会话。 |
| `/settings` | 打开交互式设置菜单卡片，支持修改语言（中/英）、卡片主题与宽屏布局开关。 |
| `/help` | 在聊天窗口中输出格式化的本地化使用指南。 |
| *直接发送普通文字* | 消息将作为文本输入直接注入到当前的默认活跃会话中；若会话当前正忙则返回提示。 |

---

## 事件卡片类型

桥接器会针对以下事件自动推送飞书交互卡片：

| 事件 | 卡片颜色 | 说明 |
|:---|:---|:---|
| 权限请求 | 🟡 黄色 | agy 请求工具执行确认；普通权限含 ✅ / ❌ 按钮，多选权限动态生成各选项对应的选择按钮 |
| 运行错误 | 🔴 红色 | agy 步骤执行出现异常 |
| 完成 / 等待输入 | 🟢 绿色 | agy 完成当前轮次，等待用户输入 |
| 会话结束 | ⚫ 灰色 | agy 进程已退出 |
| 多选问题 | 🟣 紫色 | agy 的 `ask_question` 工具触发，展示编号选项按钮 |
| 状态更新 | 🔵 蓝色 | 一般性状态变更通知 |

---

## 许可协议

MIT
