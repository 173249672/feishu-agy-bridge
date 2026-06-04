# 飞书 - AGY 桥接器 (本地 CLI 只读通知模式)

`feishu-agy-bridge` 是一个基于 Node.js 的守护进程，它将本地运行的 Antigravity CLI (`agy`) 会话与飞书（Lark）机器人连接起来。让用户可以直接在飞书聊天中接收 agy 的实时状态监视、运行结果汇总与警报推送。

与传统交互模式不同，该分支处于 **只读通知模式**：您直接在本地终端运行并同 `agy` 交互，桥接器作为后台进程被动观察本地会话日志和数据库，并自动构建飞书只读卡片推送到您的飞书客户端。

## 功能特性

- **实时状态监控**：通过增量文件读取，实时监听本地 agy 会话的 `transcript.jsonl` 日志文件。
- **双路事件检测**：同时监听 transcript JSONL 日志与 SQLite 会话数据库（`conversations/*.db`），可靠地检测问题、权限请求和错误事件。
- **只读通知卡片**：对于关键事件自动构建飞书只读通知卡片并推送：
  - **工具权限请求**：展示请求原因与可选操作列表，并附带终端操作提示。
  - **运行错误/异常**：推送异常退出或额度超限等错误信息。
  - **多选问题**：展示问题的具体内容与选项编号。
  - **步骤完成**：展示当前轮次的结果摘要。
  - **状态更新**：一般性状态变更通知（如 `running` 等）。
- **零入站配置（无 Webhook）**：无需在飞书开放平台配置任何入站消息事件订阅、Webhook 接收地址或 WebSocket 连接。桥接器只发送出站 API 请求，在防火墙后运行更安全、方便。
- **多语言支持（i18n）**：提供完整的中英文双语界面支持，卡片内容将自动根据配置进行本地化渲染。

---

## 前置准备

- **Node.js**：v20 或更高版本。
- **Python 3**：宿主机需安装 Python 3，用于执行 `src/db-helper.py` 查询 SQLite 数据库。
- **Antigravity CLI (`agy`)**：本地已安装并初始化。
- **飞书自建应用**：已启用“机器人”能力（因为只单向推送通知，无需启用事件订阅或配置 Webhook 地址）。

---

## 架构说明

```
本地 CLI (agy)
     │
     ├─► transcript.jsonl  ──► SessionWatcher (Chokidar) ──► EventClassifier ──► CardBuilder
     ├─► conversations/*.db ──► db-helper.py ──────────────────► CardBuilder      │
     │                                                                           │
     ▼                                                                           ▼
用户终端                                                                   飞书卡片接口
(用户在本地交互执行)                                                       (出站客户端调用)
```

### 模块说明

| 模块 | 职责 |
|:---|:---|
| `src/index.js` | 应用入口；串联监听器模块，并将事件转发给飞书客户端 |
| `src/feishu-client.js` | Lark SDK 封装；发送出站消息和卡片通知 |
| `src/session-watcher.js` | 基于 chokidar 的文件系统监听，监控 transcript 文件和 SQLite 数据库 |
| `src/event-classifier.js` | 解析 JSONL transcript 行并将其分类为事件类型 |
| `src/card-builder.js` | 为每种事件类型构建飞书只读卡片 payload |
| `src/session-registry.js` | 内存会话存储；跟踪所有监听到的会话信息 |
| `src/db-helper.py` | Python 脚本，由 `session-watcher.js` 调用，用于查询 SQLite 会话数据库中的问题、权限提示和错误 |
| `src/settings-manager.js` | 管理项目的设置配置（包含语言偏好、卡片主题、以及宽屏布局开关） |
| `src/i18n.js` | 本地化翻译模块，存储所有中英文翻译字段并提供动态翻译辅助方法 |

---

## 工作区结构与缓存

- **`cache/`**：AGY CLI 在本地执行时自动生成的目录，用于存储当前工作目录到项目 ID 的映射文件（`projects.json`）。该文件夹已加入 `.gitignore` 避免被提交到版本库。
- **`src/config.js`**：解析本地 brain 日志目录 (`AGY_BRAIN_DIR`) 以及飞书凭证配置。

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
   LOG_LEVEL=info
   ```

---

## 安装与运行

1. 安装依赖包：
   ```bash
   npm install
   ```
2. 执行测试套件确认全部通过：
   ```bash
   npm test
   ```
3. 启动桥接守护进程：
   ```bash
   npm start
   ```
4. 在其他工作目录运行桥接器：
   ```bash
   cd /path/to/my-project
   node /feishu-agy-bridge/run-from-cwd.js
   ```

---

## 事件卡片类型

桥接器会针对以下事件自动推送飞书只读通知卡片：

| 事件 | 卡片颜色 | 说明 |
|:---|:---|:---|
| 权限请求 | 🟡 黄色 | agy 请求工具执行确认；展示操作选项和本地终端提议提示 |
| 运行错误 | 🔴 红色 | agy 步骤执行出现异常 |
| 完成 / 等待输入 | 🟢 绿色 | agy 完成当前轮次，正在本地终端等待用户输入 |
| 会话结束 | ⚫ 灰色 | agy 进程已退出 |
| 多选问题 | 🟣 紫色 | agy 的 `ask_question` 工具触发，展示编号选项信息 |
| 状态更新 | 🔵 蓝色 | 一般性状态变更通知 |

---

## 许可协议

MIT
