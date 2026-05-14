import { Composer } from 'grammy';
import type { BotStatus, GenerateMeta, MyContext } from './types.js';
import { fetchBotStatus, improveBot, updateBotToken } from './api.js';
import { formatBotUsername } from './bot-display.js';
import {
  createFlowCancelKeyboard,
  createGenerateOptionsKeyboard,
  createManagementKeyboard,
} from './keyboards.js';
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
}

function formatBotState(status?: BotStatus | null) {
  if (!status) return 'Unknown';
  if (status.status === 'token_invalid') return 'Token invalid';
  if (status.runtime?.overall === 'running' || status.isActive) return 'Running';
  if (status.runtime?.overall === 'launching') return 'Starting';
  if (status.runtime?.overall === 'errored') return 'Errored';
  return 'Stopped';
}

function formatCurrentVersion(status?: BotStatus | null) {
  const version = status?.currentVersion ?? status?.latestVersion;
  return version ? `v${version.versionNum}` : 'None';
}

async function formatManagementMessage(
  ctx: MyContext,
  prefix: string,
) {
  const status = ctx.session.activeBotId
    ? await fetchBotStatus(String(ctx.from?.id), ctx.session.activeBotId).catch(
        () => null,
      )
    : null;

  return [
    prefix,
    '',
    `*Bot state:* ${formatBotState(status)}`,
    `*Current version:* ${formatCurrentVersion(status)}`,
  ].join('\n');
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

function defaultGenerateMeta(): GenerateMeta {
  return {
    description: true,
    about: true,
    commands: true,
  };
}

function formatGenerateOptionsMessage(description: string) {
  return [
    '✏️ *Describe your bot*',
    '',
    description,
    '',
    '⚙️ *Also generate with AI:*',
  ].join('\n');
}

async function cancelFlow(ctx: MyContext) {
  clearFlowSession(ctx);

  if (ctx.chat?.id && ctx.session.flowMessageId) {
    await ctx.api
      .deleteMessage(ctx.chat.id, ctx.session.flowMessageId)
      .catch(() => undefined);
  }

  await ctx.deleteMessage().catch(() => undefined);
  if (ctx.session.activeBotId) {
    await removeReplyKeyboard(ctx);
    await ctx.reply(
      await formatManagementMessage(ctx, 'Operation cancelled.'),
      {
        parse_mode: 'Markdown',
        reply_markup: createManagementKeyboard(),
      },
    );
    delete ctx.session.flowMessageId;
    return;
  }

  await ctx.reply('Operation cancelled.', {
    reply_markup: { remove_keyboard: true },
  });
  delete ctx.session.flowMessageId;
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
        await formatManagementMessage(
          ctx,
          `✅ ${result.message} ${formatBotUsername(ctx.session.activeBotUsername)} is ready again.`,
        ),
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
      generateMeta: defaultGenerateMeta(),
    };
    if (botUsername) {
      ctx.session.pendingBot.username = botUsername;
    }
    ctx.session.step = 'awaiting_bot_prompt';
    
    await editFlowMessageOrReply(
      ctx,
      `🎉 Great! You've successfully created *${botName}*.\n\n✏️ *Describe your bot*\n\nFor example:\n_"A bot that sends a random joke every morning"_`,
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
    text === 'Cancel' ||
    text === '❌ Cancel'
  ) {
    await cancelFlow(ctx);
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

  if (ctx.session.step === 'awaiting_improve_prompt') {
    if (!ctx.session.activeBotId) {
      clearFlowSession(ctx);
      return ctx.reply('Please select a bot to improve first using /list.');
    }

    ctx.session.step = undefined;
    const activeBotId = ctx.session.activeBotId;
    const progress = await ctx.reply('Improving bot... this might take a minute ⏳');
    await ctx.replyWithChatAction('typing');

    try {
      const result = await improveBot(telegramId, activeBotId, { prompt: text });
      await ctx.api.editMessageText(
        ctx.chat.id,
        progress.message_id,
        formatDataPayload('improve_bot', result.message, result),
        {
          parse_mode: 'Markdown',
          reply_markup: createManagementKeyboard(),
        },
      );
    } catch (error: unknown) {
      console.error('Improve error:', error);
      const msg =
        error instanceof Error ? error.message : 'Failed to improve bot.';
      await ctx.api.editMessageText(
        ctx.chat.id,
        progress.message_id,
        `❌ ${msg}\n\nPlease try again or contact support if the issue persists.`,
      );
    }
    return;
  }

  if (ctx.session.step === 'awaiting_bot_prompt') {
    if (ctx.session.pendingBot) {
      ctx.session.pendingBot.prompt = text;
      ctx.session.pendingBot.generateMeta ??= defaultGenerateMeta();
      ctx.session.step = 'awaiting_bot_generate_options';

      await editFlowMessageOrReply(ctx, formatGenerateOptionsMessage(text), {
        parse_mode: 'Markdown',
        reply_markup: createGenerateOptionsKeyboard(
          ctx.session.pendingBot.generateMeta,
        ),
      });
    }
    return;
  }

  if (ctx.session.step === 'awaiting_bot_generate_options') {
    return ctx.reply('Use the buttons above to choose AI fields, or type /cancel to abort.');
  }

  if (!ctx.session.activeBotId) {
    return ctx.reply('Please select a bot to manage first using /list or create a new one with /new.');
  }

  return ctx.reply('Use the dashboard buttons to manage this bot.');
});
