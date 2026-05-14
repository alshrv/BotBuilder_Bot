import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BackendBot, MyContext } from './types.js';
import {
  chatWithUserBot,
  deleteBot,
  fetchBotLogs,
  fetchBotStats,
  fetchBotStatus,
  fetchBotVersions,
  fetchUserBots,
  restartBot,
  resumeBot,
  stopBot,
} from './api.js';
import {
  createBackToManagementKeyboard,
  createDeleteConfirmKeyboard,
  createManagementKeyboard,
  createSettingsKeyboard,
  createTokenInvalidKeyboard,
} from './keyboards.js';
import { formatDataPayload } from './utils.js';
import {
  formatBotButtonLabel,
  formatBotListItem,
  formatBotUsername,
} from './bot-display.js';
import type { BotStatus } from './types.js';

export const callbacks = new Composer<MyContext>();
const logWatchers = new Map<string, ReturnType<typeof setInterval>>();

function getWatchKey(chatId: number | string, botId: string) {
  return `${chatId}:${botId}`;
}

function stopLogWatcher(chatId: number | string, botId: string) {
  const key = getWatchKey(chatId, botId);
  const watcher = logWatchers.get(key);
  if (!watcher) return false;

  clearInterval(watcher);
  logWatchers.delete(key);
  return true;
}

async function sendFormattedReply(ctx: MyContext, text: string) {
  if (text.length > 4000) {
    for (let i = 0; i < text.length; i += 4000) {
      await ctx.reply(text.substring(i, i + 4000), { parse_mode: 'Markdown' });
    }
    return;
  }

  await ctx.reply(text || 'No data yet.', { parse_mode: 'Markdown' });
}

async function editMessageOrReply(ctx: MyContext, text: string, extra = {}) {
  try {
    await ctx.editMessageText(text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}

function isLiveLogsActive(ctx: MyContext) {
  return Boolean(
    ctx.chat?.id &&
      ctx.session.activeBotId &&
      logWatchers.has(getWatchKey(ctx.chat.id, ctx.session.activeBotId)),
  );
}

function clearFlowSession(ctx: MyContext) {
  ctx.session.step = undefined;
  ctx.session.pendingBot = undefined;
  ctx.session.pendingAction = undefined;
}

function isTokenInvalid(status?: string | null) {
  return status === 'token_invalid';
}

function formatBotState(status?: BotStatus | null) {
  if (!status) return 'Unknown';
  if (isTokenInvalid(status.status)) return 'Token invalid';
  if (status.runtime?.overall === 'running' || status.isActive) return 'Running';
  if (status.runtime?.overall === 'launching') return 'Starting';
  if (status.runtime?.overall === 'errored') return 'Errored';
  return 'Stopped';
}

function formatCurrentVersion(status?: BotStatus | null) {
  const version = status?.currentVersion ?? status?.latestVersion;
  return version ? `v${version.versionNum}` : 'None';
}

function formatManagementMessage(
  name: string,
  username?: string | null,
  status?: BotStatus | null,
  prefix?: string,
) {
  const header =
    prefix ??
    `Now managing *${name}* (${formatBotUsername(username)}).`;
  return [
    header,
    '',
    `*Bot state:* ${formatBotState(status)}`,
    `*Current version:* ${formatCurrentVersion(status)}`,
  ].join('\n');
}

async function renderActiveBotManagement(ctx: MyContext, prefix?: string) {
  const status = await getActiveBotStatus(ctx).catch(() => null);
  const name = status?.name ?? ctx.session.activeBotName ?? 'this bot';
  return {
    text: formatManagementMessage(
      name,
      ctx.session.activeBotUsername,
      status,
      prefix,
    ),
    keyboard: isTokenInvalid(status?.status)
      ? createTokenInvalidKeyboard()
      : createManagementKeyboard(),
  };
}

async function getActiveBotStatus(ctx: MyContext) {
  if (!ctx.session.activeBotId) return null;

  const telegramId = String(ctx.from?.id);
  return fetchBotStatus(telegramId, ctx.session.activeBotId);
}

async function createActiveBotSettingsKeyboard(ctx: MyContext) {
  const status = await getActiveBotStatus(ctx);
  return createSettingsKeyboard(
    Boolean(status?.isActive),
    isTokenInvalid(status?.status),
    isLiveLogsActive(ctx),
  );
}

callbacks.callbackQuery('new_bot', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = 'awaiting_managed_bot';
  const keyboard = new Keyboard()
    .requestManagedBot('➕ Create Managed Bot', 1)
    .row()
    .text('❌ Cancel')
    .resized()
    .oneTime();

  const message = await ctx.reply("To create a new bot, click the button below and follow Telegram's prompt.", {
    reply_markup: keyboard,
  });
  ctx.session.flowMessageId = message.message_id;
});

callbacks.callbackQuery('flow_cancel', async (ctx) => {
  clearFlowSession(ctx);
  await ctx.answerCallbackQuery('Cancelled');
  await editMessageOrReply(ctx, 'Operation cancelled.');
  delete ctx.session.flowMessageId;
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
    keyboard.text(formatBotButtonLabel(b), `select_bot:${b.id}`).row();
  });

  const botList = bots.map(formatBotListItem).join('\n');
  await ctx.editMessageText(
    `*Your bots*\n${botList}\n\nSelect a bot to manage:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );
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
      if (selectedBot.telegramUsername) {
        ctx.session.activeBotUsername = selectedBot.telegramUsername;
      } else {
        delete ctx.session.activeBotUsername;
      }
      ctx.session.chatHistory = []; // Reset history for new bot session
      await ctx.answerCallbackQuery(`Selected ${selectedBot.name}`);
      const overview = await renderActiveBotManagement(ctx);
      await editMessageOrReply(
        ctx,
        overview.text,
        {
          parse_mode: 'Markdown',
          reply_markup: overview.keyboard,
        }
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
    const data = await fetchBotStats(telegramId, activeBotId);
    const finalContent = formatDataPayload(
      'get_stats',
      'Here are the latest statistics for your bot.',
      data
    );
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

callbacks.callbackQuery(/^bot_action:(logs|stats|status|versions)$/, async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  const action = ctx.match[1];
  const activeBotId = ctx.session.activeBotId;
  const telegramId = String(ctx.from?.id);

  await ctx.answerCallbackQuery();
  await ctx.replyWithChatAction('typing');

  try {
    if (action === 'status') {
      const overview = await renderActiveBotManagement(ctx);
      await editMessageOrReply(ctx, overview.text, {
        parse_mode: 'Markdown',
        reply_markup: overview.keyboard,
      });
      return;
    }

    const result =
      action === 'logs'
        ? {
            type: 'get_logs',
            content: 'Here are the latest logs.',
            data: await fetchBotLogs(telegramId, activeBotId),
          }
        : action === 'stats'
          ? {
              type: 'get_stats',
              content: 'Here are the latest statistics.',
              data: await fetchBotStats(telegramId, activeBotId),
            }
          : {
                type: 'get_versions',
                content: 'Here is the version history of your bot.',
                data: await fetchBotVersions(telegramId, activeBotId),
              };

    const finalContent = formatDataPayload(
      result.type,
      result.content,
      result.data
    );

    if (finalContent.length > 4000) {
      await sendFormattedReply(ctx, finalContent);
      await ctx.reply('Navigation:', {
        reply_markup: createBackToManagementKeyboard(),
      });
      return;
    }

    await editMessageOrReply(ctx, finalContent || 'No data yet.', {
      parse_mode: 'Markdown',
      reply_markup: createBackToManagementKeyboard(),
    });
  } catch (error) {
    console.error(`Bot action ${action} failed:`, error);
    await ctx.reply('I could not load that bot detail right now.');
  }
});

callbacks.callbackQuery('bot_logs_watch', async (ctx) => {
  if (!ctx.session.activeBotId || !ctx.chat?.id) {
    return ctx.answerCallbackQuery('No active bot.');
  }

  const activeBotId = ctx.session.activeBotId;
  const telegramId = String(ctx.from?.id);
  const chatId = ctx.chat.id;
  stopLogWatcher(chatId, activeBotId);

  await ctx.answerCallbackQuery();

  try {
    const initialLogs = await fetchBotLogs(telegramId, activeBotId);
    const seen = new Set<string>(initialLogs.lines || []);

    const watcher = setInterval(async () => {
      try {
        const latestLogs = await fetchBotLogs(telegramId, activeBotId);
        const newLines = (latestLogs.lines || []).filter((line: string) => {
          if (seen.has(line)) return false;
          seen.add(line);
          return true;
        });

        if (newLines.length === 0) return;

        const formatted = formatDataPayload(
          'get_logs',
          'New log entries:',
          {
            ...latestLogs,
            lines: newLines.slice(-20),
          }
        );

        await ctx.api.sendMessage(chatId, formatted, {
          parse_mode: 'Markdown',
        });
      } catch (error) {
        console.error('Live logs watcher failed:', error);
      }
    }, 5000);

    logWatchers.set(getWatchKey(chatId, activeBotId), watcher);
    const replyMarkup = await createActiveBotSettingsKeyboard(ctx);
    await editMessageOrReply(
      ctx,
      `Bot settings:\n\n*Live logs:* On`,
      {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      },
    );
  } catch (error) {
    console.error('Live logs start failed:', error);
    await ctx.reply('I could not start live logs right now.');
  }
});

callbacks.callbackQuery('bot_logs_stop', async (ctx) => {
  if (!ctx.session.activeBotId || !ctx.chat?.id) {
    return ctx.answerCallbackQuery('No active bot.');
  }

  const stopped = stopLogWatcher(ctx.chat.id, ctx.session.activeBotId);
  await ctx.answerCallbackQuery(stopped ? 'Live logs stopped.' : 'No live log watcher.');
  const replyMarkup = await createActiveBotSettingsKeyboard(ctx);
  await editMessageOrReply(
    ctx,
    `Bot settings:\n\n*Live logs:* Off`,
    {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    },
  );
});

callbacks.callbackQuery('bot_settings', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  await ctx.answerCallbackQuery();
  const replyMarkup = await createActiveBotSettingsKeyboard(ctx);
  await editMessageOrReply(
    ctx,
    `Bot settings:\n\n*Live logs:* ${isLiveLogsActive(ctx) ? 'On' : 'Off'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    },
  );
});

callbacks.callbackQuery('bot_update_token', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  await ctx.answerCallbackQuery();
  ctx.session.step = 'awaiting_update_managed_bot';
  const keyboard = new Keyboard()
    .requestManagedBot('🔑 Update Token', 1)
    .row()
    .text('❌ Cancel')
    .resized()
    .oneTime();

  const message = await ctx.reply(
    "Click the button below and choose the replacement bot from Telegram's prompt.",
    {
      reply_markup: keyboard,
    }
  );
  ctx.session.flowMessageId = message.message_id;
});

callbacks.callbackQuery('bot_delete_confirm', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  await ctx.answerCallbackQuery();
  await editMessageOrReply(
    ctx,
    `Delete *${ctx.session.activeBotName || 'this bot'}*?\n\nThis stops the bot and removes its versions and logs.`,
    {
      parse_mode: 'Markdown',
      reply_markup: createDeleteConfirmKeyboard(),
    }
  );
});

callbacks.callbackQuery('bot_settings_back', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  await ctx.answerCallbackQuery();
  const overview = await renderActiveBotManagement(ctx);
  await editMessageOrReply(
    ctx,
    overview.text,
    {
      parse_mode: 'Markdown',
      reply_markup: overview.keyboard,
    }
  );
});

callbacks.callbackQuery(/^bot_control:(stop|restart|resume|delete)$/, async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  const action = ctx.match[1];
  const activeBotId = ctx.session.activeBotId;
  const telegramId = String(ctx.from?.id);

  await ctx.answerCallbackQuery();
  await editMessageOrReply(ctx, `Processing ${action}...`);

  try {
    const result =
      action === 'stop'
        ? await stopBot(telegramId, activeBotId)
        : action === 'restart'
          ? await restartBot(telegramId, activeBotId)
          : action === 'resume'
            ? await resumeBot(telegramId, activeBotId)
            : await deleteBot(telegramId, activeBotId);

    if (action === 'delete') {
      if (ctx.chat?.id) stopLogWatcher(ctx.chat.id, activeBotId);
      delete ctx.session.activeBotId;
      delete ctx.session.activeBotName;
      delete ctx.session.activeBotUsername;
      ctx.session.chatHistory = [];
      await editMessageOrReply(ctx, result?.message || 'Bot deleted.');
      return;
    }

    const replyMarkup = await createActiveBotSettingsKeyboard(ctx);
    await editMessageOrReply(
      ctx,
      `${result?.message || `Bot ${action} completed.`}\n\nBot settings:\n\n*Live logs:* ${isLiveLogsActive(ctx) ? 'On' : 'Off'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      },
    );
  } catch (error) {
    console.error(`Bot ${action} failed:`, error);
    const replyMarkup = await createActiveBotSettingsKeyboard(ctx);
    await editMessageOrReply(
      ctx,
      `I could not ${action} the bot right now.\n\nBot settings:\n\n*Live logs:* ${isLiveLogsActive(ctx) ? 'On' : 'Off'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      },
    );
  }
});
