import { Composer } from 'grammy';
import type { BotStatus, GenerateMeta, MyContext } from './types.js';
import {
  checkCreateBotAllowed,
  fetchBotStatus,
  improveBot,
  updateBotToken,
} from './api.js';
import { formatBotUsername } from './bot-display.js';
import {
  DOCUMENT_READ_FAILED_MESSAGE,
  DOCUMENT_TOO_LARGE_MESSAGE,
  formatDocumentPreview,
  getDocumentUploadError,
  readDocumentContext,
  UNSUPPORTED_DOCUMENT_MESSAGE,
} from './document-context.js';
import {
  createFlowCancelKeyboard,
  createGenerateOptionsKeyboard,
  createHomeKeyboard,
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
  delete ctx.session.documentContext;
  delete ctx.session.createSourceMessageId;
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
    '✏️ Bot description',
    '',
    description,
    '',
    '⚙️ Also generate with AI:',
  ].join('\n');
}

async function createHomeKeyboardForUser(telegramId: string) {
  try {
    await checkCreateBotAllowed(telegramId);
    return createHomeKeyboard();
  } catch {
    return createHomeKeyboard({ showCreateBot: false });
  }
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

function isDocumentContextStep(ctx: MyContext) {
  return (
    ctx.session.step === 'awaiting_bot_prompt' ||
    ctx.session.step === 'awaiting_improve_prompt'
  );
}

async function handleDocumentContext(ctx: MyContext) {
  const uploadError = getDocumentUploadError(ctx);
  if (uploadError) {
    const message =
      uploadError.reason === 'too_large'
        ? DOCUMENT_TOO_LARGE_MESSAGE
        : UNSUPPORTED_DOCUMENT_MESSAGE;
    await ctx.reply(message, {
      reply_markup: createFlowCancelKeyboard(),
    });
    return;
  }

  await ctx.reply('⏳ Reading your document...');
  const result = await readDocumentContext(ctx);

  if (!result.ok) {
    const message =
      result.reason === 'too_large'
        ? DOCUMENT_TOO_LARGE_MESSAGE
        : result.reason === 'unsupported'
          ? UNSUPPORTED_DOCUMENT_MESSAGE
          : DOCUMENT_READ_FAILED_MESSAGE;
    await ctx.reply(message, {
      reply_markup: createFlowCancelKeyboard(),
    });
    return;
  }

  ctx.session.documentContext = result.text;

  const nextInstruction =
    ctx.session.step === 'awaiting_improve_prompt'
      ? 'Now tell me what to improve with this information:'
      : 'Now describe what your bot should do with this information:';

  await ctx.reply(formatDocumentPreview(result.text, nextInstruction), {
    reply_markup: createFlowCancelKeyboard(),
  });
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
    delete ctx.session.documentContext;
    
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

messages.on('message:document', async (ctx) => {
  if (!isDocumentContextStep(ctx)) return;

  await handleDocumentContext(ctx);
});

messages.on('message:photo', async (ctx) => {
  if (!isDocumentContextStep(ctx)) return;

  await ctx.reply(UNSUPPORTED_DOCUMENT_MESSAGE, {
    reply_markup: createFlowCancelKeyboard(),
  });
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
    return ctx.reply(`Tap the Telegram button to ${action}.`, {
      reply_markup: createFlowCancelKeyboard(),
    });
  }

  if (ctx.session.step === 'awaiting_improve_prompt') {
    if (!ctx.session.activeBotId) {
      clearFlowSession(ctx);
      return ctx.reply('Select a bot first.', {
        reply_markup: await createHomeKeyboardForUser(telegramId),
      });
    }

    ctx.session.step = undefined;
    const activeBotId = ctx.session.activeBotId;
    const progress = await ctx.reply('Improving bot... this might take a minute ⏳');
    await ctx.replyWithChatAction('typing');
    const documentContext = ctx.session.documentContext;

    try {
      const input: { prompt: string; documentContext?: string } = {
        prompt: text,
      };
      if (documentContext) {
        input.documentContext = documentContext;
      }

      const result = await improveBot(telegramId, activeBotId, input);
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
        `❌ ${msg}`,
        {
          reply_markup: createFlowCancelKeyboard(),
        },
      );
    } finally {
      delete ctx.session.documentContext;
    }
    return;
  }

  if (ctx.session.step === 'awaiting_bot_prompt') {
    if (ctx.session.pendingBot) {
      ctx.session.pendingBot.prompt = text;
      ctx.session.pendingBot.generateMeta ??= defaultGenerateMeta();
      ctx.session.step = 'awaiting_bot_generate_options';
      await ctx.deleteMessage().catch(() => undefined);

      await editFlowMessageOrReply(ctx, formatGenerateOptionsMessage(text), {
        reply_markup: createGenerateOptionsKeyboard(
          ctx.session.pendingBot.generateMeta,
        ),
      });
    }
    return;
  }

  if (ctx.session.step === 'awaiting_bot_generate_options') {
    return ctx.reply('Use the buttons above to choose AI fields.', {
      reply_markup: createFlowCancelKeyboard(),
    });
  }

  if (!ctx.session.activeBotId) {
    return ctx.reply('Create a bot or choose one to manage.', {
      reply_markup: await createHomeKeyboardForUser(telegramId),
    });
  }

  return ctx.reply(
    await formatManagementMessage(ctx, 'Use the dashboard buttons.'),
    {
      parse_mode: 'Markdown',
      reply_markup: createManagementKeyboard(),
    },
  );
});
