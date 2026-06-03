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
