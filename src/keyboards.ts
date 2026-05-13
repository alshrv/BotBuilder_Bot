import { InlineKeyboard } from 'grammy';

export function createManagementKeyboard() {
  return new InlineKeyboard()
    .text('📜 Show Logs', 'bot_action:logs')
    .text('🔴 Live Logs', 'bot_logs_watch')
    .row()
    .text('📊 Get Stats', 'bot_action:stats')
    .text('🟢 Get Status', 'bot_action:status')
    .row()
    .text('🧾 Show Versions', 'bot_action:versions')
    .text('⚙️ Settings', 'bot_settings');
}

export function createSettingsKeyboard(isActive: boolean) {
  const runtimeAction = isActive
    ? { label: '⏹ Stop Bot', action: 'bot_control:stop' }
    : { label: '▶️ Resume Bot', action: 'bot_control:resume' };

  return new InlineKeyboard()
    .text('🔄 Restart Bot', 'bot_control:restart')
    .text(runtimeAction.label, runtimeAction.action)
    .row()
    .text('🛑 Stop Live Logs', 'bot_logs_stop')
    .text('🗑 Delete Bot', 'bot_delete_confirm')
    .row()
    .text('⬅️ Back', 'bot_settings_back');
}

export function createDeleteConfirmKeyboard() {
  return new InlineKeyboard()
    .text('Yes, delete', 'bot_control:delete')
    .text('Cancel', 'bot_settings');
}
