import { describe, it, expect } from 'vitest';
import { SessionRegistry } from '../src/session-registry.js';

describe('SessionRegistry', () => {
  it('should register and retrieve sessions', () => {
    const registry = new SessionRegistry();
    registry.register('session1', '/path/to/log1');
    expect(registry.get('session1')).toBeDefined();
    expect(registry.getDefault().id).toBe('session1');
  });

  it('should switch default session', () => {
    const registry = new SessionRegistry();
    registry.register('session1', '/path/to/log1');
    registry.register('session2', '/path/to/log2');
    expect(registry.getDefault().id).toBe('session1');
    registry.setDefault('session2');
    expect(registry.getDefault().id).toBe('session2');
  });

  it('should support parentId registration for subagents', () => {
    const registry = new SessionRegistry();
    registry.register('session1', '/path/to/log1');
    registry.register('subsession', '/path/to/log2', 'session1');
    expect(registry.get('subsession').parentId).toBe('session1');
    expect(registry.get('session1').parentId).toBeNull();
  });
});
