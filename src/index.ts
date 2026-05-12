import { Bot, Context, session, InlineKeyboard, Keyboard } from 'grammy';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || ''; 

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is missing.');
  process.exit(1);
}

// Define session structure
interface SessionData {
  activeBotId?: string; 
  activeBotName?: string;
  chatHistory: { role: string; text: string }[];
  step?: 'awaiting_managed_bot' | 'awaiting_bot_prompt' | 'awaiting_confirmation' | undefined;
  pendingBot?: { name: string; prompt: string; token: string } | undefined;
  pendingAction?: any;
}

type MyContext = Context & { session: SessionData };

const bot = new Bot<MyContext>(BOT_TOKEN);

// Install session middleware
bot.use(
  session({
    initial: (): SessionData => ({ chatHistory: [] }),
  })
);

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'x-internal-secret': BACKEND_API_KEY,
  },
});

// Helper to get bots
async function fetchUserBots(telegramId: string) {
  try {
    const response = await api.get(`/internal/bots/user/${telegramId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching bots:', error?.response?.data || error.message);
    return [];
  }
}

bot.command('start', async (ctx) => {
  const startPayload = ctx.match;
  
  // We can still use the start payload for linking if needed, 
  // but we primarily rely on ctx.from.id for internal lookups now.
  
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

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Commands:\n' +
    '/new - Create a new bot\n' +
    '/list - List your bots and select one\n' +
    '/select - Alias for /list\n' +
    '/cancel - Cancel current operation\n\n' +
    'Once a bot is selected, you can talk to me naturally to manage it (e.g., "show logs", "deploy", "improve code").'
  );
});

bot.command('new', async (ctx) => {
  ctx.session.step = 'awaiting_managed_bot';
  const keyboard = new Keyboard()
    .requestManagedBot('➕ Create Managed Bot', 1)
    .resized()
    .oneTime();

  await ctx.reply("To create a new bot, click the button below and follow Telegram's prompt.", {
    reply_markup: keyboard,
  });
});

bot.command(['list', 'select'], async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const bots = await fetchUserBots(telegramId);

  if (bots.length === 0) {
    return ctx.reply("You haven't created any bots yet. Use /new to get started!");
  }

  const keyboard = new InlineKeyboard();
  bots.forEach((b: any) => {
    keyboard.text(b.name, `select_bot:${b.id}`).row();
  });

  await ctx.reply('Select a bot to manage:', { reply_markup: keyboard });
});

bot.command('cancel', async (ctx) => {
  ctx.session.step = undefined;
  ctx.session.pendingBot = undefined;
  ctx.session.pendingAction = undefined;
  await ctx.reply('Operation cancelled.');
});

// Callback queries
bot.callbackQuery('new_bot', async (ctx) => {
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

bot.callbackQuery('list_bots', async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = String(ctx.from?.id);
  const bots = await fetchUserBots(telegramId);

  if (bots.length === 0) {
    return ctx.reply('You haven\'t created any bots yet. Use /new to get started!');
  }

  const keyboard = new InlineKeyboard();
  bots.forEach((b: any) => {
    keyboard.text(b.name, `select_bot:${b.id}`).row();
  });

  await ctx.editMessageText('Select a bot to manage:', { reply_markup: keyboard });
});

bot.callbackQuery(/^select_bot:(.+)$/, async (ctx) => {
  const botId = ctx.match[1];
  const telegramId = String(ctx.from?.id);
  
  try {
    const bots = await fetchUserBots(telegramId);
    const selectedBot = bots.find((b: any) => b.id === botId);
    
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

bot.callbackQuery('confirm_action', async (ctx) => {
  if (!ctx.session.pendingAction || !ctx.session.activeBotId) return;
  
  const telegramId = String(ctx.from?.id);
  await ctx.answerCallbackQuery('Confirmed!');
  await ctx.editMessageText('Processing action... ⏳');

  try {
    const response = await api.post(`/internal/bots/user/${telegramId}/chat/${ctx.session.activeBotId}`, {
      message: 'Yes',
      history: ctx.session.chatHistory,
      confirmedAction: ctx.session.pendingAction,
    });
    
    const data = response.data;
    ctx.session.pendingAction = null;
    
    if (data.content) {
      await ctx.reply(data.content);
    } else {
      await ctx.reply('Action completed successfully.');
    }
  } catch (error: any) {
    console.error('Confirm error:', error?.response?.data || error.message);
    await ctx.reply('Error executing confirmed action.');
  }
});

bot.callbackQuery('cancel_action', async (ctx) => {
  ctx.session.pendingAction = null;
  await ctx.answerCallbackQuery('Cancelled');
  await ctx.editMessageText('Action cancelled.');
});

// Managed Bot Created handler
bot.on('message:managed_bot_created', async (ctx) => {
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
bot.on('message:text', async (ctx) => {
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
        const response = await api.post(`/internal/bots/user/${telegramId}/create`, {
          name: botName,
          prompt: text,
          token: ctx.session.pendingBot.token,
        });
        
        ctx.session.activeBotId = response.data.botId;
        ctx.session.activeBotName = botName;
        ctx.session.pendingBot = undefined;
        
        await ctx.reply(
          `✅ Bot *${botName}* created successfully!\n\nI've generated the initial code for you. You can now manage it here.`,
          { 
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('📊 View Stats', 'get_stats_quick')
          }
        );
      } catch (error: any) {
        console.error('Create error:', error?.response?.data || error.message);
        const msg = error?.response?.data?.message || 'Failed to create bot.';
        await ctx.reply(`❌ ${msg}\n\nPlease make sure you have linked your account on the web app.`);
      }
    }
    return;
  }

  // Management Chat
  if (!ctx.session.activeBotId) {
    return ctx.reply('Please select a bot to manage first using /list or create a new one with /new.');
  }

  try {
    await ctx.replyWithChatAction('typing');

    const response = await api.post(`/internal/bots/user/${telegramId}/chat/${ctx.session.activeBotId}`, {
      message: text,
      history: ctx.session.chatHistory,
    });

    const data = response.data;
    
    // Add to history
    ctx.session.chatHistory.push({ role: 'user', text });
    if (data.content) {
       ctx.session.chatHistory.push({ role: 'assistant', text: data.content });
    }

    if (data.type === 'confirm') {
      ctx.session.pendingAction = data.action;
      await ctx.reply(data.content, {
        reply_markup: new InlineKeyboard()
          .text('✅ Yes, Proceed', 'confirm_action')
          .text('❌ Cancel', 'cancel_action'),
      });
    } else {
      // Handle very long content (like code)
      if (data.content && data.content.length > 4000) {
        // Simple chunking for now, but ideally send as file
        for (let i = 0; i < data.content.length; i += 4000) {
          await ctx.reply(data.content.substring(i, i + 4000));
        }
      } else if (data.content) {
        await ctx.reply(data.content);
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

// Quick action handlers
bot.callbackQuery('get_stats_quick', async (ctx) => {
  if (!ctx.session.activeBotId) return ctx.answerCallbackQuery('No active bot.');
  await ctx.answerCallbackQuery();
  // Simulate a message to trigger stats
  ctx.reply('Fetching stats...');
  // We can call the chat endpoint with "get stats"
  const telegramId = String(ctx.from?.id);
  try {
    const response = await api.post(`/internal/bots/user/${telegramId}/chat/${ctx.session.activeBotId}`, {
      message: 'get stats',
      history: ctx.session.chatHistory,
    });
    if (response.data.content) {
      await ctx.reply(response.data.content);
    }
  } catch (error) {
    await ctx.reply('Error fetching stats.');
  }
});

// Start the bot
bot.start({
  onStart: (botInfo) => {
    console.log(`BotBuilder Manager Bot started as @${botInfo.username}`);
  },
});
