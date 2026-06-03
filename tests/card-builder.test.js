import { describe, it, expect } from 'vitest';
import * as CardBuilder from '../src/card-builder.js';

describe('CardBuilder', () => {
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
});
