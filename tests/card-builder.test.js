import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as CardBuilder from '../src/card-builder.js';
import { settingsManager } from '../src/settings-manager.js';

describe('CardBuilder', () => {
  beforeEach(() => {
    settingsManager.set('language', 'zh');
    settingsManager.set('theme', 'default');
    settingsManager.set('wideScreen', true);
  });

  it('should build correct permission card', () => {
    const card = CardBuilder.buildPermissionCard('sess1', 5, 'Require git write');
    expect(card.header.template).toBe('yellow');
    expect(card.elements[1].actions[0].value.action).toBe('approve');
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

    const card = CardBuilder.buildPermissionCard('sess1', 5, 'Require git write');
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

  it('should build correct permission card with options', () => {
    const options = [
      { idx: 1, text: 'Yes, allow access' },
      { idx: 2, text: 'Yes, and always allow non-workspace access' },
      { idx: 3, text: 'No, deny access' }
    ];
    const card = CardBuilder.buildPermissionCard('sess1', 5, 'Require git write', options);
    expect(card.header.template).toBe('yellow');
    // elements[0] is the reason/description div; options appear as buttons in elements[1]
    expect(card.elements[0].text.content).toContain('Require git write');
    expect(card.elements[1].actions[0].value.action).toBe('approve_option');
    expect(card.elements[1].actions[0].value.text).toBe('Yes, allow access');
    expect(card.elements[1].actions[1].value.text).toBe('Yes, and always allow non-workspace access');
    expect(card.elements[1].actions[0].value.optionIndex).toBe(0);
    expect(card.elements[1].actions[1].value.optionIndex).toBe(1);
    expect(card.elements[1].actions[2].value.optionIndex).toBe(2);
  });

  it('should render subagent trace when parentId is passed to buildPermissionCard and buildQuestionCard', () => {
    const permCard = CardBuilder.buildPermissionCard('sub-session', 5, 'Reason text', null, 'parent-session');
    expect(permCard.elements[0].text.content).toContain('子代理');
    expect(permCard.elements[0].text.content).toContain('parent-session');

    const questionData = {
      questions: [{
        question: 'What to do?',
        options: ['Opt 1', 'Opt 2']
      }]
    };
    const questCard = CardBuilder.buildQuestionCard('sub-session', 5, questionData, 'parent-session');
    expect(questCard.elements[0].text.content).toContain('子代理');
    expect(questCard.elements[0].text.content).toContain('parent-session');
  });

  it('should truncate permission reason if it exceeds 800 characters', () => {
    const longReason = 'A'.repeat(1000);
    const card = CardBuilder.buildPermissionCard('sess1', 5, longReason);
    expect(card.elements[0].text.content.length).toBeLessThan(1000);
    expect(card.elements[0].text.content).toContain('（内容过长，已截断）');
  });
});
