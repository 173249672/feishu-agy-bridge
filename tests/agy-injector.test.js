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

  it('should get correct models info', () => {
    const injector = new AGYInjector(tempDir, settingsFile);
    const info = injector.getModelsInfo();
    expect(info.currentModel).toBe('Gemini 3.5 Flash (High)');
    expect(info.aliases).toEqual({
      'flash': 'Gemini 3.5 Flash (High)',
      'medium': 'Gemini 3.5 Flash (Medium)',
      'claude': 'Claude Sonnet 4.6 (Thinking)',
      'gemini': 'Gemini 2.5 Pro',
    });
  });
});

