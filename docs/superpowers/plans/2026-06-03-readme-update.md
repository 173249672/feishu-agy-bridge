# README Documentation Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `README.md` and `README.zh-CN.md` to document the dynamic option selection for permission cards via PTY arrow navigation.

**Architecture:** Edit English and Chinese README documentation to include descriptions of parsing and interactive buttons for multi-choice permission options.

**Tech Stack:** Markdown, Git

---

### Task 1: Update README.md (English)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Modify Features and Event Cards in README.md**

Modify the "Two-way Communication" item under **Features**:
```markdown
- **Two-way Communication**: Interacts with active agy sessions. Approving or rejecting a tool permission from Feishu card buttons writes the response to agy's stdin. For multi-choice permissions, it dynamically parses options from stdout and simulates PTY arrow-key navigation when clicked.
```

Modify the "Permission Request" row under **Event Cards**:
```markdown
| Permission Request | 🟡 Yellow | agy requests tool execution approval; includes ✅ / ❌ buttons, or dynamic choice buttons for multi-choice permissions |
```

- [ ] **Step 2: Commit the changes**

Run:
```bash
git add README.md
git commit -m "docs: document dynamic option selection in README.md"
```
Expected: Clean commit.

---

### Task 2: Update README.zh-CN.md (Chinese)

**Files:**
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Modify Features and Event Cards in README.zh-CN.md**

Modify the "双向交互注入" item under **功能特性**:
```markdown
- **双向交互注入**：当 agy 提示输入或需要工具执行权限确认时，在飞书卡片上点击相应按钮可将输入写入 stdin。对于多项配置选择，会动态解析选项并通过 PTY 模拟方向键交互进行确认。
```

Modify the "权限请求" row under **事件卡片类型**:
```markdown
| 权限请求 | 🟡 黄色 | agy 请求工具执行确认，含 ✅ / ❌ 按钮，或动态配置选项按钮 |
```

- [ ] **Step 2: Commit the changes**

Run:
```bash
git add README.zh-CN.md
git commit -m "docs: document dynamic option selection in README.zh-CN.md"
```
Expected: Clean commit.

---

### Task 3: Verification

- [ ] **Step 1: Check git diff and workspace status**

Run:
```bash
git status
```
Expected: Working tree clean, everything committed.
