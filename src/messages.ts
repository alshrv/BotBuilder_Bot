import { Composer, InlineKeyboard } from 'grammy';
import type { BackendBot, BotStatus, GenerateMeta, MyContext } from './types.js';
import {
  checkCreateBotAllowed,
  fetchBotStats,
  fetchBotStatus,
  fetchUserBots,
  improveBot,
  updateBotToken,
} from './api.js';
import {
  formatBotButtonLabel,
  formatBotListItem,
  formatBotUsername,
} from './bot-display.js';
import {
  createCreateMethodKeyboard,
  createFlowCancelKeyboard,
  createGenerateOptionsKeyboard,
  createMainMenuKeyboard,
  createManagementKeyboard,
  createSettingsKeyboard,
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

function formatBotStateWithEmoji(status?: BotStatus | null) {
  const state = formatBotState(status);
  if (state === 'Running') return '🟢 Running';
  if (state === 'Starting') return '🟡 Starting';
  if (state === 'Token invalid') return '🔑 Token invalid';
  if (state === 'Errored') return '🔴 Errored';
  if (state === 'Stopped') return '🔴 Stopped';
  return '⚪ Unknown';
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
    `Status: ${formatBotStateWithEmoji(status)}`,
    `Version: ${formatCurrentVersion(status)}`,
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
    commands: false,
  };
}

function formatPromptInputMessage(botName: string) {
  return [
    '📝 Describe your bot',
    '',
    `Bot Name: ${botName}`,
    '',
    'Examples:',
    '• Restaurant ordering bot',
    '• Quiz bot for students',
    '• Crypto alerts bot',
    '• Booking assistant',
    '',
    'Send your idea below.',
  ].join('\n');
}

function formatGenerateOptionsMessage(name: string, description: string) {
  return [
    '⚙️ Generation Options',
    '',
    `Bot Name: ${name}`,
    '',
    'Selected Features:',
    'Use the toggles below.',
    '',
    'Prompt:',
    '',
    description,
  ].join('\n');
}

async function showCreateMethod(ctx: MyContext) {
  const message = await ctx.reply(
    [
      '✨ Create Bot',
      '',
      'How would you like to start?',
    ].join('\n'),
    {
      reply_markup: createCreateMethodKeyboard(),
    },
  );
  ctx.session.flowMessageId = message.message_id;
}

async function showBotList(ctx: MyContext, bots: BackendBot[]) {
  if (bots.length === 0) {
    await ctx.reply("You haven't created any bots yet. Tap ➕ Create to start.", {
      reply_markup: createMainMenuKeyboard(),
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  bots.forEach((bot) => {
    keyboard.text(formatBotButtonLabel(bot), `select_bot:${bot.id}`).row();
  });
  if (ctx.session.activeBotId) {
    keyboard.text('🔙 Back', 'bot_settings_back');
  }

  await ctx.reply(
    `🤖 *Your Bots*\n\n${bots.map(formatBotListItem).join('\n')}\n\nSelect a bot to manage:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    },
  );
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
        reply_markup: createManagementKeyboard(ctx.session.activeBotUsername),
      },
    );
    delete ctx.session.flowMessageId;
    return;
  }

  await ctx.reply('Operation cancelled.', {
    reply_markup: createMainMenuKeyboard(),
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
          reply_markup: createManagementKeyboard(ctx.session.activeBotUsername),
        }
      );
      delete ctx.session.flowMessageId;
      return;
    }

    try {
      await checkCreateBotAllowed(String(ctx.from?.id));
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'You cannot create another bot right now.';
      clearFlowSession(ctx);
      await removeReplyKeyboard(ctx);
      await editFlowMessageOrReply(ctx, `❌ ${msg}`);
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
      formatPromptInputMessage(botName),
      {
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
    text === '❌ Cancel' ||
    text === '🔙 Back'
  ) {
    await cancelFlow(ctx);
    return;
  }

  if (!ctx.session.step && text === '➕ Create') {
    await showCreateMethod(ctx);
    return;
  }

  if (!ctx.session.step && text === '🤖 Bots') {
    try {
      await showBotList(ctx, await fetchUserBots(telegramId));
    } catch (error) {
      console.error('Error fetching bots:', error);
      await ctx.reply(
        'I could not reach the BotBuilder backend. Please try again in a moment.',
      );
    }
    return;
  }

  if (!ctx.session.step && text === '📊 Analytics') {
    if (!ctx.session.activeBotId) {
      await ctx.reply('Select a bot first from 🤖 Bots.');
      return;
    }

    try {
      const stats = await fetchBotStats(telegramId, ctx.session.activeBotId);
      await ctx.reply(
        formatDataPayload(
          'get_stats',
          `📊 *${ctx.session.activeBotName ?? 'Bot'} Analytics*`,
          stats,
        ),
        {
          parse_mode: 'Markdown',
          reply_markup: createManagementKeyboard(ctx.session.activeBotUsername),
        },
      );
    } catch (error) {
      console.error('Stats error:', error);
      await ctx.reply('I could not load analytics right now.');
    }
    return;
  }

  if (!ctx.session.step && text === '⚙️ Settings') {
    if (!ctx.session.activeBotId) {
      await ctx.reply('Select a bot first from 🤖 Bots.');
      return;
    }

    try {
      const status = await fetchBotStatus(telegramId, ctx.session.activeBotId);
      await ctx.reply('⚙️ Bot Settings', {
        reply_markup: createSettingsKeyboard(
          Boolean(status?.isActive),
          status?.status === 'token_invalid',
          false,
        ),
      });
    } catch (error) {
      console.error('Settings error:', error);
      await ctx.reply('I could not load settings right now.');
    }
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
          reply_markup: createManagementKeyboard(ctx.session.activeBotUsername),
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
      await ctx.deleteMessage().catch(() => undefined);

      await editFlowMessageOrReply(ctx, formatGenerateOptionsMessage(
        ctx.session.pendingBot.name,
        text,
      ), {
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
