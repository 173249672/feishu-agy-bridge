import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageHandler, injector, feishu } from '../src/index.js';
import { config } from '../src/config.js';

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
