import { InlineKeyboard } from 'grammy';

export function createManagementKeyboard() {
  return new InlineKeyboard()
    .text('✨ Improve Bot', 'bot_improve')
    .row()
    .text('📜 Show Logs', 'bot_action:logs')
    .text('📊 Get Stats', 'bot_action:stats')
    .row()
    .text('🧾 Show Versions', 'bot_action:versions')
    .text('⚙️ Settings', 'bot_settings');
}

export function createSettingsKeyboard(
  isActive: boolean,
  isTokenInvalid = false,
  liveLogsActive = false,
) {
  if (isTokenInvalid) {
    return createTokenInvalidKeyboard();
  }

  const runtimeAction = isActive
    ? { label: '⏹ Stop Bot', action: 'bot_control:stop' }
    : { label: '▶️ Resume Bot', action: 'bot_control:resume' };
  const liveLogsAction = liveLogsActive
    ? { label: '🛑 Stop Live Logs', action: 'bot_logs_stop' }
    : { label: '🔴 Start Live Logs', action: 'bot_logs_watch' };

  return new InlineKeyboard()
    .text('🔄 Restart Bot', 'bot_control:restart')
    .text(runtimeAction.label, runtimeAction.action)
    .row()
    .text(liveLogsAction.label, liveLogsAction.action)
    .text('🗑 Delete Bot', 'bot_delete_confirm')
    .row()
    .text('⬅️ Back', 'bot_settings_back');
}

export function createTokenInvalidKeyboard() {
  return new InlineKeyboard()
    .text('🔑 Update Token', 'bot_update_token')
    .text('🗑 Delete Bot', 'bot_delete_confirm')
    .row()
    .text('⬅️ Back', 'bot_settings_back');
}

export function createFlowCancelKeyboard() {
  return new InlineKeyboard().text('⬅️ Back', 'flow_cancel');
}

export function createDeleteConfirmKeyboard() {
  return new InlineKeyboard()
    .text('Yes, delete', 'bot_control:delete')
    .text('⬅️ Back', 'bot_settings');
}

export function createBackToManagementKeyboard() {
  return new InlineKeyboard().text('⬅️ Back', 'bot_settings_back');
}
