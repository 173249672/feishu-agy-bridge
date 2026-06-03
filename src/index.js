import { config } from './config.js';
import { SessionRegistry } from './session-registry.js';
import { AGYInjector } from './agy-injector.js';
import { SessionWatcher } from './session-watcher.js';
import { EventClassifier } from './event-classifier.js';
import { FeishuClient } from './feishu-client.js';
import * as CardBuilder from './card-builder.js';
import { spawn } from 'child_process';

const registry = new SessionRegistry();
const injector = new AGYInjector(config.agy.brainDir, config.agy.settingsPath);
const watcher = new SessionWatcher(config.agy.brainDir);
const classifier = new EventClassifier();
const feishu = new FeishuClient(config.feishu.appId, config.feishu.appSecret, config.feishu.defaultChatId);

const activeProcesses = new Map();
const spawnedQueue = [];

watcher.on('session:new', ({ sessionId, filePath }) => {
  console.log(`[Watcher] New session detected: ${sessionId}`);
  registry.register(sessionId, filePath);

  const pending = spawnedQueue.shift();
  if (pending) {
    activeProcesses.set(sessionId, pending.cp);
    const session = registry.get(sessionId);
    if (session) {
      session.feishuChatId = pending.chatId;
    }
  }
});

watcher.on('line', async ({ sessionId, line }) => {
  console.log(`[Watcher][${sessionId}] ${line}`);
  const event = classifier.classifyLine(line);
  if (!event) return;

  const session = registry.get(sessionId);
  if (!session) return;

  let card;
  if (event.eventType === 'PERMISSION_REQUIRED') {
    card = CardBuilder.buildPermissionCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'ERROR') {
    card = CardBuilder.buildErrorCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'COMPLETED') {
    card = CardBuilder.buildCompletedCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'STATUS_CHANGE') {
    card = CardBuilder.buildStatusCard(sessionId, event.summary);
  }

  if (card) {
    const msgId = await feishu.sendInteractiveCard(session.feishuChatId, card);
    session.lastMessageId = msgId;
  }
});

watcher.on('error', (err) => {
  console.error('[Watcher] Error:', err);
});

const messageHandler = async ({ chatId, senderId, text, isP2P }) => {
  const input = text.trim();
  console.log(`[Feishu] Message from ${senderId} in ${chatId}: ${input}`);

  if (input.startsWith('/')) {
    const parts = input.split(' ');
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    if (command === '/new') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, '❌ Please specify a prompt. Example: `/new help me write a script`');
        return;
      }

      await feishu.sendTextMessage(chatId, `🚀 Starting new session with prompt: "${arg}"...`);
      
      const cp = spawn('agy', ['-i', arg], {
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' }
      });

      spawnedQueue.push({ cp, chatId, timestamp: Date.now() });

      cp.stdout.on('data', (data) => {
        console.log(`[AGY Out]: ${data}`);
      });

      cp.stderr.on('data', (data) => {
        console.error(`[AGY Err]: ${data}`);
      });

      cp.on('close', (code) => {
        console.log(`[AGY Closed] Exit code: ${code}`);
        for (const [sid, processCp] of activeProcesses.entries()) {
          if (processCp === cp) {
            activeProcesses.delete(sid);
            break;
          }
        }
      });
      return;
    }

    if (command === '/list') {
      const list = registry.list();
      if (list.length === 0) {
        await feishu.sendTextMessage(chatId, 'No active sessions found.');
        return;
      }
      const defaultSess = registry.getDefault();
      const lines = list.map(s => {
        const isDefault = defaultSess && defaultSess.id === s.id ? '⭐ ' : '  ';
        return `${isDefault}\`${s.id}\` (started: ${s.startTime.toLocaleTimeString()})`;
      });
      await feishu.sendTextMessage(chatId, `📋 Active Sessions:\n${lines.join('\n')}`);
      return;
    }

    if (command === '/switch') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, '❌ Usage: `/switch <session-id>`');
        return;
      }
      const success = registry.setDefault(arg);
      if (success) {
        await feishu.sendTextMessage(chatId, `✅ Switched default session to \`${arg}\``);
      } else {
        await feishu.sendTextMessage(chatId, `❌ Session \`${arg}\` not found in registry.`);
      }
      return;
    }

    if (command === '/model') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, '❌ Usage: `/model <model-name>` (e.g. `flash`, `claude`, `gemini`)');
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

    if (command === '/stop') {
      const defaultSess = registry.getDefault();
      if (!defaultSess) {
        await feishu.sendTextMessage(chatId, 'No active default session.');
        return;
      }
      const cp = activeProcesses.get(defaultSess.id);
      if (cp) {
        cp.kill();
        await feishu.sendTextMessage(chatId, `⏹️ Stopped process for session \`${defaultSess.id}\``);
      }
      registry.remove(defaultSess.id);
      await feishu.sendTextMessage(chatId, `✅ Stopped watching session \`${defaultSess.id}\``);
      return;
    }

    await feishu.sendTextMessage(chatId, `❌ Unknown command: ${command}`);
    return;
  }

  const defaultSess = registry.getDefault();
  if (!defaultSess) {
    await feishu.sendTextMessage(chatId, '❌ No active session to reply to. Use `/new <prompt>` to start one.');
    return;
  }

  defaultSess.feishuChatId = chatId;
  injector.injectMessage(defaultSess.id, input);

  const cp = activeProcesses.get(defaultSess.id);
  if (cp && cp.stdin.writable) {
    cp.stdin.write(`${input}\n`);
  }
};

const actionHandler = async ({ actionType, sessionId, stepIndex, operatorId, messageId }) => {
  console.log(`[Feishu Action] ${actionType} for session ${sessionId} step #${stepIndex} by ${operatorId}`);

  const responseText = actionType === 'approve' ? 'y' : 'n';
  injector.injectMessage(sessionId, responseText);

  const cp = activeProcesses.get(sessionId);
  if (cp && cp.stdin.writable) {
    cp.stdin.write(`${responseText}\n`);
  }

  return {
    toast: {
      type: 'success',
      content: `Submitted: ${actionType.toUpperCase()}`
    },
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: actionType === 'approve' ? 'green' : 'grey',
        title: { tag: 'plain_text', content: `✅ AGY 权限已${actionType === 'approve' ? '确认' : '拒绝'}` }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**结果**: 已由用户进行${actionType === 'approve' ? '确认' : '拒绝'}。`
          }
        }
      ]
    }
  };
};

async function main() {
  console.log('Starting Feishu-AGY Bridge...');
  watcher.start();
  await feishu.start(messageHandler, actionHandler);
  console.log('Feishu-AGY Bridge is running.');
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
