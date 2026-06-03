import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config();

const homeDir = os.homedir();

const expandHome = (p) => {
  if (p && (p.startsWith('~/') || p === '~')) {
    return path.join(homeDir, p.slice(1));
  }
  return p;
};

export const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    defaultChatId: process.env.FEISHU_DEFAULT_CHAT_ID || '',
  },
  agy: {
    brainDir: expandHome(process.env.AGY_BRAIN_DIR) || path.join(homeDir, '.gemini/antigravity-cli/brain'),
    settingsPath: expandHome(process.env.AGY_SETTINGS_PATH) || path.join(homeDir, '.gemini/antigravity-cli/settings.json'),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
