import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BackendBot, MyContext } from './types.js';
import { checkCreateBotAllowed, fetchUserBots } from './api.js';
import { formatBotButtonLabel, formatBotListItem } from './bot-display.js';

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
  const keyboard = new Keyboard()
    .requestManagedBot('➕ Create Managed Bot', 1)
    .row()
    .text('❌ Cancel')
    .resized()
    .oneTime();

  const message = await ctx.reply(
    "To create a new bot, click the button below and follow Telegram's prompt.",
    {
      reply_markup: keyboard,
    },
  );
  ctx.session.flowMessageId = message.message_id;
}

commands.command('start', async (ctx) => {
  await ctx.reply(
    'Welcome to BotBuilder! 🤖\n\n' +
    'I am your assistant to create and manage Telegram bots.\n\n' +
    'Commands:\n' +
    '/new - Create a new bot\n' +
    '/list - List your bots\n' +
    '/select - Select a bot to manage\n' +
    '/help - Show this message',
    {
      reply_markup: new InlineKeyboard()
        .text('🆕 Create Bot', 'new_bot')
        .text('📋 List My Bots', 'list_bots'),
    }
  );
});

commands.command('help', async (ctx) => {
  await ctx.reply(
    'Commands:\n' +
    '/new - Create a new bot\n' +
    '/list - List your bots and select one\n' +
    '/select - Alias for /list\n' +
    '/cancel - Cancel current operation\n\n' +
    'Once a bot is selected, use the buttons below the bot dashboard to manage it.'
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
    keyboard.text('⬅️ Back', 'bot_settings_back');
  }

  const botList = bots.map(formatBotListItem).join('\n');
  await ctx.reply(`*Your bots*\n${botList}\n\nSelect a bot to manage:`, {
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
    reply_markup: { remove_keyboard: true },
  });
});
