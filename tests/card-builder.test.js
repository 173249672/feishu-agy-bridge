import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as CardBuilder from '../src/card-builder.js';
import { settingsManager } from '../src/settings-manager.js';

describe('CardBuilder', () => {
  beforeEach(() => {
    settingsManager.set('language', 'zh');
    settingsManager.set('theme', 'default');
    settingsManager.set('wideScreen', true);
  });

  it('should build correct permission notify card (no buttons)', () => {
    const card = CardBuilder.buildPermissionNotifyCard('sess1', 5, 'Require git write');
    expect(card.header.template).toBe('yellow');
    // elements[0] is the info div, elements[1] is the tip div — no action buttons
    expect(card.elements).toHaveLength(2);
    expect(card.elements[0].text.content).toContain('Require git write');
    expect(card.elements[1].text.content).toContain('本地终端');
  });

  it('should build correct error card', () => {
    const card = CardBuilder.buildErrorCard('sess1', 6, 'Compilation failed');
    expect(card.header.template).toBe('red');
    expect(card.elements[0].text.content).toContain('Compilation failed');
  });

  it('should build correct completed card when active', () => {
    const card = CardBuilder.buildCompletedCard('sess1', 7, 'Task done successfully', true);
    expect(card.header.template).toBe('green');
    expect(card.header.title.content).toContain('等待您的输入');
    expect(card.elements[0].text.content).toContain('机器人正等待输入');
  });

  it('should build correct completed card when inactive', () => {
    const card = CardBuilder.buildCompletedCard('sess1', 7, 'Task done successfully', false);
    expect(card.header.template).toBe('grey');
    expect(card.header.title.content).toContain('会话已结束');
    expect(card.elements[0].text.content).toContain('会话已结束');
  });

  it('should support theme and widescreen settings override', () => {
    settingsManager.set('theme', 'violet');
    settingsManager.set('wideScreen', false);

    const card = CardBuilder.buildPermissionNotifyCard('sess1', 5, 'Require git write');
    expect(card.header.template).toBe('violet');
    expect(card.config.wide_screen_mode).toBe(false);
  });

  it('should build correct settings card and respect widescreen setting', () => {
    settingsManager.set('wideScreen', true);
    let card = CardBuilder.buildSettingsCard();
    expect(card.header.template).toBe('indigo');
    expect(card.elements[0].text.content).toContain('语言');
    expect(card.config.wide_screen_mode).toBe(true);

    settingsManager.set('wideScreen', false);
    card = CardBuilder.buildSettingsCard();
    expect(card.config.wide_screen_mode).toBe(false);
  });

  it('should build correct permission notify card with options (text list, no buttons)', () => {
    const options = [
      { idx: 1, text: 'Yes, allow access' },
      { idx: 2, text: 'Yes, and always allow non-workspace access' },
      { idx: 3, text: 'No, deny access' }
    ];
    const card = CardBuilder.buildPermissionNotifyCard('sess1', 5, 'Require git write', options);
    expect(card.header.template).toBe('yellow');
    // elements[0] is the info div (contains reason + options as text), elements[1] is the tip
    expect(card.elements[0].text.content).toContain('Require git write');
    expect(card.elements[0].text.content).toContain('Yes, allow access');
    expect(card.elements[0].text.content).toContain('Yes, and always allow non-workspace access');
    expect(card.elements[0].text.content).toContain('No, deny access');
    expect(card.elements[1].text.content).toContain('本地终端');
  });
});
