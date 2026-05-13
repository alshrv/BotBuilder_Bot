import { InlineKeyboard } from 'grammy';

export function createManagementKeyboard() {
  return new InlineKeyboard()
    .text('📜 Show Logs', 'bot_action:logs')
    .text('📊 Get Stats', 'bot_action:stats')
    .row()
    .text('🟢 Get Status', 'bot_action:status')
    .text('🧾 Show Versions', 'bot_action:versions');
}
