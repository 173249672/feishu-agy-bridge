export class EventClassifier {
  constructor() {
    this.lastPlannerResponseStep = null;
  }

  classifyLine(lineText) {
    if (!lineText.trim()) return null;
    try {
      const step = JSON.parse(lineText);
      const { step_index, type, status, content, tool_calls } = step;

      if (type === 'ASK_PERMISSION' || (tool_calls && tool_calls.some(tc => tc.name === 'ask_permission'))) {
        const permissionCall = tool_calls.find(tc => tc.name === 'ask_permission');
        return {
          eventType: 'PERMISSION_REQUIRED',
          stepIndex: step_index,
          summary: permissionCall?.args?.Reason || 'AGY is requesting tool permission.',
          metadata: { toolCalls: tool_calls }
        };
      }

      if (status === 'ERROR') {
        return {
          eventType: 'ERROR',
          stepIndex: step_index,
          summary: content || 'An error occurred during step execution.',
          metadata: { type }
        };
      }

      if (type === 'PLANNER_RESPONSE' && status === 'DONE') {
        if (!tool_calls || tool_calls.length === 0) {
          return {
            eventType: 'COMPLETED',
            stepIndex: step_index,
            summary: content || 'Task completed.',
            metadata: { content }
          };
        }
      }

      return null;
    } catch (err) {
      return null;
    }
  }
}
