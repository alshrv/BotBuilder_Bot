import { InlineKeyboard } from 'grammy';
import type { GenerateMeta } from './types.js';

export function createHomeKeyboard() {
  return new InlineKeyboard()
    .text('🆕 Create Bot', 'new_bot')
    .text('📋 My Bots', 'list_bots');
}

export function createManagementKeyboard() {
  return new InlineKeyboard()
    .text('✨ Improve Bot', 'bot_improve')
    .row()
    .text('🟢 Status', 'bot_action:status')
    .text('📊 Get Stats', 'bot_action:stats')
    .row()
    .text('📜 Show Logs', 'bot_action:logs')
    .text('🔁 Change Version', 'bot_action:versions')
    .row()
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

function checkboxLabel(checked: boolean, label: string) {
  return `${checked ? '✅' : '⬜'} ${label}`;
}

export function createGenerateOptionsKeyboard(meta: GenerateMeta) {
  return new InlineKeyboard()
    .text(
      checkboxLabel(meta.description, 'Description'),
      'generate_meta_toggle:description',
    )
    .row()
    .text(checkboxLabel(meta.about, 'About'), 'generate_meta_toggle:about')
    .text(
      checkboxLabel(meta.commands, 'Commands'),
      'generate_meta_toggle:commands',
    )
    .row()
    .text('🚀 Generate', 'generate_bot_confirm')
    .row()
    .text('⬅️ Back', 'flow_cancel');
}

export function createDeleteConfirmKeyboard() {
  return new InlineKeyboard()
    .text('Yes, delete', 'bot_control:delete')
    .text('⬅️ Back', 'bot_settings');
}

export function createBackToManagementKeyboard() {
  return new InlineKeyboard().text('⬅️ Back', 'bot_settings_back');
}
