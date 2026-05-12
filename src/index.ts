import { Bot, session } from 'grammy';
import { BOT_TOKEN } from './config.js';
import type { MyContext, SessionData } from './types.js';
import { commands } from './commands.js';
import { callbacks } from './callbacks.js';
import { messages } from './messages.js';

const bot = new Bot<MyContext>(BOT_TOKEN!);

// Install session middleware
bot.use(
  session({
    initial: (): SessionData => ({ chatHistory: [] }),
  })
);

// Register modules
bot.use(commands);
bot.use(callbacks);
bot.use(messages);

// Start the bot
bot.start({
  onStart: (botInfo) => {
    console.log(`BotBuilder Manager Bot started as @${botInfo.username}`);
  },
});
