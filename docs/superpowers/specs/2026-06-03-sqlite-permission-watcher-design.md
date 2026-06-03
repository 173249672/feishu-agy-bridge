# Design: SQLite-based Tool Permission Watcher

This design outlines the changes to resolve the silent deadlock issue when the `agy` process is waiting for tool permissions. Since `agy` buffers `transcript.jsonl` writes while waiting for user permissions, we will query the SQLite database (`.db`) file directly to capture pending permission requests in real-time.

## Proposed Changes

### 1. SQLite Helper Component (`src/db-helper.py`)
Modify `src/db-helper.py` to parse step type 8 (tool/permission request) and status 9 (pending) in addition to questions. Extract the tool action or summary from the binary protobuf payload and return a JSON dictionary.

### 2. Session Watcher Component (`src/session-watcher.js`)
Modify `src/session-watcher.js` to watch for updates on both `<session-id>.db` and `<session-id>.db-wal` (since SQLite WAL writes to the `-wal` file first). Extract the session ID and trigger `db-helper.py` to check for pending questions or permission approvals. Emit `session:permission` or `session:question` based on the helper output.

### 3. Orchestrator Component (`src/index.js`)
Listen to `session:permission` events, generate a Lark permission approval card using `CardBuilder.buildPermissionCard`, and send it to the Feishu chat.

## Verification Plan

### Automated Tests
1. Add a unit test in `tests/session-watcher.test.js` or `tests/index.test.js` verifying that `session:permission` events are correctly emitted when database rows contain step type 8 and status 9.
2. Run `npx vitest run` to ensure all tests pass.

### Manual Verification
1. Start a new session using `/new 当前在哪个文件夹`.
2. Confirm that the Feishu bot successfully surfaces a Lark interactive card requesting tool permission (`⚠️ AGY 请求操作确认`).
3. Click "确认" (Approve) on the card.
4. Verify that the session continues and returns the result.
