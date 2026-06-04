import { config } from './config.js';
import { SessionRegistry } from './session-registry.js';
import { SessionWatcher } from './session-watcher.js';
import { EventClassifier } from './event-classifier.js';
import { FeishuClient } from './feishu-client.js';
import * as CardBuilder from './card-builder.js';
import { t } from './i18n.js';

const registry = new SessionRegistry();
export const watcher = new SessionWatcher(config.agy.brainDir);
const classifier = new EventClassifier();
export const feishu = new FeishuClient(config.feishu.appId, config.feishu.appSecret, config.feishu.defaultChatId);

export const activeProcesses = new Map();

watcher.on('session:new', ({ sessionId, filePath }) => {
  console.log(`[Watcher] New session detected: ${sessionId}`);
  registry.register(sessionId, filePath);

  // Inherit the chatId of the current default active session, or use default from config
  const defaultSess = registry.getDefault();
  const session = registry.get(sessionId);
  if (session) {
    if (defaultSess) {
      session.feishuChatId = defaultSess.feishuChatId;
      console.log(`[Registry] Session ${sessionId} inherited chatId ${defaultSess.feishuChatId} from default session ${defaultSess.id}`);
    } else {
      session.feishuChatId = config.feishu.defaultChatId;
    }
  }
  registry.setDefault(sessionId);
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
    card = CardBuilder.buildPermissionNotifyCard(sessionId, event.stepIndex, event.summary);
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
  // Notify-only: no buttons — user selects in local terminal
  const card = CardBuilder.buildQuestionNotifyCard(sessionId, idx, questionData);
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

  // Notify-only: no approve/reject buttons — user handles in local terminal
  const card = CardBuilder.buildPermissionNotifyCard(sessionId, idx, reason, options);
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


async function main() {
  console.log('Starting Feishu-AGY Bridge...');
  watcher.start();
  console.log('Feishu-AGY Bridge is running.');
}

if (!process.env.VITEST) {
  main().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
