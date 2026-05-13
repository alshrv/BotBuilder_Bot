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

export function createSettingsKeyboard() {
  return new InlineKeyboard()
    .text('⏹ Stop', 'bot_control:stop')
    .text('🔄 Restart', 'bot_control:restart')
    .row()
    .text('▶️ Resume', 'bot_control:resume')
    .text('🛑 Stop Live Logs', 'bot_logs_stop')
    .row()
    .text('🗑 Delete Bot', 'bot_delete_confirm')
    .text('⬅️ Back', 'bot_settings_back');
}

export function createDeleteConfirmKeyboard() {
  return new InlineKeyboard()
    .text('Yes, delete', 'bot_control:delete')
    .text('Cancel', 'bot_settings');
}
