import { t } from './i18n.js';
import { settingsManager } from './settings-manager.js';

function getCardConfig(defaultColor) {
  const theme = settingsManager.get('theme') || 'default';
  const wideScreen = settingsManager.get('wideScreen') !== false;
  return {
    wideScreen,
    template: theme === 'default' ? defaultColor : theme
  };
}

export function buildPermissionCard(sessionId, stepIndex, reason) {
  const cfg = getCardConfig('yellow');
  return {
    config: { wide_screen_mode: cfg.wideScreen },
    header: {
      template: cfg.template,
      title: { tag: 'plain_text', content: t('card_permission_title') }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card_session_id')}**: \`${sessionId}\`\n**${t('card_step')}**: #${stepIndex}\n\n**${t('card_reason')}**:\n${reason}`
        }
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `✅ ${t('card_permission_confirm')}` },
            type: 'primary',
            value: { action: 'approve', sessionId, stepIndex }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `❌ ${t('card_permission_cancel')}` },
            type: 'danger',
            value: { action: 'reject', sessionId, stepIndex }
          }
        ]
      }
    ]
  };
}

export function buildErrorCard(sessionId, stepIndex, errorMsg) {
  const cfg = getCardConfig('red');
  return {
    config: { wide_screen_mode: cfg.wideScreen },
    header: {
      template: cfg.template,
      title: { tag: 'plain_text', content: t('card_error_title') }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card_session_id')}**: \`${sessionId}\`\n**${t('card_step')}**: #${stepIndex}\n\n**${t('card_error_info')}**:\n\`\`\`\n${errorMsg.substring(0, 1000)}\n\`\`\``
        }
      }
    ]
  };
}

export function buildCompletedCard(sessionId, stepIndex, summary, isActive = true) {
  const cfg = getCardConfig(isActive ? 'green' : 'grey');
  const title = isActive ? t('card_completed_waiting') : t('card_completed_done');
  const footer = isActive ? t('card_completed_tip_active') : t('card_completed_tip_done');

  return {
    config: { wide_screen_mode: cfg.wideScreen },
    header: {
      template: isActive ? cfg.template : 'grey',
      title: { tag: 'plain_text', content: title }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card_session_id')}**: \`${sessionId}\`\n\n**${t('card_summary')}**:\n${summary.substring(0, 2000)}${footer}`
        }
      }
    ]
  };
}

export function buildStatusCard(sessionId, statusText) {
  const cfg = getCardConfig('blue');
  return {
    config: { wide_screen_mode: cfg.wideScreen },
    header: {
      template: cfg.template,
      title: { tag: 'plain_text', content: t('card_status_update') }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card_session_id')}**: \`${sessionId}\`\n**${t('card_status')}**: ${statusText}`
        }
      }
    ]
  };
}

export function buildQuestionCard(sessionId, stepIndex, questionData) {
  const cfg = getCardConfig('violet');
  const firstQuestion = questionData.questions[0];
  const questionText = firstQuestion.question;
  const options = firstQuestion.options;
  
  const optionsMarkdown = options.map((opt, idx) => {
    return `${idx + 1}️⃣ ${opt}`;
  }).join('\n\n');

  const buttons = options.map((opt, idx) => {
    return {
      tag: 'button',
      text: { tag: 'plain_text', content: `${t('card_question_btn_prefix')}${idx + 1}` },
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
    config: { wide_screen_mode: cfg.wideScreen },
    header: {
      template: cfg.template,
      title: { tag: 'plain_text', content: t('card_question_title') }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card_session_id')}**: \`${sessionId}\`\n**${t('card_step')}**: #${stepIndex}\n\n**${t('card_question')}**:\n${questionText}\n\n**${t('card_options')}**:\n${optionsMarkdown}`
        }
      },
      {
        tag: 'action',
        actions: buttons
      }
    ]
  };
}

export function buildSettingsCard() {
  const current = settingsManager.getAll();
  const tLang = current.language === 'zh' ? '中文 (Chinese)' : 'English';
  const tTheme = {
    default: 'Default (Multi-color)',
    blue: 'Cool Blue',
    orange: 'Warm Orange',
    violet: 'Elegant Violet',
    grey: 'Minimalist Grey'
  }[current.theme];
  const tWS = current.wideScreen ? 'On' : 'Off';

  return {
    config: { wide_screen_mode: current.wideScreen !== false },
    header: {
      template: 'indigo',
      title: { tag: 'plain_text', content: t('settings_title') }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('settings_lang_label')}**: \`${tLang}\`\n**${t('settings_theme_label')}**: \`${tTheme}\`\n**${t('settings_widescreen_label')}**: \`${tWS}\``
        }
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🌐 中文' },
            type: current.language === 'zh' ? 'primary' : 'default',
            value: { action: 'set_lang', lang: 'zh' }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🌐 English' },
            type: current.language === 'en' ? 'primary' : 'default',
            value: { action: 'set_lang', lang: 'en' }
          }
        ]
      },
      {
        tag: 'action',
        actions: [
          { key: 'default', name: 'Default' },
          { key: 'blue', name: 'Blue' },
          { key: 'orange', name: 'Orange' },
          { key: 'violet', name: 'Violet' },
          { key: 'grey', name: 'Grey' }
        ].map(item => {
          return {
            tag: 'button',
            text: { tag: 'plain_text', content: item.name },
            type: current.theme === item.key ? 'primary' : 'default',
            value: { action: 'set_theme', theme: item.key }
          };
        })
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🖥️ Wide Screen: ON' },
            type: current.wideScreen ? 'primary' : 'default',
            value: { action: 'toggle_widescreen', wideScreen: true }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🖥️ Wide Screen: OFF' },
            type: !current.wideScreen ? 'primary' : 'default',
            value: { action: 'toggle_widescreen', wideScreen: false }
          }
        ]
      }
    ]
  };
}
