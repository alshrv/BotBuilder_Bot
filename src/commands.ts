import { Composer, InlineKeyboard } from 'grammy';
import type { BackendBot, MyContext } from './types.js';
import { checkCreateBotAllowed, fetchUserBots } from './api.js';
import { formatBotButtonLabel, formatBotListItem } from './bot-display.js';
import {
  createManagedBotKeyboard,
  createMainMenuKeyboard,
} from './keyboards.js';

export const commands = new Composer<MyContext>();

async function beginNewBotFlow(ctx: MyContext) {
  const telegramId = String(ctx.from?.id);

  try {
    await checkCreateBotAllowed(telegramId);
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : 'You cannot create another bot right now.';
    return ctx.reply(`❌ ${msg}`);
  }

  ctx.session.step = 'awaiting_managed_bot';
  const message = await ctx.reply(
    [
      '✨ Create Bot',
      '',
      "Tap below and follow Telegram's prompt.",
    ].join('\n'),
    {
      reply_markup: createManagedBotKeyboard(),
    },
  );
  ctx.session.flowMessageId = message.message_id;
}

commands.command('start', async (ctx) => {
  await ctx.reply(
    [
      '🤖 BotBuilder',
      '',
      'Create and manage Telegram bots with AI.',
    ].join('\n'),
    {
      reply_markup: createMainMenuKeyboard(),
    }
  );
});

commands.command('help', async (ctx) => {
  await ctx.reply(
    [
      '🤖 BotBuilder',
      '',
      '/new - Create a bot with AI',
      '/list - Show your bots',
      '/select - Alias for /list',
      '/cancel - Cancel the current flow',
      '',
      'You can also use the bottom keyboard for the main actions.',
    ].join('\n'),
    {
      reply_markup: createMainMenuKeyboard(),
    },
  );
});

commands.command('new', async (ctx) => {
  await beginNewBotFlow(ctx);
});

commands.command(['list', 'select'], async (ctx) => {
  const telegramId = String(ctx.from?.id);
  let bots: BackendBot[];

  try {
    bots = await fetchUserBots(telegramId);
  } catch (error) {
    console.error('Error fetching bots:', error);
    return ctx.reply(
      'I could not reach the BotBuilder backend. Please try again in a moment.'
    );
  }

  if (bots.length === 0) {
    return ctx.reply("You haven't created any bots yet. Use /new to get started!");
  }

  const keyboard = new InlineKeyboard();
  bots.forEach((b) => {
    keyboard.text(formatBotButtonLabel(b), `select_bot:${b.id}`).row();
  });
  if (ctx.session.activeBotId) {
    keyboard.text('🔙 Back', 'bot_settings_back');
  }

  const botList = bots.map(formatBotListItem).join('\n');
  await ctx.reply(`🤖 *Your Bots*\n\n${botList}\n\nSelect a bot to manage:`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

commands.command('cancel', async (ctx) => {
  if (ctx.chat?.id && ctx.session.flowMessageId) {
    await ctx.api
      .deleteMessage(ctx.chat.id, ctx.session.flowMessageId)
      .catch(() => undefined);
  }

  ctx.session.step = undefined;
  ctx.session.pendingBot = undefined;
  delete ctx.session.flowMessageId;
  await ctx.reply('Operation cancelled.', {
    reply_markup: createMainMenuKeyboard(),
  });
});
