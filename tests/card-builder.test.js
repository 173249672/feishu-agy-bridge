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
});
