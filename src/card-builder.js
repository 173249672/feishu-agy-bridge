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

export function buildCompletedCard(sessionId, stepIndex, summary, isActive = true) {
  const title = isActive ? '💬 AGY 回复 (等待您的输入...)' : '🏁 AGY 会话已结束';
  const template = isActive ? 'green' : 'grey';
  const footer = isActive 
    ? '\n\n---\n💡 **提示**: 机器人正等待输入，您可以直接在此回复继续对话。' 
    : '\n\n---\n🏁 **提示**: 会话已结束，如需开始新任务请发送 `/new <提示词>`。';

  return {
    config: { wide_screen_mode: true },
    header: {
      template: template,
      title: { tag: 'plain_text', content: title }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n\n**完成摘要**:\n${summary.substring(0, 2000)}${footer}`
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

export function buildQuestionCard(sessionId, stepIndex, questionData) {
  const firstQuestion = questionData.questions[0];
  const questionText = firstQuestion.question;
  const options = firstQuestion.options;
  
  const optionsMarkdown = options.map((opt, idx) => {
    return `${idx + 1}️⃣ ${opt}`;
  }).join('\n\n');

  const buttons = options.map((opt, idx) => {
    return {
      tag: 'button',
      text: { tag: 'plain_text', content: `选择 ${idx + 1}` },
      type: 'primary',
      value: { 
        action: 'answer', 
        sessionId, 
        stepIndex, 
        optionIndex: idx, 
        text: opt 
      }
    };
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'violet',
      title: { tag: 'plain_text', content: '❓ AGY 提问 (需要您的决策)' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话 ID**: \`${sessionId}\`\n**步骤**: #${stepIndex}\n\n**问题**:\n${questionText}\n\n**选项**:\n${optionsMarkdown}`
        }
      },
      {
        tag: 'action',
        actions: buttons
      }
    ]
  };
}
