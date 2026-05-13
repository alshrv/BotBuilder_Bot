import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BackendBot, MyContext } from './types.js';
import { chatWithUserBot, fetchUserBots } from './api.js';
import { formatDataPayload } from './utils.js';

export const callbacks = new Composer<MyContext>();

callbacks.callbackQuery('new_bot', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = 'awaiting_managed_bot';
  const keyboard = new Keyboard()
    .requestManagedBot('➕ Create Managed Bot', 1)
    .resized()
    .oneTime();

  await ctx.reply("To create a new bot, click the button below and follow Telegram's prompt.", {
    reply_markup: keyboard,
  });
});

callbacks.callbackQuery('list_bots', async (ctx) => {
  await ctx.answerCallbackQuery();
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
    return ctx.reply('You haven\'t created any bots yet. Use /new to get started!');
  }

  const keyboard = new InlineKeyboard();
  bots.forEach((b) => {
    keyboard.text(b.name, `select_bot:${b.id}`).row();
  });

  await ctx.editMessageText('Select a bot to manage:', { reply_markup: keyboard });
});

callbacks.callbackQuery(/^select_bot:(.+)$/, async (ctx) => {
  const botId = ctx.match[1];
  const telegramId = String(ctx.from?.id);
  
  try {
    const bots = await fetchUserBots(telegramId);
    const selectedBot = bots.find((b) => b.id === botId);
    
    if (selectedBot) {
      ctx.session.activeBotId = selectedBot.id;
      ctx.session.activeBotName = selectedBot.name;
      ctx.session.chatHistory = []; // Reset history for new bot session
      await ctx.answerCallbackQuery(`Selected ${selectedBot.name}`);
      await ctx.reply(
        `Now managing *${selectedBot.name}*.\n\nYou can ask me to:\n- "Show logs"\n- "Get stats"\n- "Deploy to prod"\n- "Improve the bot by adding a /help command"`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.answerCallbackQuery('Bot not found.');
    }
  } catch (error) {
    await ctx.answerCallbackQuery('Error selecting bot.');
  }
});

callbacks.callbackQuery('confirm_action', async (ctx) => {
  if (!ctx.session.pendingAction || !ctx.session.activeBotId) return;
  
  const telegramId = String(ctx.from?.id);
  const activeBotId = ctx.session.activeBotId;
  const pendingAction = ctx.session.pendingAction;
  await ctx.answerCallbackQuery('Confirmed!');
  await ctx.editMessageText('Processing action... ⏳');

  try {
    const data = await chatWithUserBot(telegramId, activeBotId, {
      message: 'Yes',
      history: ctx.session.chatHistory,
      confirmedAction: pendingAction,
    });

    ctx.session.pendingAction = null;
    
    const finalContent = formatDataPayload(data.type, data.content, data.data);
    if (finalContent.length > 4000) {
      for (let i = 0; i < finalContent.length; i += 4000) {
        await ctx.reply(finalContent.substring(i, i + 4000), { parse_mode: 'Markdown' });
      }
    } else if (finalContent) {
      await ctx.reply(finalContent, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('Action completed successfully.');
    }
  } catch (error: unknown) {
    console.error('Confirm error:', error);
    await ctx.reply('Error executing confirmed action.');
  }
});

callbacks.callbackQuery('cancel_action', async (ctx) => {
  ctx.session.pendingAction = null;
  await ctx.answerCallbackQuery('Cancelled');
  await ctx.editMessageText('Action cancelled.');
});

callbacks.callbackQuery('get_stats_quick', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');
  const activeBotId = ctx.session.activeBotId;
  await ctx.answerCallbackQuery();
  await ctx.reply('Fetching stats...');

  const telegramId = String(ctx.from?.id);
  try {
    const data = await chatWithUserBot(telegramId, activeBotId, {
      message: 'get stats',
      history: ctx.session.chatHistory,
    });

    const finalContent = formatDataPayload(data.type, data.content, data.data);
    if (finalContent) {
      await ctx.reply(finalContent, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('Action completed.');
    }
  } catch (error) {
    console.error('Stats error:', error);
    await ctx.reply('Error fetching stats.');
  }
});
