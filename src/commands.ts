import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BackendBot, MyContext } from './types.js';
import { checkCreateBotAllowed, fetchUserBots } from './api.js';
import { formatBotButtonLabel, formatBotListItem } from './bot-display.js';
import { createHomeKeyboard } from './keyboards.js';

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
    return ctx.reply(`❌ ${msg}`, {
      reply_markup: createHomeKeyboard({ showCreateBot: false }),
    });
  }

  ctx.session.step = 'awaiting_managed_bot';
  const keyboard = new Keyboard()
    .requestManagedBot('➕ Create Managed Bot', 1)
    .row()
    .text('❌ Cancel')
    .resized()
    .oneTime();

  const message = await ctx.reply(
    "Tap below and follow Telegram's prompt.",
    {
      reply_markup: keyboard,
    },
  );
  ctx.session.flowMessageId = message.message_id;
}

async function createHomeKeyboardForUser(ctx: MyContext) {
  const telegramId = String(ctx.from?.id);

  try {
    await checkCreateBotAllowed(telegramId);
    return createHomeKeyboard();
  } catch {
    return createHomeKeyboard({ showCreateBot: false });
  }
}

commands.command('start', async (ctx) => {
  await ctx.reply(
    '*BotBuilder*\n\nCreate a bot or choose one to manage.',
    {
      parse_mode: 'Markdown',
      reply_markup: await createHomeKeyboardForUser(ctx),
    }
  );
});

commands.command('help', async (ctx) => {
  await ctx.reply(
    '*BotBuilder*\n\nUse the buttons below to create or manage bots.',
    {
      parse_mode: 'Markdown',
      reply_markup: await createHomeKeyboardForUser(ctx),
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
      'I could not reach the BotBuilder backend.',
      {
        reply_markup: createHomeKeyboard({ showCreateBot: false }),
      },
    );
  }

  if (bots.length === 0) {
    return ctx.reply('No bots yet.', {
      reply_markup: new InlineKeyboard().text('🆕 Create Bot', 'new_bot'),
    });
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
