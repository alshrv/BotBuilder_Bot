import { Composer, InlineKeyboard } from 'grammy';
import type { MyContext } from './types.js';
import { chatWithUserBot, createUserBot, updateBotToken } from './api.js';
import { formatBotUsername } from './bot-display.js';
import { createFlowCancelKeyboard, createManagementKeyboard } from './keyboards.js';
import { formatDataPayload } from './utils.js';

export const messages = new Composer<MyContext>();

async function editFlowMessageOrReply(
  ctx: MyContext,
  text: string,
  extra = {},
) {
  if (ctx.chat?.id && ctx.session.flowMessageId) {
    try {
      await ctx.api.editMessageText(ctx.chat.id, ctx.session.flowMessageId, text, extra);
      return;
    } catch {
      delete ctx.session.flowMessageId;
    }
  }

  const message = await ctx.reply(text, extra);
  ctx.session.flowMessageId = message.message_id;
}

function clearFlowSession(ctx: MyContext) {
  ctx.session.step = undefined;
  ctx.session.pendingBot = undefined;
  ctx.session.pendingAction = undefined;
}

async function removeReplyKeyboard(ctx: MyContext) {
  if (!ctx.chat?.id) return;

  try {
    const message = await ctx.reply(' ', {
      reply_markup: { remove_keyboard: true },
    });
    await ctx.api.deleteMessage(ctx.chat.id, message.message_id);
  } catch {
    // Best-effort cleanup only.
  }
}

// Managed Bot Created handler
messages.on('message:managed_bot_created', async (ctx) => {
  const managedBot = ctx.message.managed_bot_created.bot;
  const botId = managedBot.id;
  const botName = managedBot.first_name;
  const botUsername = managedBot.username;
  
  try {
    const token = await ctx.api.getManagedBotToken(botId);

    if (ctx.session.step === 'awaiting_update_managed_bot') {
      if (!ctx.session.activeBotId) {
        ctx.session.step = undefined;
        return ctx.reply('Please select a bot to update first using /list.', {
          reply_markup: { remove_keyboard: true },
        });
      }

      const telegramId = String(ctx.from?.id);
      const updateInput: { token: string; telegramUsername?: string } = {
        token,
      };
      if (botUsername) {
        updateInput.telegramUsername = botUsername;
      }

      const result = await updateBotToken(
        telegramId,
        ctx.session.activeBotId,
        updateInput
      );

      if (botUsername) {
        ctx.session.activeBotUsername = botUsername;
      }
      ctx.session.step = undefined;

      await editFlowMessageOrReply(
        ctx,
        `✅ ${result.message} ${formatBotUsername(ctx.session.activeBotUsername)} is ready again.\n\nBot management is available again.`,
        {
          parse_mode: 'Markdown',
          reply_markup: createManagementKeyboard(),
        }
      );
      delete ctx.session.flowMessageId;
      return;
    }
    
    // Save pending info
    ctx.session.pendingBot = {
      name: botName,
      token,
      prompt: '',
    };
    if (botUsername) {
      ctx.session.pendingBot.username = botUsername;
    }
    ctx.session.step = 'awaiting_bot_prompt';
    
    await editFlowMessageOrReply(
      ctx,
      `🎉 Great! You've successfully created *${botName}*.\n\nNow, tell me what this bot should do. For example:\n_"A bot that sends a random joke every morning"_`,
      {
        parse_mode: 'Markdown',
        reply_markup: createFlowCancelKeyboard(),
      }
    );
    await removeReplyKeyboard(ctx);
  } catch (error) {
    console.error('Error retrieving bot token:', error);
    const msg =
      error instanceof Error
        ? error.message
        : 'Error retrieving bot token from Telegram.';
    await ctx.reply(`${msg} Please try again or type /cancel.`, {
      reply_markup: { remove_keyboard: true },
    });
  }
});

// Text message handler
messages.on('message:text', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const text = ctx.message.text;

  if (
    (text === 'Cancel' || text === '❌ Cancel') &&
    (ctx.session.step === 'awaiting_managed_bot' ||
      ctx.session.step === 'awaiting_update_managed_bot' ||
      ctx.session.step === 'awaiting_bot_prompt')
  ) {
    clearFlowSession(ctx);
    await removeReplyKeyboard(ctx);
    await ctx.deleteMessage().catch(() => undefined);
    await editFlowMessageOrReply(ctx, 'Operation cancelled.');
    delete ctx.session.flowMessageId;
    return;
  }

  // Creation Flow
  if (
    ctx.session.step === 'awaiting_managed_bot' ||
    ctx.session.step === 'awaiting_update_managed_bot'
  ) {
    const action =
      ctx.session.step === 'awaiting_update_managed_bot'
        ? 'update the token'
        : 'create your bot';
    return ctx.reply(`Please use the button below to ${action}, or type /cancel to abort.`);
  }

  if (ctx.session.step === 'awaiting_bot_prompt') {
    if (ctx.session.pendingBot) {
      ctx.session.pendingBot.prompt = text;
      const botName = ctx.session.pendingBot.name;
      ctx.session.step = undefined;
      
      const progress = await ctx.reply(`Creating *${botName}*... this might take a minute ⏳`, { parse_mode: 'Markdown' });
      await ctx.replyWithChatAction('typing');

      try {
        const createInput: {
          name: string;
          prompt: string;
          token: string;
          telegramUsername?: string;
        } = {
          name: botName,
          prompt: text,
          token: ctx.session.pendingBot.token,
        };
        if (ctx.session.pendingBot.username) {
          createInput.telegramUsername = ctx.session.pendingBot.username;
        }

        const result = await createUserBot(telegramId, createInput);
        
        ctx.session.activeBotId = result.botId;
        ctx.session.activeBotName = botName;
        if (ctx.session.pendingBot.username) {
          ctx.session.activeBotUsername = ctx.session.pendingBot.username;
        }
        ctx.session.pendingBot = undefined;
        
        await ctx.api.editMessageText(
          ctx.chat.id,
          progress.message_id,
          `✅ Bot *${botName}* (${formatBotUsername(ctx.session.activeBotUsername)}) created successfully! You can now manage it here.`,
          {
            parse_mode: 'Markdown',
            reply_markup: createManagementKeyboard(),
          }
        );
      } catch (error: unknown) {
        console.error('Create error:', error);
        const msg =
          error instanceof Error ? error.message : 'Failed to create bot.';
        await ctx.api.editMessageText(
          ctx.chat.id,
          progress.message_id,
          `❌ ${msg}\n\nPlease try again or contact support if the issue persists.`
        );
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
