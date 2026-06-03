import { describe, it, expect } from 'vitest';
import { EventClassifier } from '../src/event-classifier.js';

describe('EventClassifier', () => {
  it('should detect permission requests', () => {
    const classifier = new EventClassifier();
    const line = JSON.stringify({
      step_index: 5,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      tool_calls: [{ name: 'ask_permission', args: { Reason: 'Need write permission' } }]
    });
    const result = classifier.classifyLine(line);
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('PERMISSION_REQUIRED');
    expect(result.summary).toBe('Need write permission');
  });

  it('should detect errors', () => {
    const classifier = new EventClassifier();
    const line = JSON.stringify({
      step_index: 6,
      type: 'RUN_COMMAND',
      status: 'ERROR',
      content: 'Command failed: permission denied'
    });
    const result = classifier.classifyLine(line);
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('ERROR');
    expect(result.summary).toContain('Command failed');
  });

  it('should detect task completion', () => {
    const classifier = new EventClassifier();
    const line = JSON.stringify({
      step_index: 7,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      content: 'Here is the code you requested.'
    });
    const result = classifier.classifyLine(line);
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('COMPLETED');
    expect(result.summary).toBe('Here is the code you requested.');
  });
});
