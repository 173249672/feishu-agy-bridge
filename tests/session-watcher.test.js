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
