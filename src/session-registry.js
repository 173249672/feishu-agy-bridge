export class SessionRegistry {
  constructor() {
    this.sessions = new Map();
    this.defaultSessionId = null;
  }

  register(sessionId, path) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        path: path,
        startTime: new Date(),
        status: 'active',
        feishuChatId: null,
        lastMessageId: null
      });
      if (!this.defaultSessionId) {
        this.defaultSessionId = sessionId;
      }
    }
    return this.sessions.get(sessionId);
  }

  get(sessionId) {
    return this.sessions.get(sessionId);
  }

  getDefault() {
    return this.sessions.get(this.defaultSessionId);
  }

  setDefault(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.defaultSessionId = sessionId;
      return true;
    }
    return false;
  }

  list() {
    return Array.from(this.sessions.values());
  }

  remove(sessionId) {
    this.sessions.delete(sessionId);
    if (this.defaultSessionId === sessionId) {
      const keys = Array.from(this.sessions.keys());
      this.defaultSessionId = keys.length > 0 ? keys[0] : null;
    }
  }
}
