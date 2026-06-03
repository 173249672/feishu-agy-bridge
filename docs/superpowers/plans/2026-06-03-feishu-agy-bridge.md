# Feishu-AGY Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `feishu-agy-bridge` daemon to watch local Antigravity CLI logs, push status updates to Feishu via WebSocket, and route Feishu interactive responses back to the active session.

**Architecture:** A Node.js daemon using `chokidar` to tail `transcript.jsonl` files in the agy brain directory. User commands are parsed, routing messages to the active session by writing to the session's `.system_generated/messages/` folder and injecting keystrokes into the active CLI's stdin.

**Tech Stack:** Node.js 20+, `@larksuiteoapi/node-sdk`, `chokidar`, `dotenv`, `vitest`.

---

### Task 1: Project Initialization and Configuration

**Files:**
- Create: `package.json`
- Create: `src/config.js`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**
Write package dependencies and scripts in the root directory.

```json
{
  "name": "feishu-agy-bridge",
  "version": "1.0.0",
  "description": "Feishu-AGY Bridge daemon",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.28.0",
    "chokidar": "^3.6.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create .env.example**
Define the env template with all key properties.

```env
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxxx
FEISHU_DEFAULT_CHAT_ID=oc_xxxxx
AGY_BRAIN_DIR=~/.gemini/antigravity-cli/brain
AGY_SETTINGS_PATH=~/.gemini/antigravity-cli/settings.json
LOG_LEVEL=info
```

- [ ] **Step 3: Create src/config.js**
Provide config parser.

```javascript
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config();

const homeDir = os.homedir();

export const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    defaultChatId: process.env.FEISHU_DEFAULT_CHAT_ID || '',
  },
  agy: {
    brainDir: process.env.AGY_BRAIN_DIR || path.join(homeDir, '.gemini/antigravity-cli/brain'),
    settingsPath: process.env.AGY_SETTINGS_PATH || path.join(homeDir, '.gemini/antigravity-cli/settings.json'),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
```

- [ ] **Step 4: Verify packages installation**
Run: `npm install` and check dependencies are installed.

- [ ] **Step 5: Commit**
```bash
git add package.json src/config.js .env.example
git commit -m "feat: project init and configurations"
```

---

### Task 2: Event Classifier Component

**Files:**
- Create: `src/event-classifier.js`
- Test: `tests/event-classifier.test.js`

- [ ] **Step 1: Write Event Classifier unit tests**
Create unit tests to verify parsing steps of transcript logs.

```javascript
import { describe, it, expect } from 'vitest';
import { EventClassifier } from '../src/event-classifier.js';

describe('EventClassifier', () => {
  it('should detect permission requests', () => {
    const classifier = new EventClassifier();
    const line = JSON.stringify({
      step_index: 5,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      tool_calls: [{ name: 'ask_permission', args: { Reason: 'Need write permission' } }]
    });
    const result = classifier.classifyLine(line);
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('PERMISSION_REQUIRED');
    expect(result.summary).toBe('Need write permission');
  });

  it('should detect errors', () => {
    const classifier = new EventClassifier();
    const line = JSON.stringify({
      step_index: 6,
      type: 'RUN_COMMAND',
      status: 'ERROR',
      content: 'Command failed: permission denied'
    });
    const result = classifier.classifyLine(line);
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('ERROR');
    expect(result.summary).toContain('Command failed');
  });

  it('should detect task completion', () => {
    const classifier = new EventClassifier();
    const line = JSON.stringify({
      step_index: 7,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      content: 'Here is the code you requested.'
    });
    const result = classifier.classifyLine(line);
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('COMPLETED');
    expect(result.summary).toBe('Here is the code you requested.');
  });
});
```

- [ ] **Step 2: Run tests to verify failures**
Run: `npx vitest run tests/event-classifier.test.js`
Expected: Failure (module not found/implemented).

- [ ] **Step 3: Implement src/event-classifier.js**
Write the log classifier logic.

```javascript
export class EventClassifier {
  constructor() {
    this.lastPlannerResponseStep = null;
  }

  classifyLine(lineText) {
    if (!lineText.trim()) return null;
    try {
      const step = JSON.parse(lineText);
      const { step_index, type, status, content, tool_calls } = step;

      if (type === 'ASK_PERMISSION' || (tool_calls && tool_calls.some(tc => tc.name === 'ask_permission'))) {
        const permissionCall = tool_calls.find(tc => tc.name === 'ask_permission');
        return {
          eventType: 'PERMISSION_REQUIRED',
          stepIndex: step_index,
          summary: permissionCall?.args?.Reason || 'AGY is requesting tool permission.',
          metadata: { toolCalls: tool_calls }
        };
      }

      if (status === 'ERROR') {
        return {
          eventType: 'ERROR',
          stepIndex: step_index,
          summary: content || 'An error occurred during step execution.',
          metadata: { type }
        };
      }

      if (type === 'PLANNER_RESPONSE' && status === 'DONE') {
        if (!tool_calls || tool_calls.length === 0) {
          return {
            eventType: 'COMPLETED',
            stepIndex: step_index,
            summary: content || 'Task completed.',
            metadata: { content }
          };
        }
      }

      return null;
    } catch (err) {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/event-classifier.test.js`
Expected: Pass.

- [ ] **Step 5: Commit**
```bash
git add src/event-classifier.js tests/event-classifier.test.js
git commit -m "feat: implement EventClassifier with tests"
```

---

### Task 3: Session Registry

**Files:**
- Create: `src/session-registry.js`
- Test: `tests/session-registry.test.js`

- [ ] **Step 1: Write Session Registry tests**
Create unit tests to verify default and list options.

```javascript
import { describe, it, expect } from 'vitest';
import { SessionRegistry } from '../src/session-registry.js';

describe('SessionRegistry', () => {
  it('should register and retrieve sessions', () => {
    const registry = new SessionRegistry();
    registry.register('session1', '/path/to/log1');
    expect(registry.get('session1')).toBeDefined();
    expect(registry.getDefault().id).toBe('session1');
  });

  it('should switch default session', () => {
    const registry = new SessionRegistry();
    registry.register('session1', '/path/to/log1');
    registry.register('session2', '/path/to/log2');
    expect(registry.getDefault().id).toBe('session1');
    registry.setDefault('session2');
    expect(registry.getDefault().id).toBe('session2');
  });
});
```

- [ ] **Step 2: Run tests to verify failures**
Run: `npx vitest run tests/session-registry.test.js`
Expected: Failure.

- [ ] **Step 3: Implement src/session-registry.js**
Write the session manager class.

```javascript
export class SessionRegistry {
  constructor() {
    this.sessions = new Map();
    this.defaultSessionId = null;
  }

  register(sessionId, path) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        path: path,
        startTime: new Date(),
        status: 'active',
        feishuChatId: null,
        lastMessageId: null
      });
      if (!this.defaultSessionId) {
        this.defaultSessionId = sessionId;
      }
    }
    return this.sessions.get(sessionId);
  }

  get(sessionId) {
    return this.sessions.get(sessionId);
  }

  getDefault() {
    return this.sessions.get(this.defaultSessionId);
  }

  setDefault(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.defaultSessionId = sessionId;
      return true;
    }
    return false;
  }

  list() {
    return Array.from(this.sessions.values());
  }

  remove(sessionId) {
    this.sessions.delete(sessionId);
    if (this.defaultSessionId === sessionId) {
      const keys = Array.from(this.sessions.keys());
      this.defaultSessionId = keys.length > 0 ? keys[0] : null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/session-registry.test.js`
Expected: Pass.

- [ ] **Step 5: Commit**
```bash
git add src/session-registry.js tests/session-registry.test.js
git commit -m "feat: implement SessionRegistry with tests"
```

---

### Task 4: Session Watcher

**Files:**
- Create: `src/session-watcher.js`
- Test: `tests/session-watcher.test.js`

- [ ] **Step 1: Write Session Watcher tests**
Create unit tests to verify directory watching and tailing.

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionWatcher } from '../src/session-watcher.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SessionWatcher', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-watcher-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect new sessions and tail lines', async () => {
    const watcher = new SessionWatcher(tempDir);
    const linesReceived = [];
    let detectedSessionId = null;

    watcher.on('session:new', ({ sessionId }) => {
      detectedSessionId = sessionId;
    });

    watcher.on('line', ({ line }) => {
      linesReceived.push(line);
    });

    watcher.start();

    // Create session structure
    const sessionDir = path.join(tempDir, 'test-session-123', '.system_generated', 'logs');
    fs.mkdirSync(sessionDir, { recursive: true });
    const logFile = path.join(sessionDir, 'transcript.jsonl');

    fs.writeFileSync(logFile, 'line1\n');
    await new Promise(resolve => setTimeout(resolve, 300));

    fs.appendFileSync(logFile, 'line2\nline3\n');
    await new Promise(resolve => setTimeout(resolve, 300));

    watcher.stop();

    expect(detectedSessionId).toBe('test-session-123');
    expect(linesReceived).toEqual(['line1', 'line2', 'line3']);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**
Run: `npx vitest run tests/session-watcher.test.js`
Expected: Failure.

- [ ] **Step 3: Implement src/session-watcher.js**
Write the tail logic.

```javascript
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';

export class SessionWatcher extends EventEmitter {
  constructor(brainDir) {
    super();
    this.brainDir = brainDir;
    this.watcher = null;
    this.fileOffsets = new Map();
  }

  start() {
    const watchPattern = path.join(this.brainDir, '*', '.system_generated', 'logs', 'transcript.jsonl');
    this.watcher = chokidar.watch(watchPattern, {
      persistent: true,
      ignoreInitial: false,
    });

    this.watcher.on('add', (filePath) => {
      const sessionId = this.extractSessionId(filePath);
      this.fileOffsets.set(filePath, 0);
      this.emit('session:new', { sessionId, filePath });
      this.readIncrementally(filePath, sessionId);
    });

    this.watcher.on('change', (filePath) => {
      const sessionId = this.extractSessionId(filePath);
      this.readIncrementally(filePath, sessionId);
    });
  }

  extractSessionId(filePath) {
    const parts = filePath.split(path.sep);
    const index = parts.indexOf('.system_generated');
    if (index > 0) {
      return parts[index - 1];
    }
    return path.basename(path.dirname(path.dirname(path.dirname(filePath))));
  }

  readIncrementally(filePath, sessionId) {
    try {
      const stats = fs.statSync(filePath);
      const currentOffset = this.fileOffsets.get(filePath) || 0;
      const size = stats.size;

      if (size < currentOffset) {
        this.fileOffsets.set(filePath, 0);
        return;
      }

      if (size === currentOffset) return;

      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(size - currentOffset);
      fs.readSync(fd, buffer, 0, buffer.length, currentOffset);
      fs.closeSync(fd);

      this.fileOffsets.set(filePath, size);

      const content = buffer.toString('utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          this.emit('line', { sessionId, line, filePath });
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/session-watcher.test.js`
Expected: Pass.

- [ ] **Step 5: Commit**
```bash
git add src/session-watcher.js tests/session-watcher.test.js
git commit -m "feat: implement SessionWatcher with tests"
```

---

### Task 5: Feishu Card Builder

**Files:**
- Create: `src/card-builder.js`
- Test: `tests/card-builder.test.js`

- [ ] **Step 1: Write Card Builder tests**
Create unit tests to verify Feishu card structure creation.

```javascript
import { describe, it, expect } from 'vitest';
import * as CardBuilder from '../src/card-builder.js';

describe('CardBuilder', () => {
  it('should build correct permission card', () => {
    const card = CardBuilder.buildPermissionCard('sess1', 5, 'Require git write');
    expect(card.header.template).toBe('yellow');
    expect(card.elements[1].actions[0].value.action).toBe('approve');
  });

  it('should build correct error card', () => {
    const card = CardBuilder.buildErrorCard('sess1', 6, 'Compilation failed');
    expect(card.header.template).toBe('red');
    expect(card.elements[0].text.content).toContain('Compilation failed');
  });
});
```

- [ ] **Step 2: Run tests to verify failures**
Run: `npx vitest run tests/card-builder.test.js`
Expected: Failure.

- [ ] **Step 3: Implement src/card-builder.js**
Write methods to generate card layouts.

```javascript
export function buildPermissionCard(sessionId, stepIndex, reason) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'yellow',
      title: { tag: 'plain_text', content: '⚠️ AGY 请求操作确认' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**请求原因**:\n${reason}`
        }
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✅ 确认' },
            type: 'primary',
            value: { action: 'approve', sessionId, stepIndex }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❌ 取消' },
            type: 'danger',
            value: { action: 'reject', sessionId, stepIndex }
          }
        ]
      }
    ]
  };
}

export function buildErrorCard(sessionId, stepIndex, errorMsg) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'red',
      title: { tag: 'plain_text', content: '🚨 AGY 运行出现异常' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**错误信息**:\n\`\`\`\n${errorMsg.substring(0, 1000)}\n\`\`\``
        }
      }
    ]
  };
}

export function buildCompletedCard(sessionId, stepIndex, summary) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'green',
      title: { tag: 'plain_text', content: '🎉 AGY 对话轮次完成' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n\n**完成摘要**:\n${summary.substring(0, 2000)}`
        }
      }
    ]
  };
}

export function buildStatusCard(sessionId, statusText) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: 'ℹ️ AGY 状态更新' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n**状态**: ${statusText}`
        }
      }
    ]
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/card-builder.test.js`
Expected: Pass.

- [ ] **Step 5: Commit**
```bash
git add src/card-builder.js tests/card-builder.test.js
git commit -m "feat: implement CardBuilder with tests"
```

---

### Task 6: AGY Injector Component

**Files:**
- Create: `src/agy-injector.js`
- Test: `tests/agy-injector.test.js`

- [ ] **Step 1: Write AGY Injector tests**
Create unit tests to verify writing messages to messages/ folder and updating model config.

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AGYInjector } from '../src/agy-injector.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AGYInjector', () => {
  let tempDir;
  let settingsFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-injector-test-'));
    settingsFile = path.join(tempDir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ model: 'Gemini 3.5 Flash (High)' }), 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should inject message json file into messages dir', () => {
    const injector = new AGYInjector(tempDir, settingsFile);
    const sessionId = 'session-123';
    
    const messageId = injector.injectMessage(sessionId, 'Approved');
    
    const messagePath = path.join(tempDir, sessionId, '.system_generated', 'messages', `${messageId}.json`);
    expect(fs.existsSync(messagePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
    expect(content.content).toBe('Approved');
    expect(content.recipient).toBe(sessionId);
    expect(content.sender).toBe('feishu-bridge');
  });

  it('should update settings.json model field using alias', () => {
    const injector = new AGYInjector(tempDir, settingsFile);
    const model = injector.switchModel('claude');
    expect(model).toBe('Claude Sonnet 4.6 (Thinking)');

    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    expect(settings.model).toBe('Claude Sonnet 4.6 (Thinking)');
  });
});
```

- [ ] **Step 2: Run tests to verify failures**
Run: `npx vitest run tests/agy-injector.test.js`
Expected: Failure.

- [ ] **Step 3: Implement src/agy-injector.js**
Write injector class logic.

```javascript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class AGYInjector {
  constructor(brainDir, settingsPath) {
    this.brainDir = brainDir;
    this.settingsPath = settingsPath;
  }

  injectMessage(sessionId, content) {
    const messagesDir = path.join(this.brainDir, sessionId, '.system_generated', 'messages');
    
    if (!fs.existsSync(messagesDir)) {
      fs.mkdirSync(messagesDir, { recursive: true });
    }

    const messageId = crypto.randomUUID();
    const payload = {
      id: messageId,
      recipient: sessionId,
      sender: 'feishu-bridge',
      priority: 'MESSAGE_PRIORITY_HIGH',
      timestamp: new Date().toISOString(),
      content: content
    };

    const filePath = path.join(messagesDir, `${messageId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return messageId;
  }

  switchModel(modelName) {
    if (!fs.existsSync(this.settingsPath)) {
      throw new Error(`Settings file not found: ${this.settingsPath}`);
    }

    const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
    
    const MODEL_ALIASES = {
      'flash': 'Gemini 3.5 Flash (High)',
      'medium': 'Gemini 3.5 Flash (Medium)',
      'claude': 'Claude Sonnet 4.6 (Thinking)',
      'gemini': 'Gemini 2.5 Pro',
    };

    const normalized = modelName.trim().toLowerCase();
    const targetModel = MODEL_ALIASES[normalized] || modelName;

    settings.model = targetModel;
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return targetModel;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/agy-injector.test.js`
Expected: Pass.

- [ ] **Step 5: Commit**
```bash
git add src/agy-injector.js tests/agy-injector.test.js
git commit -m "feat: implement AGYInjector with tests"
```

---

### Task 7: Lark Client and Integration

**Files:**
- Create: `src/feishu-client.js`
- Create: `src/index.js`

- [ ] **Step 1: Implement src/feishu-client.js**
Setup Lark WebSocket client using the SDK.

```javascript
import * as lark from '@larksuiteoapi/node-sdk';

export class FeishuClient {
  constructor(appId, appSecret, defaultChatId) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.defaultChatId = defaultChatId;
    this.client = new lark.Client({ appId, appSecret });
    this.wsClient = null;
  }

  async start(messageHandler, actionHandler) {
    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        const { message, sender } = data;
        if (!message) return;
        const textContent = JSON.parse(message.content).text;
        const chatType = message.chat_type;
        const chatId = message.chat_id;
        
        await messageHandler({
          chatId,
          senderId: sender.sender_id.open_id,
          text: textContent,
          isP2P: chatType === 'p2p'
        });
      },
      'card.action.trigger': async (data) => {
        const { action, operator, open_message_id } = data;
        if (!action || !action.value) return {};
        
        const { action: actionType, sessionId, stepIndex } = action.value;
        const result = await actionHandler({
          actionType,
          sessionId,
          stepIndex,
          operatorId: operator.open_id,
          messageId: open_message_id
        });

        return result || {};
      }
    });

    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      eventDispatcher: eventDispatcher,
    });

    await this.wsClient.start();
  }

  async sendInteractiveCard(chatId, cardPayload) {
    const targetChat = chatId || this.defaultChatId;
    if (!targetChat) return null;
    const response = await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: targetChat,
        msg_type: 'interactive',
        content: JSON.stringify(cardPayload)
      }
    });
    return response.data.message_id;
  }

  async updateCard(messageId, cardPayload) {
    await this.client.im.v1.message.patch({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(cardPayload)
      }
    });
  }

  async sendTextMessage(chatId, text) {
    const targetChat = chatId || this.defaultChatId;
    if (!targetChat) return null;
    await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: targetChat,
        msg_type: 'text',
        content: JSON.stringify({ text })
      }
    });
  }
}
```

- [ ] **Step 2: Implement src/index.js orchestrator**
Write the main connection entry.

```javascript
import { config } from './config.js';
import { SessionRegistry } from './session-registry.js';
import { AGYInjector } from './agy-injector.js';
import { SessionWatcher } from './session-watcher.js';
import { EventClassifier } from './event-classifier.js';
import { FeishuClient } from './feishu-client.js';
import * as CardBuilder from './card-builder.js';
import { spawn } from 'child_process';

const registry = new SessionRegistry();
const injector = new AGYInjector(config.agy.brainDir, config.agy.settingsPath);
const watcher = new SessionWatcher(config.agy.brainDir);
const classifier = new EventClassifier();
const feishu = new FeishuClient(config.feishu.appId, config.feishu.appSecret, config.feishu.defaultChatId);

const activeProcesses = new Map();
const spawnedQueue = [];

watcher.on('session:new', ({ sessionId, filePath }) => {
  console.log(`[Watcher] New session detected: ${sessionId}`);
  registry.register(sessionId, filePath);

  const pending = spawnedQueue.shift();
  if (pending) {
    activeProcesses.set(sessionId, pending.cp);
    const session = registry.get(sessionId);
    if (session) {
      session.feishuChatId = pending.chatId;
    }
  }
});

watcher.on('line', async ({ sessionId, line }) => {
  console.log(`[Watcher][${sessionId}] ${line}`);
  const event = classifier.classifyLine(line);
  if (!event) return;

  const session = registry.get(sessionId);
  if (!session) return;

  let card;
  if (event.eventType === 'PERMISSION_REQUIRED') {
    card = CardBuilder.buildPermissionCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'ERROR') {
    card = CardBuilder.buildErrorCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'COMPLETED') {
    card = CardBuilder.buildCompletedCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'STATUS_CHANGE') {
    card = CardBuilder.buildStatusCard(sessionId, event.summary);
  }

  if (card) {
    const msgId = await feishu.sendInteractiveCard(session.feishuChatId, card);
    session.lastMessageId = msgId;
  }
});

watcher.on('error', (err) => {
  console.error('[Watcher] Error:', err);
});

const messageHandler = async ({ chatId, senderId, text, isP2P }) => {
  const input = text.trim();
  console.log(`[Feishu] Message from ${senderId} in ${chatId}: ${input}`);

  if (input.startsWith('/')) {
    const parts = input.split(' ');
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    if (command === '/new') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, '❌ Please specify a prompt. Example: `/new help me write a script`');
        return;
      }

      await feishu.sendTextMessage(chatId, `🚀 Starting new session with prompt: "${arg}"...`);
      
      const cp = spawn('agy', ['-i', arg], {
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' }
      });

      spawnedQueue.push({ cp, chatId, timestamp: Date.now() });

      cp.stdout.on('data', (data) => {
        console.log(`[AGY Out]: ${data}`);
      });

      cp.stderr.on('data', (data) => {
        console.error(`[AGY Err]: ${data}`);
      });

      cp.on('close', (code) => {
        console.log(`[AGY Closed] Exit code: ${code}`);
        for (const [sid, processCp] of activeProcesses.entries()) {
          if (processCp === cp) {
            activeProcesses.delete(sid);
            break;
          }
        }
      });
      return;
    }

    if (command === '/list') {
      const list = registry.list();
      if (list.length === 0) {
        await feishu.sendTextMessage(chatId, 'No active sessions found.');
        return;
      }
      const defaultSess = registry.getDefault();
      const lines = list.map(s => {
        const isDefault = defaultSess && defaultSess.id === s.id ? '⭐ ' : '  ';
        return `${isDefault}\`${s.id}\` (started: ${s.startTime.toLocaleTimeString()})`;
      });
      await feishu.sendTextMessage(chatId, `📋 Active Sessions:\n${lines.join('\n')}`);
      return;
    }

    if (command === '/switch') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, '❌ Usage: `/switch <session-id>`');
        return;
      }
      const success = registry.setDefault(arg);
      if (success) {
        await feishu.sendTextMessage(chatId, `✅ Switched default session to \`${arg}\``);
      } else {
        await feishu.sendTextMessage(chatId, `❌ Session \`${arg}\` not found in registry.`);
      }
      return;
    }

    if (command === '/model') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, '❌ Usage: `/model <model-name>` (e.g. `flash`, `claude`, `gemini`)');
        return;
      }
      try {
        const chosenModel = injector.switchModel(arg);
        await feishu.sendTextMessage(chatId, `✅ Model switched to \`${chosenModel}\``);
      } catch (err) {
        await feishu.sendTextMessage(chatId, `❌ Failed to switch model: ${err.message}`);
      }
      return;
    }

    if (command === '/stop') {
      const defaultSess = registry.getDefault();
      if (!defaultSess) {
        await feishu.sendTextMessage(chatId, 'No active default session.');
        return;
      }
      const cp = activeProcesses.get(defaultSess.id);
      if (cp) {
        cp.kill();
        await feishu.sendTextMessage(chatId, `⏹️ Stopped process for session \`${defaultSess.id}\``);
      }
      registry.remove(defaultSess.id);
      await feishu.sendTextMessage(chatId, `✅ Stopped watching session \`${defaultSess.id}\``);
      return;
    }

    await feishu.sendTextMessage(chatId, `❌ Unknown command: ${command}`);
    return;
  }

  const defaultSess = registry.getDefault();
  if (!defaultSess) {
    await feishu.sendTextMessage(chatId, '❌ No active session to reply to. Use `/new <prompt>` to start one.');
    return;
  }

  defaultSess.feishuChatId = chatId;
  injector.injectMessage(defaultSess.id, input);

  const cp = activeProcesses.get(defaultSess.id);
  if (cp && cp.stdin.writable) {
    cp.stdin.write(`${input}\n`);
  }
};

const actionHandler = async ({ actionType, sessionId, stepIndex, operatorId, messageId }) => {
  console.log(`[Feishu Action] ${actionType} for session ${sessionId} step #${stepIndex} by ${operatorId}`);

  const responseText = actionType === 'approve' ? 'y' : 'n';
  injector.injectMessage(sessionId, responseText);

  const cp = activeProcesses.get(sessionId);
  if (cp && cp.stdin.writable) {
    cp.stdin.write(`${responseText}\n`);
  }

  return {
    toast: {
      type: 'success',
      content: `Submitted: ${actionType.toUpperCase()}`
    },
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: actionType === 'approve' ? 'green' : 'grey',
        title: { tag: 'plain_text', content: `✅ AGY 权限已${actionType === 'approve' ? '确认' : '拒绝'}` }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**结果**: 已由用户进行${actionType === 'approve' ? '确认' : '拒绝'}。`
          }
        }
      ]
    }
  };
};

async function main() {
  console.log('Starting Feishu-AGY Bridge...');
  watcher.start();
  await feishu.start(messageHandler, actionHandler);
  console.log('Feishu-AGY Bridge is running.');
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Run all unit tests to verify complete coverage**
Run: `npx vitest run`
Expected: PASS all tests.

- [ ] **Step 4: Commit**
```bash
git add src/feishu-client.js src/index.js
git commit -m "feat: implement FeishuClient and orchestrator integration"
```
