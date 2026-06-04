# Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the `/stop` command to keep stopped sessions in the registry, format `/list` with 1-based index numbers and status indicators, support index-based lookups for commands, and add the `/del` command to kill running processes and wipe agy session files on disk.

**Architecture:** We will implement an index-based session resolution function `resolveSession` that dynamically maps a 1-based index to a session sorted by `startTime` (ascending). We will update `/list`, `/switch`, and `/stop` to use this resolution, and add `/del` to handle index, UUID, and `all` inputs with complete filesystem cleanup (brain directory and conversations database files).

**Tech Stack:** Node.js, child_process, fs, Vitest

---

### Task 1: Write unit tests in `tests/index.test.js`

**Files:**
- Modify: `tests/index.test.js`

- [ ] **Step 1: Write the failing/mock tests for the new behaviors**
  Add test suite for session management index commands to `tests/index.test.js`.
  We will add a new `describe('Session management index commands', ...)` block at the end of the file:
  
  ```javascript
  describe('Session management index commands', () => {
    let mockList;
    let mockGet;
    let mockRemove;
    let mockSetDefault;
    let mockGetDefault;

    beforeEach(async () => {
      vi.restoreAllMocks();
      spawnMock.mockReset();
      config.feishu.defaultChatId = 'test-chat-id';

      const registryModule = await import('../src/session-registry.js');
      mockList = vi.spyOn(registryModule.SessionRegistry.prototype, 'list');
      mockGet = vi.spyOn(registryModule.SessionRegistry.prototype, 'get');
      mockRemove = vi.spyOn(registryModule.SessionRegistry.prototype, 'remove');
      mockSetDefault = vi.spyOn(registryModule.SessionRegistry.prototype, 'setDefault');
      mockGetDefault = vi.spyOn(registryModule.SessionRegistry.prototype, 'getDefault');
    });

    it('should format /list with sorted 1-based indices, running status, and default star', async () => {
      const startTime1 = new Date('2026-06-03T12:00:00Z');
      const startTime2 = new Date('2026-06-03T12:05:00Z');

      mockList.mockReturnValue([
        { id: 'session-2', startTime: startTime2 },
        { id: 'session-1', startTime: startTime1 }
      ]);
      mockGetDefault.mockReturnValue({ id: 'session-1' });
    });
  });
  ```

- [ ] **Step 2: Run the test suite to watch them fail**
  Run: `npx vitest run tests/index.test.js`
  Expected: FAIL (or errors since commands/indices are not implemented yet).

---

### Task 2: Implement dynamic index resolution and command handlers in `src/index.js`

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Implement `resolveSession` helper function**
  Add the `resolveSession` function at the module scope level of `src/index.js`.
  
  ```javascript
  function resolveSession(arg) {
    if (!arg) return null;
    const list = registry.list().sort((a, b) => a.startTime - b.startTime);
    const idx = parseInt(arg, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= list.length) {
      return list[idx - 1];
    }
    return registry.get(arg) || null;
  }
  ```

- [ ] **Step 2: Update `/list` command formatting**
  Sort sessions by `startTime` (ascending) and prefix with `[idx]` and state indicators (`🟢` / `⚪`).
  
  ```javascript
    if (command === '/list') {
      const list = registry.list().sort((a, b) => a.startTime - b.startTime);
      if (list.length === 0) {
        await feishu.sendTextMessage(chatId, 'No active sessions found.');
        return;
      }
      const defaultSess = registry.getDefault();
      const lines = list.map((s, i) => {
        const isDefault = defaultSess && defaultSess.id === s.id ? '⭐ ' : '  ';
        const isActive = activeProcesses.has(s.id);
        const statusIndicator = isActive ? '🟢' : '⚪';
        return `[${i + 1}] ${isDefault}${statusIndicator} \`${s.id}\` (started: ${s.startTime.toLocaleTimeString()})`;
      });
      await feishu.sendTextMessage(chatId, `📋 Active Sessions:\n${lines.join('\n')}`);
      return;
    }
  ```

- [ ] **Step 3: Update `/switch` command to support index-based resolution**
  Update the `/switch` block to call `resolveSession(arg)`.

- [ ] **Step 4: Update `/stop` command to preserve session in list and support index-based resolution**
  Update `/stop` block to use `resolveSession(arg)` (falling back to default session if no `arg`), terminate process if active, and keep the session in `registry` (do NOT call `registry.remove`).

- [ ] **Step 5: Implement `/del` command with agy files cleanup**
  Add the `/del` block supporting index/UUID/`all`. Deletes directories/files on disk:
  
  ```javascript
  import fs from 'fs';
  // ...
  const deleteSessionFiles = (sessionId) => {
    // 1. Brain directory
    const brainDir = path.join(config.agy.brainDir, sessionId);
    try {
      if (fs.existsSync(brainDir)) {
        fs.rmSync(brainDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error(`Failed to delete brain dir: ${brainDir}`, e);
    }
    // 2. Database files
    const conversationsDir = watcher.conversationsDir;
    const dbExtensions = ['.db', '.db-wal', '.db-shm'];
    for (const ext of dbExtensions) {
      const dbFile = path.join(conversationsDir, `${sessionId}${ext}`);
      try {
        if (fs.existsSync(dbFile)) {
          fs.rmSync(dbFile, { force: true });
        }
      } catch (e) {
        console.error(`Failed to delete db file: ${dbFile}`, e);
      }
    }
    // 3. Remove from watcher known sessions
    watcher.knownSessions.delete(sessionId);
  };
  ```

---

### Task 3: Verify and complete the tests

**Files:**
- Modify: `tests/index.test.js`

- [ ] **Step 1: Run all tests to verify everything passes**
  Run: `npx vitest run`
  Expected: PASS

- [ ] **Step 2: Commit changes**
  Run:
  ```bash
  git add src/index.js tests/index.test.js
  git commit -m "feat: implement index-based session commands /stop, /switch, and /del with agy filesystem cleanup"
  ```
