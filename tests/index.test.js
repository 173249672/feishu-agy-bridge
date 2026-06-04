import { describe, it, expect, vi, beforeEach } from 'vitest';

const { spawnMock, execFileMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  execFileMock: vi.fn()
}));

vi.mock('child_process', () => ({
  spawn: (...args) => spawnMock(...args),
  execFile: (...args) => execFileMock(...args)
}));

import { messageHandler, injector, feishu, watcher, activeProcesses, spawnedQueue, actionHandler } from '../src/index.js';
import { registry } from '../src/session-registry.js';
import { config } from '../src/config.js';
import * as CardBuilder from '../src/card-builder.js';
import { settingsManager } from '../src/settings-manager.js';
import fs from 'fs';

describe('index.js messageHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
    execFileMock.mockReset();
    config.feishu.defaultChatId = 'test-chat-id';
    activeProcesses.clear();
    spawnedQueue.length = 0;
    settingsManager.set('language', 'en');
    settingsManager.set('theme', 'default');
    settingsManager.set('wideScreen', true);
  });

  it('should format and return model list when /model is called without argument', async () => {
    const getModelsInfoSpy = vi.spyOn(injector, 'getModelsInfo').mockReturnValue({
      currentModel: 'Test Model A',
      aliases: {
        'alias1': 'Test Model A',
        'alias2': 'Test Model B'
      }
    });

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/model',
      isP2P: false
    });

    expect(getModelsInfoSpy).toHaveBeenCalled();
    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      `🤖 Current Model: \`Test Model A\`\n\n📋 Available Models:\n• alias1: Test Model A\n• alias2: Test Model B\n\nUsage: \`/model <model-name>\``
    );
  });

  it('should switch model when /model is called with a model name', async () => {
    const switchModelSpy = vi.spyOn(injector, 'switchModel').mockReturnValue('Test Model B');
    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/model alias2',
      isP2P: false
    });

    expect(switchModelSpy).toHaveBeenCalledWith('alias2');
    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      '✅ Model switched to `Test Model B`'
    );
  });

  it('should return failure message if switching model throws an error', async () => {
    const switchModelSpy = vi.spyOn(injector, 'switchModel').mockImplementation(() => {
      throw new Error('Some error');
    });
    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/model invalid-model',
      isP2P: false
    });

    expect(switchModelSpy).toHaveBeenCalledWith('invalid-model');
    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      '❌ Failed to switch model: Some error'
    );
  });
});

describe('index.js session:permission handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should send a permission card when session:permission event is emitted', async () => {
    const sessionId = 'test-session-perm-001';
    const chatId = 'test-perm-chat-id';
    const idx = 42;
    const reason = 'Reading a test file';

    // Register a fake session
    const fakeRegistry = { feishuChatId: chatId, status: 'busy', lastPermissionIdx: undefined, lastPermissionKey: undefined, lastMessageId: null };
    vi.spyOn(watcher, 'emit').mockReturnValue(true);

    const buildPermissionCardSpy = vi.spyOn(CardBuilder, 'buildPermissionCard').mockReturnValue({ header: {}, elements: [] });
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-001');

    // Simulate calling the session:permission handler directly
    const listeners = watcher.rawListeners('session:permission');
    expect(listeners.length).toBeGreaterThan(0);

    // Register session in the module-level registry via messageHandler side-effect
    // Instead, we manually register with the registry by inspecting what's needed
    // Patch registry.get to return the fakeRegistry
    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeRegistry);

    // Invoke the handler
    await listeners[0].call(watcher, { sessionId, idx, reason });

    expect(buildPermissionCardSpy).toHaveBeenCalledWith(sessionId, idx, reason, null, undefined);
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

    const buildPermissionCardSpy = vi.spyOn(CardBuilder, 'buildPermissionCard').mockReturnValue({ header: {}, elements: [] });
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-multiline');

    const listeners = watcher.rawListeners('session:permission');
    await listeners[0].call(watcher, { sessionId, idx, reason });

    expect(buildPermissionCardSpy).toHaveBeenCalledWith(
      sessionId,
      idx,
      reason,
      [
        { idx: 1, text: 'Yes' },
        { idx: 2, text: "Yes, and always allow in this conversation for commands that start with 'git status'" },
        { idx: 3, text: "Yes, and always allow for commands that start with 'git status' (Persist to settings.json)" },
        { idx: 4, text: 'No' }
      ],
      undefined
    );

    activeProcesses.delete(sessionId);
    registrySpy.mockRestore();
  });
});

describe('index.js session:agy_error handler and /new close fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
    execFileMock.mockReset();
  });

  it('should notify and kill process on session:agy_error', async () => {
    const mockKill = vi.fn();
    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: mockKill,
      errorNotified: false
    };

    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // 1. Call /new to queue the process
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/new test session',
      isP2P: false
    });

    // 2. Simulate session:new to move mockCp to activeProcesses
    const newSessionListeners = watcher.rawListeners('session:new');
    newSessionListeners[0]({ sessionId: 'session-123', filePath: '/fake/path' });

    // Mock session lookup
    const fakeSession = { feishuChatId: 'test-chat-id', lastErrorIdx: undefined };
    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeSession);

    // 3. Trigger session:agy_error listener
    const errorListeners = watcher.rawListeners('session:agy_error');
    await errorListeners[0]({ sessionId: 'session-123', idx: 1, message: 'Quota reached' });

    // 4. Verification
    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('Quota reached'));
    expect(mockKill).toHaveBeenCalledWith('SIGTERM');
    expect(mockCp.errorNotified).toBe(true);

    registrySpy.mockRestore();
  });

  it('should send fallback error message on close if not already notified', async () => {
    let closeHandler;
    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, handler) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      }),
      errorNotified: false
    };

    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // Call /new to trigger spawn and register the close handler
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/new test session',
      isP2P: false
    });

    expect(closeHandler).toBeDefined();

    // Trigger the close handler with exit code 1
    await closeHandler(1);

    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      expect.stringContaining('AGY exited with code 1')
    );
    expect(mockCp.errorNotified).toBe(true);
  });
});

describe('Session management index commands', () => {
  let mockList;
  let mockGet;
  let mockRemove;
  let mockSetDefault;
  let mockGetDefault;
  let existsSyncSpy;
  let rmSyncSpy;

  beforeEach(async () => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
    execFileMock.mockReset();
    config.feishu.defaultChatId = 'test-chat-id';
    activeProcesses.clear();
    spawnedQueue.length = 0;
    settingsManager.set('language', 'en');
    settingsManager.set('theme', 'default');
    settingsManager.set('wideScreen', true);

    const registryModule = await import('../src/session-registry.js');
    mockList = vi.spyOn(registryModule.SessionRegistry.prototype, 'list');
    mockGet = vi.spyOn(registryModule.SessionRegistry.prototype, 'get');
    mockRemove = vi.spyOn(registryModule.SessionRegistry.prototype, 'remove');
    mockSetDefault = vi.spyOn(registryModule.SessionRegistry.prototype, 'setDefault');
    mockGetDefault = vi.spyOn(registryModule.SessionRegistry.prototype, 'getDefault');

    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    rmSyncSpy = vi.spyOn(fs, 'rmSync').mockReturnValue(undefined);
  });

  it('should format /list with sorted 1-based indices, running status, and default star', async () => {
    const startTime1 = new Date('2026-06-03T12:00:00Z');
    const startTime2 = new Date('2026-06-03T12:05:00Z');

    mockList.mockReturnValue([
      { id: 'session-2', startTime: startTime2 },
      { id: 'session-1', startTime: startTime1 }
    ]);
    mockGetDefault.mockReturnValue({ id: 'session-1' });

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/list',
      isP2P: false
    });

    expect(sendTextMessageSpy).toHaveBeenCalled();
    const message = sendTextMessageSpy.mock.calls[0][1];
    expect(message).toContain('[1] ⭐ ⚪ `session-1`');
    expect(message).toContain('[2]   ⚪ `session-2`');
  });

  it('should switch default session by index or UUID', async () => {
    const startTime1 = new Date('2026-06-03T12:00:00Z');
    const startTime2 = new Date('2026-06-03T12:05:00Z');

    mockList.mockReturnValue([
      { id: '1aee16b2-1336-4464-96aa-279630dd936b', startTime: startTime2 },
      { id: 'session-1', startTime: startTime1 }
    ]);
    mockGet.mockImplementation((id) => {
      if (id === 'session-1') return { id: 'session-1', startTime: startTime1 };
      if (id === '1aee16b2-1336-4464-96aa-279630dd936b') return { id: '1aee16b2-1336-4464-96aa-279630dd936b', startTime: startTime2 };
      return null;
    });
    mockSetDefault.mockReturnValue(true);

    activeProcesses.set('session-1', { stdin: { write: vi.fn() } });
    activeProcesses.set('1aee16b2-1336-4464-96aa-279630dd936b', { stdin: { write: vi.fn() } });

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // Switch by index 1 (session-1)
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/switch 1',
      isP2P: false
    });
    expect(mockSetDefault).toHaveBeenCalledWith('session-1');

    // Switch by index 2 (1aee16b2-...)
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/switch 2',
      isP2P: false
    });
    expect(mockSetDefault).toHaveBeenCalledWith('1aee16b2-1336-4464-96aa-279630dd936b');

    // Switch by UUID starting with a digit
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/switch 1aee16b2-1336-4464-96aa-279630dd936b',
      isP2P: false
    });
    expect(mockSetDefault).toHaveBeenCalledWith('1aee16b2-1336-4464-96aa-279630dd936b');
  });

  it('should fail to switch default session if target session is inactive', async () => {
    const startTime1 = new Date('2026-06-03T12:00:00Z');
    mockList.mockReturnValue([
      { id: 'session-inactive', startTime: startTime1 }
    ]);
    mockGet.mockReturnValue({ id: 'session-inactive', startTime: startTime1 });
    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/switch 1',
      isP2P: false
    });

    expect(mockSetDefault).not.toHaveBeenCalled();
    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      expect.stringContaining('not active')
    );
  });

  it('should stop session by index (SIGTERM kill, keep in registry)', async () => {
    const mockKill = vi.fn();
    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: mockKill,
      errorNotified: false
    };
    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // 1. Call /new to trigger spawn and queue process
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/new prompt X',
      isP2P: false
    });

    // 2. Trigger session:new to move to activeProcesses and registry
    const newSessionListeners = watcher.rawListeners('session:new');
    newSessionListeners[0]({ sessionId: 'session-to-stop', filePath: '/fake/path' });

    // Mock registry methods
    const startTime = new Date();
    mockList.mockReturnValue([
      { id: 'session-to-stop', startTime }
    ]);
    mockGetDefault.mockReturnValue({ id: 'session-to-stop', startTime });
    mockGet.mockReturnValue({ id: 'session-to-stop', startTime });

    // Call /stop 1
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/stop 1',
      isP2P: false
    });

    expect(mockKill).toHaveBeenCalledWith('SIGTERM');
    // Ensure it was NOT removed from registry
    expect(mockRemove).not.toHaveBeenCalled();
    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('Stopped process for session'));
  });

  it('should delete session by index (SIGTERM kill, delete agy files, remove from registry)', async () => {
    const mockKill = vi.fn();
    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: mockKill,
      errorNotified: false
    };
    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // 1. Call /new to trigger spawn and queue process
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/new prompt Y',
      isP2P: false
    });

    // 2. Trigger session:new to move to activeProcesses and registry
    const newSessionListeners = watcher.rawListeners('session:new');
    newSessionListeners[0]({ sessionId: 'session-to-del', filePath: '/fake/path' });

    // Mock registry methods
    const startTime = new Date();
    mockList.mockReturnValue([
      { id: 'session-to-del', startTime }
    ]);
    mockGetDefault.mockReturnValue({ id: 'session-to-del', startTime });
    mockGet.mockReturnValue({ id: 'session-to-del', startTime });

    // Spy on watcher.knownSessions
    const knownSessionsDeleteSpy = vi.spyOn(watcher.knownSessions, 'delete');

    // Call /del 1
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/del 1',
      isP2P: false
    });

    expect(mockKill).toHaveBeenCalledWith('SIGTERM');
    expect(existsSyncSpy).toHaveBeenCalled();
    expect(rmSyncSpy).toHaveBeenCalled();
    expect(knownSessionsDeleteSpy).toHaveBeenCalledWith('session-to-del');
    expect(mockRemove).toHaveBeenCalledWith('session-to-del');
    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('Deleted session `session-to-del`'));
  });

  it('should delete all sessions via /del all', async () => {
    const mockKill = vi.fn();
    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: mockKill,
      errorNotified: false
    };
    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // Register a session
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/new prompt Z',
      isP2P: false
    });
    const newSessionListeners = watcher.rawListeners('session:new');
    newSessionListeners[0]({ sessionId: 'session-z', filePath: '/fake/path' });

    mockList.mockReturnValue([
      { id: 'session-z', startTime: new Date() }
    ]);

    // Call /del all
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/del all',
      isP2P: false
    });

    expect(mockKill).toHaveBeenCalledWith('SIGTERM');
    expect(mockRemove).toHaveBeenCalledWith('session-z');
    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('Deleted all 1 sessions'));
  });

  it('should display settings card on /settings', async () => {
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-settings');

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/settings',
      isP2P: false
    });

    expect(sendInteractiveCardSpy).toHaveBeenCalled();
    const card = sendInteractiveCardSpy.mock.calls[0][1];
    expect(card.header.title.content).toContain('Settings');
  });

  it('should display help text on /help command and respect language settings', async () => {
    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    // Test with English language setting
    settingsManager.set('language', 'en');
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/help',
      isP2P: false
    });
    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('Help Center - Command Guide'));

    // Test with Chinese language setting
    settingsManager.set('language', 'zh');
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/help',
      isP2P: false
    });
    expect(sendTextMessageSpy).toHaveBeenLastCalledWith('test-chat-id', expect.stringContaining('帮助中心 - 指令使用指南'));
  });

  it('should fail to resume if no index or ID is specified', async () => {
    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/resume',
      isP2P: false
    });
    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('resume <index or session-id>'));
  });

  it('should fail to resume if the session does not exist', async () => {
    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);
    mockList.mockReturnValue([]);
    mockGet.mockReturnValue(null);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/resume non-existent',
      isP2P: false
    });
    expect(sendTextMessageSpy).toHaveBeenCalledWith('test-chat-id', expect.stringContaining('Session `non-existent` not found'));
  });

  it('should set default and notify if the session is already active', async () => {
    const startTime1 = new Date('2026-06-03T12:00:00Z');
    mockList.mockReturnValue([
      { id: 'session-active', startTime: startTime1 }
    ]);
    mockGet.mockReturnValue({ id: 'session-active', startTime: startTime1 });
    
    // Set it active in activeProcesses
    activeProcesses.set('session-active', { stdin: { write: vi.fn() } });

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/resume 1',
      isP2P: false
    });

    expect(mockSetDefault).toHaveBeenCalledWith('session-active');
    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      expect.stringContaining('is already active')
    );
  });

  it('should spawn agy with --conversation and add to activeProcesses when resuming inactive session', async () => {
    const startTime1 = new Date('2026-06-03T12:00:00Z');
    const mockSession = { id: 'session-inactive', startTime: startTime1 };
    mockList.mockReturnValue([mockSession]);
    mockGet.mockReturnValue(mockSession);

    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      errorNotified: false
    };
    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/resume 1',
      isP2P: false
    });

    expect(mockSetDefault).toHaveBeenCalledWith('session-inactive');
    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      expect.stringContaining('Resuming and activating')
    );
    expect(spawnMock).toHaveBeenCalled();
    const args = spawnMock.mock.calls[0][1];
    expect(args).toContain('--conversation');
    expect(args).toContain('session-inactive');
    expect(activeProcesses.get('session-inactive')).toBe(mockCp);
  });

  it('should parse optional flags in /new command and pass them to spawn', async () => {
    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      errorNotified: false
    };
    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/new --sandbox --dangerously-skip-permissions --model flash --add-dir /path/to/dir prompt text here',
      isP2P: false
    });

    expect(sendTextMessageSpy).toHaveBeenCalledWith(
      'test-chat-id',
      expect.stringContaining('prompt text here')
    );
    expect(spawnMock).toHaveBeenCalled();
    const spawnArgs = spawnMock.mock.calls[0][1];
    expect(spawnArgs).toContain('--sandbox');
    expect(spawnArgs).toContain('--dangerously-skip-permissions');
    expect(spawnArgs).toContain('--model');
    expect(spawnArgs).toContain('flash');
    expect(spawnArgs).toContain('--add-dir');
    expect(spawnArgs).toContain('/path/to/dir');
    expect(spawnArgs).toContain('prompt text here');
  });

  it('should parse optional flags in /resume command and pass them to spawn', async () => {
    const startTime1 = new Date('2026-06-03T12:00:00Z');
    const mockSession = { id: 'session-inactive', startTime: startTime1 };
    mockList.mockReturnValue([mockSession]);
    mockGet.mockReturnValue(mockSession);

    const mockCp = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      errorNotified: false
    };
    spawnMock.mockReturnValue(mockCp);

    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);

    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/resume 1 --sandbox --dangerously-skip-permissions',
      isP2P: false
    });

    expect(spawnMock).toHaveBeenCalled();
    const spawnArgs = spawnMock.mock.calls[0][1];
    expect(spawnArgs).toContain('--sandbox');
    expect(spawnArgs).toContain('--dangerously-skip-permissions');
    expect(spawnArgs).toContain('--conversation');
    expect(spawnArgs).toContain('session-inactive');
  });

  it('should run execFile and send output to Feishu for /changelog, /plugins, /update, /models', async () => {
    const sendTextMessageSpy = vi.spyOn(feishu, 'sendTextMessage').mockResolvedValue(undefined);
    
    // Mock execFile to invoke callback with test output
    execFileMock.mockImplementation((cmd, args, cb) => {
      cb(null, `Mock output for ${args.join(' ')}`, '');
    });

    // Test /changelog
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/changelog',
      isP2P: false
    });
    expect(execFileMock).toHaveBeenCalledWith('agy', ['changelog'], expect.any(Function));
    expect(sendTextMessageSpy).toHaveBeenLastCalledWith('test-chat-id', 'Mock output for changelog');

    // Test /plugins
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/plugins list',
      isP2P: false
    });
    expect(execFileMock).toHaveBeenLastCalledWith('agy', ['plugin', 'list'], expect.any(Function));
    expect(sendTextMessageSpy).toHaveBeenLastCalledWith('test-chat-id', 'Mock output for plugin list');

    // Test /update
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/update',
      isP2P: false
    });
    expect(execFileMock).toHaveBeenLastCalledWith('agy', ['update'], expect.any(Function));
    expect(sendTextMessageSpy).toHaveBeenLastCalledWith('test-chat-id', 'Mock output for update');

    // Test /models
    await messageHandler({
      chatId: 'test-chat-id',
      senderId: 'user-123',
      text: '/models',
      isP2P: false
    });
    expect(execFileMock).toHaveBeenLastCalledWith('agy', ['models'], expect.any(Function));
    expect(sendTextMessageSpy).toHaveBeenLastCalledWith('test-chat-id', 'Mock output for models');
  });

  it('should handle settings actions in actionHandler and return updated card synchronously', async () => {
    const res = await actionHandler({
      actionType: 'set_lang',
      lang: 'en',
      messageId: 'msg-123',
      operatorId: 'ou_test-operator'
    });

    expect(settingsManager.get('language')).toBe('en');
    expect(res.toast.content).toBe('Settings updated');
    expect(res.card.type).toBe('raw');
    expect(res.card.data.header.title.content).toContain('Settings');
  });

  it('should handle approve_option action in actionHandler', async () => {
    const mockWrite = vi.fn();
    const mockCp = {
      stdin: {
        writable: true,
        write: mockWrite
      }
    };
    activeProcesses.set('test-session-123', mockCp);

    const injectMessageSpy = vi.spyOn(injector, 'injectMessage').mockReturnValue('msg-uuid');

    const res = await actionHandler({
      actionType: 'approve_option',
      sessionId: 'test-session-123',
      stepIndex: 5,
      optionIndex: 1,
      text: 'Yes, and always allow non-workspace access',
      operatorId: 'ou_test-operator'
    });

    expect(injectMessageSpy).toHaveBeenCalledWith('test-session-123', 'Yes, and always allow non-workspace access');
    expect(mockWrite).toHaveBeenCalledWith('\x1b[B\r');
    expect(res.toast.content).toBe('Select 2');
    expect(res.card.data.header.title.content).toBe('✅ AGY Action Confirmed');
    expect(res.card.data.elements[0].text.content).toContain('2️⃣ Yes, and always allow non-workspace access');
  });
});
