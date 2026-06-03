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
    await new Promise(resolve => watcher.once('ready', resolve));

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

  it('should emit session:new when a .db file is added', async () => {
    const conversationsDir = path.join(path.dirname(tempDir), 'conversations');
    fs.mkdirSync(conversationsDir, { recursive: true });

    const watcher = new SessionWatcher(tempDir);
    let detectedSessionId = null;
    let detectedFilePath = null;

    watcher.on('session:new', ({ sessionId, filePath }) => {
      detectedSessionId = sessionId;
      detectedFilePath = filePath;
    });

    watcher.start();
    await new Promise(resolve => watcher.once('ready', resolve));

    const dbFile = path.join(conversationsDir, 'db-session-456.db');
    fs.writeFileSync(dbFile, 'fake sqlite content');

    await new Promise(resolve => setTimeout(resolve, 300));

    watcher.stop();
    fs.rmSync(conversationsDir, { recursive: true, force: true });

    expect(detectedSessionId).toBe('db-session-456');
    expect(detectedFilePath).toBe(path.join(tempDir, 'db-session-456', '.system_generated', 'logs', 'transcript.jsonl'));
  });
});
