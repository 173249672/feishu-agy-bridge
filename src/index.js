import { config } from './config.js';
import { SessionRegistry } from './session-registry.js';
import { AGYInjector } from './agy-injector.js';
import { SessionWatcher } from './session-watcher.js';
import { EventClassifier } from './event-classifier.js';
import { FeishuClient } from './feishu-client.js';
import * as CardBuilder from './card-builder.js';
import { spawn } from 'child_process';

const registry = new SessionRegistry();
export const injector = new AGYInjector(config.agy.brainDir, config.agy.settingsPath);
export const watcher = new SessionWatcher(config.agy.brainDir);
const classifier = new EventClassifier();
export const feishu = new FeishuClient(config.feishu.appId, config.feishu.appSecret, config.feishu.defaultChatId);

const activeProcesses = new Map();
const spawnedQueue = [];
const newline = process.platform === 'darwin' ? '\r' : '\n';

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
    registry.setDefault(sessionId);
    console.log(`[Registry] Set default session to ${sessionId} (spawned via /new)`);
  }
});

watcher.on('line', async ({ sessionId, line }) => {
  console.log(`[Watcher][${sessionId}] ${line}`);
  
  const session = registry.get(sessionId);
  if (!session) return;

  const event = classifier.classifyLine(line);
  if (!event) {
    if (session.status !== 'busy') {
      session.status = 'busy';
    }
    return;
  }

  let card;
  if (event.eventType === 'PERMISSION_REQUIRED') {
    session.status = 'waiting_permission';
    card = CardBuilder.buildPermissionCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'ERROR') {
    session.status = 'error';
    card = CardBuilder.buildErrorCard(sessionId, event.stepIndex, event.summary);
  } else if (event.eventType === 'COMPLETED') {
    session.status = 'waiting_input';
    const isActive = activeProcesses.has(sessionId);
    card = CardBuilder.buildCompletedCard(sessionId, event.stepIndex, event.summary, isActive);
  } else if (event.eventType === 'STATUS_CHANGE') {
    card = CardBuilder.buildStatusCard(sessionId, event.summary);
  }

  if (card) {
    const msgId = await feishu.sendInteractiveCard(session.feishuChatId, card);
    session.lastMessageId = msgId;
  }
});

watcher.on('session:question', async ({ sessionId, idx, questionData }) => {
  console.log(`[Watcher][${sessionId}] Question detected at step #${idx}`);
  const session = registry.get(sessionId);
  if (!session) return;

  if (session.lastQuestionIdx === idx) return;
  session.lastQuestionIdx = idx;

  session.status = 'waiting_input';
  const card = CardBuilder.buildQuestionCard(sessionId, idx, questionData);
  const msgId = await feishu.sendInteractiveCard(session.feishuChatId, card);
  session.lastMessageId = msgId;
});

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

watcher.on('error', (err) => {
  console.error('[Watcher] Error:', err);
});


export const messageHandler = async ({ chatId, senderId, text, isP2P }) => {
  const input = text.trim();
  console.log(`[Feishu] Message from ${senderId} in ${chatId}: ${input}`);

  // Security authorization check: only allow commands from the authorized defaultChatId
  if (config.feishu.defaultChatId && chatId !== config.feishu.defaultChatId) {
    console.warn(`[Security] Unauthorized message attempt from chatId: ${chatId}`);
    await feishu.sendTextMessage(chatId, '❌ You are not authorized to interact with this bot.');
    return;
  }

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
      
      // Clean environment to avoid agent-specific variables causing conflicts
      const cleanEnv = { ...process.env, FORCE_COLOR: '1' };
      for (const key of Object.keys(cleanEnv)) {
        if (key.startsWith('ANTIGRAVITY_') || key.startsWith('CHROME_') || key.startsWith('AGY_BROWSER_')) {
          delete cleanEnv[key];
        }
      }

      // On macOS, we wrap the spawn using python3's pty module to allocate a pseudo-terminal (PTY).
      // This prevents agy from deadlocking on reading stdin, and satisfies Bubble Tea's TTY requirements.
      const isMac = process.platform === 'darwin';
      const cmd = isMac ? 'python3' : 'agy';
      const spawnArgs = isMac 
        ? ['-c', 'import pty, sys; pty.spawn(sys.argv[1:])', 'agy', '-i', arg]
        : ['-i', arg];

      const cp = spawn(cmd, spawnArgs, {
        env: cleanEnv
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
  
  const cp = activeProcesses.get(defaultSess.id);
  if (!cp) {
    await feishu.sendTextMessage(chatId, `❌ The current default session \`${defaultSess.id}\` is not active (no running process). Use \`/switch <session-id>\` or start a new one with \`/new <prompt>\`.`);
    return;
  }

  if (defaultSess.status === 'busy') {
    await feishu.sendTextMessage(chatId, `⏳ 机器人当前正忙于执行任务，请等待本轮任务完成后再输入。您也可以发送 \`/stop\` 中断当前任务。`);
    return;
  }

  injector.injectMessage(defaultSess.id, input);

  if (cp.stdin.writable) {
    cp.stdin.write(`${input}${newline}`);
    console.log(`[Feishu] Forwarded input to session ${defaultSess.id}: ${input}`);
    defaultSess.status = 'busy';
  } else {
    console.error(`[Feishu] Process stdin for session ${defaultSess.id} is not writable!`);
  }
};

const actionHandler = async (params) => {
  const { actionType, sessionId, stepIndex, operatorId, messageId } = params;
  console.log(`[Feishu Action] ${actionType} for session ${sessionId} step #${stepIndex} by ${operatorId}`);

  if (actionType === 'answer') {
    const { optionIndex, text } = params;
    console.log(`[Feishu Action] Answer selected: idx=${optionIndex}, text=${text}`);
    
    injector.injectMessage(sessionId, text);

    const cp = activeProcesses.get(sessionId);
    if (cp && cp.stdin.writable) {
      cp.stdin.write(`\r`);
    }

    return {
      toast: {
        type: 'success',
        content: `Selected Option ${optionIndex + 1}`
      },
      card: {
        config: { wide_screen_mode: true },
        header: {
          template: 'green',
          title: { tag: 'plain_text', content: `✅ 问题已回答` }
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**您的选择**: \n${optionIndex + 1}️⃣ ${text}`
            }
          }
        ]
      }
    };
  }

  const responseText = actionType === 'approve' ? 'y' : 'n';
  injector.injectMessage(sessionId, responseText);

  const cp = activeProcesses.get(sessionId);
  if (cp && cp.stdin.writable) {
    cp.stdin.write(`${responseText}${newline}`);
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

if (!process.env.VITEST) {
  main().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
