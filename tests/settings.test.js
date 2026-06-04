import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsManager } from '../src/settings-manager.js';
import { t } from '../src/i18n.js';
import fs from 'fs';

describe('settings-manager.js', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    settingsManager.settings = {
      language: 'zh',
      theme: 'default',
      wideScreen: true
    };
  });

  it('should initialize with default settings', () => {
    expect(settingsManager.get('language')).toBe('zh');
    expect(settingsManager.get('theme')).toBe('default');
    expect(settingsManager.get('wideScreen')).toBe(true);
  });

  it('should set and get values and write to disk', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    settingsManager.set('language', 'en');
    expect(settingsManager.get('language')).toBe('en');
    expect(writeSpy).toHaveBeenCalled();

    // Reset to default
    settingsManager.set('language', 'zh');
  });
});

describe('i18n.js t()', () => {
  it('should translate keys correctly in Chinese', () => {
    settingsManager.set('language', 'zh');
    expect(t('list_empty')).toBe('没有找到活动会话。');
    expect(t('new_start', 'hello')).toBe('🚀 正在启动新会话，提示词："hello"...');
  });

  it('should translate keys correctly in English', () => {
    settingsManager.set('language', 'en');
    expect(t('list_empty')).toBe('No sessions found.');
    expect(t('new_start', 'hello')).toBe('🚀 Starting new session with prompt: "hello"...');

    // Reset to default
    settingsManager.set('language', 'zh');
  });
});
