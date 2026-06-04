import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Allow only safe session IDs: UUID format or alphanumeric/hyphen/underscore (8–128 chars)
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

function assertSafeSessionId(sessionId) {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`Invalid sessionId format: "${sessionId}"`);
  }
}

function assertUnderBase(base, resolved) {
  const absBase = path.resolve(base);
  const absResolved = path.resolve(resolved);
  if (!absResolved.startsWith(absBase + path.sep) && absResolved !== absBase) {
    throw new Error(`Path traversal detected: "${resolved}" is outside base "${base}"`);
  }
}

export class AGYInjector {
  constructor(brainDir, settingsPath) {
    this.brainDir = brainDir;
    this.settingsPath = settingsPath;
  }

  injectMessage(sessionId, content) {
    assertSafeSessionId(sessionId);

    const messagesDir = path.join(this.brainDir, sessionId, '.system_generated', 'messages');
    assertUnderBase(this.brainDir, messagesDir);

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
    assertUnderBase(this.brainDir, filePath);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return messageId;
  }

  getModelsInfo() {
    let currentModel = 'Unknown';
    if (fs.existsSync(this.settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        currentModel = settings.model || 'Unknown';
      } catch (err) {
        console.error('Failed to read settings.json for current model:', err);
      }
    }

    const MODEL_ALIASES = {
      'flash': 'Gemini 3.5 Flash (High)',
      'medium': 'Gemini 3.5 Flash (Medium)',
      'claude': 'Claude Sonnet 4.6 (Thinking)',
      'gemini': 'Gemini 2.5 Pro',
    };

    return {
      currentModel,
      aliases: MODEL_ALIASES
    };
  }

  switchModel(modelName) {
    if (!fs.existsSync(this.settingsPath)) {
      throw new Error(`Settings file not found: ${this.settingsPath}`);
    }

    const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
    const info = this.getModelsInfo();
    const normalized = modelName.trim().toLowerCase();
    const targetModel = info.aliases[normalized] || modelName;

    settings.model = targetModel;
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return targetModel;
  }
}
