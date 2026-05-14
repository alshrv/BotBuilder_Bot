import { InlineKeyboard, Keyboard } from 'grammy';
import type { GenerateMeta } from './types.js';

function normalizeUsername(username?: string | null) {
  return username?.trim().replace(/^@/, '');
}

export function createMainMenuKeyboard() {
  return new Keyboard()
    .text('🤖 Bots')
    .text('➕ Create')
    .row()
    .text('📊 Analytics')
    .text('⚙️ Settings')
    .resized()
    .persistent();
}

export function createEntryKeyboard() {
  return new InlineKeyboard()
    .text('✨ Create Bot', 'new_bot')
    .text('🤖 My Bots', 'list_bots');
}

export function createCreateMethodKeyboard() {
  return new InlineKeyboard()
    .text('🧠 Generate with AI', 'create_ai')
    .row()
    .text('🔙 Back', 'main_menu');
}

export function createManagedBotKeyboard(label = '➕ Create Telegram Bot') {
  return new Keyboard()
    .requestManagedBot(label, 1)
    .row()
    .text('🔙 Back')
    .resized()
    .oneTime();
}

export function createManagementKeyboard(username?: string | null) {
  const keyboard = new InlineKeyboard();
  const normalized = normalizeUsername(username);

  if (normalized) {
    keyboard.url('🚀 Open Bot', `https://t.me/${normalized}`);
    keyboard.text('📊 Analytics', 'bot_action:stats').row();
  } else {
    keyboard.text('📊 Analytics', 'bot_action:stats').row();
  }

  return keyboard
    .text('🧠 Improve', 'bot_improve')
    .text('🔄 Versions', 'bot_action:versions')
    .row()
    .text('⚙️ Settings', 'bot_settings');
}

export function createSuccessKeyboard(username?: string | null) {
  const keyboard = new InlineKeyboard();
  const normalized = normalizeUsername(username);

  if (normalized) {
    keyboard.url('🚀 Open Bot', `https://t.me/${normalized}`);
    keyboard.text('⚙️ Manage', 'bot_settings_back').row();
  } else {
    keyboard.text('⚙️ Manage', 'bot_settings_back').row();
  }

  return keyboard
    .text('📊 Analytics', 'bot_action:stats')
    .text('🧠 Improve', 'bot_improve');
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
  return new InlineKeyboard().text('🔙 Back', 'flow_cancel');
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
    .text('🚀 Generate Bot', 'generate_bot_confirm')
    .row()
    .text('✏️ Edit Prompt', 'edit_bot_prompt')
    .text('🔙 Back', 'flow_cancel');
}

export function createDeleteConfirmKeyboard() {
  return new InlineKeyboard()
    .text('Yes, delete', 'bot_control:delete')
    .text('🔙 Back', 'bot_settings');
}

export function createBackToManagementKeyboard() {
  return new InlineKeyboard().text('🔙 Back', 'bot_settings_back');
}
