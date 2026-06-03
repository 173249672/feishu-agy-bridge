# Feishu-AGY Bridge

`feishu-agy-bridge` is a Node.js daemon that connects Antigravity CLI (`agy`) sessions with Feishu (Lark), enabling real-time status monitoring, alert forwarding, and interactive command execution directly from Feishu chat.

## Features

- **Real-time Status Monitoring**: Tails agy session transcripts in real-time.
- **Interactive Event Cards**: Automatically sends formatted interactive cards to Feishu for key events (tool permission requests, execution errors, step updates, task completion).
- **Two-way Communication**: Interacts with active agy sessions. Approving or rejecting a tool permission from Feishu card buttons will write to agy's stdin and local IPC message folders.
- **Model Switching**: Swishing models on the fly using `/model <model-name>` command.
- **Multi-session Management**: Watches and manages multiple parallel agy sessions.

---

## Prerequisites

- **Node.js**: v20 or higher.
- **Antigravity CLI (`agy`)**: Installed and initialized locally.
- **Feishu Custom App**: An enterprise self-built application with Bot and Event Subscription enabled, specifically with the `card.action.trigger` and `im.message.receive_v1` permissions.

---

## Configuration

1. Copy the environment variables template:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your Lark App credentials:
   ```env
   FEISHU_APP_ID=cli_your_app_id
   FEISHU_APP_SECRET=your_app_secret
   FEISHU_DEFAULT_CHAT_ID=oc_your_default_group_or_dm_chat_id
   AGY_BRAIN_DIR=~/.gemini/antigravity-cli/brain
   AGY_SETTINGS_PATH=~/.gemini/antigravity-cli/settings.json
   LOG_LEVEL=info
   ```

---

## Installation & Usage

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the test suite to verify tests pass:
   ```bash
   npm test
   ```
3. Start the bridge daemon:
   ```bash
   npm start
   ```

---

## Feishu Commands

Type these commands directly in your chat with the bot to manage agy:

| Command | Action |
|:---|:---|
| `/new <prompt>` | Start a new `agy` session with the given initial prompt. |
| `/list` | List all active agy sessions monitored by the bridge. |
| `/switch <session-id>` | Switch the default active session to route messages to. |
| `/model <model-alias>` | Switch the model (aliases: `flash`, `medium`, `claude`, `gemini`). |
| `/stop` | Kills the default active session and stops watching its log. |
| *Plain Text Message* | Routes the message as user input to the default active session. |

---

## License

MIT
