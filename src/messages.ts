import { Composer, InlineKeyboard } from 'grammy';
import type { MyContext } from './types.js';
import { chatWithUserBot, createUserBot } from './api.js';
import { createManagementKeyboard } from './keyboards.js';
import { formatDataPayload } from './utils.js';

export const messages = new Composer<MyContext>();

// Managed Bot Created handler
messages.on('message:managed_bot_created', async (ctx) => {
  const managedBot = ctx.message.managed_bot_created.bot;
  const botId = managedBot.id;
  const botName = managedBot.first_name;
  
  try {
    const token = await ctx.api.getManagedBotToken(botId);
    
    // Save pending info
    ctx.session.pendingBot = { name: botName, token, prompt: '' };
    ctx.session.step = 'awaiting_bot_prompt';
    
    // Remove the custom keyboard
    await ctx.reply(
      `🎉 Great! You've successfully created *${botName}*.\n\nNow, tell me what this bot should do. For example:\n_"A bot that sends a random joke every morning"_`,
      { reply_markup: { remove_keyboard: true }, parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error retrieving bot token:', error);
    await ctx.reply('Error retrieving bot token from Telegram. Please try again or type /cancel.', { reply_markup: { remove_keyboard: true } });
  }
});

// Text message handler
messages.on('message:text', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const text = ctx.message.text;

  // Creation Flow
  if (ctx.session.step === 'awaiting_managed_bot') {
    return ctx.reply('Please use the "➕ Create Managed Bot" button below to create your bot, or type /cancel to abort.');
  }

  if (ctx.session.step === 'awaiting_bot_prompt') {
    if (ctx.session.pendingBot) {
      ctx.session.pendingBot.prompt = text;
      const botName = ctx.session.pendingBot.name;
      ctx.session.step = undefined;
      
      await ctx.reply(`Creating *${botName}*... this might take a minute ⏳`, { parse_mode: 'Markdown' });
      await ctx.replyWithChatAction('typing');

      try {
        const result = await createUserBot(telegramId, {
          name: botName,
          prompt: text,
          token: ctx.session.pendingBot.token,
        });
        
        ctx.session.activeBotId = result.botId;
        ctx.session.activeBotName = botName;
        ctx.session.pendingBot = undefined;
        
        await ctx.reply(
          `✅ Bot *${botName}* created successfully! You can now manage it here.`,
          {
            parse_mode: 'Markdown',
            reply_markup: createManagementKeyboard(),
          }
        );
      } catch (error: unknown) {
        console.error('Create error:', error);
        const msg =
          error instanceof Error ? error.message : 'Failed to create bot.';
        await ctx.reply(`❌ ${msg}\n\nPlease try again or contact support if the issue persists.`);
      }
    }
    return;
  }

  // Management Chat
  if (!ctx.session.activeBotId) {
    return ctx.reply('Please select a bot to manage first using /list or create a new one with /new.');
  }

  const activeBotId = ctx.session.activeBotId;

  try {
    await ctx.replyWithChatAction('typing');

    const data = await chatWithUserBot(telegramId, activeBotId, {
      message: text,
      history: ctx.session.chatHistory,
    });

    // Add to history
    ctx.session.chatHistory.push({ role: 'user', text });
    if (data.content) {
       ctx.session.chatHistory.push({ role: 'assistant', text: data.content });
    }

    if (data.type === 'confirm') {
      if (!data.action) {
        return ctx.reply(
          'The backend asked for confirmation but did not include an action to run.'
        );
      }

      ctx.session.pendingAction = data.action;
      await ctx.reply(data.content || 'Please confirm this backend action.', {
        reply_markup: new InlineKeyboard()
          .text('✅ Yes, Proceed', 'confirm_action')
          .text('❌ Cancel', 'cancel_action'),
      });
    } else {
      let finalContent = formatDataPayload(data.type, data.content, data.data);
      if (finalContent.length > 4000) {
        // Simple chunking for now, but ideally send as file
        for (let i = 0; i < finalContent.length; i += 4000) {
          await ctx.reply(finalContent.substring(i, i + 4000), { parse_mode: 'Markdown' });
        }
      } else if (finalContent) {
        await ctx.reply(finalContent, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply('Action completed.');
      }
    }

  } catch (error: any) {
    console.error('Chat error:', error?.response?.data || error.message);
    const msg = error?.response?.data?.message || 'Sorry, I encountered an error communicating with the BotBuilder backend.';
    await ctx.reply(msg);
  }
});
