# Feishu-AGY Bridge

[中文文档 (Chinese Version)](README.zh-CN.md)

> [!IMPORTANT]
> **New SDK-based version**: A cleaner, native integration built on the Google Antigravity Python SDK is available at [feishu-agy-sdk-bridge](file:///Users/emu/Desktop/feishu-agy-sdk-bridge).

`feishu-agy-bridge` is a Node.js daemon that connects Antigravity CLI (`agy`) sessions with Feishu (Lark), enabling real-time status monitoring, alert forwarding, and interactive command execution directly from Feishu chat.

> [!NOTE]
> There is a **`local-cli-notify`** branch in this repository. If you prefer a notify-only setup where you view session status in Feishu but approve/deny permission prompts and questions locally on your terminal (without interactive buttons in Feishu), please switch to the `local-cli-notify` branch.

## Features

- **Real-time Status Monitoring**: Tails agy session `transcript.jsonl` logs in real-time via incremental file reads.
- **Dual-path Event Detection**: Watches both transcript JSONL logs and SQLite conversation databases (`conversations/*.db`) to detect questions, permission requests, and errors reliably.
- **Interactive Event Cards**: Automatically sends formatted interactive cards to Feishu for key events (tool permission requests, execution errors, step completions, multi-choice questions).
- **Two-way Communication**: Interacts with active agy sessions. Approving or rejecting a tool permission from Feishu card buttons writes the response to agy's stdin. For multi-choice permissions, it dynamically parses options from stdout and simulates PTY arrow-key navigation when clicked.
- **Model Switching**: Switches models on the fly using `/model <model-alias>`. With no argument, returns the current model and a list of all available aliases.
- **Multi-session & Index Management**: Watches and manages multiple parallel agy sessions simultaneously. Supports index-based shortcut commands for quicker interaction.
- **Dynamic Localization (i18n)**: Fully localized interfaces in both English and Chinese. The bot adapts to user settings dynamically.
- **Interactive Configuration Settings**: Offers a custom `/settings` card interface in Feishu to toggle widescreen views, theme templates, and active display languages.
- **Localized Guide Help**: Built-in `/help` command displaying a detailed user guide formatted based on current language configuration.
- **Security Authorization**: Only messages from the configured `FEISHU_DEFAULT_CHAT_ID` are allowed to control the bot. All other senders receive an unauthorized error.
- **macOS PTY Wrapping**: On macOS, new sessions are spawned via Python's `pty` module to allocate a pseudo-terminal with a standard window size (80x24), satisfying agy's TUI/TTY requirements without deadlocking stdin.

---

## Prerequisites

- **Node.js**: v20 or higher.
- **Python 3**: Required on the host for PTY spawning (macOS) and SQLite database inspection via `src/db-helper.py`.
- **Antigravity CLI (`agy`)**: Installed and initialized locally.
- **Feishu Custom App**: An enterprise self-built application with Bot and Event Subscription enabled, specifically with the `card.action.trigger` and `im.message.receive_v1` permissions.

---

## Architecture

```
Feishu Chat
    │  (webhook / card action)
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

### Module Overview

| Module | Responsibility |
|:---|:---|
| `src/index.js` | Application entry point; wires all modules together and hosts `messageHandler` / `actionHandler` |
| `src/feishu-client.js` | Lark SDK wrapper; handles webhooks, sends messages and cards |
| `src/session-watcher.js` | File system watcher (chokidar) for transcript files and SQLite DBs |
| `src/event-classifier.js` | Parses JSONL transcript lines and classifies them into event types |
| `src/card-builder.js` | Builds Feishu interactive card payloads for each event type |
| `src/agy-injector.js` | Writes IPC message files and updates `settings.json` for model switching |
| `src/session-registry.js` | In-memory session store; tracks all active sessions and the default session |
| `src/db-helper.py` | Python script called by `session-watcher.js` to query SQLite conversation DBs for pending questions, permission prompts, and errors |
| `src/settings-manager.js` | Manages project settings (language, widescreen mode, and theme template preferences) |
| `src/i18n.js` | Localization helper; stores translation strings and outputs localized content dynamically |

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
4. Run from another directory while preserving the current working directory:
   ```bash
   cd /path/to/a
   node /feishu-agy-bridge/run-from-cwd.js
   ```

   This loads code and `.env` from `/feishu-agy-bridge`, while `process.cwd()` remains `/path/to/a`.
   ```bash
   cd /path/to/a
   AGY_BRAIN_DIR=/other/path/brain AGY_SETTINGS_PATH=/other/path/settings.json node /feishu-agy-bridge/run-from-cwd.js
   ```

---

## Feishu Commands

Type these commands directly in your chat with the bot to manage agy:

| Command | Action |
|:---|:---|
| `/new <prompt>` | Start a new `agy` session with the given initial prompt. |
| `/list` | List all active agy sessions monitored by the bridge. Shows status (🟢 running, ⚪ stopped) and default session (marked with ⭐). |
| `/switch <index/session-id>` | Switch the default active session to route messages to. Accepts an integer index or session ID. |
| `/model` | Show the current model and list all available model aliases. |
| `/model <model-alias>` | Switch the model (aliases: `flash`, `medium`, `claude`, `gemini`). |
| `/stop [index/session-id]` | Kill the target session process (defaults to the default session) and stop watching its log. Accepts index or ID. |
| `/del <index/session-id/all>` | Kill the target session process, remove it from registry, and delete its local transcript/db files. Use `/del all` to clean all sessions. |
| `/settings` | Open the interactive settings card to configure language (zh/en), theme template, and widescreen mode. |
| `/help` | Show the localized user guide detailing all available commands. |
| *Plain Text Message* | Routes the message as user input to the default active session. Blocked with a warning if the session is currently busy. |

---

## Event Cards

The bridge automatically sends interactive cards to Feishu for the following events:

| Event | Card Color | Description |
|:---|:---|:---|
| Permission Request | 🟡 Yellow | agy requests tool execution approval; includes ✅ / ❌ buttons, or dynamic choice buttons for multi-choice permissions |
| Error | 🔴 Red | An error occurred in the agy step |
| Completed / Waiting | 🟢 Green | agy finished a turn and is waiting for input |
| Session Ended | ⚫ Grey | The agy process exited |
| Multi-choice Question | 🟣 Violet | agy's `ask_question` tool triggered; shows numbered option buttons |
| Status Update | 🔵 Blue | General status change notifications |

---

## License

MIT
