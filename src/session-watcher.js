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
    this.isReady = false;
  }

  start() {
    this.watcher = chokidar.watch(this.brainDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 4,
    });

    this.watcher.on('ready', () => {
      this.isReady = true;
      this.emit('ready');
    });

    this.watcher.on('add', (filePath) => {
      if (filePath.endsWith(path.join('.system_generated', 'logs', 'transcript.jsonl'))) {
        const sessionId = this.extractSessionId(filePath);
        let startOffset = 0;
        if (!this.isReady) {
          try {
            const stats = fs.statSync(filePath);
            startOffset = stats.size;
          } catch (err) {
            startOffset = 0;
          }
        }
        this.fileOffsets.set(filePath, startOffset);
        this.emit('session:new', { sessionId, filePath });
        if (startOffset === 0) {
          this.readIncrementally(filePath, sessionId);
        }
      }
    });

    this.watcher.on('change', (filePath) => {
      if (filePath.endsWith(path.join('.system_generated', 'logs', 'transcript.jsonl'))) {
        const sessionId = this.extractSessionId(filePath);
        this.readIncrementally(filePath, sessionId);
      }
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
