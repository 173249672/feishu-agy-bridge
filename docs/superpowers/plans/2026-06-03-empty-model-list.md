# Model Command Argument Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the `/model` command in the Feishu bot to list all available models and the current active model when called without any arguments.

**Architecture:** Retrieve current model information and available model aliases from `AGYInjector.getModelsInfo()`, then format and send the response back to the Feishu channel.

**Tech Stack:** Node.js, Lark (Feishu) Open SDK, Vitest

---

### Task 1: Add unit tests for getModelsInfo in agy-injector.test.js

**Files:**
- Modify: `tests/agy-injector.test.js`

- [ ] **Step 1: Write a unit test for `getModelsInfo` in `tests/agy-injector.test.js`**
  Modify `tests/agy-injector.test.js` to add a test case verifying `getModelsInfo()` retrieves the correct current model and aliases dictionary.
  
  ```javascript
  it('should get correct models info', () => {
    const injector = new AGYInjector(tempDir, settingsFile);
    const info = injector.getModelsInfo();
    expect(info.currentModel).toBe('Gemini 3.5 Flash (High)');
    expect(info.aliases).toEqual({
      'flash': 'Gemini 3.5 Flash (High)',
      'medium': 'Gemini 3.5 Flash (Medium)',
      'claude': 'Claude Sonnet 4.6 (Thinking)',
      'gemini': 'Gemini 2.5 Pro',
    });
  });
  ```

- [ ] **Step 2: Run tests to verify the new test passes**
  Run: `npx vitest run tests/agy-injector.test.js`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add tests/agy-injector.test.js
  git commit -m "test: add unit test for getModelsInfo in agy-injector"
  ```

---

### Task 2: Implement empty argument behavior for /model in index.js

**Files:**
- Modify: `src/index.js:184-196`

- [ ] **Step 1: Update the /model handler to format and return models when no argument is passed**
  Update the conditional check block for `/model` command in `src/index.js` to get models info, format them into a bullet list, and send the message back to the Feishu chat.
  
  ```javascript
    if (command === '/model') {
      if (!arg) {
        const info = injector.getModelsInfo();
        const availableList = Object.entries(info.aliases)
          .map(([alias, name]) => `• ${alias}: ${name}`)
          .join('\n');
        await feishu.sendTextMessage(
          chatId,
          `🤖 Current Model: \`${info.currentModel}\`\n\n📋 Available Models:\n${availableList}\n\nUsage: \`/model <model-name>\``
        );
        return;
      }
      try {
        const chosenModel = injector.switchModel(arg);
        await feishu.sendTextMessage(chatId, `✅ Model switched to \`${chosenModel}\``);
      } catch (err) {
        await feishu.sendTextMessage(chatId, `❌ Failed to switch model: ${err.message}`);
      }
      return;
    }
  ```

- [ ] **Step 2: Run all unit tests**
  Run: `npx vitest run`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/index.js
  git commit -m "feat: list available models when /model is called without arguments"
  ```
