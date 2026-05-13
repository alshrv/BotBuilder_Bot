import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BackendBot, MyContext } from './types.js';
import { fetchUserBots } from './api.js';

export const commands = new Composer<MyContext>();

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
    'Once a bot is selected, you can talk to me naturally to manage it (e.g., "show logs", "deploy", "improve code").'
  );
});

commands.command('new', async (ctx) => {
  ctx.session.step = 'awaiting_managed_bot';
  const keyboard = new Keyboard()
    .requestManagedBot('➕ Create Managed Bot', 1)
    .resized()
    .oneTime();

  await ctx.reply("To create a new bot, click the button below and follow Telegram's prompt.", {
    reply_markup: keyboard,
  });
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
    keyboard.text(b.name, `select_bot:${b.id}`).row();
  });

  await ctx.reply('Select a bot to manage:', { reply_markup: keyboard });
});

commands.command('cancel', async (ctx) => {
  ctx.session.step = undefined;
  ctx.session.pendingBot = undefined;
  ctx.session.pendingAction = undefined;
  await ctx.reply('Operation cancelled.');
});
