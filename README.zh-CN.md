# 飞书 - AGY 桥接器 (Feishu-AGY Bridge)

`feishu-agy-bridge` 是一个基于 Node.js 的守护进程，它将本地的 Antigravity CLI (`agy`) 会话与飞书（Lark）机器人连接起来。让用户可以直接在飞书聊天中接收 agy 的实时状态监视、告警推送，并直接与会话进行交互。

## 功能特性

- **实时状态监控**：实时增量监听 agy 会话的 `transcript.jsonl` 日志。
- **交互式卡片推送**：对于关键事件（工具权限请求、运行错误、状态变更、任务完成等）自动构建飞书卡片并推送到指定群聊或私聊。
- **双向交互注入**：当 agy 提示输入或需要工具执行权限确认时，可直接在飞书卡片上点击 ✅ 确认 或 ❌ 取消，程序会自动向 agy 进程的 stdin 和 IPC 消息目录注入对应回复。
- **动态切换模型**：通过飞书指令 `/model <model-name>` 实时切换 agy 执行对话的模型配置。
- **多会话管理**：支持同时监控和管理多个并行的 agy 终端会话。

---

## 前置准备

- **Node.js**：v20 或更高版本。
- **Antigravity CLI (`agy`)**：本地已安装并初始化。
- **飞书自建应用**：已启用“机器人”和“事件订阅”，并且开通了 `card.action.trigger` (卡片交互) 和 `im.message.receive_v1` (接收消息) 的相关权限。

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
| `/list` | 列出当前桥接器正在监听的所有活跃 agy 会话。 |
| `/switch <session-id>` | 切换默认的交互会话。 |
| `/model <model-alias>` | 切换当前会话所使用的模型配置（别名支持: `flash`, `medium`, `claude`, `gemini`）。 |
| `/stop` | 杀死当前的默认 agy 进程，并停止对其日志的监听。 |
| *直接发送普通文字* | 消息将作为文本输入直接注入到当前的默认活跃会话中。 |

---

## 许可协议

MIT
