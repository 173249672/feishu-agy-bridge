import { describe, it, expect, vi, beforeEach } from 'vitest';

import { feishu, watcher, activeProcesses } from '../src/index.js';
import { config } from '../src/config.js';
import * as CardBuilder from '../src/card-builder.js';
import { settingsManager } from '../src/settings-manager.js';

describe('index.js session:permission handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    config.feishu.defaultChatId = 'test-chat-id';
    activeProcesses.clear();
    settingsManager.set('language', 'en');
    settingsManager.set('theme', 'default');
    settingsManager.set('wideScreen', true);
  });

  it('should send a permission card when session:permission event is emitted', async () => {
    const sessionId = 'test-session-perm-001';
    const chatId = 'test-perm-chat-id';
    const idx = 42;
    const reason = 'Reading a test file';

    // Register a fake session
    const fakeRegistry = { feishuChatId: chatId, status: 'busy', lastPermissionIdx: undefined, lastPermissionKey: undefined, lastMessageId: null };
    vi.spyOn(watcher, 'emit').mockReturnValue(true);

    const buildPermissionNotifyCardSpy = vi.spyOn(CardBuilder, 'buildPermissionNotifyCard').mockReturnValue({ header: {}, elements: [] });
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-001');

    // Simulate calling the session:permission handler directly
    const listeners = watcher.rawListeners('session:permission');
    expect(listeners.length).toBeGreaterThan(0);

    // Register session in the module-level registry
    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeRegistry);

    // Invoke the handler
    await listeners[0].call(watcher, { sessionId, idx, reason });

    expect(buildPermissionNotifyCardSpy).toHaveBeenCalledWith(sessionId, idx, reason, null);
    expect(sendInteractiveCardSpy).toHaveBeenCalledWith(chatId, expect.any(Object));
    expect(fakeRegistry.status).toBe('waiting_permission');
    expect(fakeRegistry.lastPermissionIdx).toBe(idx);
    expect(fakeRegistry.lastPermissionKey).toBe(`${idx}:${reason}`);

    registrySpy.mockRestore();
  });

  it('should not send a duplicate permission card for the same idx and reason', async () => {
    const sessionId = 'test-session-perm-002';
    const chatId = 'test-perm-chat-002';
    const idx = 10;
    const reason = 'Duplicate test';

    const fakeRegistry = { feishuChatId: chatId, status: 'busy', lastPermissionIdx: idx, lastPermissionKey: `${idx}:${reason}`, lastMessageId: null };
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-002');

    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeRegistry);

    const listeners = watcher.rawListeners('session:permission');
    await listeners[0].call(watcher, { sessionId, idx, reason });

    // Should NOT send card because lastPermissionKey matches
    expect(sendInteractiveCardSpy).not.toHaveBeenCalled();

    registrySpy.mockRestore();
  });

  it('should send a new permission card if the same idx has a different reason', async () => {
    const sessionId = 'test-session-perm-003';
    const chatId = 'test-perm-chat-003';
    const idx = 10;
    const reason1 = 'Grep command';
    const reason2 = 'Git commit';

    const fakeRegistry = { feishuChatId: chatId, status: 'busy', lastPermissionIdx: idx, lastPermissionKey: `${idx}:${reason1}`, lastMessageId: null };
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-003');

    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeRegistry);

    const listeners = watcher.rawListeners('session:permission');
    await listeners[0].call(watcher, { sessionId, idx, reason: reason2 });

    // Should send card because reason is different
    expect(sendInteractiveCardSpy).toHaveBeenCalled();
    expect(fakeRegistry.lastPermissionKey).toBe(`${idx}:${reason2}`);

    registrySpy.mockRestore();
  });

  it('should parse multiline wrapped options and send permission card', async () => {
    const sessionId = 'test-session-perm-multiline';
    const chatId = 'test-perm-chat-multiline';
    const idx = 6;
    const reason = 'Proposing command: git status';

    const fakeRegistry = { feishuChatId: chatId, status: 'busy', lastPermissionIdx: undefined, lastPermissionKey: undefined, lastMessageId: null };
    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeRegistry);

    const mockCp = {
      stdoutBuffer: `
Do you want to proceed?
> 1. Yes
  2. Yes, and always allow in this conversation for commands that start with
'git status'
  3. Yes, and always allow for commands that start with 'git status' (Persist to
settings.json)
  4. No

  ↑/↓ Navigate · tab Amend · e edit command
      `
    };
    activeProcesses.set(sessionId, mockCp);

    const buildPermissionNotifyCardSpy = vi.spyOn(CardBuilder, 'buildPermissionNotifyCard').mockReturnValue({ header: {}, elements: [] });
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-multiline');

    const listeners = watcher.rawListeners('session:permission');
    await listeners[0].call(watcher, { sessionId, idx, reason });

    expect(buildPermissionNotifyCardSpy).toHaveBeenCalledWith(
      sessionId,
      idx,
      reason,
      [
        { idx: 1, text: 'Yes' },
        { idx: 2, text: "Yes, and always allow in this conversation for commands that start with 'git status'" },
        { idx: 3, text: "Yes, and always allow for commands that start with 'git status' (Persist to settings.json)" },
        { idx: 4, text: 'No' }
      ]
    );

    activeProcesses.delete(sessionId);
    registrySpy.mockRestore();
  });
});

describe('index.js session:agy_error handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should notify and kill process on session:agy_error', async () => {
    const mockKill = vi.fn();
    const mockCp = {
      kill: mockKill,
      errorNotified: false
    };

    activeProcesses.set('session-123', mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // Mock session lookup
    const fakeSession = { feishuChatId: 'test-chat-id', lastErrorIdx: undefined };
    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeSession);

    // Trigger session:agy_error listener
    const errorListeners = watcher.rawListeners('session:agy_error');
    await errorListeners[0]({ sessionId: 'session-123', idx: 1, message: 'Quota reached' });

    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('Quota reached'));
    expect(mockKill).toHaveBeenCalledWith('SIGTERM');
    expect(mockCp.errorNotified).toBe(true);

    registrySpy.mockRestore();
  });
});
