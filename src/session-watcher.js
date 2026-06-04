import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.dirname(__dirname);
const dbHelperPath = path.join(projectDir, 'src', 'db-helper.py');

export class SessionWatcher extends EventEmitter {
  constructor(brainDir) {
    super();
    this.brainDir = brainDir;
    this.conversationsDir = path.join(path.dirname(brainDir), 'conversations');
    this.watcher = null;
    this.fileOffsets = new Map();
    this.knownSessions = new Set();
    this.isReady = false;
    this.dbDebounceTimers = new Map();
  }

  registerNewSession(sessionId, filePath) {
    if (this.knownSessions.has(sessionId)) return;
    this.knownSessions.add(sessionId);
    this.emit('session:new', { sessionId, filePath });
  }

  start() {
    this.watcher = chokidar.watch([this.brainDir, this.conversationsDir], {
      persistent: true,
      ignoreInitial: false,
      depth: 6,
      ignored: (filePath) => {
        if (filePath.includes(this.conversationsDir)) {
          return false;
        }
        if (filePath.startsWith(this.brainDir)) {
          const relative = path.relative(this.brainDir, filePath);
          if (relative === '' || relative === '.') return false;
          
          const parts = relative.split(path.sep);
          if (parts.length === 1) return false;
          
          if (parts[1] !== '.system_generated') {
            return true;
          }
        }
        return false;
      }
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
          // During initial scan: skip existing content in known sessions to avoid replaying old events.
          // For newly discovered sessions (sub-agents spawned before bridge started), read from beginning.
          if (this.knownSessions.has(sessionId)) {
            try {
              const stats = fs.statSync(filePath);
              startOffset = stats.size;
            } catch (err) {
              startOffset = 0;
            }
          }
        }
        this.fileOffsets.set(filePath, startOffset);
        this.registerNewSession(sessionId, filePath);
        if (startOffset === 0) {
          this.readIncrementally(filePath, sessionId);
        }
      } else if ((filePath.endsWith('.db') || filePath.endsWith('.db-wal')) && filePath.includes(this.conversationsDir)) {
        const filename = path.basename(filePath);
        const sessionId = filename.endsWith('.db-wal') ? filename.slice(0, -7) : filename.slice(0, -3);
        const transcriptPath = path.join(this.brainDir, sessionId, '.system_generated', 'logs', 'transcript.jsonl');
        this.registerNewSession(sessionId, transcriptPath);
        const dbPath = path.join(this.conversationsDir, `${sessionId}.db`);
        if (this.isReady) {
          this.debounceDbCheck(sessionId, dbPath);
        }
      }
    });

    this.watcher.on('change', (filePath) => {
      if (filePath.endsWith(path.join('.system_generated', 'logs', 'transcript.jsonl'))) {
        const sessionId = this.extractSessionId(filePath);
        this.registerNewSession(sessionId, filePath);
        this.readIncrementally(filePath, sessionId);
      } else if ((filePath.endsWith('.db') || filePath.endsWith('.db-wal')) && filePath.includes(this.conversationsDir)) {
        const filename = path.basename(filePath);
        const sessionId = filename.endsWith('.db-wal') ? filename.slice(0, -7) : filename.slice(0, -3);
        const transcriptPath = path.join(this.brainDir, sessionId, '.system_generated', 'logs', 'transcript.jsonl');
        this.registerNewSession(sessionId, transcriptPath);
        const dbPath = path.join(this.conversationsDir, `${sessionId}.db`);
        this.debounceDbCheck(sessionId, dbPath);
      }
    });
  }

  checkDatabaseForQuestion(filePath, sessionId) {
    execFile('python3', [dbHelperPath, filePath], (err, stdout, stderr) => {
      if (err) {
        console.error(`[Watcher] Error running db-helper: ${err.message}`);
        return;
      }
      try {
        const output = stdout.trim();
        if (output && output !== 'null') {
          const res = JSON.parse(output);
          if (res) {
            if (res.type === 'question' && res.question_data) {
              this.emit('session:question', {
                sessionId,
                idx: res.idx,
                questionData: res.question_data
              });
            } else if (res.type === 'permission' && res.reason) {
              this.emit('session:permission', {
                sessionId,
                idx: res.idx,
                reason: res.reason
              });
            } else if (res.type === 'error' && res.message) {
              this.emit('session:agy_error', {
                sessionId,
                idx: res.idx,
                message: res.message
              });
            }
          }
        }
      } catch (e) {
        console.error(`[Watcher] Failed to parse db-helper output: ${e.message}, stdout: ${stdout}`);
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

  debounceDbCheck(sessionId, dbPath) {
    if (this.dbDebounceTimers.has(sessionId)) {
      clearTimeout(this.dbDebounceTimers.get(sessionId));
    }
    const timer = setTimeout(() => {
      this.dbDebounceTimers.delete(sessionId);
      this.checkDatabaseForQuestion(dbPath, sessionId);
    }, 100); // 100ms debounce
    this.dbDebounceTimers.set(sessionId, timer);
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
    }
    for (const timer of this.dbDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.dbDebounceTimers.clear();
  }
}
