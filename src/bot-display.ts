import type { BackendBot } from './types.js';

export function formatBotUsername(username?: string | null) {
  const normalized = username?.trim().replace(/^@/, '');
  return normalized ? `@${normalized}` : 'username unavailable';
}

export function formatBotListItem(bot: BackendBot) {
  return `• *${bot.name}* (${formatBotUsername(bot.telegramUsername)})`;
}

export function formatBotButtonLabel(bot: BackendBot) {
  const username = bot.telegramUsername?.trim().replace(/^@/, '');
  return username ? `${bot.name} (@${username})` : bot.name;
}
