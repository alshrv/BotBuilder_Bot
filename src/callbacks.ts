import { Composer, InlineKeyboard } from 'grammy';
import type { BackendBot, GenerateMeta, MyContext } from './types.js';
import {
  checkCreateBotAllowed,
  createUserBot,
  deleteBot,
  deployBotVersion,
  fetchBotLogs,
  fetchBotStats,
  fetchBotStatus,
  fetchBotVersions,
  fetchUserBots,
  improveBot,
  restartBot,
  resumeBot,
  stopBot,
} from './api.js';
import {
  createBackToManagementKeyboard,
  createDeleteConfirmKeyboard,
  createFlowCancelKeyboard,
  createGenerateOptionsKeyboard,
  createEntryKeyboard,
  createManagedBotKeyboard,
  createManagementKeyboard,
  createSettingsKeyboard,
  createSuccessKeyboard,
  createTokenInvalidKeyboard,
} from './keyboards.js';
import { formatDataPayload } from './utils.js';
import {
  formatBotButtonLabel,
  formatBotListItem,
  formatBotUsername,
} from './bot-display.js';
import type { BotStatus, BotVersion } from './types.js';

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

function formatManagementMessage(
  name: string,
  username?: string | null,
  status?: BotStatus | null,
  prefix?: string,
) {
  const title = `🤖 *${name}*`;
  const usernameLine = username ? `Username: ${formatBotUsername(username)}` : null;

  return [
    prefix,
    title,
    usernameLine,
    '',
    `Status: ${formatBotStateWithEmoji(status)}`,
    `Version: ${formatCurrentVersion(status)}`,
  ].filter((line) => line !== undefined && line !== null).join('\n');
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
      : createManagementKeyboard(ctx.session.activeBotUsername),
  };
}

async function getActiveBotStatus(ctx: MyContext) {
  if (!ctx.session.activeBotId) return null;

  const telegramId = String(ctx.from?.id);
  return fetchBotStatus(telegramId, ctx.session.activeBotId);
}

async function activateBotFromCallback(ctx: MyContext, botId: string) {
  const telegramId = String(ctx.from?.id);
  const status = await fetchBotStatus(telegramId, botId);

  ctx.session.activeBotId = botId;
  ctx.session.activeBotName = status.name;
  delete ctx.session.activeBotUsername;

  return status;
}

async function createActiveBotSettingsKeyboard(ctx: MyContext) {
  const status = await getActiveBotStatus(ctx);
  return createSettingsKeyboard(
    Boolean(status?.isActive),
    isTokenInvalid(status?.status),
    isLiveLogsActive(ctx),
  );
}

function truncateLabel(text: string, maxLength = 34) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function createVersionPickerKeyboard(versions: BotVersion[]) {
  const keyboard = new InlineKeyboard();

  versions.forEach((version) => {
    const currentMarker = version.isActive ? ' 🟢' : '';
    keyboard
      .text(
        `v${version.versionNum}${currentMarker} ${truncateLabel(version.prompt)}`,
        `bot_version:${version.id}`,
      )
      .row();
  });

  return keyboard.text('⬅️ Back', 'bot_settings_back');
}

function formatVersionPickerMessage(versions: BotVersion[]) {
  if (versions.length === 0) {
    return 'No versions yet.';
  }

  const versionLines = versions
    .map((version) => {
      const marker = version.isActive ? ' 🟢 Current' : '';
      return `*v${version.versionNum}*${marker}\n_${version.prompt}_`;
    })
    .join('\n\n');

  return `📦 *Bot Versions*\n\n${versionLines}\n\nSelect a version to deploy:`;
}

function formatManagedBotMessage() {
  return [
    '✨ Create Bot',
    '',
    "Tap below and follow Telegram's prompt.",
  ].join('\n');
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

function formatGenerationProgress(name: string, frame: number) {
  const frames = [
    {
      bar: '▰▱▱▱▱▱▱▱',
      percent: '15%',
      lines: [
        '⏳ Improving prompt',
        '⏳ Generating structure',
        '⏳ Writing handlers',
        '⏳ Creating menus',
        '⏳ Deploying bot',
      ],
    },
    {
      bar: '▰▰▰▱▱▱▱▱',
      percent: '35%',
      lines: [
        '✓ Improving prompt',
        '⏳ Generating structure',
        '⏳ Writing handlers',
        '⏳ Creating menus',
        '⏳ Deploying bot',
      ],
    },
    {
      bar: '▰▰▰▰▰▱▱▱',
      percent: '60%',
      lines: [
        '✓ Improving prompt',
        '✓ Generating structure',
        '⏳ Writing handlers',
        '⏳ Creating menus',
        '⏳ Deploying bot',
      ],
    },
    {
      bar: '▰▰▰▰▰▰▰▱',
      percent: '85%',
      lines: [
        '✓ Improving prompt',
        '✓ Generating structure',
        '✓ Writing handlers',
        '✓ Creating menus',
        '⏳ Deploying bot',
      ],
    },
  ];
  const state = frames[Math.min(frame, frames.length - 1)]!;

  return [
    '🧠 Building your bot...',
    '',
    `*${name}*`,
    '',
    `${state.bar} ${state.percent}`,
    '',
    ...state.lines,
  ].join('\n');
}

function formatSuccessMessage(
  name: string,
  username?: string | null,
  status?: BotStatus | null,
) {
  return [
    '✅ Bot Generated Successfully',
    '',
    `🤖 *${name}*${username ? ` (${formatBotUsername(username)})` : ''}`,
    `Status: ${formatBotStateWithEmoji(status)}`,
    `Version: ${formatCurrentVersion(status)}`,
  ].join('\n');
}

callbacks.callbackQuery('main_menu', async (ctx) => {
  clearFlowSession(ctx);
  await ctx.answerCallbackQuery();
  await editMessageOrReply(
    ctx,
    [
      '🤖 BotBuilder',
      '',
      'Create and manage Telegram bots with AI.',
    ].join('\n'),
    {
      reply_markup: createEntryKeyboard(),
    },
  );
});

async function beginManagedBotCreation(ctx: MyContext) {
  const telegramId = String(ctx.from?.id);

  try {
    await checkCreateBotAllowed(telegramId);
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : 'You cannot create another bot right now.';
    await ctx.answerCallbackQuery({
      text: msg.slice(0, 180),
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  ctx.session.step = 'awaiting_managed_bot';

  const message = await ctx.reply(formatManagedBotMessage(), {
    reply_markup: createManagedBotKeyboard(),
  });
  ctx.session.flowMessageId = message.message_id;
}

callbacks.callbackQuery('new_bot', beginManagedBotCreation);

callbacks.callbackQuery('create_ai', beginManagedBotCreation);

callbacks.callbackQuery('flow_cancel', async (ctx) => {
  clearFlowSession(ctx);
  await ctx.answerCallbackQuery('Cancelled');
  if (ctx.session.activeBotId) {
    const overview = await renderActiveBotManagement(ctx, 'Operation cancelled.');
    await editMessageOrReply(ctx, overview.text, {
      parse_mode: 'Markdown',
      reply_markup: overview.keyboard,
    });
  } else {
    await editMessageOrReply(
      ctx,
      [
        '🤖 BotBuilder',
        '',
        'Create and manage Telegram bots with AI.',
      ].join('\n'),
      {
        reply_markup: createEntryKeyboard(),
      },
    );
  }
  delete ctx.session.flowMessageId;
});

callbacks.callbackQuery(
  /^generate_meta_toggle:(description|about|commands)$/,
  async (ctx) => {
    const field = ctx.match[1] as 'description' | 'about' | 'commands';
    const pendingBot = ctx.session.pendingBot;

    if (
      ctx.session.step !== 'awaiting_bot_generate_options' ||
      !pendingBot?.generateMeta
    ) {
      return ctx.answerCallbackQuery('No generation in progress.');
    }

    pendingBot.generateMeta[field] = !pendingBot.generateMeta[field];
    await ctx.answerCallbackQuery(
      pendingBot.generateMeta[field] ? 'Enabled' : 'Disabled',
    );
    await ctx.editMessageReplyMarkup({
      reply_markup: createGenerateOptionsKeyboard(pendingBot.generateMeta),
    });
  },
);

callbacks.callbackQuery('edit_bot_prompt', async (ctx) => {
  const pendingBot = ctx.session.pendingBot;
  if (!pendingBot) {
    return ctx.answerCallbackQuery('No generation in progress.');
  }

  await ctx.answerCallbackQuery();
  ctx.session.step = 'awaiting_bot_prompt';
  await editMessageOrReply(ctx, formatPromptInputMessage(pendingBot.name), {
    reply_markup: createFlowCancelKeyboard(),
  });
});

callbacks.callbackQuery('generate_bot_confirm', async (ctx) => {
  const pendingBot = ctx.session.pendingBot;
  if (
    ctx.session.step !== 'awaiting_bot_generate_options' ||
    !pendingBot?.prompt
  ) {
    return ctx.answerCallbackQuery('No bot description found.');
  }

  await ctx.answerCallbackQuery();
  await ctx.replyWithChatAction('typing');
  await editMessageOrReply(ctx, formatGenerationProgress(pendingBot.name, 0), {
    parse_mode: 'Markdown',
  });

  let progressFrame = 1;
  const progressTimer = setInterval(() => {
    void ctx
      .editMessageText(formatGenerationProgress(pendingBot.name, progressFrame), {
        parse_mode: 'Markdown',
      })
      .catch(() => undefined);
    progressFrame = Math.min(progressFrame + 1, 3);
  }, 2500);

  const telegramId = String(ctx.from?.id);
  try {
    const createInput: {
      name: string;
      prompt: string;
      token: string;
      telegramUsername?: string;
      generateMeta?: GenerateMeta;
    } = {
      name: pendingBot.name,
      prompt: pendingBot.prompt,
      token: pendingBot.token,
    };
    if (pendingBot.generateMeta) {
      createInput.generateMeta = pendingBot.generateMeta;
    }
    if (pendingBot.username) {
      createInput.telegramUsername = pendingBot.username;
    }

    const result = await createUserBot(telegramId, createInput);
    clearInterval(progressTimer);

    ctx.session.activeBotId = result.botId;
    ctx.session.activeBotName = pendingBot.name;
    if (pendingBot.username) {
      ctx.session.activeBotUsername = pendingBot.username;
    }

    const botName = pendingBot.name;
    const botUsername = pendingBot.username;
    clearFlowSession(ctx);

    if (botUsername) {
      ctx.session.activeBotUsername = botUsername;
    }

    const status = await getActiveBotStatus(ctx).catch(() => null);

    await editMessageOrReply(
      ctx,
      formatSuccessMessage(
        ctx.session.activeBotName || botName,
        ctx.session.activeBotUsername,
        status,
      ),
      {
        parse_mode: 'Markdown',
        reply_markup: createSuccessKeyboard(ctx.session.activeBotUsername),
      },
    );
    delete ctx.session.flowMessageId;
  } catch (error: unknown) {
    clearInterval(progressTimer);
    console.error('Create error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create bot.';
    await editMessageOrReply(
      ctx,
      `❌ ${msg}\n\nPlease try again or contact support if the issue persists.`,
      {
        reply_markup: createFlowCancelKeyboard(),
      },
    );
  }
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
  if (ctx.session.activeBotId) {
    keyboard.text('🔙 Back', 'bot_settings_back');
  }

  const botList = bots.map(formatBotListItem).join('\n');
  await ctx.editMessageText(
    `🤖 *Your Bots*\n\n${botList}\n\nSelect a bot to manage:`,
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
      await ctx.reply(finalContent, {
        parse_mode: 'Markdown',
        reply_markup: createBackToManagementKeyboard(),
      });
    } else {
      await ctx.reply('Action completed.', {
        reply_markup: createBackToManagementKeyboard(),
      });
    }
  } catch (error) {
    console.error('Stats error:', error);
    await ctx.reply('Error fetching stats.', {
      reply_markup: createBackToManagementKeyboard(),
    });
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

    if (action === 'versions') {
      const versions = await fetchBotVersions(telegramId, activeBotId);
      await editMessageOrReply(ctx, formatVersionPickerMessage(versions), {
        parse_mode: 'Markdown',
        reply_markup: createVersionPickerKeyboard(versions),
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
        : {
            type: 'get_stats',
            content: 'Here are the latest statistics.',
            data: await fetchBotStats(telegramId, activeBotId),
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
    await ctx.reply('I could not load that bot detail right now.', {
      reply_markup: createBackToManagementKeyboard(),
    });
  }
});

callbacks.callbackQuery(/^bot_version:(.+)$/, async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  const versionId = ctx.match[1]!;
  const activeBotId = ctx.session.activeBotId;
  const telegramId = String(ctx.from?.id);

  await ctx.answerCallbackQuery();
  await editMessageOrReply(ctx, 'Changing version... ⏳');

  try {
    const result = await deployBotVersion(telegramId, activeBotId, versionId);
    const overview = await renderActiveBotManagement(
      ctx,
      result?.message || 'Version changed.',
    );
    await editMessageOrReply(ctx, overview.text, {
      parse_mode: 'Markdown',
      reply_markup: overview.keyboard,
    });
  } catch (error) {
    console.error('Version change failed:', error);
    await editMessageOrReply(ctx, 'I could not change the version right now.', {
      reply_markup: createBackToManagementKeyboard(),
    });
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
      `⚙️ *${ctx.session.activeBotName ?? 'Bot'} Settings*\n\n*Live logs:* On`,
      {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      },
    );
  } catch (error) {
    console.error('Live logs start failed:', error);
    await ctx.reply('I could not start live logs right now.', {
      reply_markup: createBackToManagementKeyboard(),
    });
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
    `⚙️ *${ctx.session.activeBotName ?? 'Bot'} Settings*\n\n*Live logs:* Off`,
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
    `⚙️ *${ctx.session.activeBotName ?? 'Bot'} Settings*\n\n*Live logs:* ${isLiveLogsActive(ctx) ? 'On' : 'Off'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    },
  );
});

callbacks.callbackQuery('bot_improve', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  await ctx.answerCallbackQuery();
  ctx.session.step = 'awaiting_improve_prompt';
  const message = await ctx.reply(
    [
      `🧠 Improve ${ctx.session.activeBotName ?? 'this bot'}`,
      '',
      'Describe what you want to improve.',
      '',
      'Examples:',
      '• Add payment system',
      '• Add multilingual support',
      '• Make UI cleaner',
      '• Add admin analytics',
    ].join('\n'),
    {
      reply_markup: createFlowCancelKeyboard(),
    },
  );
  ctx.session.flowMessageId = message.message_id;
});

callbacks.callbackQuery('bot_update_token', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');

  await ctx.answerCallbackQuery();
  ctx.session.step = 'awaiting_update_managed_bot';

  const message = await ctx.reply(
    "Click the button below and choose the replacement bot from Telegram's prompt.",
    {
      reply_markup: createManagedBotKeyboard('🔑 Update Token'),
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

callbacks.callbackQuery(/^crash_logs:(.+)$/, async (ctx) => {
  const botId = ctx.match[1]!;
  const telegramId = String(ctx.from?.id);

  await ctx.answerCallbackQuery();

  try {
    await activateBotFromCallback(ctx, botId);
    const data = await fetchBotLogs(telegramId, botId);
    const finalContent = formatDataPayload(
      'get_logs',
      'Here are the latest logs.',
      data,
    );

    if (finalContent.length > 4000) {
      await sendFormattedReply(ctx, finalContent);
      await ctx.reply('Navigation:', {
        reply_markup: createBackToManagementKeyboard(),
      });
      return;
    }

    await ctx.reply(finalContent || 'No logs yet.', {
      parse_mode: 'Markdown',
      reply_markup: createBackToManagementKeyboard(),
    });
  } catch (error) {
    console.error('Crash logs action failed:', error);
    await ctx.reply('I could not load the crash logs right now.', {
      reply_markup: createBackToManagementKeyboard(),
    });
  }
});

callbacks.callbackQuery(/^crash_fix:(.+)$/, async (ctx) => {
  const botId = ctx.match[1]!;
  const telegramId = String(ctx.from?.id);

  await ctx.answerCallbackQuery();
  await ctx.replyWithChatAction('typing');

  try {
    await activateBotFromCallback(ctx, botId);
    const result = await improveBot(telegramId, botId, {
      prompt: 'Fix the latest crash using the latest error logs.',
    });
    const finalContent = formatDataPayload('improve_bot', result.message, result);
    if (finalContent.length > 4000) {
      await sendFormattedReply(ctx, finalContent);
      await ctx.reply('Navigation:', {
        reply_markup: createBackToManagementKeyboard(),
      });
      return;
    }

    await ctx.reply(finalContent || 'I started working on a fix.', {
      parse_mode: 'Markdown',
      reply_markup: createBackToManagementKeyboard(),
    });
  } catch (error) {
    console.error('Crash fix action failed:', error);
    await ctx.reply('I could not start the AI fix right now.', {
      reply_markup: createBackToManagementKeyboard(),
    });
  }
});

callbacks.callbackQuery(/^crash_restart:(.+)$/, async (ctx) => {
  const botId = ctx.match[1]!;
  const telegramId = String(ctx.from?.id);

  await ctx.answerCallbackQuery();

  try {
    await activateBotFromCallback(ctx, botId);
    const result = await restartBot(telegramId, botId);
    const overview = await renderActiveBotManagement(
      ctx,
      result?.message || 'Bot restart requested.',
    );
    await ctx.reply(overview.text, {
      parse_mode: 'Markdown',
      reply_markup: overview.keyboard,
    });
  } catch (error) {
    console.error('Crash restart action failed:', error);
    await ctx.reply('I could not restart the bot right now.', {
      reply_markup: createBackToManagementKeyboard(),
    });
  }
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
      await editMessageOrReply(ctx, result?.message || 'Bot deleted.');
      return;
    }

    const replyMarkup = await createActiveBotSettingsKeyboard(ctx);
    await editMessageOrReply(
      ctx,
      `${result?.message || `Bot ${action} completed.`}\n\n⚙️ *${ctx.session.activeBotName ?? 'Bot'} Settings*\n\n*Live logs:* ${isLiveLogsActive(ctx) ? 'On' : 'Off'}`,
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
      `I could not ${action} the bot right now.\n\n⚙️ *${ctx.session.activeBotName ?? 'Bot'} Settings*\n\n*Live logs:* ${isLiveLogsActive(ctx) ? 'On' : 'Off'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      },
    );
  }
});
