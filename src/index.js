import { Bot, Context, session } from 'grammy';
import * as dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || ''; // For system-level auth if needed
if (!BOT_TOKEN) {
    console.error('Error: TELEGRAM_BOT_TOKEN is missing.');
    process.exit(1);
}
const bot = new Bot(BOT_TOKEN);
// Install session middleware
bot.use(session({
    initial: () => ({ chatHistory: [] }),
}));
bot.command('start', async (ctx) => {
    const startPayload = ctx.match;
    if (startPayload) {
        // If they used a deep link e.g. /start <nonce>
        ctx.session.userId = startPayload; // Simplified: assume payload is user ID or we bind it
        await ctx.reply('Welcome to BotBuilder! Your account is linked. What would you like to build today?');
    }
    else {
        await ctx.reply('Welcome to BotBuilder! Please log in to the web app and click "Connect Telegram" to link your account.');
    }
});
bot.command('help', async (ctx) => {
    await ctx.reply('I am your BotBuilder assistant. Just tell me what kind of bot you want to create, or ask me to check your logs, deploy your bot, etc.');
});
bot.on('message:text', async (ctx) => {
    const userId = ctx.session.userId;
    if (!userId) {
        return ctx.reply('Please link your account first by starting the bot from the BotBuilder web dashboard.');
    }
    const text = ctx.message.text;
    const activeBotId = ctx.session.activeBotId;
    // We need an active bot session to chat with the backend's chat tool
    if (!activeBotId) {
        // Ideally, we'd list their bots or start a new one. 
        // For now, let's just echo.
        return ctx.reply('You do not have an active bot selected. (Selection UI coming soon!)');
    }
    // Forward message to BotBuilder backend /chat endpoint
    try {
        // Send a typing indicator
        await ctx.replyWithChatAction('typing');
        // Make request to backend
        // Note: We need a way to authenticate this request. If the backend requires a JWT, 
        // the Manager bot needs a service token, or the user's token.
        // For now, we'll assume the backend allows service-level access or we have a workaround.
        const response = await axios.post(`${BACKEND_URL}/bots/${activeBotId}/chat`, {
            message: text,
            history: ctx.session.chatHistory,
        }, {
            headers: {
                'Authorization': `Bearer ${BACKEND_API_KEY}` // Replace with proper auth
            }
        });
        const data = response.data;
        // Add to history
        ctx.session.chatHistory.push({ role: 'user', text });
        if (data.content) {
            ctx.session.chatHistory.push({ role: 'assistant', text: data.content });
        }
        if (data.type === 'text') {
            await ctx.reply(data.content);
        }
        else if (data.type === 'confirm') {
            // Need confirmation UI
            await ctx.reply(`Confirmation required: ${data.content}`);
        }
        else {
            // Tool execution success
            await ctx.reply(`Done: ${data.content}`);
        }
    }
    catch (error) {
        console.error('Chat error:', error?.response?.data || error.message);
        await ctx.reply('Sorry, I encountered an error communicating with the BotBuilder backend.');
    }
});
// Start the bot
bot.start({
    onStart: (botInfo) => {
        console.log(`BotBuilder Manager Bot started as @${botInfo.username}`);
    },
});
//# sourceMappingURL=index.js.map