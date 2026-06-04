import * as lark from '@larksuiteoapi/node-sdk';

export class FeishuClient {
  constructor(appId, appSecret, defaultChatId) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.defaultChatId = defaultChatId;
    this.client = new lark.Client({ appId, appSecret });
    this.wsClient = null;
  }

  async start(messageHandler, actionHandler) {
    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        const { message, sender } = data;
        if (!message) return;
        const textContent = JSON.parse(message.content).text;
        const chatType = message.chat_type;
        const chatId = message.chat_id;
        
        await messageHandler({
          chatId,
          senderId: sender.sender_id.open_id,
          text: textContent,
          isP2P: chatType === 'p2p'
        });
      },
      'card.action.trigger': async (data) => {
        const { action, operator, messageId } = data;
        if (!action || !action.value) return {};
        
        const result = await actionHandler({
          ...action.value,
          actionType: action.value.action,
          operatorId: operator?.openId,
          messageId: messageId
        });

        return result || {};
      }
    });

    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      eventDispatcher: eventDispatcher,
    });

    await this.wsClient.start({ eventDispatcher });
  }

  getReceiveIdType(id) {
    if (id.startsWith('ou_')) return 'open_id';
    return 'chat_id';
  }

  async sendInteractiveCard(chatId, cardPayload) {
    const targetChat = chatId || this.defaultChatId;
    if (!targetChat) return null;
    const response = await this.client.im.v1.message.create({
      params: { receive_id_type: this.getReceiveIdType(targetChat) },
      data: {
        receive_id: targetChat,
        msg_type: 'interactive',
        content: JSON.stringify(cardPayload)
      }
    });
    return response.data.message_id;
  }

  async updateCard(messageId, cardPayload) {
    await this.client.im.v1.message.patch({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(cardPayload)
      }
    });
  }

  async sendTextMessage(chatId, text) {
    const targetChat = chatId || this.defaultChatId;
    if (!targetChat) return null;
    await this.client.im.v1.message.create({
      params: { receive_id_type: this.getReceiveIdType(targetChat) },
      data: {
        receive_id: targetChat,
        msg_type: 'text',
        content: JSON.stringify({ text })
      }
    });
  }
}
