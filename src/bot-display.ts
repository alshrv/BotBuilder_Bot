import type { BackendBot } from './types.js';

export function formatBotUsername(username?: string | null) {
  const normalized = username?.trim().replace(/^@/, '');
  return normalized ? `@${normalized}` : 'username unavailable';
}

export function formatBotListItem(bot: BackendBot) {
  const status =
    bot.status === 'token_invalid'
      ? '🔴 Token invalid'
      : bot.isActive === false
        ? '🔴 Stopped'
        : '🟢 Online';
  return `• *${bot.name}*      ${status}`;
}

export function formatBotButtonLabel(bot: BackendBot) {
  const username = bot.telegramUsername?.trim().replace(/^@/, '');
  const suffix =
    bot.status === 'token_invalid'
      ? ' 🔑'
      : bot.isActive === false
        ? ' 🔴'
        : ' 🟢';
  return username ? `${bot.name} (@${username})${suffix}` : `${bot.name}${suffix}`;
}
