# SQLite-based Tool Permission Watcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the Feishu-AGY Bridge to detect tool permission checks (step type 8, status 9) directly from SQLite databases in real-time, preventing silent hangs.

**Architecture:** Extend the python `db-helper.py` to query for permission requests, update `session-watcher.js` to monitor both `.db` and `.db-wal` SQLite files, and listen for `session:permission` in `index.js` to surface interactive confirmation cards.

**Tech Stack:** Node.js, Python, Lark Open SDK, SQLite, Vitest

---

### Task 1: Update db-helper.py to parse tool permission checks

**Files:**
- Modify: `src/db-helper.py`

- [ ] **Step 1: Rewrite db-helper.py to check for both questions (138) and permission checks (8)**
  Update `src/db-helper.py` to check if `status == 9` for the latest step, then determine type and extract the JSON payload.
  
  ```python
  import sqlite3
  import json
  import sys

  def get_latest_pending_step(db_path):
      try:
          conn = sqlite3.connect(db_path)
          cursor = conn.cursor()
          cursor.execute("SELECT idx, step_type, status, step_payload FROM steps ORDER BY idx DESC LIMIT 1;")
          row = cursor.fetchone()
          conn.close()
          
          if not row:
              return None
              
          idx, step_type, status, payload = row
          if status == 9: # PENDING/WAITING
              if step_type == 138: # ASK_QUESTION
                  start_idx = payload.find(b'{"questions":')
                  if start_idx != -1:
                      brace_count = 0
                      in_quote = False
                      escape = False
                      end_idx = -1
                      for i in range(start_idx, len(payload)):
                          char = chr(payload[i])
                          if in_quote:
                              if escape:
                                  escape = False
                              elif char == '\\':
                                  escape = True
                              elif char == '"':
                                  in_quote = False
                          else:
                              if char == '"':
                                  in_quote = True
                              elif char == '{':
                                  brace_count += 1
                              elif char == '}':
                                  brace_count -= 1
                                  if brace_count == 0:
                                      end_idx = i + 1
                                      break
                      if end_idx != -1:
                          json_bytes = payload[start_idx:end_idx]
                          return {
                              "idx": idx,
                              "type": "question",
                              "question_data": json.loads(json_bytes.decode('utf-8'))
                          }
              elif step_type == 8: # TOOL_CALL/PERMISSION_REQUEST
                  start_idx = payload.find(b'{"')
                  if start_idx != -1:
                      brace_count = 0
                      in_quote = False
                      escape = False
                      end_idx = -1
                      for i in range(start_idx, len(payload)):
                          char = chr(payload[i])
                          if in_quote:
                              if escape:
                                  escape = False
                              elif char == '\\':
                                  escape = True
                              elif char == '"':
                                  in_quote = False
                          else:
                              if char == '"':
                                  in_quote = True
                              elif char == '{':
                                  brace_count += 1
                              elif char == '}':
                                  brace_count -= 1
                                  if brace_count == 0:
                                      end_idx = i + 1
                                      break
                      if end_idx != -1:
                          try:
                              json_bytes = payload[start_idx:end_idx]
                              tool_data = json.loads(json_bytes.decode('utf-8'))
                              reason = tool_data.get('toolAction') or tool_data.get('toolSummary') or "Requesting tool permission"
                              return {
                                  "idx": idx,
                                  "type": "permission",
                                  "reason": reason
                              }
                          except Exception:
                              pass
                  return {
                      "idx": idx,
                      "type": "permission",
                      "reason": "Requesting tool permission"
                  }
          return None
      except Exception as e:
          return {"error": str(e)}

  if __name__ == "__main__":
      if len(sys.argv) < 2:
          sys.exit(1)
      db_path = sys.argv[1]
      res = get_latest_pending_step(db_path)
      if res:
          print(json.dumps(res))
      else:
          print("null")
  ```

- [ ] **Step 2: Run verification script on the active pending database**
  Verify the script parses the pending database successfully.
  Run: `python3 src/db-helper.py /Users/emu/.gemini/antigravity-cli/conversations/d3d5a990-d79a-4dc6-a281-33544e194c28.db`
  Expected Output: `{"idx": 3, "type": "permission", "reason": "Viewing using-superpowers skill file"}` (or similar JSON with "permission" type).

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/db-helper.py
  git commit -m "feat: update db-helper to support tool permission request extraction"
  ```

---

### Task 2: Update session-watcher.js to handle permission events

**Files:**
- Modify: `src/session-watcher.js`
- Test: `tests/session-watcher.test.js`

- [ ] **Step 1: Update watcher database event handlers in session-watcher.js**
  Modify the `SessionWatcher` class to:
  1. Watch both `.db` and `.db-wal` SQLite file changes.
  2. Parse the session ID correctly from the file names.
  3. Execute the helper and emit either `session:question` or `session:permission` depending on the helper output.
  
  Replace `checkDatabaseForQuestion` and update `start()` watch logic.
  
  ```javascript
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
              }
            }
          }
        } catch (e) {
          console.error(`[Watcher] Failed to parse db-helper output: ${e.message}, stdout: ${stdout}`);
        }
      });
    }
  ```
  
  In `start()`, update `watcher.on('add')` and `watcher.on('change')` handlers to check for `.db` or `.db-wal` changes:
  
  ```javascript
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
        } else if ((filePath.endsWith('.db') || filePath.endsWith('.db-wal')) && filePath.includes(this.conversationsDir)) {
          const filename = path.basename(filePath);
          const sessionId = filename.endsWith('.db-wal') ? filename.slice(0, -7) : filename.slice(0, -3);
          const dbPath = path.join(this.conversationsDir, `${sessionId}.db`);
          this.checkDatabaseForQuestion(dbPath, sessionId);
        }
      });

      this.watcher.on('change', (filePath) => {
        if (filePath.endsWith(path.join('.system_generated', 'logs', 'transcript.jsonl'))) {
          const sessionId = this.extractSessionId(filePath);
          this.readIncrementally(filePath, sessionId);
        } else if ((filePath.endsWith('.db') || filePath.endsWith('.db-wal')) && filePath.includes(this.conversationsDir)) {
          const filename = path.basename(filePath);
          const sessionId = filename.endsWith('.db-wal') ? filename.slice(0, -7) : filename.slice(0, -3);
          const dbPath = path.join(this.conversationsDir, `${sessionId}.db`);
          this.checkDatabaseForQuestion(dbPath, sessionId);
        }
      });
  ```

- [ ] **Step 2: Update unit tests in tests/session-watcher.test.js**
  Ensure the unit tests cover the watcher logic and any changes to DB event handling.
  Run: `npx vitest run tests/session-watcher.test.js`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/session-watcher.js
  git commit -m "feat: watch WAL files and emit permission events in session-watcher"
  ```

---

### Task 3: Listen to permission events in index.js

**Files:**
- Modify: `src/index.js`
- Test: `tests/index.test.js`

- [ ] **Step 1: Add listener for session:permission in index.js**
  Listen to `session:permission` in `index.js`, format the permission card, and send it to Feishu.
  
  ```javascript
  watcher.on('session:permission', async ({ sessionId, idx, reason }) => {
    console.log(`[Watcher][${sessionId}] Permission required at step #${idx}: ${reason}`);
    const session = registry.get(sessionId);
    if (!session) return;

    if (session.lastPermissionIdx === idx) return;
    session.lastPermissionIdx = idx;

    session.status = 'waiting_permission';
    const card = CardBuilder.buildPermissionCard(sessionId, idx, reason);
    const msgId = await feishu.sendInteractiveCard(session.feishuChatId, card);
    session.lastMessageId = msgId;
  });
  ```

- [ ] **Step 2: Add unit test in tests/index.test.js for the permission handler**
  Add unit tests in `tests/index.test.js` verifying that the event listener handles `session:permission` and sends the correct Lark interactive card.
  
  Run: `npx vitest run`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/index.js tests/index.test.js
  git commit -m "feat: listen for session:permission and surface Feishu permission cards"
  ```
