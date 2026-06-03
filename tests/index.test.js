import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageHandler, injector, feishu, watcher } from '../src/index.js';
import { registry } from '../src/session-registry.js';
import { config } from '../src/config.js';
import * as CardBuilder from '../src/card-builder.js';

describe('index.js messageHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    config.feishu.defaultChatId = 'test-chat-id';
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
    const fakeRegistry = { feishuChatId: chatId, status: 'busy', lastPermissionIdx: undefined, lastMessageId: null };
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

    expect(buildPermissionCardSpy).toHaveBeenCalledWith(sessionId, idx, reason);
    expect(sendInteractiveCardSpy).toHaveBeenCalledWith(chatId, expect.any(Object));
    expect(fakeRegistry.status).toBe('waiting_permission');
    expect(fakeRegistry.lastPermissionIdx).toBe(idx);

    registrySpy.mockRestore();
  });

  it('should not send a duplicate permission card for the same idx', async () => {
    const sessionId = 'test-session-perm-002';
    const chatId = 'test-perm-chat-002';
    const idx = 10;
    const reason = 'Duplicate test';

    const fakeRegistry = { feishuChatId: chatId, status: 'busy', lastPermissionIdx: idx, lastMessageId: null };
    const sendInteractiveCardSpy = vi.spyOn(feishu, 'sendInteractiveCard').mockResolvedValue('msg-002');

    const registryModule = await import('../src/session-registry.js');
    const registrySpy = vi.spyOn(registryModule.SessionRegistry.prototype, 'get').mockReturnValue(fakeRegistry);

    const listeners = watcher.rawListeners('session:permission');
    await listeners[0].call(watcher, { sessionId, idx, reason });

    // Should NOT send card because lastPermissionIdx === idx
    expect(sendInteractiveCardSpy).not.toHaveBeenCalled();

    registrySpy.mockRestore();
  });
});
