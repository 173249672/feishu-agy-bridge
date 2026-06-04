import { settingsManager } from './settings-manager.js';

const translations = {
  zh: {
    // Commands & Notifications
    new_start: (prompt) => `🚀 正在启动新会话，提示词："${prompt}"...`,
    new_fail: (err) => `❌ AGY 启动失败\n\n${err}`,
    new_usage: '❌ 请指定提示词。例如：\`/new 帮我写一个脚本\`',
    switch_usage: '❌ 使用方法：\`/switch <序号或会话ID>\`',
    del_usage: '❌ 使用方法：\`/del <序号或会话ID>\` 或 \`/del all\`',
    list_header: '📋 活动会话：',
    list_empty: '没有找到活动会话。',
    switch_success: (id) => `✅ 已切换默认会话为 \`${id}\``,
    switch_fail: (arg) => `❌ 未找到会话 \`${arg}\`。`,
    stop_success: (id) => `⏹️ 已停止会话 \`${id}\` 的进程`,
    stop_already: (id) => `⚠️ 会话 \`${id}\` 已经处于停止状态。`,
    stop_no_default: '没有活动的默认会话。',
    del_all: (count) => `🗑️ 已删除所有共 ${count} 个会话。`,
    del_success: (id) => `🗑️ 已删除会话 \`${id}\`。`,
    del_fail: (arg) => `❌ 未找到会话 \`${arg}\`。`,
    model_list_header: (curr) => `🤖 当前模型: \`${curr}\`\n\n📋 可用模型:\n`,
    model_usage: '\n\n使用方法: `/model <模型别名>`',
    model_success: (model) => `✅ 模型已切换为 \`${model}\``,
    model_fail: (err) => `❌ 切换模型失败: ${err}`,
    unknown_command: (cmd) => `❌ 未知指令: ${cmd}`,
    no_active_session: '❌ 当前没有活动的会话。请发送 `/new <提示词>` 开始一个新会话。',
    session_not_active: (id) => `❌ 当前默认会话 \`${id}\` 不活动。请使用 \`/switch <序号/ID>\` 或发送 \`/new <提示词>\` 启动新会话。`,
    bot_busy: '⏳ 机器人当前正忙于执行任务，请等待本轮任务完成后再输入。您也可以发送 \`/stop\` 中断当前任务。',
    help_content: `📖 帮助中心 - 指令使用指南\n\n🚀 **/new <提示词>**\n开始一个新会话。提示词为你需要机器人协作完成的任务。例如：\`/new 帮我写一个备份脚本\`\n\n📋 **/list**\n列出本地所有会话，显示运行状态（🟢 运行中，⚪ 已停止）和默认会话（⭐ 标识）。\n\n🔄 **/switch <序号/会话ID>**\n将目标会话切换为当前默认会话。之后的消息都将转发到该会话。\n\n🤖 **/model [模型名称]**\n无参数时列出可用模型及别名；带参数时切换当前模型。例如：\`/model flash\`\n\n⏹️ **/stop [序号/会话ID]**\n停止目标会话的运行进程（默认停止当前会话）。\n\n🗑️ **/del <序号/会话ID/all>**\n删除目标会话及其本地文件；\`/del all\` 可清空所有会话。\n\n⚙️ **/settings**\n打开设置菜单卡片，调整语言、主题模板及宽屏模式配置。\n\nℹ️ **/help**\n显示本帮助手册。`,

    // Card UI Labels
    card_session_id: '会话 ID',
    card_step: '步骤',
    card_reason: '请求原因',
    card_result: '结果',
    card_confirm_title: '✅ 问题已回答',
    card_your_choice: '您的选择',
    card_status_update: 'ℹ️ AGY 状态更新',
    card_status: '状态',
    card_permission_title: '⚠️ AGY 请求操作确认',
    card_permission_confirm: '确认',
    card_permission_cancel: '取消',
    card_permission_approved: '✅ AGY 权限已确认',
    card_permission_rejected: '❌ AGY 权限已拒绝',
    card_permission_handled_suffix: '已由用户进行确认/拒绝。',
    card_error_title: '🚨 AGY 运行出现异常',
    card_error_info: '错误信息',
    card_completed_waiting: '💬 AGY 回复 (等待您的输入...)',
    card_completed_done: '🏁 AGY 会话已结束',
    card_completed_tip_active: '\n\n---\n💡 **提示**: 机器人正等待输入，您可以直接在此回复继续对话。',
    card_completed_tip_done: '\n\n---\n🏁 **提示**: 会话已结束，如需开始新任务请发送 `/new <提示词>`。',
    card_question_title: '❓ AGY 提问 (需要您的决策)',
    card_question_btn_prefix: '选择 ',
    card_summary: '完成摘要',
    card_question: '问题',
    card_options: '选项',
    card_subagent_of: (parentId) => `🔗 子代理（派生自 \`${parentId}\`）`,

    // Settings Interface
    settings_title: '⚙️ Bridge 设置 (Settings)',
    settings_lang_label: '🌐 语言 (Language)',
    settings_theme_label: '🎨 卡片主题 (Theme)',
    settings_widescreen_label: '🖥️ 宽屏模式 (Wide Screen)',
    settings_save_toast: '设置已更新 / Settings updated',
    status_label: '状态'
  },
  en: {
    // Commands & Notifications
    new_start: (prompt) => `🚀 Starting new session with prompt: "${prompt}"...`,
    new_fail: (err) => `❌ AGY failed to start\n\n${err}`,
    new_usage: '❌ Please specify a prompt. Example: \`/new help me write a script\`',
    switch_usage: '❌ Usage: \`/switch <index or session-id>\`',
    del_usage: '❌ Usage: \`/del <index or session-id>\` or \`/del all\`',
    list_header: '📋 Active Sessions:',
    list_empty: 'No sessions found.',
    switch_success: (id) => `✅ Switched default session to \`${id}\``,
    switch_fail: (arg) => `❌ Session \`${arg}\` not found.`,
    stop_success: (id) => `⏹️ Stopped process for session \`${id}\``,
    stop_already: (id) => `⚠️ Session \`${id}\` is already stopped.`,
    stop_no_default: 'No active default session.',
    del_all: (count) => `🗑️ Deleted all ${count} sessions.`,
    del_success: (id) => `🗑️ Deleted session \`${id}\`.`,
    del_fail: (arg) => `❌ Session \`${arg}\` not found.`,
    model_list_header: (curr) => `🤖 Current Model: \`${curr}\`\n\n📋 Available Models:\n`,
    model_usage: '\n\nUsage: `/model <model-name>`',
    model_success: (model) => `✅ Model switched to \`${model}\``,
    model_fail: (err) => `❌ Failed to switch model: ${err}`,
    unknown_command: (cmd) => `❌ Unknown command: ${cmd}`,
    no_active_session: '❌ No active session to reply to. Use `/new <prompt>` to start one.',
    session_not_active: (id) => `❌ The current default session \`${id}\` is not active (no running process). Use \`/switch <index/id>\` or start a new one with \`/new <prompt>\`.`,
    bot_busy: '⏳ Bot is currently busy executing tasks. Please wait until this round completes. You can also send \`/stop\` to interrupt.',
    help_content: `📖 Help Center - Command Guide\n\n🚀 **/new <prompt>**\nStart a new session with the task description you want the bot to work on. Example: \`/new write a backup script\`\n\n📋 **/list**\nList all local sessions, showing their status (🟢 running, ⚪ stopped) and default session (marked with ⭐).\n\n🔄 **/switch <index/session-id>**\nSwitch the default active session to the target session. Subsequent inputs will be forwarded there.\n\n🤖 **/model [model-name]**\nWithout arguments, lists all available models; with argument, switches the active model. Example: \`/model flash\`\n\n⏹️ **/stop [index/session-id]**\nStop the active process of the target session (defaults to default session).\n\n🗑️ **/del <index/session-id/all>**\nDelete the target session and its files from disk; \`/del all\` deletes all sessions.\n\n⚙️ **/settings**\nDisplay the settings card to configure language, theme, and widescreen mode.\n\nℹ️ **/help**\nShow this help manual.`,

    // Card UI Labels
    card_session_id: 'Session ID',
    card_step: 'Step',
    card_reason: 'Reason',
    card_result: 'Result',
    card_confirm_title: '✅ Question Answered',
    card_your_choice: 'Your Choice',
    card_status_update: 'ℹ️ AGY Status Update',
    card_status: 'Status',
    card_permission_title: '⚠️ AGY Action Confirmation Required',
    card_permission_confirm: 'Confirm',
    card_permission_cancel: 'Cancel',
    card_permission_approved: '✅ AGY Action Confirmed',
    card_permission_rejected: '❌ AGY Action Rejected',
    card_permission_handled_suffix: 'Has been confirmed/rejected by user.',
    card_error_title: '🚨 AGY Exception Occurred',
    card_error_info: 'Error Message',
    card_completed_waiting: '💬 AGY Reply (Waiting for input...)',
    card_completed_done: '🏁 AGY Session Ended',
    card_completed_tip_active: '\n\n---\n💡 **Tip**: Bot is waiting for input. Reply directly here to continue.',
    card_completed_tip_done: '\n\n---\n🏁 **Tip**: Session ended. Send `/new <prompt>` to start a new task.',
    card_question_title: '❓ AGY Question (Decision required)',
    card_question_btn_prefix: 'Select ',
    card_summary: 'Summary',
    card_question: 'Question',
    card_options: 'Options',
    card_subagent_of: (parentId) => `🔗 Sub-agent (spawned by \`${parentId}\`)`,

    // Settings Interface
    settings_title: '⚙️ Bridge Settings',
    settings_lang_label: '🌐 Language',
    settings_theme_label: '🎨 Theme Color',
    settings_widescreen_label: '🖥️ Wide Screen Mode',
    settings_save_toast: 'Settings updated',
    status_label: 'Status'
  }
};

export function t(key, ...args) {
  const lang = settingsManager.get('language') || 'zh';
  const val = translations[lang] && translations[lang][key];
  if (typeof val === 'function') {
    return val(...args);
  }
  return val || key;
}
