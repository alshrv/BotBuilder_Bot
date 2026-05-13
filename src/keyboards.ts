import { InlineKeyboard } from 'grammy';

export function createManagementKeyboard() {
  return new InlineKeyboard()
    .text('📜 Show Logs', 'bot_action:logs')
    .text('📊 Get Stats', 'bot_action:stats')
    .row()
    .text('🟢 Get Status', 'bot_action:status')
    .text('🧾 Show Versions', 'bot_action:versions')
    .row()
    .text('⚙️ Settings', 'bot_settings');
}

export function createSettingsKeyboard() {
  return new InlineKeyboard()
    .text('⏹ Stop', 'bot_control:stop')
    .text('🔄 Restart', 'bot_control:restart')
    .row()
    .text('▶️ Resume', 'bot_control:resume')
    .text('⬅️ Back', 'bot_settings_back');
}
