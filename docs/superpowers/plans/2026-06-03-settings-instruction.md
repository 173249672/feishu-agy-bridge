# Settings Command and Multi-Language Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a `/settings` command that displays an interactive card to configure card style presets, wide-screen mode toggles, and language selection (Chinese/English) with translation files.

**Architecture:** We will implement:
1. `src/settings-manager.js`: Handles disk persistence for setting parameters to `bridge-settings.json` in the brain directory.
2. `src/i18n.js`: Maps text and card labels for translations.
3. `src/card-builder.js`: Dynamically uses the language translations and theme templates to generate status/action cards, and adds the settings card layout.
4. `src/index.js`: Integrates settings command, translates all prompt strings, and handles settings callbacks.

**Tech Stack:** Node.js, child_process, fs, Vitest

---

### Task 1: Create Settings Manager and translation dictionary

**Files:**
- Create: `src/settings-manager.js`
- Create: `src/i18n.js`
- Test: `tests/settings.test.js`

- [ ] **Step 1: Implement `src/settings-manager.js`**
  Create the settings manager class to load/save JSON properties.
  
- [ ] **Step 2: Implement `src/i18n.js`**
  Create the dictionary structure containing English and Chinese messages.
  
- [ ] **Step 3: Write tests for Settings Manager and i18n**
  Write tests in a new file `tests/settings.test.js`.
  
- [ ] **Step 4: Run tests to verify correctness**
  Run: `npx vitest run tests/settings.test.js`
  Expected: PASS

---

### Task 2: Refactor `src/card-builder.js` for translations, themes, and settings card

**Files:**
- Modify: `src/card-builder.js`
- Test: `tests/card-builder.test.js`

- [ ] **Step 1: Modify existing card builders to use `t()` translation keys**
  Update title strings, label strings, button text, and tips in `src/card-builder.js`.
  
- [ ] **Step 2: Implement card header theme overrides and wide-screen overrides**
  Use `settingsManager.get('theme')` to override header color templates, and `settingsManager.get('wideScreen')` for wide-screen layout parameters.
  
- [ ] **Step 3: Implement `buildSettingsCard()`**
  Create the interactive settings menu card with selectors for Language, Theme Color, and Wide Screen.
  
- [ ] **Step 4: Update and verify card-builder tests**
  Modify card-builder tests to adapt to the translation parameters and verify success.
  Run: `npx vitest run tests/card-builder.test.js`
  Expected: PASS

---

### Task 3: Integrate settings command and translate messages in `src/index.js`

**Files:**
- Modify: `src/index.js`
- Modify: `tests/index.test.js`

- [ ] **Step 1: Replace hardcoded strings in `src/index.js` command handlers with `t()`**
  Translate all response texts for `/new`, `/list`, `/switch`, `/stop`, `/del`, `/model` and error handling.
  
- [ ] **Step 2: Add `/settings` command handler in messageHandler**
  Respond with settings card:
  ```javascript
  if (command === '/settings') {
    const card = CardBuilder.buildSettingsCard();
    await feishu.sendInteractiveCard(chatId, card);
    return;
  }
  ```
  
- [ ] **Step 3: Handle setting button actions in actionHandler**
  Parse actions (`set_lang`, `set_theme`, `toggle_widescreen`), persist updates, trigger in-place card updates, and reply with success toasts.
  
- [ ] **Step 4: Update test suite in `tests/index.test.js`**
  Add unit tests verifying settings command display and action handlers.
  
- [ ] **Step 5: Verify all tests in the repository**
  Run: `npx vitest run`
  Expected: PASS
