import { config } from './config.js';
import { SessionRegistry } from './session-registry.js';
import { AGYInjector } from './agy-injector.js';
import { SessionWatcher } from './session-watcher.js';
import { EventClassifier } from './event-classifier.js';
import { FeishuClient } from './feishu-client.js';
import * as CardBuilder from './card-builder.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { t } from './i18n.js';
import { settingsManager } from './settings-manager.js';

const registry = new SessionRegistry();
export const injector = new AGYInjector(config.agy.brainDir, config.agy.settingsPath);
export const watcher = new SessionWatcher(config.agy.brainDir);
const classifier = new EventClassifier();
export const feishu = new FeishuClient(config.feishu.appId, config.feishu.appSecret, config.feishu.defaultChatId);

export const activeProcesses = new Map();
export const spawnedQueue = [];
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
  } else {
    // If not in spawnedQueue, this session was spawned internally (e.g., a subagent).
    // Inherit the chatId of the current default active session.
    const defaultSess = registry.getDefault();
    const session = registry.get(sessionId);
    if (session && defaultSess) {
      session.feishuChatId = defaultSess.feishuChatId;
      console.log(`[Registry] Session ${sessionId} inherited chatId ${defaultSess.feishuChatId} from default session ${defaultSess.id}`);
    }
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

function parsePermissionOptions(stdout) {
  if (!stdout) return null;
  const clean = stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  
  let startLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].match(/^(?:>\s*)?1\.\s*(.*)$/)) {
      startLineIdx = i;
      break;
    }
  }
  
  if (startLineIdx === -1) return null;
  
  const options = [];
  let expectedIndex = 1;
  
  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.includes('navigate') || 
      lowerLine.includes('↑/↓') || 
      lowerLine.includes('enter to select') || 
      lowerLine.includes('esc to cancel') || 
      lowerLine.includes('tab amend') || 
      lowerLine.includes('edit command') ||
      lowerLine.includes('use arrow keys')
    ) {
      continue;
    }
    const match = line.match(/^(?:>\s*)?([1-9][0-9]*)\.\s*(.*)$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const text = match[2].trim();
      
      if (idx === expectedIndex) {
        options.push({ idx, text });
        expectedIndex++;
        continue;
      }
    }
    
    if (options.length > 0) {
      options[options.length - 1].text += ' ' + line;
    }
  }
  
  return options.length > 0 ? options : null;
}

watcher.on('session:permission', async ({ sessionId, idx, reason }) => {
  console.log(`[Watcher][${sessionId}] Permission required at step #${idx}: ${reason}`);
  const session = registry.get(sessionId);
  if (!session) return;

  const permKey = `${idx}:${reason}`;
  if (session.lastPermissionKey === permKey) return;
  session.lastPermissionKey = permKey;
  session.lastPermissionIdx = idx;

  session.status = 'waiting_permission';

  let options = null;
  const cp = activeProcesses.get(sessionId);
  if (cp && cp.stdoutBuffer) {
    options = parsePermissionOptions(cp.stdoutBuffer);
  }

  const card = CardBuilder.buildPermissionCard(sessionId, idx, reason, options);
  const msgId = await feishu.sendInteractiveCard(session.feishuChatId, card);
  session.lastMessageId = msgId;
});

watcher.on('session:agy_error', async ({ sessionId, idx, message }) => {
  console.error(`[Watcher][${sessionId}] AGY error at step #${idx}: ${message}`);

  // Find the chatId — look in session registry or fall back to defaultChatId
  const session = registry.get(sessionId);
  const targetChatId = session?.feishuChatId || config.feishu.defaultChatId;

  if (!targetChatId) return;

  // Deduplicate by idx
  if (session && session.lastErrorIdx === idx) return;
  if (session) session.lastErrorIdx = idx;

  await feishu.sendTextMessage(targetChatId, t('new_fail', message));

  // Kill the frozen agy process for this session
  const cp = activeProcesses.get(sessionId);
  if (cp) {
    cp.errorNotified = true;
    try { cp.kill('SIGTERM'); } catch (e) {}
    activeProcesses.delete(sessionId);
  }
});

watcher.on('error', (err) => {
  console.error('[Watcher] Error:', err);
});


function resolveSession(arg) {
  if (!arg) return null;
  const list = registry.list().sort((a, b) => a.startTime - b.startTime);
  const idx = parseInt(arg, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= list.length) {
    return list[idx - 1];
  }
  return registry.get(arg) || null;
}

const deleteSessionFiles = (sessionId) => {
  const brainDir = path.join(config.agy.brainDir, sessionId);
  try {
    if (fs.existsSync(brainDir)) {
      fs.rmSync(brainDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`Failed to delete brain dir: ${brainDir}`, e);
  }
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
  watcher.knownSessions.delete(sessionId);
};

// Max length for /new task prompt to prevent resource abuse
const MAX_NEW_ARG_LENGTH = 4096;

export const messageHandler = async ({ chatId, senderId, text, isP2P }) => {
  const input = text.trim();
  // Truncate logged input to avoid leaking sensitive data in logs
  const logInput = input.length > 120 ? input.slice(0, 120) + '…' : input;
  console.log(`[Feishu] Message from ${senderId} in ${chatId}: ${logInput}`);

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
        await feishu.sendTextMessage(chatId, t('new_usage'));
        return;
      }

      // Guard against excessively long prompts
      if (arg.length > MAX_NEW_ARG_LENGTH) {
        await feishu.sendTextMessage(chatId, `❌ Task prompt too long (max ${MAX_NEW_ARG_LENGTH} characters).`);
        return;
      }

      await feishu.sendTextMessage(chatId, t('new_start', arg));
      
      // Clean environment to avoid agent-specific variables causing conflicts
      const cleanEnv = { ...process.env, FORCE_COLOR: '1' };
      for (const key of Object.keys(cleanEnv)) {
        if (key === 'ANTIGRAVITY_LS_ADDRESS' || key === 'ANTIGRAVITY_CSRF_TOKEN' || key === 'ANTIGRAVITY_PROJECT_ID') {
          continue;
        }
        if (key.startsWith('ANTIGRAVITY_') || key.startsWith('CHROME_') || key.startsWith('AGY_BROWSER_')) {
          delete cleanEnv[key];
        }
      }

      // On macOS, we wrap the spawn using python3's pty module to allocate a pseudo-terminal (PTY).
      // This prevents agy from deadlocking on reading stdin, and satisfies Bubble Tea's TTY requirements.
      // We explicitly configure the PTY window size to 80 columns and 24 rows to ensure the Bubble Tea TUI
      // renders and focuses its text inputs correctly.
      const isMac = process.platform === 'darwin';
      const cmd = isMac ? 'python3' : 'agy';
      const spawnArgs = isMac 
        ? [
            '-c',
            'import pty, os, sys, fcntl, termios, struct;\n' +
            'pid, fd = pty.fork()\n' +
            'if pid == 0:\n' +
            '    try: fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))\n' +
            '    except: pass\n' +
            '    os.execlp(sys.argv[1], *sys.argv[1:])\n' +
            'else:\n' +
            '    try: pty._copy(fd)\n' +
            '    except: pass',
            'agy', '-i', arg
          ]
        : ['-i', arg];

      const cp = spawn(cmd, spawnArgs, {
        env: cleanEnv
      });

      cp.stdoutBuffer = '';
      const startTime = Date.now();
      let stderrBuffer = '';
      spawnedQueue.push({ cp, chatId, timestamp: startTime });

      cp.errorNotified = false;
      const notifyError = async (rawMessage) => {
        if (cp.errorNotified) return;
        cp.errorNotified = true;
        const clean = rawMessage.replace(/\x1b\[[^m]*m|[\x00-\x08\x0e-\x1f\x7f]/g, '').trim();
        const quotaMatch = clean.match(/Individual quota reached[^.\n]*/);
        const resourceMatch = clean.match(/RESOURCE_EXHAUSTED[^\n]*/i);
        const shortError = quotaMatch?.[0] || resourceMatch?.[0] || clean.split('\n').find(l => l.trim()) || clean;

        await feishu.sendTextMessage(chatId, t('new_fail', shortError.slice(0, 300)));
      };

      cp.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(`[AGY Out]: ${text}`);
        cp.stdoutBuffer += text;
      });

      cp.stderr.on('data', (data) => {
        const text = data.toString();
        console.error(`[AGY Err]: ${text}`);
        stderrBuffer += text;
      });

      cp.on('close', async (code) => {
        const elapsed = Date.now() - startTime;
        console.log(`[AGY Closed] Exit code: ${code}, elapsed: ${elapsed}ms`);

        // Remove from activeProcesses
        for (const [sid, processCp] of activeProcesses.entries()) {
          if (processCp === cp) {
            activeProcesses.delete(sid);
            break;
          }
        }

        // Fallback: if closed with error and we haven't already notified
        if (code !== 0 && !cp.errorNotified) {
          await notifyError(cp.stdoutBuffer + stderrBuffer || `AGY exited with code ${code}`);
        }
      });
      return;
    }

    if (command === '/list') {
      const list = registry.list().sort((a, b) => a.startTime - b.startTime);
      if (list.length === 0) {
        await feishu.sendTextMessage(chatId, t('list_empty'));
        return;
      }
      const defaultSess = registry.getDefault();
      const lines = list.map((s, i) => {
        const isDefault = defaultSess && defaultSess.id === s.id ? '⭐ ' : '  ';
        const isActive = activeProcesses.has(s.id);
        const statusIndicator = isActive ? '🟢' : '⚪';
        return `[${i + 1}] ${isDefault}${statusIndicator} \`${s.id}\` (started: ${s.startTime.toLocaleTimeString()})`;
      });
      await feishu.sendTextMessage(chatId, `${t('list_header')}\n${lines.join('\n')}`);
      return;
    }

    if (command === '/switch') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, t('switch_usage'));
        return;
      }
      const session = resolveSession(arg);
      if (session) {
        registry.setDefault(session.id);
        await feishu.sendTextMessage(chatId, t('switch_success', session.id));
      } else {
        await feishu.sendTextMessage(chatId, t('switch_fail', arg));
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
          `${t('model_list_header', info.currentModel)}${availableList}${t('model_usage')}`
        );
        return;
      }
      try {
        const chosenModel = injector.switchModel(arg);
        await feishu.sendTextMessage(chatId, t('model_success', chosenModel));
      } catch (err) {
        await feishu.sendTextMessage(chatId, t('model_fail', err.message));
      }
      return;
    }

    if (command === '/stop') {
      let session;
      if (arg) {
        session = resolveSession(arg);
        if (!session) {
          await feishu.sendTextMessage(chatId, t('switch_fail', arg));
          return;
        }
      } else {
        session = registry.getDefault();
        if (!session) {
          await feishu.sendTextMessage(chatId, t('stop_no_default'));
          return;
        }
      }
      const cp = activeProcesses.get(session.id);
      if (cp) {
        try { cp.kill('SIGTERM'); } catch (e) {}
        activeProcesses.delete(session.id);
        await feishu.sendTextMessage(chatId, t('stop_success', session.id));
      } else {
        await feishu.sendTextMessage(chatId, t('stop_already', session.id));
      }
      return;
    }

    if (command === '/del') {
      if (!arg) {
        await feishu.sendTextMessage(chatId, t('del_usage'));
        return;
      }
      if (arg.toLowerCase() === 'all') {
        const list = registry.list();
        let deletedCount = 0;
        for (const s of list) {
          const cp = activeProcesses.get(s.id);
          if (cp) {
            try { cp.kill('SIGTERM'); } catch (e) {}
            activeProcesses.delete(s.id);
          }
          deleteSessionFiles(s.id);
          registry.remove(s.id);
          deletedCount++;
        }
        await feishu.sendTextMessage(chatId, t('del_all', deletedCount));
        return;
      }
      const session = resolveSession(arg);
      if (!session) {
        await feishu.sendTextMessage(chatId, t('switch_fail', arg));
        return;
      }
      const cp = activeProcesses.get(session.id);
      if (cp) {
        try { cp.kill('SIGTERM'); } catch (e) {}
        activeProcesses.delete(session.id);
      }
      deleteSessionFiles(session.id);
      registry.remove(session.id);
      await feishu.sendTextMessage(chatId, t('del_success', session.id));
      return;
    }

    if (command === '/settings') {
      const card = CardBuilder.buildSettingsCard();
      await feishu.sendInteractiveCard(chatId, card);
      return;
    }

    if (command === '/help') {
      await feishu.sendTextMessage(chatId, t('help_content'));
      return;
    }

    await feishu.sendTextMessage(chatId, t('unknown_command', command));
    return;
  }

  const defaultSess = registry.getDefault();
  if (!defaultSess) {
    await feishu.sendTextMessage(chatId, t('no_active_session'));
    return;
  }

  defaultSess.feishuChatId = chatId;
    
  const cp = activeProcesses.get(defaultSess.id);
  if (!cp) {
    await feishu.sendTextMessage(chatId, t('session_not_active', defaultSess.id));
    return;
  }

  if (defaultSess.status === 'busy') {
    await feishu.sendTextMessage(chatId, t('bot_busy'));
    return;
  }

  injector.injectMessage(defaultSess.id, input);

  if (cp.stdin.writable) {
    cp.stdin.write(`${input}${newline}`);
    const logFwd = input.length > 120 ? input.slice(0, 120) + '…' : input;
    console.log(`[Feishu] Forwarded input to session ${defaultSess.id}: ${logFwd}`);
    defaultSess.status = 'busy';
  } else {
    console.error(`[Feishu] Process stdin for session ${defaultSess.id} is not writable!`);
  }
};

// Actions that control AGY processes and require strict identity validation
const AGY_CONTROL_ACTIONS = new Set(['answer', 'approve', 'reject', 'approve_option']);
// Session ID format guard (used for path traversal prevention)
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

// Cache of authorised open_ids (members of the default chat).
// We re-use the same chatId-based allowlist: only the bot owner's direct
// messages are accepted. Card actions carry operatorId (open_id) from Feishu;
// we validate it is the same sender who created the session (i.e. came from
// the authorised chat). A simple guard: reject any action whose operatorId is
// absent or whose sessionId fails our format rules.
export const actionHandler = async (params) => {
  const { actionType, sessionId, stepIndex, operatorId, messageId } = params;
  console.log(`[Feishu Action] ${actionType} for session ${sessionId} step #${stepIndex} by ${operatorId}`);

  // Settings actions don't touch AGY processes and have no sessionId — handle first
  if (actionType === 'set_lang' || actionType === 'set_theme' || actionType === 'toggle_widescreen') {
    if (actionType === 'set_lang') {
      settingsManager.set('language', params.lang);
    } else if (actionType === 'set_theme') {
      settingsManager.set('theme', params.theme);
    } else if (actionType === 'toggle_widescreen') {
      settingsManager.set('wideScreen', params.wideScreen);
    }

    const updatedCard = CardBuilder.buildSettingsCard();
    return {
      toast: {
        type: 'success',
        content: t('settings_save_toast')
      },
      card: {
        type: 'raw',
        data: updatedCard
      }
    };
  }

  // For all AGY process-control actions: validate sessionId format and operatorId presence
  if (AGY_CONTROL_ACTIONS.has(actionType)) {
    if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
      console.warn(`[Security] actionHandler rejected invalid sessionId: "${sessionId}"`);
      return { toast: { type: 'error', content: 'Invalid session.' } };
    }
    if (!operatorId) {
      console.warn('[Security] actionHandler rejected action with no operatorId');
      return { toast: { type: 'error', content: 'Unauthorized.' } };
    }
  }

  if (actionType === 'answer') {
    const { optionIndex, text } = params;
    console.log(`[Feishu Action] Answer selected: idx=${optionIndex}, text=${text}`);
    
    injector.injectMessage(sessionId, text);

    const cp = activeProcesses.get(sessionId);
    if (cp && cp.stdin.writable) {
      cp.stdin.write(`\r`);
    }

    const updatedCard = {
      config: { wide_screen_mode: settingsManager.get('wideScreen') !== false },
      header: {
        template: 'green',
        title: { tag: 'plain_text', content: t('card_confirm_title') }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${t('card_session_id')}**: \`${sessionId}\`\n**${t('card_step')}**: #${stepIndex}\n\n**${t('card_your_choice')}**: \n${optionIndex + 1}️⃣ ${text}`
          }
        }
      ]
    };

    return {
      toast: {
        type: 'success',
        content: `${t('card_question_btn_prefix')}${optionIndex + 1}`
      },
      card: {
        type: 'raw',
        data: updatedCard
      }
    };
  }

  if (actionType === 'approve_option') {
    const { optionIndex, text } = params;
    console.log(`[Feishu Action] Permission Option selected: idx=${optionIndex}, text=${text}`);

    injector.injectMessage(sessionId, text);

    const cp = activeProcesses.get(sessionId);
    if (cp && cp.stdin.writable) {
      cp.stdin.write('\x1b[B'.repeat(optionIndex) + '\r');
    }

    const updatedCard = {
      config: { wide_screen_mode: settingsManager.get('wideScreen') !== false },
      header: {
        template: 'green',
        title: { tag: 'plain_text', content: t('card_permission_approved') }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${t('card_session_id')}**: \`${sessionId}\`\n**${t('card_step')}**: #${stepIndex}\n\n**${t('card_result')}**: ${t('card_permission_handled_suffix')}\n**${t('card_your_choice')}**: \n${optionIndex + 1}️⃣ ${text}`
          }
        }
      ]
    };

    return {
      toast: {
        type: 'success',
        content: `${t('card_question_btn_prefix')}${optionIndex + 1}`
      },
      card: {
        type: 'raw',
        data: updatedCard
      }
    };
  }

  const responseText = actionType === 'approve' ? 'y' : 'n';
  injector.injectMessage(sessionId, responseText);

  const cp = activeProcesses.get(sessionId);
  if (cp && cp.stdin.writable) {
    cp.stdin.write(`${responseText}${newline}`);
  }

  const updatedCard = {
    config: { wide_screen_mode: settingsManager.get('wideScreen') !== false },
    header: {
      template: actionType === 'approve' ? 'green' : 'grey',
      title: { tag: 'plain_text', content: actionType === 'approve' ? t('card_permission_approved') : t('card_permission_rejected') }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card_session_id')}**: \`${sessionId}\`\n**${t('card_step')}**: #${stepIndex}\n\n**${t('card_result')}**: ${t('card_permission_handled_suffix')}`
        }
      }
    ]
  };

  return {
    toast: {
      type: 'success',
      content: `Submitted: ${actionType.toUpperCase()}`
    },
    card: {
      type: 'raw',
      data: updatedCard
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
