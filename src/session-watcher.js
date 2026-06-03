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
