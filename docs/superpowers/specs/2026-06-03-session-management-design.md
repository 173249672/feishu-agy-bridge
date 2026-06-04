# Session Management Design Doc

## Overview
This design document details the enhancement of the session management commands `/list`, `/switch`, `/stop` and the new `/del` command in the Feishu-AGY bridge to support index-based interactions and processes stopping without removing sessions.

## Goals
- Modify `/stop` to only terminate the running agy process, preserving the session metadata in the registry list.
- Modify `/list` to return 1-based index numbers sorted by `startTime` (ascending), with visual indicators for process running states (`🟢` vs `⚪`).
- Support index-based lookup in `/switch`, `/stop`, and the new `/del` commands.
- Implement `/del <idx or session-id>` and `/del all` to stop running processes and completely remove session metadata from the registry.

## Components and Architecture

### Index Resolution
A helper function `resolveSession` will translate a string parameter into a session:
1. Try parsing the argument as an integer.
2. If it is a valid 1-based index within the list of sorted sessions (sorted by `startTime` ascending), retrieve the session at that index.
3. Otherwise, look up the session by its exact UUID from the registry.

### Registry and Process Maps
- `SessionRegistry` stores session metadata.
- `activeProcesses` (in-memory Map) maps a sessionId to its running process instance (`ChildProcess`).

## Verification Plan

### Automated tests
We will add unit tests in `tests/index.test.js` to assert the following behaviors:
- `/list` displays 1-based indices, running state indicators (`🟢` / `⚪`), and default indicators (`⭐`).
- `/switch` switches using either index or UUID.
- `/stop` kills process and keeps session in registry.
- `/del` kills process and removes session from registry (supporting index, UUID, and `all`).
