export function buildPermissionCard(sessionId, stepIndex, reason) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'yellow',
      title: { tag: 'plain_text', content: '⚠️ AGY 请求操作确认' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**请求原因**:\n${reason}`
        }
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✅ 确认' },
            type: 'primary',
            value: { action: 'approve', sessionId, stepIndex }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❌ 取消' },
            type: 'danger',
            value: { action: 'reject', sessionId, stepIndex }
          }
        ]
      }
    ]
  };
}

export function buildErrorCard(sessionId, stepIndex, errorMsg) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'red',
      title: { tag: 'plain_text', content: '🚨 AGY 运行出现异常' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**错误信息**:\n\`\`\`\n${errorMsg.substring(0, 1000)}\n\`\`\``
        }
      }
    ]
  };
}

export function buildCompletedCard(sessionId, stepIndex, summary) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'green',
      title: { tag: 'plain_text', content: '🎉 AGY 对话轮次完成' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n\n**完成摘要**:\n${summary.substring(0, 2000)}`
        }
      }
    ]
  };
}

export function buildStatusCard(sessionId, statusText) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: 'ℹ️ AGY 状态更新' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n**状态**: ${statusText}`
        }
      }
    ]
  };
}
