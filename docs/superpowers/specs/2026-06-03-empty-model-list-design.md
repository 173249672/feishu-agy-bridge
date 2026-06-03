# Design: Display All Available Models for `/model` Command Without Argument

This design document outlines the changes to return all available models and the current active model when the `/model` command is called without specifying a model name.

## Proposed Changes

### Component: Feishu Bridge Handler (`src/index.js`)

Modify the `/model` command handler to call `injector.getModelsInfo()` and format a user-friendly list of available models.

#### Target: `src/index.js`

Replace the check `if (!arg)` in the `/model` block:

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

## Verification Plan

### Manual Verification
1. Open Feishu and send `/model` without any argument to the bot.
2. Verify that it prints:
   * The current model.
   * A list of all available model aliases and their descriptions.
   * Usage instructions.
3. Verify that `/model <model-name>` still works to switch the model.
